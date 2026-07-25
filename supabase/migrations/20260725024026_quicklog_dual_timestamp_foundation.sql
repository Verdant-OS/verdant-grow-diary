-- Quick Log dual-timestamp persistence foundation.
--
-- `occurred_at` / `entry_at` keep their existing meaning: when the grower
-- says the activity happened. `logged_at` is the Captured timestamp: when
-- the grower recorded the activity. The two values are deliberately allowed
-- to differ.
--
-- This migration is additive and leaves every previously published migration
-- untouched. It:
--   * adds real, indexed logged_at columns;
--   * backfills legacy rows without trusting JSON casts;
--   * correlates diary mirrors only inside one owner + grow boundary;
--   * preserves the current public RPC signatures while wrapping the latest
--     hardened implementations with canonical logged_at persistence;
--   * keeps old/non-Quick-Log insert paths compatible through INSERT triggers.

BEGIN;

-- The immediately preceding core repair owns this dependency. Fail before any
-- DDL or RPC rename if migrations are applied out of order.
DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'quicklog_idempotency'
      AND column_name = 'request_hash'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'quicklog_dual_timestamp_requires_request_hash';
  END IF;
END;
$preflight$;

-- Exception-safe parser for untrusted legacy/caller JSON. The explicit-zone
-- RFC3339 shape makes parsing independent of the session TimeZone/DateStyle.
CREATE FUNCTION public.quicklog_try_parse_logged_at(p_value text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_value timestamptz;
BEGIN
  IF length(p_value) > 64
     OR p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt ][0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?([Zz]|[+-][0-9]{2}:[0-9]{2})$' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_value := p_value::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF NOT pg_catalog.isfinite(v_value) THEN
    RETURN NULL;
  END IF;
  RETURN v_value;
END;
$function$;

CREATE FUNCTION public.quicklog_try_parse_uuid(p_value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_value uuid;
BEGIN
  IF length(p_value) <> 36
     OR p_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_value := p_value::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  RETURN v_value;
END;
$function$;

-- Exact pre-logged_at request hash used only to recognize idempotency records
-- created by the preceding event RPC. Keeping the expression in one protected
-- helper prevents wrapper/test drift while changed payloads still fail closed.
CREATE FUNCTION public.quicklog_event_request_hash_pre_logged_at(
  p_grow_id uuid,
  p_event_type text,
  p_tent_id uuid,
  p_plant_id uuid,
  p_note text,
  p_photo_url text,
  p_occurred_at timestamptz,
  p_sensor_snapshot jsonb,
  p_details jsonb,
  p_water jsonb,
  p_feed jsonb
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
SELECT pg_catalog.md5(
  jsonb_build_object(
    'grow_id', p_grow_id,
    'event_type', p_event_type,
    'tent_id', p_tent_id,
    'plant_id', p_plant_id,
    'note', p_note,
    'photo_url', p_photo_url,
    'occurred_at', p_occurred_at,
    'sensor_snapshot', p_sensor_snapshot,
    'details', p_details,
    'water', p_water,
    'feed', p_feed
  )::text
);
$function$;

REVOKE ALL ON FUNCTION public.quicklog_try_parse_logged_at(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quicklog_try_parse_logged_at(text) FROM anon;
REVOKE ALL ON FUNCTION public.quicklog_try_parse_logged_at(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.quicklog_try_parse_uuid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quicklog_try_parse_uuid(text) FROM anon;
REVOKE ALL ON FUNCTION public.quicklog_try_parse_uuid(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.quicklog_event_request_hash_pre_logged_at(
  uuid, text, uuid, uuid, text, text, timestamptz, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quicklog_event_request_hash_pre_logged_at(
  uuid, text, uuid, uuid, text, text, timestamptz, jsonb, jsonb, jsonb, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.quicklog_event_request_hash_pre_logged_at(
  uuid, text, uuid, uuid, text, text, timestamptz, jsonb, jsonb, jsonb, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.quicklog_event_request_hash_pre_logged_at(
  uuid, text, uuid, uuid, text, text, timestamptz, jsonb, jsonb, jsonb, jsonb
) TO service_role;

ALTER TABLE public.diary_entries
  ADD COLUMN IF NOT EXISTS logged_at timestamptz;
ALTER TABLE public.grow_events
  ADD COLUMN IF NOT EXISTS logged_at timestamptz;

COMMENT ON COLUMN public.diary_entries.logged_at IS
  'Captured timestamp: when the grower recorded this entry. entry_at remains the grower-reported occurrence timestamp.';
COMMENT ON COLUMN public.grow_events.logged_at IS
  'Captured timestamp: when the grower recorded this event. occurred_at remains the grower-reported occurrence timestamp.';

-- Legacy diary backfill: accept the old JSON capture only when it parses and
-- remains within a narrow clock-skew window of the server-created row. An
-- occurrence/backdated value, malformed value, scalar, or absent value fails
-- closed to created_at instead of turning occurrence time into capture time.
WITH diary_capture_candidates AS (
  SELECT
    de.id,
    de.created_at,
    public.quicklog_try_parse_logged_at(
      de.details->>'logged_at'
    ) AS legacy_logged_at
  FROM public.diary_entries AS de
  WHERE de.logged_at IS NULL
)
UPDATE public.diary_entries AS de
SET logged_at = CASE
  WHEN dc.legacy_logged_at BETWEEN
       dc.created_at - interval '5 minutes'
       AND dc.created_at + interval '5 minutes'
    THEN dc.legacy_logged_at
  ELSE dc.created_at
END
FROM diary_capture_candidates AS dc
WHERE de.id = dc.id
  AND de.logged_at IS NULL;

-- Rank every usable diary mirror deterministically. A mirror is eligible only
-- when owner AND grow match the event. Modern linked_grow_event_id wins over
-- the legacy grow_event_id key; closest occurrence, then stable row identity,
-- breaks duplicates without cross-user/cross-grow correlation.
-- The legacy validation trigger rewrites updated_at on every UPDATE, even when
-- only a new compatibility column changes. Disable only that named trigger
-- while this atomic backfill runs, then restore it before any RPC is replaced.
ALTER TABLE public.grow_events DISABLE TRIGGER trg_validate_grow_event;

WITH ranked_mirrors AS (
  SELECT
    ge.id AS grow_event_id,
    de.logged_at,
    row_number() OVER (
      PARTITION BY ge.id
      ORDER BY
        link.key_priority ASC,
        abs(extract(epoch FROM (de.entry_at - ge.occurred_at))) ASC,
        de.entry_at ASC,
        de.id ASC
    ) AS mirror_rank
  FROM public.grow_events AS ge
  JOIN public.diary_entries AS de
    ON de.user_id = ge.user_id
   AND de.grow_id = ge.grow_id
  CROSS JOIN LATERAL (
    VALUES
      (
        0,
        public.quicklog_try_parse_uuid(
          de.details->>'linked_grow_event_id'
        )
      ),
      (
        1,
        public.quicklog_try_parse_uuid(
          de.details->>'grow_event_id'
        )
      )
  ) AS link(key_priority, linked_event_id)
  WHERE ge.logged_at IS NULL
    AND link.linked_event_id = ge.id
),
chosen_mirrors AS (
  SELECT grow_event_id, logged_at
  FROM ranked_mirrors
  WHERE mirror_rank = 1
)
UPDATE public.grow_events AS ge
SET logged_at = cm.logged_at
FROM chosen_mirrors AS cm
WHERE ge.id = cm.grow_event_id
  AND ge.logged_at IS NULL;

UPDATE public.grow_events
SET logged_at = created_at
WHERE logged_at IS NULL;

ALTER TABLE public.grow_events ENABLE TRIGGER trg_validate_grow_event;

CREATE INDEX IF NOT EXISTS idx_diary_entries_grow_logged_at
  ON public.diary_entries (grow_id, logged_at DESC)
  WHERE logged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diary_entries_plant_logged_at
  ON public.diary_entries (plant_id, logged_at DESC)
  WHERE plant_id IS NOT NULL AND logged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diary_entries_tent_logged_at
  ON public.diary_entries (tent_id, logged_at DESC)
  WHERE tent_id IS NOT NULL AND logged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grow_events_user_logged_at
  ON public.grow_events (user_id, logged_at DESC)
  WHERE logged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grow_events_grow_logged_at
  ON public.grow_events (grow_id, logged_at DESC)
  WHERE logged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grow_events_plant_logged_at
  ON public.grow_events (plant_id, logged_at DESC)
  WHERE plant_id IS NOT NULL AND logged_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grow_events_tent_logged_at
  ON public.grow_events (tent_id, logged_at DESC)
  WHERE tent_id IS NOT NULL AND logged_at IS NOT NULL;

-- Compatibility backstops for existing writers that do not know logged_at.
-- Only the trusted wrapper context may supply a capture timestamp. Direct
-- legacy writers are server-stamped at insertion; caller JSON, explicit column
-- values, and occurrence timestamps cannot masquerade as capture time.
CREATE FUNCTION public.quicklog_stamp_diary_logged_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.logged_at := COALESCE(
    public.quicklog_try_parse_logged_at(
      NULLIF(
        pg_catalog.current_setting(
          'verdant.quicklog_logged_at',
          true
        ),
        ''
      )
    ),
    pg_catalog.clock_timestamp()
  );
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.quicklog_stamp_grow_event_logged_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.logged_at := COALESCE(
    public.quicklog_try_parse_logged_at(
      NULLIF(
        pg_catalog.current_setting(
          'verdant.quicklog_logged_at',
          true
        ),
        ''
      )
    ),
    pg_catalog.clock_timestamp()
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.quicklog_stamp_diary_logged_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quicklog_stamp_diary_logged_at() FROM anon;
REVOKE ALL ON FUNCTION public.quicklog_stamp_diary_logged_at() FROM authenticated;
REVOKE ALL ON FUNCTION public.quicklog_stamp_grow_event_logged_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quicklog_stamp_grow_event_logged_at() FROM anon;
REVOKE ALL ON FUNCTION public.quicklog_stamp_grow_event_logged_at() FROM authenticated;

DROP TRIGGER IF EXISTS trg_quicklog_stamp_diary_logged_at
  ON public.diary_entries;
CREATE TRIGGER trg_quicklog_stamp_diary_logged_at
BEFORE INSERT ON public.diary_entries
FOR EACH ROW
EXECUTE FUNCTION public.quicklog_stamp_diary_logged_at();

DROP TRIGGER IF EXISTS trg_quicklog_stamp_grow_event_logged_at
  ON public.grow_events;
CREATE TRIGGER trg_quicklog_stamp_grow_event_logged_at
BEFORE INSERT ON public.grow_events
FOR EACH ROW
EXECUTE FUNCTION public.quicklog_stamp_grow_event_logged_at();

-- Preserve the current hardened implementations byte-for-byte under internal,
-- non-executable names. The public wrappers below keep the exact signatures
-- and delegate all existing validation/ownership/idempotency behavior.
ALTER FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) RENAME TO quicklog_save_event_pre_logged_at;

ALTER FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text, text
) RENAME TO quicklog_save_manual_pre_logged_at;

REVOKE ALL ON FUNCTION public.quicklog_save_event_pre_logged_at(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quicklog_save_event_pre_logged_at(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.quicklog_save_event_pre_logged_at(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) FROM authenticated;

REVOKE ALL ON FUNCTION public.quicklog_save_manual_pre_logged_at(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quicklog_save_manual_pre_logged_at(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.quicklog_save_manual_pre_logged_at(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text, text
) FROM authenticated;

CREATE FUNCTION public.quicklog_save_event(
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
  v_existing_request_hash text;
  v_legacy_request_hash text;
  v_raw_details_fingerprint text;
  v_previous_logged_at_context text;
  v_call_details jsonb;
  v_result jsonb;
  v_event_id uuid;
  v_grow_id uuid;
  v_is_reused boolean := false;
  v_is_exact_legacy_retry boolean := false;
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

    SELECT qi.grow_event_id, ge.logged_at, qi.request_hash
      INTO
        v_existing_event_id,
        v_existing_logged_at,
        v_existing_request_hash
      FROM public.quicklog_idempotency AS qi
      JOIN public.grow_events AS ge
        ON ge.id = qi.grow_event_id
       AND ge.user_id = uid
     WHERE qi.user_id = uid
       AND qi.idempotency_key = p_idempotency_key;
  END IF;

  -- Before this migration, request_hash covered the caller's original details
  -- without an injected logged_at key. Recognize that exact legacy hash before
  -- validating the newly-introduced field: the old request may contain a value
  -- that is malformed or future by today's contract, but only a byte-for-byte
  -- equivalent legacy payload may reuse its original row.
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
  v_is_exact_legacy_retry :=
    v_existing_event_id IS NOT NULL
    AND v_existing_request_hash IS NOT NULL
    AND v_existing_request_hash = v_legacy_request_hash;

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
  v_call_details := jsonb_build_object(
    '__verdant_request_details_hash_v1',
    v_raw_details_fingerprint
  ) || jsonb_build_object('logged_at', v_logged_at);

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

CREATE FUNCTION public.quicklog_save_manual(
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

  -- The established manual contract validates/reuses its idempotency key
  -- before any payload field. Preserve that order exactly: an existing key
  -- ignores changed retry input, including malformed/future Captured values.
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

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        uid::text || ':' || p_idempotency_key,
        0
      )
    );

    SELECT qi.grow_event_id, ge.logged_at
      INTO v_existing_event_id, v_existing_logged_at
      FROM public.quicklog_idempotency AS qi
      JOIN public.grow_events AS ge
        ON ge.id = qi.grow_event_id
       AND ge.user_id = uid
     WHERE qi.user_id = uid
       AND qi.idempotency_key = p_idempotency_key;
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

REVOKE ALL ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) FROM anon;
GRANT EXECUTE ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) TO authenticated;

REVOKE ALL ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text, text
) TO authenticated;

COMMENT ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb,
  timestamptz, jsonb, jsonb, jsonb
) IS
  'Authenticated Quick Log event writer. Persists canonical Captured logged_at separately from occurred_at and preserves atomic per-user idempotency.';
COMMENT ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric,
  timestamptz, jsonb, text, text
) IS
  'Authenticated legacy Quick Log writer. Persists canonical Captured logged_at separately from occurred_at while preserving the existing retry contract.';

COMMIT;

NOTIFY pgrst, 'reload schema';
