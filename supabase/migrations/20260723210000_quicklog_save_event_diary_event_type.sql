-- quicklog_save_event: stamp the server-validated event type onto the diary
-- companion row's details.
--
-- Bug (Codex review, PR #441): the diary_entries mirror INSERT carries no event
-- type (the table has no event_type column and the details object omitted it),
-- so normalizeDiaryEntry defaulted every quick-log companion to "note" — a
-- Training save showed a "Note" badge on Recent Plant Activity.
--
-- Change (single behavioral edit; everything else is byte-identical to the
-- 20260721193923 definition): v_details now includes
--   'event_type', p_event_type
-- in the built object (the RIGHT operand of `v_extra || jsonb_build_object(...)`),
-- so the server-validated type overrides any caller-supplied
-- p_details.event_type. details.event_type is the established diary-row
-- convention (action_followup / action_outcome rows already use it), and the
-- client read layer (diaryEntryRules.normalizeDiaryEntry) accepts it as an
-- allow-listed fallback when no top-level type exists.
--
-- Signature is unchanged, so CREATE OR REPLACE is safe (no DROP: the 12-arg
-- signature is preserved). Grants re-issued below per RPC-migration policy.

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
  v_existing_hash text;
  v_request_hash text;
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
  v_num numeric;
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
  IF p_feed IS NOT NULL AND p_feed ? 'products' AND jsonb_typeof(p_feed->'products') <> 'array' THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
  END IF;

  IF p_water IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_water) AS wk
      WHERE wk NOT IN ('volume_ml','ph','ec_ms_cm','runoff_ml','runoff_ph','runoff_ec','water_temp_c')
    ) THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
        VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
    END IF;
    FOR k, v_val IN SELECT * FROM jsonb_each(p_water) LOOP
      IF jsonb_typeof(v_val) <> 'number' THEN
        INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
          VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
      END IF;
      v_num := (p_water->>k)::numeric;
      IF NOT (
        (k IN ('ph','runoff_ph') AND v_num >= 0 AND v_num <= 14) OR
        (k IN ('ec_ms_cm','runoff_ec') AND v_num >= 0 AND v_num <= 10) OR
        (k IN ('volume_ml','runoff_ml') AND v_num >= 0 AND v_num <= 1000000) OR
        (k = 'water_temp_c' AND v_num >= -10 AND v_num <= 60)
      ) THEN
        INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
          VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
      END IF;
    END LOOP;
  END IF;

  IF p_feed IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_feed) AS fk
      WHERE fk NOT IN ('line_id','products','volume_ml','ph','ec_in','ec_out','runoff_ml','runoff_ph','runoff_ec','water_temp_c')
    ) THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
        VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
    END IF;
    IF jsonb_array_length(COALESCE(p_feed->'products', '[]'::jsonb)) > 24
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(p_feed->'products', '[]'::jsonb)) AS pe
         WHERE jsonb_typeof(pe) <> 'object'
       ) THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
        VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
    END IF;
    FOR k, v_val IN SELECT * FROM jsonb_each(p_feed) LOOP
      IF k IN ('volume_ml','ph','ec_in','ec_out','runoff_ml','runoff_ph','runoff_ec','water_temp_c') THEN
        IF jsonb_typeof(v_val) <> 'number' THEN
          INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
            VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
          RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
        END IF;
        v_num := (p_feed->>k)::numeric;
        IF NOT (
          (k IN ('ph','runoff_ph') AND v_num >= 0 AND v_num <= 14) OR
          (k IN ('ec_in','ec_out','runoff_ec') AND v_num >= 0 AND v_num <= 10) OR
          (k IN ('volume_ml','runoff_ml') AND v_num >= 0 AND v_num <= 1000000) OR
          (k = 'water_temp_c' AND v_num >= -10 AND v_num <= 60)
        ) THEN
          INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
            VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
          RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF p_note IS NOT NULL AND length(p_note) > 500 THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
  END IF;
  IF p_details IS NOT NULL AND length(p_details::text) > 20000 THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
  END IF;
  IF p_details IS NOT NULL AND jsonb_typeof(p_details) = 'object' AND EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_details) AS dk
    WHERE dk IN ('user_id','grow_id','tent_id','plant_id','auth_uid','auth.uid')
  ) THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
  END IF;
  IF p_details IS NOT NULL AND p_details::text ~ '(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}|sk_(live|test)_[A-Za-z0-9]{12,})' THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_typed_payload');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_typed_payload');
  END IF;

  INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status)
    VALUES (uid, p_idempotency_key, 'save_started');

  v_request_hash := md5(jsonb_build_object(
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
  )::text);

  SELECT grow_event_id, request_hash INTO v_existing, v_existing_hash
    FROM public.quicklog_idempotency
   WHERE user_id = uid AND idempotency_key = p_idempotency_key;
  IF FOUND AND v_request_hash IS NOT NULL AND v_existing_hash IS NOT NULL AND v_existing_hash <> v_request_hash THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'idempotency_key_conflict');
    RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_conflict');
  END IF;
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
    IF p_tent_id IS DISTINCT FROM v_plant_tent THEN
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
        -- Server-validated event type for the diary read layer: diary_entries
        -- has no event_type column, so plant-scoped surfaces recover the type
        -- from details. Placed in the built object (right operand of ||) so it
        -- overrides any caller-supplied p_details.event_type.
        'event_type', p_event_type,
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
    UPDATE public.quicklog_idempotency SET request_hash = v_request_hash
      WHERE user_id = uid AND idempotency_key = p_idempotency_key;
  EXCEPTION WHEN unique_violation THEN
    SELECT grow_event_id, request_hash INTO v_existing, v_existing_hash
      FROM public.quicklog_idempotency
     WHERE user_id = uid AND idempotency_key = p_idempotency_key;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'save_failed');
    END IF;
    IF v_request_hash IS NOT NULL AND v_existing_hash IS NOT NULL AND v_existing_hash <> v_request_hash THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_key_conflict');
    END IF;
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, grow_event_id, status)
      VALUES (uid, p_idempotency_key, v_existing, 'duplicate_reused');
    RETURN jsonb_build_object('ok', true, 'grow_event_id', v_existing, 'reused', true);
  WHEN OTHERS THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'save_failed', SQLSTATE);
    RETURN jsonb_build_object('ok', false, 'reason', 'save_failed');
  END;

  INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, grow_event_id, status)
    VALUES (uid, p_idempotency_key, v_event_id, 'save_succeeded');

  RETURN jsonb_build_object('ok', true, 'grow_event_id', v_event_id, 'reused', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz, jsonb, jsonb, jsonb
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz, jsonb, jsonb, jsonb
) FROM anon;
GRANT EXECUTE ON FUNCTION public.quicklog_save_event(
  text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz, jsonb, jsonb, jsonb
) TO authenticated;

NOTIFY pgrst, 'reload schema';