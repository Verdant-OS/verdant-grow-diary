-- quicklog_save_event v2: atomic idempotency race handler + safe JSON return
--
-- This migration updates quicklog_save_event to satisfy the trust-boundary
-- static tests in src/test/quicklog-save-event-rpc-trust-boundary.test.ts.
--
-- Changes from the previous definition (20260703093500):
--   1. WHEN unique_violation handler: concurrent replay of the same
--      idempotency key now re-reads quicklog_idempotency and returns
--      {ok:true, reused:true, grow_event_id} instead of rolling back.
--   2. WHEN OTHERS handler: no longer re-raises. Returns
--      {ok:false, reason:'save_failed'} so callers receive a calm, typed
--      envelope instead of a Postgres exception.
--
-- No behavior change to the happy path, validation, or sensor logic.
-- Grants remain: REVOKE from PUBLIC + anon, GRANT EXECUTE to authenticated only.

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
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_existing uuid;
  v_event_id uuid;
  v_plant_grow uuid;
  v_plant_tent uuid;
  v_tent_grow uuid;
  v_occurred timestamptz := COALESCE(p_occurred_at, now());
  v_metrics jsonb;
  v_src text;
  v_cap text;
  v_has_snapshot boolean := false;
  v_has_extra_details boolean := false;
  v_needs_diary boolean := false;
  v_details jsonb;
  v_extra jsonb;
  k text;
  v_val jsonb;
  v_water jsonb;
  v_feed jsonb;
  v_feed_products jsonb;
  v_feed_line text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_idempotency_key');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_idempotency_key');
  END IF;

  IF p_event_type NOT IN (
    'observation','watering','feeding','photo','environment','training',
    'harvest','cure_check'
  ) THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_event_type');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_event_type');
  END IF;

  -- Typed payload / event_type coherence. Fail before ANY writes so mismatch
  -- produces zero grow_events, subtype rows, diary rows, or idempotency rows.
  IF p_water IS NOT NULL AND p_event_type <> 'watering' THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
  END IF;
  IF p_feed IS NOT NULL AND p_event_type <> 'feeding' THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
  END IF;
  IF p_water IS NOT NULL AND jsonb_typeof(p_water) <> 'object' THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
  END IF;
  IF p_feed IS NOT NULL AND jsonb_typeof(p_feed) <> 'object' THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
  END IF;
  IF p_feed IS NOT NULL
     AND p_feed ? 'products'
     AND jsonb_typeof(p_feed->'products') <> 'array' THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
  END IF;

  INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status)
    VALUES (uid, p_idempotency_key, 'save_started');

  SELECT grow_event_id INTO v_existing
    FROM public.quicklog_idempotency
   WHERE user_id = uid AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, grow_event_id, status)
      VALUES (uid, p_idempotency_key, v_existing, 'duplicate_reused');
    RETURN jsonb_build_object('ok', true, 'grow_event_id', v_existing, 'reused', true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.grows WHERE id = p_grow_id AND user_id = uid) THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'grow_not_owned');
    RETURN jsonb_build_object('ok', false, 'reason', 'grow_not_owned');
  END IF;

  IF p_tent_id IS NOT NULL THEN
    SELECT grow_id INTO v_tent_grow FROM public.tents
      WHERE id = p_tent_id AND user_id = uid;
    IF NOT FOUND OR v_tent_grow IS DISTINCT FROM p_grow_id THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
        VALUES (uid, p_idempotency_key, 'validation_failed', 'tent_not_in_grow');
      RETURN jsonb_build_object('ok', false, 'reason', 'tent_not_in_grow');
    END IF;
  END IF;

  IF p_plant_id IS NOT NULL THEN
    SELECT grow_id, tent_id INTO v_plant_grow, v_plant_tent
      FROM public.plants WHERE id = p_plant_id AND user_id = uid;
    IF NOT FOUND OR v_plant_grow IS DISTINCT FROM p_grow_id THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
        VALUES (uid, p_idempotency_key, 'validation_failed', 'plant_not_in_grow');
      RETURN jsonb_build_object('ok', false, 'reason', 'plant_not_in_grow');
    END IF;
    IF p_tent_id IS NOT NULL AND v_plant_tent IS NOT NULL AND v_plant_tent <> p_tent_id THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
        VALUES (uid, p_idempotency_key, 'validation_failed', 'plant_not_in_tent');
      RETURN jsonb_build_object('ok', false, 'reason', 'plant_not_in_tent');
    END IF;
  END IF;

  IF p_sensor_snapshot IS NOT NULL AND jsonb_typeof(p_sensor_snapshot) = 'object' THEN
    v_metrics := p_sensor_snapshot->'metrics';
    IF v_metrics IS NOT NULL AND jsonb_typeof(v_metrics) = 'object'
       AND (SELECT count(*) FROM jsonb_object_keys(v_metrics)) > 0 THEN
      FOR k, v_val IN SELECT * FROM jsonb_each(v_metrics) LOOP
        IF jsonb_typeof(v_val) <> 'number' THEN
          INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
            VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_sensor_metric');
          RETURN jsonb_build_object('ok', false, 'reason', 'invalid_sensor_metric');
        END IF;
      END LOOP;
      v_src := p_sensor_snapshot->>'source';
      v_cap := p_sensor_snapshot->>'captured_at';
      IF v_src IS NULL OR length(btrim(v_src)) = 0 THEN
        INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
          VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_sensor_source');
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_sensor_source');
      END IF;
      BEGIN
        PERFORM v_cap::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
          VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_sensor_captured_at');
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_sensor_captured_at');
      END;
      v_has_snapshot := true;
    END IF;
  END IF;

  IF p_details IS NOT NULL
     AND jsonb_typeof(p_details) = 'object'
     AND (SELECT count(*) FROM jsonb_object_keys(p_details)) > 0 THEN
    v_extra := p_details;
    v_has_extra_details := true;
  ELSE
    v_extra := '{}'::jsonb;
  END IF;

  -- Sanitize typed payloads: whitelist keys only.
  IF p_water IS NOT NULL THEN
    v_water := jsonb_strip_nulls(jsonb_build_object(
      'volume_ml',    p_water->'volume_ml',
      'ph',           p_water->'ph',
      'ec_ms_cm',     p_water->'ec_ms_cm',
      'runoff_ml',    p_water->'runoff_ml',
      'runoff_ph',    p_water->'runoff_ph',
      'runoff_ec',    p_water->'runoff_ec',
      'water_temp_c', p_water->'water_temp_c'
    ));
  END IF;

  IF p_feed IS NOT NULL THEN
    v_feed_products := COALESCE(p_feed->'products', '[]'::jsonb);
    v_feed_line := COALESCE(NULLIF(btrim(COALESCE(p_feed->>'line_id','')), ''), 'default');
    v_feed := jsonb_strip_nulls(jsonb_build_object(
      'line_id',      v_feed_line,
      'products',     v_feed_products,
      'volume_ml',    p_feed->'volume_ml',
      'ph',           p_feed->'ph',
      'ec_in',        p_feed->'ec_in',
      'ec_out',       p_feed->'ec_out',
      'runoff_ml',    p_feed->'runoff_ml',
      'runoff_ph',    p_feed->'runoff_ph',
      'runoff_ec',    p_feed->'runoff_ec',
      'water_temp_c', p_feed->'water_temp_c'
    ));
  END IF;

  v_needs_diary := v_has_snapshot
                 OR (p_photo_url IS NOT NULL AND length(p_photo_url) > 0)
                 OR v_has_extra_details
                 OR v_water IS NOT NULL
                 OR v_feed  IS NOT NULL;

  BEGIN
    INSERT INTO public.grow_events
      (user_id, grow_id, tent_id, plant_id, event_type, source, occurred_at, note)
    VALUES
      (uid, p_grow_id, p_tent_id, p_plant_id, p_event_type, 'manual', v_occurred, NULLIF(p_note, ''))
    RETURNING id INTO v_event_id;

    -- Subtype writes are atomic with the spine. Any trigger validation
    -- failure raises and rolls back the whole save (no orphan spine, diary,
    -- or idempotency row).
    IF v_water IS NOT NULL THEN
      INSERT INTO public.watering_events
        (event_id, user_id, volume_ml, ph, ec_ms_cm,
         runoff_ml, runoff_ph, runoff_ec, water_temp_c)
      VALUES
        (v_event_id, uid,
         NULLIF(v_water->>'volume_ml','')::numeric,
         NULLIF(v_water->>'ph','')::numeric,
         NULLIF(v_water->>'ec_ms_cm','')::numeric,
         NULLIF(v_water->>'runoff_ml','')::numeric,
         NULLIF(v_water->>'runoff_ph','')::numeric,
         NULLIF(v_water->>'runoff_ec','')::numeric,
         NULLIF(v_water->>'water_temp_c','')::numeric);
    END IF;

    IF v_feed IS NOT NULL THEN
      INSERT INTO public.feeding_events
        (event_id, user_id, line_id, products,
         volume_ml, ph, ec_in, ec_out,
         runoff_ml, runoff_ph, runoff_ec, water_temp_c)
      VALUES
        (v_event_id, uid,
         COALESCE(v_feed->>'line_id', 'default'),
         COALESCE(v_feed->'products', '[]'::jsonb),
         NULLIF(v_feed->>'volume_ml','')::numeric,
         NULLIF(v_feed->>'ph','')::numeric,
         NULLIF(v_feed->>'ec_in','')::numeric,
         NULLIF(v_feed->>'ec_out','')::numeric,
         NULLIF(v_feed->>'runoff_ml','')::numeric,
         NULLIF(v_feed->>'runoff_ph','')::numeric,
         NULLIF(v_feed->>'runoff_ec','')::numeric,
         NULLIF(v_feed->>'water_temp_c','')::numeric);
    END IF;

    IF v_needs_diary THEN
      v_details := v_extra || jsonb_build_object(
        'sensor_snapshot', CASE WHEN v_has_snapshot THEN jsonb_build_object(
            'source', v_src,
            'captured_at', v_cap,
            'metrics', v_metrics
          ) ELSE NULL END,
        'photo_url', p_photo_url,
        'watering', v_water,
        'feeding',  v_feed,
        'quick_log_version', 2,
        'linked_grow_event_id', v_event_id
      );
      INSERT INTO public.diary_entries
        (user_id, grow_id, tent_id, plant_id, note, entry_at, details)
      VALUES
        (uid, p_grow_id, p_tent_id, p_plant_id,
         COALESCE(NULLIF(btrim(p_note), ''), '(quick log)'),
         v_occurred, v_details);
    END IF;

    INSERT INTO public.quicklog_idempotency (user_id, idempotency_key, grow_event_id)
      VALUES (uid, p_idempotency_key, v_event_id);
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent replay of the same idempotency key: re-read the committed
    -- row and return the same reused envelope so the caller gets an
    -- idempotent response with no duplicate companion rows.
    SELECT grow_event_id INTO v_existing
      FROM public.quicklog_idempotency
     WHERE user_id = uid AND idempotency_key = p_idempotency_key;
    -- Guard: in theory the idempotency row could be missing here if it was
    -- deleted between the unique_violation firing and this re-read (e.g. a
    -- concurrent DELETE). In practice this is only possible outside normal
    -- app flow (service-role maintenance), but we guard defensively so the
    -- function always returns a typed envelope rather than null fields.
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'save_failed');
    END IF;
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, grow_event_id, status)
      VALUES (uid, p_idempotency_key, v_existing, 'duplicate_reused');
    RETURN jsonb_build_object('ok', true, 'grow_event_id', v_existing, 'reused', true);
  WHEN OTHERS THEN
    -- Record SQLSTATE only (5-char code) to avoid leaking raw error text,
    -- then return a calm typed envelope instead of re-raising.
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'save_failed', SQLSTATE);
    RETURN jsonb_build_object('ok', false, 'reason', 'save_failed');
  END;

  INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, grow_event_id, status)
    VALUES (uid, p_idempotency_key, v_event_id, 'save_succeeded');

  RETURN jsonb_build_object('ok', true, 'grow_event_id', v_event_id, 'reused', false);
END;
$function$;

-- Tighten grants: authenticated only (matches the original 20260626213951 posture).
REVOKE ALL ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz, jsonb, jsonb, jsonb
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz, jsonb, jsonb, jsonb
) FROM anon;
GRANT EXECUTE ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz, jsonb, jsonb, jsonb
) TO authenticated;

-- Refresh PostgREST schema cache so grant changes take effect immediately.
NOTIFY pgrst, 'reload schema';
