-- Forward-repair authenticated INSERT on public.user_agreement_acceptances.
--
-- Measured production (2026-08-24, preview → live project knkwiiywfkbqznbxwqfh):
--   SELECT on this table SUCCEEDED (modal showed "None on file" for ToS+Privacy).
--   Accept upsert FAILED with HTTP 401 / SQLSTATE 42501
--   "new row violates row-level security policy for table
--   \"user_agreement_acceptances\"".
-- Writer: AgreementReconsentGate / AccountPreferences / Auth signup via
-- PostgREST upsert Prefer: resolution=ignore-duplicates.
--
-- This migration is GitHub-only until Cheek explicitly authorizes APPLY.
-- Do not APPLY unrelated signup-acquisition forward repairs with this change.
--
-- Idempotent / fail-closed:
--   * Re-assert SELECT+INSERT grants; revoke UPDATE/DELETE for authenticated.
--   * Recreate SELECT + INSERT RLS policies (auth.uid() = user_id).
--   * No UPDATE/DELETE policies for authenticated (append-only).
--   * SECURITY INVOKER RPC forces user_id from auth.uid() so clients never
--     trust a client-chosen user_id for the write path.
--   * Timestamp trigger from 20260713233000 remains the consent-clock authority.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Table must already exist (production SELECT proved it). Refuse silent create.
DO $preflight$
BEGIN
  IF to_regclass('public.user_agreement_acceptances') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'agreement_acceptance_insert_forward_repair_missing_table';
  END IF;
END
$preflight$;

ALTER TABLE public.user_agreement_acceptances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_agreement_acceptances FROM PUBLIC;
REVOKE ALL ON TABLE public.user_agreement_acceptances FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.user_agreement_acceptances FROM authenticated;

GRANT SELECT, INSERT ON TABLE public.user_agreement_acceptances TO authenticated;
GRANT ALL ON TABLE public.user_agreement_acceptances TO service_role;

DROP POLICY IF EXISTS "Users view own acceptances" ON public.user_agreement_acceptances;
CREATE POLICY "Users view own acceptances"
  ON public.user_agreement_acceptances
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own acceptances" ON public.user_agreement_acceptances;
CREATE POLICY "Users insert own acceptances"
  ON public.user_agreement_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- No authenticated UPDATE/DELETE policies — append-only consent evidence.
DROP POLICY IF EXISTS "Users update own acceptances" ON public.user_agreement_acceptances;
DROP POLICY IF EXISTS "Users delete own acceptances" ON public.user_agreement_acceptances;

CREATE OR REPLACE FUNCTION public.record_own_agreement_acceptances(
  p_acceptances jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  item jsonb;
  v_type public.agreement_type;
  v_version text;
  v_effective date;
  v_ua text;
  attempted integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_acceptances IS NULL OR jsonb_typeof(p_acceptances) <> 'array' THEN
    RAISE EXCEPTION 'acceptances must be a jsonb array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_acceptances) = 0 THEN
    RETURN 0;
  END IF;

  -- Current product surface is two agreements; keep a hard cap against abuse.
  IF jsonb_array_length(p_acceptances) > 16 THEN
    RAISE EXCEPTION 'too many acceptance rows' USING ERRCODE = '22023';
  END IF;

  FOR item IN
    SELECT value FROM jsonb_array_elements(p_acceptances) AS t(value)
  LOOP
    IF jsonb_typeof(item) <> 'object' THEN
      RAISE EXCEPTION 'each acceptance must be an object' USING ERRCODE = '22023';
    END IF;

    -- Never trust a client-supplied user_id even if present in the payload.
    BEGIN
      v_type := (item->>'agreement_type')::public.agreement_type;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'invalid agreement_type' USING ERRCODE = '22023';
    END;

    v_version := item->>'version';
    IF v_version IS NULL
       OR btrim(v_version) = ''
       OR char_length(v_version) > 64 THEN
      RAISE EXCEPTION 'invalid version' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_effective := (item->>'effective_date')::date;
    EXCEPTION
      WHEN invalid_datetime_format OR datetime_field_overflow THEN
        RAISE EXCEPTION 'invalid effective_date' USING ERRCODE = '22023';
    END;

    IF v_effective IS NULL THEN
      RAISE EXCEPTION 'effective_date is required' USING ERRCODE = '22023';
    END IF;

    v_ua := item->>'user_agent';
    IF v_ua IS NOT NULL AND char_length(v_ua) > 1024 THEN
      v_ua := left(v_ua, 1024);
    END IF;

    INSERT INTO public.user_agreement_acceptances (
      user_id,
      agreement_type,
      version,
      effective_date,
      user_agent
    )
    VALUES (
      uid,
      v_type,
      v_version,
      v_effective,
      NULLIF(v_ua, '')
    )
    ON CONFLICT (user_id, agreement_type, version) DO NOTHING;

    attempted := attempted + 1;
  END LOOP;

  RETURN attempted;
END;
$$;

REVOKE ALL ON FUNCTION public.record_own_agreement_acceptances(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_own_agreement_acceptances(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_own_agreement_acceptances(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_own_agreement_acceptances(jsonb) TO service_role;

COMMENT ON FUNCTION public.record_own_agreement_acceptances(jsonb) IS
  'Append-only consent write: inserts current agreement acceptances for auth.uid() only (ON CONFLICT DO NOTHING). Client must not supply user_id.';

-- Keep / re-assert the server-clock trigger (service_role-exempt).
CREATE OR REPLACE FUNCTION public.set_agreement_acceptance_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.accepted_at := now();
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_agreement_acceptance_timestamps
  ON public.user_agreement_acceptances;
CREATE TRIGGER trg_set_agreement_acceptance_timestamps
  BEFORE INSERT ON public.user_agreement_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.set_agreement_acceptance_timestamps();

DO $postcondition$
DECLARE
  v_insert_policies integer;
  v_update_policies integer;
  v_delete_policies integer;
  v_select_ok boolean;
  v_insert_ok boolean;
  v_update_ok boolean;
  v_delete_ok boolean;
  v_rpc_auth_exec boolean;
  v_rpc_anon_exec boolean;
BEGIN
  SELECT count(*) INTO v_insert_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'user_agreement_acceptances'
    AND cmd = 'INSERT'
    AND roles @> ARRAY['authenticated']::name[];

  SELECT count(*) INTO v_update_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'user_agreement_acceptances'
    AND cmd = 'UPDATE'
    AND roles @> ARRAY['authenticated']::name[];

  SELECT count(*) INTO v_delete_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'user_agreement_acceptances'
    AND cmd = 'DELETE'
    AND roles @> ARRAY['authenticated']::name[];

  IF v_insert_policies < 1 THEN
    RAISE EXCEPTION 'agreement_acceptance_insert_forward_repair_missing_insert_policy';
  END IF;
  IF v_update_policies <> 0 OR v_delete_policies <> 0 THEN
    RAISE EXCEPTION 'agreement_acceptance_insert_forward_repair_unexpected_mutate_policy';
  END IF;

  v_select_ok := has_table_privilege('authenticated', 'public.user_agreement_acceptances', 'SELECT');
  v_insert_ok := has_table_privilege('authenticated', 'public.user_agreement_acceptances', 'INSERT');
  v_update_ok := has_table_privilege('authenticated', 'public.user_agreement_acceptances', 'UPDATE');
  v_delete_ok := has_table_privilege('authenticated', 'public.user_agreement_acceptances', 'DELETE');

  IF NOT v_select_ok OR NOT v_insert_ok THEN
    RAISE EXCEPTION 'agreement_acceptance_insert_forward_repair_missing_grant';
  END IF;
  IF v_update_ok OR v_delete_ok THEN
    RAISE EXCEPTION 'agreement_acceptance_insert_forward_repair_mutate_grant_present';
  END IF;

  SELECT has_function_privilege(
           'authenticated',
           'public.record_own_agreement_acceptances(jsonb)',
           'EXECUTE'
         ),
         has_function_privilege(
           'anon',
           'public.record_own_agreement_acceptances(jsonb)',
           'EXECUTE'
         )
    INTO v_rpc_auth_exec, v_rpc_anon_exec;

  IF NOT v_rpc_auth_exec THEN
    RAISE EXCEPTION 'agreement_acceptance_insert_forward_repair_rpc_auth_missing';
  END IF;
  IF v_rpc_anon_exec THEN
    RAISE EXCEPTION 'agreement_acceptance_insert_forward_repair_rpc_anon_executable';
  END IF;
END
$postcondition$;

NOTIFY pgrst, 'reload schema';

COMMIT;
