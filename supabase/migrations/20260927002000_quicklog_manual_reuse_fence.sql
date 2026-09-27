-- Guard Quick Log manual idempotency replays against retracted rows and
-- changed request payloads. This forward migration replaces only the public
-- wrapper; the private delegate, existing tables, RLS and grants stay intact.
BEGIN;

DO $quicklog_manual_reuse_preflight$
DECLARE
  v_wrapper_oid oid := pg_catalog.to_regprocedure(
    'public.quicklog_save_manual(text, uuid, text, numeric, text, numeric, numeric, numeric, timestamp with time zone, jsonb, text, text)'
  );
  v_delegate_oid oid := pg_catalog.to_regprocedure(
    'public.quicklog_save_manual_pre_logged_at(text, uuid, text, numeric, text, numeric, numeric, numeric, timestamp with time zone, jsonb, text, text)'
  );
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20260927, 2000);
  IF v_wrapper_oid IS NULL OR v_delegate_oid IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS p
       JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
       WHERE p.oid = v_wrapper_oid
         AND p.prosecdef
         AND owner_role.rolname = 'postgres'
         AND p.prorettype = 'jsonb'::pg_catalog.regtype
         AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]
         AND pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', ''))
             = '0d3098b81787fa90898da921345c0dbc'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS p
       JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
       WHERE p.oid = v_delegate_oid
         AND p.prosecdef
         AND owner_role.rolname = 'postgres'
         AND p.prorettype = 'jsonb'::pg_catalog.regtype
         AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]
         AND pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', ''))
             = '7ec296e422f7f47c8b2793b051840798'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_attribute AS a
       WHERE a.attrelid = 'public.quicklog_idempotency'::pg_catalog.regclass
         AND a.attname = 'request_hash'
         AND a.atttypid = 'text'::pg_catalog.regtype
         AND NOT a.attnotnull AND NOT a.attisdropped
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_attribute AS a
       WHERE a.attrelid = 'public.grow_events'::pg_catalog.regclass
         AND a.attname = 'is_deleted'
         AND a.atttypid = 'boolean'::pg_catalog.regtype
         AND NOT a.attisdropped
     )
     OR pg_catalog.has_function_privilege('anon', v_wrapper_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege(
       'authenticated', v_wrapper_oid, 'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_manual_reuse_preflight_unrecognized';
  END IF;
END;
$quicklog_manual_reuse_preflight$;

CREATE OR REPLACE FUNCTION public.quicklog_save_manual(
  p_target_type text,
  p_target_id uuid,
  p_action text,
  p_volume_ml numeric DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_temperature_c numeric DEFAULT NULL,
  p_humidity_pct numeric DEFAULT NULL,
  p_vpd_kpa numeric DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_stage text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_requested_logged_at timestamptz;
  v_logged_at timestamptz;
  v_existing_event_id uuid;
  v_existing_logged_at timestamptz;
  v_existing_deleted boolean;
  v_existing_request_hash text;
  v_request_hash text;
  v_hash_update_count integer;
  v_previous_logged_at_context text;
  v_call_details jsonb;
  v_result jsonb;
  v_event_id uuid;
  v_grow_id uuid;
  v_is_reused boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Keep the established key-length response before reading an existing key.
  IF p_idempotency_key IS NOT NULL
     AND length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RETURN public.quicklog_save_manual_pre_logged_at(
      p_target_type,
      p_target_id,
      p_action,
      p_volume_ml,
      p_note,
      p_temperature_c,
      p_humidity_pct,
      p_vpd_kpa,
      p_occurred_at,
      p_details,
      p_idempotency_key,
      p_stage
    );
  END IF;

  -- Bind new keyed saves to the caller's original request, not the generated
  -- logged_at timestamp. A retry can then be exact even when its reply was
  -- lost and the server selected the capture time.
  v_request_hash := 'manual_v1:' || pg_catalog.md5(
    jsonb_build_object(
      'target_type', p_target_type,
      'target_id', p_target_id,
      'action', p_action,
      'volume_ml', p_volume_ml,
      'note', p_note,
      'temperature_c', p_temperature_c,
      'humidity_pct', p_humidity_pct,
      'vpd_kpa', p_vpd_kpa,
      'occurred_at', p_occurred_at,
      'details', p_details,
      'stage', p_stage
    )::text
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        uid::text || ':' || p_idempotency_key,
        0
      )
    );

    SELECT qi.grow_event_id, ge.logged_at, ge.is_deleted, qi.request_hash
      INTO
        v_existing_event_id,
        v_existing_logged_at,
        v_existing_deleted,
        v_existing_request_hash
      FROM public.quicklog_idempotency AS qi
      JOIN public.grow_events AS ge
        ON ge.id = qi.grow_event_id
       AND ge.user_id = uid
     WHERE qi.user_id = uid
       AND qi.idempotency_key = p_idempotency_key
     FOR UPDATE OF ge;
    -- The row lock is held through the response. A concurrent retraction
    -- cannot turn an already-retracted receipt into a successful replay.
    IF v_existing_event_id IS NOT NULL AND v_existing_deleted THEN
      INSERT INTO public.quicklog_audit_events
        (user_id, idempotency_key, grow_event_id, status, reason)
      VALUES
        (uid, p_idempotency_key, v_existing_event_id,
         'validation_failed', 'idempotency_key_retracted');
      RETURN jsonb_build_object(
        'ok', false, 'reason', 'idempotency_key_retracted'
      );
    END IF;
    IF v_existing_event_id IS NOT NULL
       AND v_existing_request_hash IS NULL THEN
      -- An old manual key proves only row identity, not request equality.
      -- Keep the row, but do not claim an unverified replay succeeded.
      INSERT INTO public.quicklog_audit_events
        (user_id, idempotency_key, grow_event_id, status, reason)
      VALUES
        (uid, p_idempotency_key, v_existing_event_id,
         'validation_failed', 'idempotency_key_unverified');
      RETURN jsonb_build_object(
        'ok', false, 'reason', 'idempotency_key_unverified'
      );
    END IF;
    IF v_existing_event_id IS NOT NULL
       AND v_existing_request_hash IS NOT NULL
       AND v_existing_request_hash <> v_request_hash THEN
      INSERT INTO public.quicklog_audit_events
        (user_id, idempotency_key, grow_event_id, status, reason)
      VALUES
        (uid, p_idempotency_key, v_existing_event_id,
         'validation_failed', 'idempotency_key_conflict');
      RETURN jsonb_build_object(
        'ok', false, 'reason', 'idempotency_key_conflict'
      );
    END IF;
    -- Never backfill a hash from an old replay: that would bless changed input.
  END IF;

  IF v_existing_event_id IS NULL THEN
    -- Preserve the delegate's established invalid_details response instead of
    -- silently coercing a malformed non-object payload to {}.
    IF p_details IS NOT NULL
       AND jsonb_typeof(p_details) <> 'object' THEN
      RETURN public.quicklog_save_manual_pre_logged_at(
        p_target_type,
        p_target_id,
        p_action,
        p_volume_ml,
        p_note,
        p_temperature_c,
        p_humidity_pct,
        p_vpd_kpa,
        p_occurred_at,
        p_details,
        p_idempotency_key,
        p_stage
      );
    END IF;

    IF p_details IS NOT NULL
       AND p_details ? 'logged_at' THEN
      IF jsonb_typeof(p_details->'logged_at') <> 'string' THEN
        INSERT INTO public.quicklog_audit_events
          (user_id, idempotency_key, status, reason)
        VALUES
          (uid, p_idempotency_key, 'validation_failed', 'invalid_logged_at');
        RETURN jsonb_build_object(
          'ok', false, 'reason', 'invalid_logged_at'
        );
      END IF;

      v_requested_logged_at :=
        public.quicklog_try_parse_logged_at(p_details->>'logged_at');
      IF v_requested_logged_at IS NULL
         OR v_requested_logged_at
              > pg_catalog.clock_timestamp() + interval '5 minutes' THEN
        INSERT INTO public.quicklog_audit_events
          (user_id, idempotency_key, status, reason)
        VALUES
          (uid, p_idempotency_key, 'validation_failed', 'invalid_logged_at');
        RETURN jsonb_build_object(
          'ok', false, 'reason', 'invalid_logged_at'
        );
      END IF;
    END IF;
  END IF;

  -- quicklog_save_manual's established retry contract reuses the original
  -- row for an existing key without a request-hash conflict. Preserve that
  -- exact row's Captured timestamp even if a retry carries a new value.
  v_logged_at := CASE
    WHEN v_existing_event_id IS NOT NULL
      THEN COALESCE(
        v_existing_logged_at,
        v_requested_logged_at,
        pg_catalog.clock_timestamp()
      )
    ELSE COALESCE(
      v_requested_logged_at,
      pg_catalog.clock_timestamp()
    )
  END;

  v_call_details := (
    CASE
      WHEN p_details IS NOT NULL
           AND jsonb_typeof(p_details) = 'object'
        THEN p_details
      ELSE '{}'::jsonb
    END
  ) || jsonb_build_object('logged_at', v_logged_at);

  BEGIN
    IF v_existing_event_id IS NOT NULL THEN
      INSERT INTO public.quicklog_audit_events
        (user_id, idempotency_key, grow_event_id, status)
      VALUES
        (
          uid,
          p_idempotency_key,
          v_existing_event_id,
          'duplicate_reused'
        );
      v_result := jsonb_build_object(
        'ok', true,
        'grow_event_id', v_existing_event_id,
        'reused', true
      );
    ELSE
      v_previous_logged_at_context :=
        pg_catalog.current_setting('verdant.quicklog_logged_at', true);
      PERFORM pg_catalog.set_config(
        'verdant.quicklog_logged_at',
        jsonb_build_object('logged_at', v_logged_at)->>'logged_at',
        true
      );
      v_result := public.quicklog_save_manual_pre_logged_at(
        p_target_type,
        p_target_id,
        p_action,
        p_volume_ml,
        p_note,
        p_temperature_c,
        p_humidity_pct,
        p_vpd_kpa,
        p_occurred_at,
        v_call_details,
        p_idempotency_key,
        p_stage
      );
      PERFORM pg_catalog.set_config(
        'verdant.quicklog_logged_at',
        COALESCE(v_previous_logged_at_context, ''),
        true
      );
    END IF;

    IF COALESCE(v_result->>'ok', 'false') <> 'true' THEN
      RETURN v_result;
    END IF;
    v_is_reused := COALESCE(v_result->>'reused', 'false') = 'true';

    v_event_id :=
      public.quicklog_try_parse_uuid(v_result->>'grow_event_id');
    IF v_event_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'quicklog_dual_timestamp_invalid_result';
    END IF;

    IF p_idempotency_key IS NOT NULL
       AND v_existing_event_id IS NULL
       AND NOT v_is_reused THEN
      UPDATE public.quicklog_idempotency AS qi
         SET request_hash = v_request_hash
       WHERE qi.user_id = uid
         AND qi.idempotency_key = p_idempotency_key
         AND qi.grow_event_id = v_event_id
         AND qi.request_hash IS NULL;
      GET DIAGNOSTICS v_hash_update_count = ROW_COUNT;
      IF v_hash_update_count <> 1 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'quicklog_manual_request_hash_missing';
      END IF;
    END IF;

    SELECT ge.grow_id
      INTO v_grow_id
      FROM public.grow_events AS ge
     WHERE ge.id = v_event_id
       AND ge.user_id = uid
       AND ge.logged_at IS NOT DISTINCT FROM v_logged_at;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'quicklog_dual_timestamp_event_missing';
    END IF;

    UPDATE public.diary_entries AS de
       SET logged_at = v_logged_at,
           details = (
             COALESCE(de.details, '{}'::jsonb) - 'logged_at'
           ) || jsonb_build_object('logged_at', v_logged_at)
     WHERE de.user_id = uid
       AND de.grow_id = v_grow_id
       AND (
         public.quicklog_try_parse_uuid(
           de.details->>'linked_grow_event_id'
         ) = v_event_id
         OR public.quicklog_try_parse_uuid(
           de.details->>'grow_event_id'
          ) = v_event_id
        )
       AND (
         de.logged_at IS DISTINCT FROM v_logged_at
         OR public.quicklog_try_parse_logged_at(
              de.details->>'logged_at'
            ) IS DISTINCT FROM v_logged_at
       );
    IF NOT v_is_reused
       AND NOT EXISTS (
         SELECT 1
         FROM public.diary_entries AS de
         WHERE de.user_id = uid
           AND de.grow_id = v_grow_id
           AND (
             public.quicklog_try_parse_uuid(
               de.details->>'linked_grow_event_id'
             ) = v_event_id
             OR public.quicklog_try_parse_uuid(
               de.details->>'grow_event_id'
             ) = v_event_id
           )
           AND de.logged_at IS NOT DISTINCT FROM v_logged_at
           AND public.quicklog_try_parse_logged_at(
                 de.details->>'logged_at'
               ) IS NOT DISTINCT FROM v_logged_at
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'quicklog_dual_timestamp_mirror_missing';
    END IF;

    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.quicklog_audit_events
      (user_id, idempotency_key, status, reason)
    VALUES
      (
        uid,
        p_idempotency_key,
        'save_failed',
        'dual_timestamp_persist_failed'
      );
    RETURN jsonb_build_object('ok', false, 'reason', 'save_failed');
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text, text
) TO authenticated, service_role;

DO $quicklog_manual_reuse_postcondition$
DECLARE
  v_wrapper_oid oid := pg_catalog.to_regprocedure(
    'public.quicklog_save_manual(text, uuid, text, numeric, text, numeric, numeric, numeric, timestamp with time zone, jsonb, text, text)'
  );
BEGIN
  IF v_wrapper_oid IS NULL
     OR pg_catalog.has_function_privilege('anon', v_wrapper_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege(
       'authenticated', v_wrapper_oid, 'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role', v_wrapper_oid, 'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_manual_reuse_postcondition_failed';
  END IF;
END;
$quicklog_manual_reuse_postcondition$;

COMMIT;
