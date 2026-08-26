-- Failure-safe attribution write + operator readiness RPC.
--
-- WHY. public.handle_new_user (re-issued by 20260813030000) INSERTs into
-- public.signup_acquisition_attributions outside the only EXCEPTION block
-- (which wraps referral conversion only). A missing table, constraint miss,
-- or grant miss raises 42P01 / similar out of the AFTER INSERT trigger on
-- auth.users, GoTrue returns HTTP 500, and the account never persists.
--
-- This migration does NOT recreate the table or change allowlists. It only:
--   1. Replaces handle_new_user so the attribution INSERT is best-effort
--      (EXCEPTION WHEN OTHERS + RAISE LOG) while profile creation and the
--      referral block stay unchanged.
--   2. Adds an operator-only readiness snapshot for the exact checks
--      operators need before treating marketing attributed signup as ready.
--
-- Immutable history: 20260813030000_signup_acquisition_forward_repair.sql is
-- never edited here. No ledger hand-insert. No unrelated schema.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_signup_source text;
  v_marketing_opt_in boolean;
  v_ref_code text;
  v_referrer uuid;
BEGIN
  v_signup_source := CASE
    WHEN NEW.raw_user_meta_data->>'verdant_signup_source' IN (
      'landing_page','pricing_page','founder_page','founder_share',
      'pricing_interest_share','operator_outreach','grower_invite',
      'context_check','vpd_calculator','csv_history','blueprint_targets'
    ) THEN NEW.raw_user_meta_data->>'verdant_signup_source'
    ELSE NULL
  END;

  v_marketing_opt_in := CASE
    WHEN NEW.raw_user_meta_data->'marketing_opt_in' = 'true'::jsonb THEN true
    ELSE false
  END;

  INSERT INTO public.profiles (
    user_id, display_name, marketing_opt_in, marketing_opt_in_at, referral_code
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    v_marketing_opt_in,
    CASE WHEN v_marketing_opt_in THEN COALESCE(NEW.created_at, now()) ELSE NULL END,
    public.generate_referral_code()
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Attribution is analytics-only. Never abort account creation when the
  -- table, constraint, or grants are missing or misconfigured.
  IF v_signup_source IS NOT NULL THEN
    BEGIN
      INSERT INTO public.signup_acquisition_attributions (user_id, source, created_at)
      VALUES (NEW.id, v_signup_source, COALESCE(NEW.created_at, now()))
      ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG
        'signup_acquisition_attributions write failed during handle_new_user for user_id=% sqlstate=% sqlerrm=%',
        NEW.id,
        SQLSTATE,
        SQLERRM;
    END;
  END IF;

  BEGIN
    v_ref_code := lower(btrim(NEW.raw_user_meta_data->>'verdant_ref_code'));
    IF v_ref_code IS NOT NULL AND v_ref_code ~ '^[a-z0-9]{6,16}$' THEN
      SELECT p.user_id INTO v_referrer
        FROM public.profiles p
       WHERE p.referral_code = v_ref_code
       LIMIT 1;
      IF v_referrer IS NOT NULL AND v_referrer <> NEW.id THEN
        PERFORM public.convert_referral(
          v_referrer, NEW.id, v_ref_code,
          COALESCE(NULLIF(current_setting('app.payments_environment', true), ''), 'live'),
          NEW.email_confirmed_at IS NOT NULL
            AND NULLIF(current_setting('app.payments_environment', true), '') IS NOT NULL
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates the grower profile on auth.users insert; copies allowlisted first-touch attribution best-effort with RAISE LOG on failure so missing analytics objects cannot abort account creation; converts referrals best-effort.';

-- Operator-only readiness: table, three helper functions, and the name-bound
-- forward-repair ledger row. Does not grant public/anon access.
CREATE OR REPLACE FUNCTION public.signup_acquisition_readiness_operator_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_table_present boolean;
  v_record_fn_present boolean;
  v_acquisition_snapshot_present boolean;
  v_signup_to_paid_present boolean;
  v_ledger_present boolean := false;
  v_failed text[] := ARRAY[]::text[];
  v_ready boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF NOT public.has_role(auth.uid(), 'operator'::public.app_role) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operator_required');
  END IF;

  v_table_present := to_regclass('public.signup_acquisition_attributions') IS NOT NULL;
  v_record_fn_present :=
    to_regprocedure('public.record_signup_acquisition_first_touch(text)') IS NOT NULL;
  v_acquisition_snapshot_present :=
    to_regprocedure('public.signup_acquisition_operator_snapshot()') IS NOT NULL;
  v_signup_to_paid_present :=
    to_regprocedure('public.signup_to_paid_operator_snapshot()') IS NOT NULL;

  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM supabase_migrations.schema_migrations AS sm
      WHERE sm.version = '20260813030000'
        AND sm.name IN (
          'signup_acquisition_forward_repair',
          '20260813030000_signup_acquisition_forward_repair'
        )
    )
    INTO v_ledger_present;
  END IF;

  IF NOT v_table_present THEN
    v_failed := array_append(v_failed, 'signup_acquisition_attributions_table');
  END IF;
  IF NOT v_record_fn_present THEN
    v_failed := array_append(v_failed, 'record_signup_acquisition_first_touch');
  END IF;
  IF NOT v_acquisition_snapshot_present THEN
    v_failed := array_append(v_failed, 'signup_acquisition_operator_snapshot');
  END IF;
  IF NOT v_signup_to_paid_present THEN
    v_failed := array_append(v_failed, 'signup_to_paid_operator_snapshot');
  END IF;
  IF NOT v_ledger_present THEN
    v_failed := array_append(v_failed, 'forward_repair_ledger_row');
  END IF;

  v_ready := cardinality(v_failed) = 0;

  RETURN jsonb_build_object(
    'ok', true,
    'ready', v_ready,
    'status', CASE WHEN v_ready THEN 'ready' ELSE 'not_ready' END,
    'generated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'checks', jsonb_build_object(
      'signup_acquisition_attributions_table', v_table_present,
      'record_signup_acquisition_first_touch', v_record_fn_present,
      'signup_acquisition_operator_snapshot', v_acquisition_snapshot_present,
      'signup_to_paid_operator_snapshot', v_signup_to_paid_present,
      'forward_repair_ledger_row', v_ledger_present
    ),
    'failed_checks', to_jsonb(v_failed),
    'expected_ledger', jsonb_build_object(
      'version', '20260813030000',
      'names', jsonb_build_array(
        'signup_acquisition_forward_repair',
        '20260813030000_signup_acquisition_forward_repair'
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.signup_acquisition_readiness_operator_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_acquisition_readiness_operator_snapshot() FROM anon;
GRANT EXECUTE ON FUNCTION public.signup_acquisition_readiness_operator_snapshot() TO authenticated;

COMMENT ON FUNCTION public.signup_acquisition_readiness_operator_snapshot() IS
  'Operator-only readiness for signup acquisition: table present, three helper functions present, and name-bound 20260813030000 ledger row. Returns ready/not_ready plus failed_checks. No PII.';

NOTIFY pgrst, 'reload schema';
