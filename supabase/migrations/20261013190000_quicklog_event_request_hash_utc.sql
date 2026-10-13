-- Bind the Quick Log event idempotency hash to instants, not to the session
-- TimeZone's rendering of them.
--
-- The frozen delegate quicklog_save_event_pre_logged_at hashes p_occurred_at
-- and the wrapper-supplied details (which carry logged_at) through
-- jsonb_build_object, and jsonb renders a timestamptz in the session
-- TimeZone (PostgREST honours Prefer: timezone). The same instant therefore
-- hashed differently per session zone, and an exact retry from another zone
-- was refused as idempotency_key_conflict. Every keyed event save was
-- exposed, including p_occurred_at = NULL, through logged_at.
--
-- The delegate body cannot change, so this wrapper runs the delegate under
-- TimeZone UTC: the stored hash is byte-identical to what a UTC session
-- already stored. A hash stored before this repair by a non-UTC session is
-- still accepted from a session rendering the same offset; the pre-dual-
-- timestamp legacy hash is accepted in its caller-zone or UTC form. The
-- caller's TimeZone is restored before the wrapper returns.
--
-- Wrapper only. No table, policy, delegate, helper or ACL change; proconfig
-- is unchanged.
BEGIN;

DO $quicklog_event_request_hash_utc_preflight$
DECLARE
  v_wrapper_oid oid := pg_catalog.to_regprocedure(
    'public.quicklog_save_event(text, uuid, text, uuid, uuid, text, text, jsonb, timestamp with time zone, jsonb, jsonb, jsonb)'
  );
  v_delegate_oid oid := pg_catalog.to_regprocedure(
    'public.quicklog_save_event_pre_logged_at(text, uuid, text, uuid, uuid, text, text, jsonb, timestamp with time zone, jsonb, jsonb, jsonb)'
  );
  v_helper_oid oid := pg_catalog.to_regprocedure(
    'public.quicklog_event_request_hash_pre_logged_at(uuid, text, uuid, uuid, text, text, timestamp with time zone, jsonb, jsonb, jsonb, jsonb)'
  );
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261001, 190000);
  IF v_wrapper_oid IS NULL OR v_delegate_oid IS NULL OR v_helper_oid IS NULL
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
             -- 20261001140000 mirrorless-legacy wrapper
             = '959d2add8823a738560dec9e9f53920e'
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
             = '674f6b2718cd1a68c15970663e185b57'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS p
       WHERE p.oid = v_helper_oid
         AND p.provolatile = 's'
         AND p.prorettype = 'text'::pg_catalog.regtype
         AND p.proconfig = ARRAY['search_path=pg_catalog, pg_temp']::text[]
         AND pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', ''))
             = '7d5fe89b921c640c848ee2293ea1d264'
     )
     OR pg_catalog.has_function_privilege('anon', v_wrapper_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege(
       'authenticated', v_wrapper_oid, 'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_event_request_hash_utc_preflight_unrecognized';
  END IF;
END;
$quicklog_event_request_hash_utc_preflight$;

CREATE OR REPLACE FUNCTION public.quicklog_save_event(
  p_idempotency_key text,
  p_grow_id uuid,
  p_event_type text,
  p_tent_id uuid DEFAULT NULL,
  p_plant_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_photo_url text DEFAULT NULL,
  p_sensor_snapshot jsonb DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_water jsonb DEFAULT NULL,
  p_feed jsonb DEFAULT NULL
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
  v_existing_grow_id uuid;
  v_existing_deleted boolean;
  v_existing_request_hash text;
  v_legacy_request_hash text;
  v_legacy_request_hash_utc text;
  v_caller_time_zone text := pg_catalog.current_setting('TimeZone');
  v_session_call_details jsonb;
  v_is_session_hash_retry boolean := false;
  v_raw_details_fingerprint text;
  v_previous_logged_at_context text;
  v_call_details jsonb;
  v_result jsonb;
  v_event_id uuid;
  v_grow_id uuid;
  v_is_reused boolean := false;
  v_is_exact_legacy_retry boolean := false;
  v_is_mirrorless_legacy_retry boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Preserve the delegate's established validation order. An invalid or
  -- missing idempotency key cannot write, so it needs no capture envelope.
  IF p_idempotency_key IS NULL
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
    RETURN public.quicklog_save_event_pre_logged_at(
      p_idempotency_key,
      p_grow_id,
      p_event_type,
      p_tent_id,
      p_plant_id,
      p_note,
      p_photo_url,
      p_sensor_snapshot,
      p_occurred_at,
      p_details,
      p_water,
      p_feed
    );
  END IF;

  -- Serialize the timestamp freeze point for one user + idempotency key.
  -- A concurrent/retried request that omitted logged_at reuses the timestamp
  -- persisted by the winner, so the delegated request hash remains stable.
  IF p_idempotency_key IS NOT NULL
     AND length(p_idempotency_key) BETWEEN 8 AND 200 THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        uid::text || ':' || p_idempotency_key,
        0
      )
    );

    SELECT qi.grow_event_id, ge.logged_at, ge.grow_id,
           ge.is_deleted, qi.request_hash
      INTO
        v_existing_event_id,
        v_existing_logged_at,
        v_existing_grow_id,
        v_existing_deleted,
        v_existing_request_hash
      FROM public.quicklog_idempotency AS qi
      JOIN public.grow_events AS ge
        ON ge.id = qi.grow_event_id
       AND ge.user_id = uid
     WHERE qi.user_id = uid
       AND qi.idempotency_key = p_idempotency_key
     FOR UPDATE OF ge;
  END IF;

  -- Before the dual-timestamp foundation, request_hash covered the caller's
  -- original details without an injected logged_at key. A session may have
  -- stored it in any TimeZone: recognize the caller-zone rendering and the
  -- UTC rendering of the same instant.
  v_legacy_request_hash :=
    public.quicklog_event_request_hash_pre_logged_at(
      p_grow_id,
      p_event_type,
      p_tent_id,
      p_plant_id,
      p_note,
      p_photo_url,
      p_occurred_at,
      p_sensor_snapshot,
      p_details,
      p_water,
      p_feed
  );
  PERFORM pg_catalog.set_config('TimeZone', 'UTC', true);
  v_legacy_request_hash_utc :=
    public.quicklog_event_request_hash_pre_logged_at(
      p_grow_id,
      p_event_type,
      p_tent_id,
      p_plant_id,
      p_note,
      p_photo_url,
      p_occurred_at,
      p_sensor_snapshot,
      p_details,
      p_water,
      p_feed
  );
  PERFORM pg_catalog.set_config('TimeZone', v_caller_time_zone, true);

  -- A prior key may only return success while its event and diary receipt
  -- are still active. Hold the event through this transaction: every
  -- correction/retraction locks that event before writing. Do not wait for
  -- the diary row, because a diary-first revision can hold it while waiting
  -- for our event lock.
  IF v_existing_event_id IS NOT NULL THEN
    IF v_existing_deleted THEN
      INSERT INTO public.quicklog_audit_events
        (user_id, idempotency_key, grow_event_id, status, reason)
      VALUES
        (uid, p_idempotency_key, v_existing_event_id,
         'validation_failed', 'idempotency_key_retracted');
      RETURN jsonb_build_object(
        'ok', false, 'reason', 'idempotency_key_retracted'
      );
    END IF;

    PERFORM 1
      FROM public.diary_entries AS de
     WHERE de.user_id = uid
       AND de.grow_id = v_existing_grow_id
       AND de.retracted_at IS NULL
       AND (
         public.quicklog_try_parse_uuid(
           de.details->>'linked_grow_event_id'
         ) = v_existing_event_id
         OR public.quicklog_try_parse_uuid(
           de.details->>'grow_event_id'
         ) = v_existing_event_id
       )
     ORDER BY de.id
     LIMIT 1;
    IF NOT FOUND THEN
      -- Before the dual-timestamp foundation, the delegate saved an event
      -- without a diary companion when its request carried no sensor
      -- metrics, photo, details, water or feed (its v_needs_diary was
      -- false). An exact retry of such a request still owns an active
      -- receipt; only a companion that was retracted or removed is missing.
      v_is_mirrorless_legacy_retry :=
        v_existing_request_hash IS NOT NULL
        AND v_existing_request_hash IN (
          v_legacy_request_hash,
          v_legacy_request_hash_utc
        )
        AND NOT (
          (
            p_sensor_snapshot IS NOT NULL
            AND jsonb_typeof(p_sensor_snapshot) = 'object'
            AND jsonb_typeof(p_sensor_snapshot->'metrics') = 'object'
            AND p_sensor_snapshot->'metrics' <> '{}'::jsonb
          )
          OR (p_photo_url IS NOT NULL AND length(p_photo_url) > 0)
          OR (
            p_details IS NOT NULL
            AND jsonb_typeof(p_details) = 'object'
            AND p_details <> '{}'::jsonb
          )
          OR p_water IS NOT NULL
          OR p_feed IS NOT NULL
        );
      IF NOT v_is_mirrorless_legacy_retry THEN
        INSERT INTO public.quicklog_audit_events
          (user_id, idempotency_key, grow_event_id, status, reason)
        VALUES
          (uid, p_idempotency_key, v_existing_event_id,
           'validation_failed', 'idempotency_receipt_missing');
        RETURN jsonb_build_object(
          'ok', false, 'reason', 'idempotency_receipt_missing'
        );
      END IF;
    END IF;
  END IF;

  -- Recognize the exact legacy hash (computed above) before validating the
  -- newly-introduced field: the old request may contain a value that is
  -- malformed or future by today's contract, but only a byte-for-byte
  -- equivalent legacy payload may reuse its original row.
  v_is_exact_legacy_retry :=
    v_existing_event_id IS NOT NULL
    AND v_existing_request_hash IS NOT NULL
    AND v_existing_request_hash IN (
      v_legacy_request_hash,
      v_legacy_request_hash_utc
    );

  -- Let the preserved delegate reject invalid raw details itself. Those
  -- values cannot reach a write, and delegation retains the exact
  -- event/water/feed/note-versus-details validation order without copying its
  -- rule table into this wrapper. Exact legacy retries remain exempt because
  -- the matching stored hash proves that the same payload already passed the
  -- pre-migration contract.
  IF NOT v_is_exact_legacy_retry
     AND p_details IS NOT NULL
     AND (
       length(p_details::text) > 20000
       OR p_details::text
            ~ '(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}|sk_(live|test)_[A-Za-z0-9]{12,})'
       OR (
         jsonb_typeof(p_details) = 'object'
         AND EXISTS (
           SELECT 1
           FROM jsonb_object_keys(p_details) AS dk
           WHERE dk IN (
             'user_id',
             'grow_id',
             'tent_id',
             'plant_id',
             'auth_uid',
             'auth.uid'
           )
         )
       )
     ) THEN
    RETURN public.quicklog_save_event_pre_logged_at(
      p_idempotency_key,
      p_grow_id,
      p_event_type,
      p_tent_id,
      p_plant_id,
      p_note,
      p_photo_url,
      p_sensor_snapshot,
      p_occurred_at,
      p_details,
      p_water,
      p_feed
    );
  END IF;

  IF NOT v_is_exact_legacy_retry
     AND p_details IS NOT NULL
     AND jsonb_typeof(p_details) = 'object'
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

  v_logged_at := CASE
    WHEN v_existing_event_id IS NOT NULL
         AND v_requested_logged_at IS NULL
      THEN COALESCE(
        v_existing_logged_at,
        pg_catalog.clock_timestamp()
      )
    ELSE COALESCE(
      v_requested_logged_at,
      pg_catalog.clock_timestamp()
    )
  END;

  -- Normalize every valid raw details shape into the same internal envelope.
  -- Hashing the type-tagged raw value keeps null/scalar/array/object identities
  -- distinct and prevents a caller object from impersonating a non-object
  -- marker. The companion diary update reconstructs valid grower object fields
  -- and removes the envelope before persistence becomes visible.
  v_raw_details_fingerprint := pg_catalog.md5(
    jsonb_build_object(
      'is_sql_null', p_details IS NULL,
      'json_type', jsonb_typeof(p_details),
      'value', p_details
    )::text
  );
  v_session_call_details := jsonb_build_object(
    '__verdant_request_details_hash_v1',
    v_raw_details_fingerprint
  ) || jsonb_build_object('logged_at', v_logged_at);
  -- The delegate hashes timestamptz values in the session TimeZone. A hash
  -- stored before the UTC repair by a non-UTC session is still recognized
  -- from a session rendering the same offset (the helper's field set is the
  -- delegate's). Every other request is hashed under UTC below.
  v_is_session_hash_retry :=
    v_existing_event_id IS NOT NULL
    AND v_existing_request_hash IS NOT NULL
    AND v_existing_request_hash =
      public.quicklog_event_request_hash_pre_logged_at(
        p_grow_id,
        p_event_type,
        p_tent_id,
        p_plant_id,
        p_note,
        p_photo_url,
        p_occurred_at,
        p_sensor_snapshot,
        v_session_call_details,
        p_water,
        p_feed
      );

  BEGIN
    IF v_is_exact_legacy_retry THEN
      INSERT INTO public.quicklog_audit_events
        (user_id, idempotency_key, status)
      VALUES
        (uid, p_idempotency_key, 'save_started');
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
      -- Canonical hash form: the exact text a UTC session renders. Restored
      -- immediately after the call; an aborted block reverts it itself.
      PERFORM pg_catalog.set_config(
        'TimeZone',
        CASE
          WHEN v_is_session_hash_retry THEN v_caller_time_zone
          ELSE 'UTC'
        END,
        true
      );
      v_call_details := jsonb_build_object(
        '__verdant_request_details_hash_v1',
        v_raw_details_fingerprint
      ) || jsonb_build_object('logged_at', v_logged_at);
      v_result := public.quicklog_save_event_pre_logged_at(
        p_idempotency_key,
        p_grow_id,
        p_event_type,
        p_tent_id,
        p_plant_id,
        p_note,
        p_photo_url,
        p_sensor_snapshot,
        p_occurred_at,
        v_call_details,
        p_water,
        p_feed
      );
      PERFORM pg_catalog.set_config('TimeZone', v_caller_time_zone, true);
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

    -- Keep the timestamp foundation's sequential backfill behavior, but
    -- never wait on a mirror held by a diary-first revision. Fresh rows are
    -- ours already; their required timestamp postcondition remains below.
    WITH editable_mirrors AS (
      SELECT de.id
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
        AND (
          NOT v_is_reused
          OR de.logged_at IS DISTINCT FROM v_logged_at
          OR public.quicklog_try_parse_logged_at(
               de.details->>'logged_at'
             ) IS DISTINCT FROM v_logged_at
        )
      FOR UPDATE OF de SKIP LOCKED
    )
    UPDATE public.diary_entries AS de
       SET logged_at = v_logged_at,
           details = (
             CASE
               WHEN v_is_exact_legacy_retry
                 THEN COALESCE(de.details, '{}'::jsonb) - 'logged_at'
               ELSE (
                 CASE
                   WHEN p_details IS NOT NULL
                        AND jsonb_typeof(p_details) = 'object'
                     THEN p_details
                   ELSE '{}'::jsonb
                 END
               ) || (
                 COALESCE(de.details, '{}'::jsonb)
                   - 'logged_at'
                   - '__verdant_request_details_hash_v1'
               )
             END
           ) || jsonb_build_object('logged_at', v_logged_at)
      FROM editable_mirrors AS mirror
     WHERE de.id = mirror.id;
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
        AND (
          v_is_exact_legacy_retry
          OR (
            p_details IS NOT NULL
            AND jsonb_typeof(p_details) = 'object'
            AND p_details ? '__verdant_request_details_hash_v1'
            AND de.details->'__verdant_request_details_hash_v1'
                  IS NOT DISTINCT FROM
                p_details->'__verdant_request_details_hash_v1'
          )
          OR (
            (
              p_details IS NULL
              OR jsonb_typeof(p_details) <> 'object'
              OR NOT (
                p_details ? '__verdant_request_details_hash_v1'
              )
            )
            AND NOT (
              de.details ? '__verdant_request_details_hash_v1'
            )
          )
        )
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

REVOKE ALL ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) FROM anon;
GRANT EXECUTE ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
)
  TO authenticated, service_role;

DO $quicklog_event_request_hash_utc_postcondition$
DECLARE
  v_wrapper_oid oid := pg_catalog.to_regprocedure(
    'public.quicklog_save_event(text, uuid, text, uuid, uuid, text, text, jsonb, timestamp with time zone, jsonb, jsonb, jsonb)'
  );
BEGIN
  IF v_wrapper_oid IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS p
       JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
       WHERE p.oid = v_wrapper_oid
         AND p.prosecdef
         AND owner_role.rolname = 'postgres'
         AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]
         AND pg_catalog.md5(pg_catalog.replace(p.prosrc, E'\r', ''))
             = '834408e54794ac4980757f86699ce45c'
     )
     OR pg_catalog.has_function_privilege('anon', v_wrapper_oid, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege(
       'authenticated', v_wrapper_oid, 'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'service_role', v_wrapper_oid, 'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_event_request_hash_utc_postcondition_failed';
  END IF;
END;
$quicklog_event_request_hash_utc_postcondition$;

COMMIT;
