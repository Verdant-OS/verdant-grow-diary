-- Forward-only replay repair for local/sandbox rebuilds.
--
-- Fresh filename-order replays can miss a handful of historical compatibility
-- objects that later hardening migrations or replay gates still expect:
--   * legacy admin_schema_audit(text[], text[]) wrapper
--   * legacy email_queue_dispatch() / email_queue_wake() signatures
--   * keyed Quick Log correction/retraction overloads plus their idempotency
--     receipt table and internal helper
--   * authenticated EXECUTE on public.has_role(uuid, public.app_role)
--
-- Production may already have any or all of these. Only create the missing
-- objects; never replace existing definitions.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.admin_schema_audit(text[],text[])') IS NULL
     AND to_regprocedure('public.admin_schema_audit(text[],text[],jsonb)') IS NOT NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION public.admin_schema_audit(
        _migrations text[],
        _tables text[]
      )
      RETURNS jsonb
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = pg_catalog
      AS $body$
        SELECT public.admin_schema_audit(_migrations, _tables, '[]'::jsonb);
      $body$;
    $sql$;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.admin_schema_audit(text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_schema_audit(text[], text[]) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.email_queue_dispatch()') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION public.email_queue_dispatch()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO public, pg_temp
      AS $body$
      BEGIN
        RETURN;
      END;
      $body$;
    $sql$;
  END IF;

  IF to_regprocedure('public.email_queue_wake()') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION public.email_queue_wake()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO public, pg_temp
      AS $body$
      BEGIN
        RETURN;
      END;
      $body$;
    $sql$;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;

REVOKE ALL ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_queue_wake() TO service_role;

COMMENT ON FUNCTION public.email_queue_dispatch() IS
  'Legacy replay-compatibility shim. Fresh repo replays never call this signature; later hardening migrations still revoke it.';

COMMENT ON FUNCTION public.email_queue_wake() IS
  'Legacy replay-compatibility shim. Fresh repo replays never call this signature; later hardening migrations still revoke it.';

CREATE TABLE IF NOT EXISTS public.quicklog_revision_idempotency (
  user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  request JSONB NOT NULL,
  receipt JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);

ALTER TABLE public.quicklog_revision_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quicklog_revision_idempotency FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.quicklog_revision_idempotency TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.quicklog_correct_entry(text,jsonb,uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.quicklog_retract_entry(text,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION
      'quicklog replay forward repair requires legacy correction/retraction RPCs'
      USING ERRCODE = '55000';
  END IF;

  IF to_regprocedure('public.quicklog_revision_apply_once(text,text,text,jsonb,uuid,uuid,text)') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION public.quicklog_revision_apply_once(
        p_idempotency_key TEXT,
        p_kind TEXT,
        p_reason_code TEXT,
        p_changes JSONB,
        p_grow_event_id UUID,
        p_diary_entry_id UUID,
        p_reason_note TEXT
      )
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public', 'pg_temp'
      AS $body$
      DECLARE
        uid UUID := auth.uid();
        v_request JSONB;
        v_prior public.quicklog_revision_idempotency%ROWTYPE;
        v_receipt JSONB;
      BEGIN
        IF uid IS NULL THEN
          RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
        END IF;
        IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
          RETURN jsonb_build_object('ok', false, 'reason', 'invalid_idempotency_key');
        END IF;
        IF p_kind IS NULL OR p_kind NOT IN ('correction', 'retraction') THEN
          RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
        END IF;
        v_request := jsonb_build_object(
          'kind', p_kind, 'reason_code', p_reason_code, 'changes', p_changes,
          'grow_event_id', p_grow_event_id, 'diary_entry_id', p_diary_entry_id,
          'reason_note', p_reason_note
        );
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
          'quicklog-revision:' || uid::text || ':' || p_idempotency_key, 0
        ));
        SELECT * INTO v_prior
          FROM public.quicklog_revision_idempotency
         WHERE user_id = uid AND idempotency_key = p_idempotency_key;
        IF FOUND THEN
          IF v_prior.request IS DISTINCT FROM v_request THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_conflict');
          END IF;
          RETURN v_prior.receipt || jsonb_build_object('reused', true);
        END IF;

        IF p_kind = 'correction' THEN
          v_receipt := public.quicklog_correct_entry(
            p_reason_code => p_reason_code, p_changes => p_changes,
            p_grow_event_id => p_grow_event_id, p_diary_entry_id => p_diary_entry_id,
            p_reason_note => p_reason_note
          );
        ELSE
          v_receipt := public.quicklog_retract_entry(
            p_reason_code => p_reason_code, p_grow_event_id => p_grow_event_id,
            p_diary_entry_id => p_diary_entry_id, p_reason_note => p_reason_note
          );
        END IF;
        IF v_receipt ->> 'ok' = 'true' THEN
          INSERT INTO public.quicklog_revision_idempotency (user_id, idempotency_key, request, receipt)
          VALUES (uid, p_idempotency_key, v_request, v_receipt);
        END IF;
        RETURN v_receipt;
      END;
      $body$;
    $sql$;
  END IF;

  IF to_regprocedure('public.quicklog_correct_entry(text,text,jsonb,uuid,uuid,text)') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION public.quicklog_correct_entry(
        p_idempotency_key TEXT,
        p_reason_code TEXT,
        p_changes JSONB,
        p_grow_event_id UUID DEFAULT NULL,
        p_diary_entry_id UUID DEFAULT NULL,
        p_reason_note TEXT DEFAULT NULL
      )
      RETURNS JSONB
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path TO 'public', 'pg_temp'
      AS $body$
        SELECT public.quicklog_revision_apply_once(
          p_idempotency_key, 'correction', p_reason_code, p_changes,
          p_grow_event_id, p_diary_entry_id, p_reason_note
        );
      $body$;
    $sql$;
  END IF;

  IF to_regprocedure('public.quicklog_retract_entry(text,text,uuid,uuid,text)') IS NULL THEN
    EXECUTE $sql$
      CREATE FUNCTION public.quicklog_retract_entry(
        p_idempotency_key TEXT,
        p_reason_code TEXT,
        p_grow_event_id UUID DEFAULT NULL,
        p_diary_entry_id UUID DEFAULT NULL,
        p_reason_note TEXT DEFAULT NULL
      )
      RETURNS JSONB
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path TO 'public', 'pg_temp'
      AS $body$
        SELECT public.quicklog_revision_apply_once(
          p_idempotency_key, 'retraction', p_reason_code, NULL,
          p_grow_event_id, p_diary_entry_id, p_reason_note
        );
      $body$;
    $sql$;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.quicklog_revision_apply_once(TEXT, TEXT, TEXT, JSONB, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.quicklog_correct_entry(TEXT, TEXT, JSONB, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quicklog_correct_entry(TEXT, TEXT, JSONB, UUID, UUID, TEXT)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.quicklog_retract_entry(TEXT, TEXT, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quicklog_retract_entry(TEXT, TEXT, UUID, UUID, TEXT)
  TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
