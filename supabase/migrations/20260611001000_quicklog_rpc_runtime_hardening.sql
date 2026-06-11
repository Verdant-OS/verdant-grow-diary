-- Runtime hardening for Quick Log RPC trust boundaries.
--
-- Goals:
--   * quicklog_save_event: make parallel idempotency-key races replay the winning
--     grow_event_id instead of leaking duplicate companion rows or raw DB errors.
--   * quicklog_save_manual: bring the V2 manual RPC onto the same audit/atomic
--     failure contract: SQLSTATE only, no SQLERRM leakage, no orphan companions.

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
  p_details jsonb DEFAULT NULL
)
RETURNS jsonb
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
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 200 THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_idempotency_key');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_idempotency_key');
  END IF;

  -- Trigger-aligned list. 'note' is deliberately NOT here — the client
  -- maps note -> observation and uses p_details.kind = 'note' to preserve
  -- the user's intent.
  IF p_event_type NOT IN ('observation','watering','feeding','photo','environment','training') THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_event_type');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_event_type');
  END IF;

  IF p_details IS NOT NULL AND jsonb_typeof(p_details) <> 'object' THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'validation_failed', 'invalid_details');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_details');
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

  v_needs_diary := v_has_snapshot
                 OR (p_photo_url IS NOT NULL AND length(p_photo_url) > 0)
                 OR v_has_extra_details;

  BEGIN
    INSERT INTO public.grow_events
      (user_id, grow_id, tent_id, plant_id, event_type, source, occurred_at, note)
    VALUES
      (uid, p_grow_id, p_tent_id, p_plant_id, p_event_type, 'manual', v_occurred, NULLIF(p_note, ''))
    RETURNING id INTO v_event_id;

    IF v_needs_diary THEN
      v_details := v_extra || jsonb_build_object(
        'sensor_snapshot', CASE WHEN v_has_snapshot THEN jsonb_build_object(
            'source', v_src,
            'captured_at', v_cap,
            'metrics', v_metrics
          ) ELSE NULL END,
        'photo_url', p_photo_url,
        'quick_log_version', 1,
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
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'save_failed', SQLSTATE);

    SELECT grow_event_id INTO v_existing
      FROM public.quicklog_idempotency
     WHERE user_id = uid AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, grow_event_id, status)
        VALUES (uid, p_idempotency_key, v_existing, 'duplicate_reused');
      RETURN jsonb_build_object('ok', true, 'grow_event_id', v_existing, 'reused', true);
    END IF;

    RETURN jsonb_build_object('ok', false, 'reason', 'save_failed', 'reused', false);
  WHEN OTHERS THEN
    INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, status, reason)
      VALUES (uid, p_idempotency_key, 'save_failed', SQLSTATE);
    RETURN jsonb_build_object('ok', false, 'reason', 'save_failed', 'reused', false);
  END;

  INSERT INTO public.quicklog_audit_events (user_id, idempotency_key, grow_event_id, status)
    VALUES (uid, p_idempotency_key, v_event_id, 'save_succeeded');

  RETURN jsonb_build_object('ok', true, 'grow_event_id', v_event_id, 'reused', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.quicklog_save_event(text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quicklog_save_event(text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz, jsonb) TO authenticated;

COMMENT ON FUNCTION public.quicklog_save_event(text, uuid, text, uuid, uuid, text, text, jsonb, timestamptz, jsonb) IS
  'Atomic Quick Log writer (v2): note-style Quick Logs MUST arrive as event_type=observation with p_details.kind=note. Trigger-aligned event-type whitelist. Sensor snapshot provenance preserved verbatim. Idempotency races replay the winning result.';

CREATE OR REPLACE FUNCTION public.quicklog_save_manual(
  p_target_type   text,
  p_target_id     uuid,
  p_action        text,
  p_volume_ml     numeric        DEFAULT NULL,
  p_note          text           DEFAULT NULL,
  p_temperature_c numeric        DEFAULT NULL,
  p_humidity_pct  numeric        DEFAULT NULL,
  p_vpd_kpa       numeric        DEFAULT NULL,
  p_occurred_at   timestamptz    DEFAULT NULL,
  p_details       jsonb          DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  uid             uuid := auth.uid();
  v_grow_id       uuid;
  v_tent_id       uuid;
  v_plant_id      uuid;
  v_occurred      timestamptz := COALESCE(p_occurred_at, now());
  v_parent_event  uuid;
  v_env_parent    uuid;
  v_env_child     uuid;
  v_has_sensors   boolean;
  v_parent_type   text;
  v_diary_id      uuid := NULL;
  v_safe_details  jsonb;
  v_diary_note    text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_target_type NOT IN ('tent','plant') THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'invalid_target_type');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_target_type');
  END IF;

  IF p_target_id IS NULL THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'missing_target_id');
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_target_id');
  END IF;

  IF p_action NOT IN ('water','note') THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'unsupported_action');
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_action');
  END IF;

  IF p_action = 'water'
     AND (p_volume_ml IS NULL OR p_volume_ml <= 0) THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'invalid_volume');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_volume');
  END IF;

  -- p_details must be a JSON object when supplied (no arrays / scalars).
  IF p_details IS NOT NULL AND jsonb_typeof(p_details) <> 'object' THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'invalid_details');
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_details');
  END IF;

  -- Resolve & verify ownership of the selected target.
  IF p_target_type = 'plant' THEN
    SELECT p.tent_id, p.grow_id, p.id
      INTO v_tent_id, v_grow_id, v_plant_id
      FROM public.plants p
     WHERE p.id = p_target_id AND p.user_id = uid;
  ELSE
    SELECT t.id, t.grow_id
      INTO v_tent_id, v_grow_id
      FROM public.tents t
     WHERE t.id = p_target_id AND t.user_id = uid;
    v_plant_id := NULL;
  END IF;

  IF v_grow_id IS NULL THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'target_not_owned');
    RETURN jsonb_build_object('ok', false, 'reason', 'target_not_owned');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.grows g
     WHERE g.id = v_grow_id AND g.user_id = uid
  ) THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'validation_failed', 'grow_not_owned');
    RETURN jsonb_build_object('ok', false, 'reason', 'grow_not_owned');
  END IF;

  v_has_sensors := (p_temperature_c IS NOT NULL
                    OR p_humidity_pct IS NOT NULL
                    OR p_vpd_kpa IS NOT NULL);

  v_parent_type := CASE
    WHEN p_action = 'water' THEN 'watering'
    ELSE 'observation'
  END;

  INSERT INTO public.quicklog_audit_events (user_id, status)
    VALUES (uid, 'save_started');

  BEGIN
    -- Parent grow_event for the primary action.
    INSERT INTO public.grow_events
      (user_id, grow_id, tent_id, plant_id, event_type, source, occurred_at, note)
    VALUES
      (uid, v_grow_id, v_tent_id, v_plant_id,
       v_parent_type, 'manual', v_occurred, NULLIF(p_note, ''))
    RETURNING id INTO v_parent_event;

    IF p_action = 'water' THEN
      INSERT INTO public.watering_events (event_id, user_id, volume_ml)
      VALUES (v_parent_event, uid, p_volume_ml);
    END IF;

    -- Optional sensor snapshot. Schema requires a separate 'environment' parent
    -- because trg_validate_environment_owner enforces parent.event_type='environment'.
    IF v_has_sensors THEN
      INSERT INTO public.grow_events
        (user_id, grow_id, tent_id, plant_id, event_type, source, occurred_at, note)
      VALUES
        (uid, v_grow_id, v_tent_id, v_plant_id,
         'environment', 'manual', v_occurred, NULL)
      RETURNING id INTO v_env_parent;

      INSERT INTO public.environment_events
        (event_id, user_id, temperature_c, humidity_pct, vpd_kpa)
      VALUES
        (v_env_parent, uid, p_temperature_c, p_humidity_pct, p_vpd_kpa)
      RETURNING event_id INTO v_env_child;
    END IF;

    -- Optional companion diary_entries row carrying structured details
    -- (e.g. { "sensor": { ... } }). Only fires when p_details is provided so
    -- existing callers preserve their exact prior behavior.
    IF p_details IS NOT NULL THEN
      -- Strip auth/ownership-scoped keys so a malicious payload cannot rebind
      -- the row to another user / grow / tent / plant.
      v_safe_details := (
        p_details
          - 'user_id'
          - 'grow_id'
          - 'tent_id'
          - 'plant_id'
          - 'auth_uid'
          - 'auth.uid'
      );
      v_diary_note := COALESCE(NULLIF(p_note, ''), '(quick log)');
      INSERT INTO public.diary_entries
        (user_id, grow_id, tent_id, plant_id, note, details, entry_at)
      VALUES
        (uid, v_grow_id, v_tent_id, v_plant_id,
         v_diary_note, v_safe_details, v_occurred)
      RETURNING id INTO v_diary_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.quicklog_audit_events (user_id, status, reason)
      VALUES (uid, 'save_failed', SQLSTATE);
    RETURN jsonb_build_object('ok', false, 'reason', 'save_failed');
  END;

  INSERT INTO public.quicklog_audit_events (user_id, grow_event_id, status)
    VALUES (uid, v_parent_event, 'save_succeeded');

  RETURN jsonb_build_object(
    'ok', true,
    'grow_event_id', v_parent_event,
    'environment_event_id', v_env_child,
    'diary_entry_id', v_diary_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz, jsonb
) TO authenticated;