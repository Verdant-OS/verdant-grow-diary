-- Quick Log correction: editable volume, dose, and sensor values.
--
-- The original measured values are copied into quicklog_entry_revisions.previous_state
-- before the live row changes. quicklog_correct_entry merges the helper's previous
-- object into that ledger and writes the new value on the live row.
-- Cheeko approved this migration at 4:54 PM CT on 2026-10-14. No table, column, policy, or grant change.
--
-- Bounds: watering volume > 0 and <= 50000 ml (LARGE_WATER_AMOUNT_HARD_MAX_ML);
-- feeding volume > 0 and <= 1000000 ml; dose >= 0 and <= 1000000; temperature
-- -10..60 C; humidity 0..100; VPD 0..10 kPa.

BEGIN;

CREATE FUNCTION public.quicklog_correction_apply_measured_values(
  p_uid UUID,
  p_event_type TEXT,
  p_grow_event_id UUID,
  p_diary_ids UUID[],
  p_env_ids UUID[],
  p_has_volume BOOLEAN,
  p_volume NUMERIC,
  p_has_dose BOOLEAN,
  p_dose NUMERIC,
  p_has_sensor BOOLEAN,
  p_sensor JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_previous JSONB := '{}'::jsonb;
  v_next JSONB := '{}'::jsonb;
  v_old_volume NUMERIC;
  v_products JSONB;
  v_env_rows JSONB;
  v_target_ids UUID[];
  v_updated INTEGER;
  v_watering_with_env BOOLEAN;
BEGIN
  -- A watering Quick Log saved with readings has a manual environment sibling.
  -- Its sensor values are correctable only through an owned environment row.
  v_watering_with_env := p_event_type = 'watering' AND EXISTS (
    SELECT 1 FROM public.environment_events e
     WHERE e.user_id = p_uid
       AND e.event_id = ANY (COALESCE(p_env_ids, '{}'::uuid[]))
  );
  IF p_has_volume AND p_event_type NOT IN ('watering', 'feeding') THEN
    RETURN jsonb_build_object('reason', 'unsupported_change');
  END IF;
  IF p_has_dose AND p_event_type <> 'feeding' THEN
    RETURN jsonb_build_object('reason', 'unsupported_change');
  END IF;
  IF p_has_sensor
     AND p_event_type NOT IN ('environment', 'environment_check', 'manual_sensor_snapshot')
     AND NOT (p_event_type = 'observation' AND COALESCE(cardinality(p_env_ids), 0) > 0)
     AND NOT v_watering_with_env THEN
    RETURN jsonb_build_object('reason', 'unsupported_change');
  END IF;
  -- Environment Check readings live only in details.environment_check. With no
  -- sensor_snapshot, no manual_sensor_snapshot and no owned environment row,
  -- the sensor writes below change nothing, so reject instead of appending
  -- an empty revision.
  IF p_has_sensor
     AND NOT EXISTS (
       SELECT 1 FROM public.environment_events e
        WHERE e.user_id = p_uid
          AND e.event_id = ANY (COALESCE(p_env_ids, '{}'::uuid[]) || ARRAY[p_grow_event_id])
     )
     AND EXISTS (
       SELECT 1 FROM public.diary_entries d
        WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
          AND jsonb_typeof(d.details -> 'environment_check') = 'object'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.diary_entries d
        WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
          AND (jsonb_typeof(d.details -> 'sensor_snapshot') = 'object'
               OR jsonb_typeof(d.details -> 'manual_sensor_snapshot') = 'object')
     ) THEN
    RETURN jsonb_build_object('reason', 'unsupported_change');
  END IF;
  IF p_has_dose THEN
    SELECT f.products INTO v_products
      FROM public.feeding_events f
     WHERE f.event_id = p_grow_event_id AND f.user_id = p_uid;
    IF v_products IS NULL OR jsonb_typeof(v_products) <> 'array' OR jsonb_array_length(v_products) = 0 THEN
      SELECT d.details -> 'feeding' -> 'products' INTO v_products
        FROM public.diary_entries d
       WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
       LIMIT 1;
    END IF;
    IF v_products IS NULL OR jsonb_typeof(v_products) <> 'array' OR jsonb_array_length(v_products) = 0 THEN
      SELECT d.details -> 'nutrients' INTO v_products
        FROM public.diary_entries d
       WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
       LIMIT 1;
    END IF;
    IF v_products IS NULL OR jsonb_typeof(v_products) <> 'array' OR jsonb_array_length(v_products) = 0 THEN
      RETURN jsonb_build_object('reason', 'unsupported_change');
    END IF;
  END IF;

  IF p_has_volume THEN
    IF p_event_type NOT IN ('watering', 'feeding') THEN
      RETURN jsonb_build_object('reason', 'unsupported_change');
    END IF;
    IF p_event_type = 'watering' THEN
      SELECT w.volume_ml INTO v_old_volume
        FROM public.watering_events w
       WHERE w.event_id = p_grow_event_id AND w.user_id = p_uid;
    ELSE
      SELECT f.volume_ml INTO v_old_volume
        FROM public.feeding_events f
       WHERE f.event_id = p_grow_event_id AND f.user_id = p_uid;
    END IF;
    IF v_old_volume IS NULL THEN
      SELECT CASE
        WHEN p_event_type = 'watering' THEN COALESCE(
          CASE WHEN jsonb_typeof(d.details -> 'watering' -> 'volume_ml') = 'number'
            THEN (d.details -> 'watering' ->> 'volume_ml')::numeric END,
          CASE WHEN jsonb_typeof(d.details -> 'watering_amount_ml') = 'number'
            THEN (d.details ->> 'watering_amount_ml')::numeric END,
          CASE WHEN jsonb_typeof(d.details -> 'wateringAmountMl') = 'number'
            THEN (d.details ->> 'wateringAmountMl')::numeric END
        )
        ELSE COALESCE(
          CASE WHEN jsonb_typeof(d.details -> 'feeding' -> 'volume_ml') = 'number'
            THEN (d.details -> 'feeding' ->> 'volume_ml')::numeric END,
          CASE WHEN jsonb_typeof(d.details -> 'watering_amount_ml') = 'number'
            THEN (d.details ->> 'watering_amount_ml')::numeric END,
          CASE WHEN jsonb_typeof(d.details -> 'wateringAmountMl') = 'number'
            THEN (d.details ->> 'wateringAmountMl')::numeric END
        )
      END
      INTO v_old_volume
      FROM public.diary_entries d
      WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
      LIMIT 1;
    END IF;
    v_previous := v_previous || jsonb_build_object('volume_ml', v_old_volume);
    v_next := v_next || jsonb_build_object('volume_ml', p_volume);
    IF p_grow_event_id IS NOT NULL AND p_event_type = 'watering' THEN
      UPDATE public.watering_events w
         SET volume_ml = p_volume
       WHERE w.event_id = p_grow_event_id AND w.user_id = p_uid;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 AND COALESCE(cardinality(p_diary_ids), 0) = 0 THEN
        RETURN jsonb_build_object('reason', 'unsupported_change');
      END IF;
    ELSIF p_grow_event_id IS NOT NULL THEN
      UPDATE public.feeding_events f
         SET volume_ml = p_volume
       WHERE f.event_id = p_grow_event_id AND f.user_id = p_uid;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated = 0 AND COALESCE(cardinality(p_diary_ids), 0) = 0 THEN
        RETURN jsonb_build_object('reason', 'unsupported_change');
      END IF;
    END IF;
    IF p_event_type = 'watering' THEN
      UPDATE public.diary_entries d
         SET details = jsonb_set(COALESCE(d.details, '{}'::jsonb), '{watering,volume_ml}', to_jsonb(p_volume), true)
       WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid;
      UPDATE public.diary_entries d
         SET details = jsonb_set(d.details, '{watering_amount_ml}', to_jsonb(p_volume), false)
       WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
         AND jsonb_typeof(d.details -> 'watering_amount_ml') = 'number';
      UPDATE public.diary_entries d
         SET details = jsonb_set(d.details, '{wateringAmountMl}', to_jsonb(p_volume), false)
       WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
         AND jsonb_typeof(d.details -> 'wateringAmountMl') = 'number';
    ELSE
      UPDATE public.diary_entries d
         SET details = jsonb_set(COALESCE(d.details, '{}'::jsonb), '{feeding,volume_ml}', to_jsonb(p_volume), true)
       WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid;
      UPDATE public.diary_entries d
         SET details = jsonb_set(d.details, '{watering_amount_ml}', to_jsonb(p_volume), false)
       WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
         AND jsonb_typeof(d.details -> 'watering_amount_ml') = 'number';
      UPDATE public.diary_entries d
         SET details = jsonb_set(d.details, '{wateringAmountMl}', to_jsonb(p_volume), false)
       WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
         AND jsonb_typeof(d.details -> 'wateringAmountMl') = 'number';
    END IF;
  END IF;

  IF p_has_dose THEN
    IF p_event_type <> 'feeding' THEN
      RETURN jsonb_build_object('reason', 'unsupported_change');
    END IF;
    SELECT f.products INTO v_products
      FROM public.feeding_events f
     WHERE f.event_id = p_grow_event_id AND f.user_id = p_uid;
    IF v_products IS NULL OR jsonb_typeof(v_products) <> 'array' OR jsonb_array_length(v_products) = 0 THEN
      SELECT d.details -> 'feeding' -> 'products' INTO v_products
        FROM public.diary_entries d
       WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
       LIMIT 1;
    END IF;
    IF v_products IS NULL OR jsonb_typeof(v_products) <> 'array' OR jsonb_array_length(v_products) = 0 THEN
      SELECT d.details -> 'nutrients' INTO v_products
        FROM public.diary_entries d
       WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
       LIMIT 1;
    END IF;
    IF v_products IS NULL OR jsonb_typeof(v_products) <> 'array' OR jsonb_array_length(v_products) = 0 THEN
      RETURN jsonb_build_object('reason', 'unsupported_change');
    END IF;
    v_previous := v_previous || jsonb_build_object(
      'products', v_products,
      'dose_amount', v_products -> 0 -> 'amount'
    );
    v_next := v_next || jsonb_build_object('dose_amount', p_dose);
    v_products := jsonb_set(v_products, '{0,amount}', to_jsonb(p_dose), true);
    IF p_grow_event_id IS NOT NULL THEN
      UPDATE public.feeding_events f
         SET products = v_products
       WHERE f.event_id = p_grow_event_id AND f.user_id = p_uid;
    END IF;
    UPDATE public.diary_entries d
       SET details = jsonb_set(
         jsonb_set(COALESCE(d.details, '{}'::jsonb), '{feeding,products}', v_products, true),
         '{nutrients,0,amount}', to_jsonb(p_dose), true
       )
     WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
       AND jsonb_typeof(d.details -> 'nutrients') = 'array';
    UPDATE public.diary_entries d
       SET details = jsonb_set(COALESCE(d.details, '{}'::jsonb), '{feeding,products}', v_products, true)
     WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
       AND jsonb_typeof(COALESCE(d.details -> 'nutrients', 'null'::jsonb)) IS DISTINCT FROM 'array';
  END IF;

  IF p_has_sensor THEN
    IF p_event_type NOT IN ('environment', 'environment_check', 'manual_sensor_snapshot')
       AND NOT (p_event_type = 'observation' AND COALESCE(cardinality(p_env_ids), 0) > 0)
       AND NOT v_watering_with_env THEN
      RETURN jsonb_build_object('reason', 'unsupported_change');
    END IF;
    v_target_ids := COALESCE(p_env_ids, '{}'::uuid[]);
    IF p_grow_event_id IS NOT NULL THEN
      v_target_ids := v_target_ids || ARRAY[p_grow_event_id];
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'event_id', e.event_id,
      'temperature_c', e.temperature_c,
      'humidity_pct', e.humidity_pct,
      'vpd_kpa', e.vpd_kpa
    ) ORDER BY e.event_id), '[]'::jsonb) INTO v_env_rows
      FROM public.environment_events e
     WHERE e.user_id = p_uid AND e.event_id = ANY (v_target_ids);
    v_previous := v_previous || jsonb_build_object('environment_events', v_env_rows, 'sensor_values', (
      SELECT d.details -> 'sensor_snapshot' -> 'metrics'
        FROM public.diary_entries d
       WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
       LIMIT 1
    ));
    v_next := v_next || jsonb_build_object('sensor_values', p_sensor);
    UPDATE public.environment_events e
       SET temperature_c = CASE WHEN p_sensor ? 'temperature_c' THEN (p_sensor ->> 'temperature_c')::numeric ELSE e.temperature_c END,
           humidity_pct = CASE WHEN p_sensor ? 'humidity_pct' THEN (p_sensor ->> 'humidity_pct')::numeric ELSE e.humidity_pct END,
           vpd_kpa = CASE WHEN p_sensor ? 'vpd_kpa' THEN (p_sensor ->> 'vpd_kpa')::numeric ELSE e.vpd_kpa END
     WHERE e.user_id = p_uid AND e.event_id = ANY (v_target_ids);
    UPDATE public.diary_entries d
       SET details = jsonb_set(
         jsonb_set(
           jsonb_set(
             COALESCE(d.details, '{}'::jsonb),
             '{sensor_snapshot,metrics,temperature_c}',
             CASE WHEN p_sensor ? 'temperature_c' THEN to_jsonb((p_sensor ->> 'temperature_c')::numeric)
                  ELSE COALESCE(d.details #> '{sensor_snapshot,metrics,temperature_c}', 'null'::jsonb) END,
             true),
           '{sensor_snapshot,metrics,humidity_pct}',
           CASE WHEN p_sensor ? 'humidity_pct' THEN to_jsonb((p_sensor ->> 'humidity_pct')::numeric)
                ELSE COALESCE(d.details #> '{sensor_snapshot,metrics,humidity_pct}', 'null'::jsonb) END,
           true),
         '{sensor_snapshot,metrics,vpd_kpa}',
         CASE WHEN p_sensor ? 'vpd_kpa' THEN to_jsonb((p_sensor ->> 'vpd_kpa')::numeric)
              ELSE COALESCE(d.details #> '{sensor_snapshot,metrics,vpd_kpa}', 'null'::jsonb) END,
         true)
     WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid;
    UPDATE public.diary_entries d
       SET details = jsonb_set(
         jsonb_set(
           d.details,
           '{manual_sensor_snapshot,temp_f}',
           CASE WHEN p_sensor ? 'temperature_c'
             THEN to_jsonb(((p_sensor ->> 'temperature_c')::numeric * 9.0 / 5.0) + 32)
             ELSE COALESCE(d.details #> '{manual_sensor_snapshot,temp_f}', 'null'::jsonb) END,
           true),
         '{manual_sensor_snapshot,humidity_percent}',
         CASE WHEN p_sensor ? 'humidity_pct'
           THEN to_jsonb((p_sensor ->> 'humidity_pct')::numeric)
           ELSE COALESCE(d.details #> '{manual_sensor_snapshot,humidity_percent}', 'null'::jsonb) END,
         true)
     WHERE d.id = ANY (p_diary_ids) AND d.user_id = p_uid
       AND jsonb_typeof(d.details -> 'manual_sensor_snapshot') = 'object';
  END IF;

  RETURN jsonb_build_object('previous', v_previous, 'next', v_next);
END;
$$;

REVOKE ALL ON FUNCTION public.quicklog_correction_apply_measured_values(
  UUID, TEXT, UUID, UUID[], UUID[], BOOLEAN, NUMERIC, BOOLEAN, NUMERIC, BOOLEAN, JSONB
) FROM PUBLIC, anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.quicklog_correct_entry(
  p_reason_code TEXT,
  p_changes JSONB,
  p_grow_event_id UUID DEFAULT NULL,
  p_diary_entry_id UUID DEFAULT NULL,
  p_reason_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  uid UUID := auth.uid();
  v_root record;
  v_spine public.grow_events%ROWTYPE;
  v_diary public.diary_entries%ROWTYPE;
  v_root_id UUID;
  v_rev_no INTEGER;
  v_rev_id UUID;
  v_key TEXT;
  v_has_note BOOLEAN := false;
  v_has_time BOOLEAN := false;
  v_has_target BOOLEAN := false;
  v_note TEXT;
  v_time TIMESTAMPTZ;
  v_target_type TEXT;
  v_target_id UUID;
  v_new_grow UUID;
  v_new_tent UUID;
  v_new_plant UUID;
  v_env_ids UUID[] := '{}'::uuid[];
  v_diary_ids UUID[] := '{}'::uuid[];
  v_prev JSONB;
  v_new JSONB := '{}'::jsonb;
  v_has_volume BOOLEAN := false;
  v_has_dose BOOLEAN := false;
  v_has_sensor BOOLEAN := false;
  v_volume NUMERIC;
  v_dose NUMERIC;
  v_sensor JSONB;
  v_measured JSONB;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_reason_code IS NULL OR p_reason_code NOT IN (
    'wrong_plant', 'wrong_tent', 'wrong_time', 'typo', 'wrong_value',
    'duplicate', 'test_entry', 'accidental', 'other'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_reason');
  END IF;

  IF p_reason_note IS NOT NULL AND char_length(p_reason_note) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_note');
  END IF;

  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_changes');
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    IF v_key NOT IN ('note', 'occurred_at', 'target_type', 'target_id', 'volume_ml', 'dose_amount', 'sensor_values') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_change');
    END IF;
  END LOOP;

  IF p_changes ? 'note' THEN
    IF jsonb_typeof(p_changes -> 'note') NOT IN ('string', 'null') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END IF;
    v_has_note := true;
    v_note := p_changes ->> 'note';
    IF v_note IS NOT NULL AND char_length(v_note) > 4000 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END IF;
  END IF;

  IF p_changes ? 'occurred_at' THEN
    BEGIN
      v_time := (p_changes ->> 'occurred_at')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END;
    IF v_time IS NULL OR v_time > now() + interval '5 minutes' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END IF;
    v_has_time := true;
  END IF;

  IF (p_changes ? 'target_type') <> (p_changes ? 'target_id') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
  END IF;

  IF p_changes ? 'target_type' THEN
    v_target_type := p_changes ->> 'target_type';
    IF v_target_type NOT IN ('plant', 'tent') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END IF;
    BEGIN
      v_target_id := (p_changes ->> 'target_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END;
    v_has_target := true;
  END IF;


  IF p_changes ? 'volume_ml' THEN
    BEGIN
      v_volume := (p_changes ->> 'volume_ml')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END;
    IF v_volume IS NULL OR v_volume <= 0 OR v_volume > 1000000 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END IF;
    v_has_volume := true;
  END IF;

  IF p_changes ? 'dose_amount' THEN
    BEGIN
      v_dose := (p_changes ->> 'dose_amount')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END;
    IF v_dose IS NULL OR v_dose < 0 OR v_dose > 1000000 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END IF;
    v_has_dose := true;
  END IF;

  IF p_changes ? 'sensor_values' THEN
    v_sensor := p_changes -> 'sensor_values';
    IF jsonb_typeof(v_sensor) <> 'object' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END IF;
    FOR v_key IN SELECT jsonb_object_keys(v_sensor) LOOP
      IF v_key NOT IN ('temperature_c', 'humidity_pct', 'vpd_kpa') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
      END IF;
      IF jsonb_typeof(v_sensor -> v_key) <> 'number' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
      END IF;
      BEGIN
        IF v_key = 'temperature_c' AND ((v_sensor ->> v_key)::numeric < -10 OR (v_sensor ->> v_key)::numeric > 60) THEN
          RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
        ELSIF v_key = 'humidity_pct' AND ((v_sensor ->> v_key)::numeric < 0 OR (v_sensor ->> v_key)::numeric > 100) THEN
          RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
        ELSIF v_key = 'vpd_kpa' AND ((v_sensor ->> v_key)::numeric < 0 OR (v_sensor ->> v_key)::numeric > 10) THEN
          RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
      END;
    END LOOP;
    IF v_sensor = '{}'::jsonb THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
    END IF;
    v_has_sensor := true;
  END IF;

  IF NOT (v_has_note OR v_has_time OR v_has_target OR v_has_volume OR v_has_dose OR v_has_sensor) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_changes');
  END IF;

  v_root := public.quicklog_revision_resolve_root(uid, p_grow_event_id, p_diary_entry_id);
  IF v_root.out_reason IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_root.out_reason);
  END IF;
  v_root_id := COALESCE(v_root.out_grow_event_id, v_root.out_diary_entry_id);

  IF EXISTS (
    SELECT 1 FROM public.quicklog_entry_revisions r
     WHERE r.root_id = v_root_id AND r.kind = 'retraction'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_retracted');
  END IF;

  -- Resolve and validate the new target with the same ownership + coherence
  -- rules quicklog_save_manual applies on save.
  IF v_has_target THEN
    IF v_target_type = 'plant' THEN
      SELECT p.tent_id, p.grow_id, p.id
        INTO v_new_tent, v_new_grow, v_new_plant
        FROM public.plants p
       WHERE p.id = v_target_id AND p.user_id = uid;
    ELSE
      SELECT t.id, t.grow_id
        INTO v_new_tent, v_new_grow
        FROM public.tents t
       WHERE t.id = v_target_id AND t.user_id = uid;
      v_new_plant := NULL;
    END IF;
    IF v_new_grow IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'target_not_owned');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.grows g WHERE g.id = v_new_grow AND g.user_id = uid
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'grow_not_owned');
    END IF;
  END IF;

  IF v_root.out_grow_event_id IS NOT NULL THEN
    SELECT * INTO v_spine FROM public.grow_events WHERE id = v_root.out_grow_event_id;
    IF v_spine.is_deleted THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_retracted');
    END IF;

    v_env_ids := public.quicklog_revision_sibling_env_ids(uid, v_spine);

    SELECT COALESCE(array_agg(d.id), '{}'::uuid[]) INTO v_diary_ids
      FROM public.diary_entries d
     WHERE d.user_id = uid
       AND (
         -- Parse-then-compare so legacy mirrors with non-canonical UUID text
         -- (e.g. uppercase) still match, exactly like the resolver does.
         public.quicklog_try_parse_uuid(d.details ->> 'linked_grow_event_id') = v_spine.id
         OR public.quicklog_try_parse_uuid(d.details ->> 'grow_event_id') = v_spine.id
       );

    -- Pheno receipts pin plant identity into the receipt contract; a
    -- re-target of the SPINE would rewrite the linked receipt mirror's
    -- plant_id and silently transfer breeding evidence and coverage.
    -- The diary-only branch below has the same guard for unlinked receipts.
    IF v_has_target AND EXISTS (
      SELECT 1 FROM public.diary_entries d
       WHERE d.id = ANY (v_diary_ids)
         AND d.details ->> 'kind' = 'pheno_evidence_receipt'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_change');
    END IF;

    v_prev := jsonb_build_object(
      'note', v_spine.note,
      'occurred_at', v_spine.occurred_at,
      'grow_id', v_spine.grow_id,
      'tent_id', v_spine.tent_id,
      'plant_id', v_spine.plant_id
    );


    IF v_has_volume OR v_has_dose OR v_has_sensor THEN
      -- Watering volume matches LARGE_WATER_AMOUNT_HARD_MAX_ML (50000 ml).
      IF v_has_volume AND v_spine.event_type = 'watering' AND v_volume > 50000 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
      END IF;
      v_measured := public.quicklog_correction_apply_measured_values(
        uid, v_spine.event_type, v_spine.id, v_diary_ids, v_env_ids,
        v_has_volume, v_volume, v_has_dose, v_dose, v_has_sensor, v_sensor
      );
      IF v_measured ? 'reason' THEN
        RETURN jsonb_build_object('ok', false, 'reason', v_measured ->> 'reason');
      END IF;
      v_prev := v_prev || COALESCE(v_measured -> 'previous', '{}'::jsonb);
      v_new := v_new || COALESCE(v_measured -> 'next', '{}'::jsonb);
    END IF;

    IF v_has_note THEN
      v_new := v_new || jsonb_build_object('note', v_note);
    END IF;
    IF v_has_time THEN
      v_new := v_new || jsonb_build_object('occurred_at', v_time);
    END IF;
    IF v_has_target THEN
      v_new := v_new || jsonb_build_object(
        'grow_id', v_new_grow, 'tent_id', v_new_tent, 'plant_id', v_new_plant
      );
    END IF;

    UPDATE public.grow_events
       SET note = CASE WHEN v_has_note THEN NULLIF(v_note, '') ELSE note END,
           occurred_at = CASE WHEN v_has_time THEN v_time ELSE occurred_at END,
           grow_id = CASE WHEN v_has_target THEN v_new_grow ELSE grow_id END,
           tent_id = CASE WHEN v_has_target THEN v_new_tent ELSE tent_id END,
           plant_id = CASE WHEN v_has_target THEN v_new_plant ELSE plant_id END
     WHERE id = v_spine.id AND user_id = uid;

    -- Keep environment companions coherent for time/target moves.
    IF (v_has_time OR v_has_target) AND array_length(v_env_ids, 1) IS NOT NULL THEN
      UPDATE public.grow_events
         SET occurred_at = CASE WHEN v_has_time THEN v_time ELSE occurred_at END,
             grow_id = CASE WHEN v_has_target THEN v_new_grow ELSE grow_id END,
             tent_id = CASE WHEN v_has_target THEN v_new_tent ELSE tent_id END,
             plant_id = CASE WHEN v_has_target THEN v_new_plant ELSE plant_id END
       WHERE id = ANY (v_env_ids) AND user_id = uid;
    END IF;

    IF array_length(v_diary_ids, 1) IS NOT NULL THEN
      UPDATE public.diary_entries
         SET note = CASE WHEN v_has_note THEN COALESCE(NULLIF(v_note, ''), '(quick log)') ELSE note END,
             entry_at = CASE WHEN v_has_time THEN v_time ELSE entry_at END,
             details = CASE WHEN v_has_time
               THEN public.quicklog_revision_rebase_captured_at(details, entry_at, v_time)
               ELSE details END,
             grow_id = CASE WHEN v_has_target THEN v_new_grow ELSE grow_id END,
             tent_id = CASE WHEN v_has_target THEN v_new_tent ELSE tent_id END,
             plant_id = CASE WHEN v_has_target THEN v_new_plant ELSE plant_id END
       WHERE id = ANY (v_diary_ids) AND user_id = uid;
    END IF;
  ELSE
    SELECT * INTO v_diary FROM public.diary_entries WHERE id = v_root.out_diary_entry_id;
    IF v_diary.retracted_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_retracted');
    END IF;

    -- Pheno evidence receipts pin plant identity into the receipt contract;
    -- re-targeting one would silently re-attribute evidence. Correcting a
    -- receipt is limited to note/time; wrong-plant receipts are retracted.
    IF v_has_target AND v_diary.details ->> 'kind' = 'pheno_evidence_receipt' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_change');
    END IF;

    v_prev := jsonb_build_object(
      'note', v_diary.note,
      'entry_at', v_diary.entry_at,
      'grow_id', v_diary.grow_id,
      'tent_id', v_diary.tent_id,
      'plant_id', v_diary.plant_id
    );


    IF v_has_volume OR v_has_dose OR v_has_sensor THEN
      -- Watering volume matches LARGE_WATER_AMOUNT_HARD_MAX_ML (50000 ml).
      IF v_has_volume AND COALESCE(v_diary.details ->> 'event_type', '') = 'watering' AND v_volume > 50000 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
      END IF;
      v_measured := public.quicklog_correction_apply_measured_values(
        uid, COALESCE(v_diary.details ->> 'event_type', ''), NULL, ARRAY[v_diary.id], '{}'::uuid[],
        v_has_volume, v_volume, v_has_dose, v_dose, v_has_sensor, v_sensor
      );
      IF v_measured ? 'reason' THEN
        RETURN jsonb_build_object('ok', false, 'reason', v_measured ->> 'reason');
      END IF;
      v_prev := v_prev || COALESCE(v_measured -> 'previous', '{}'::jsonb);
      v_new := v_new || COALESCE(v_measured -> 'next', '{}'::jsonb);
    END IF;

    IF v_has_note THEN
      v_new := v_new || jsonb_build_object('note', v_note);
    END IF;
    IF v_has_time THEN
      v_new := v_new || jsonb_build_object('entry_at', v_time);
    END IF;
    IF v_has_target THEN
      v_new := v_new || jsonb_build_object(
        'grow_id', v_new_grow, 'tent_id', v_new_tent, 'plant_id', v_new_plant
      );
    END IF;

    UPDATE public.diary_entries
       SET note = CASE WHEN v_has_note THEN COALESCE(NULLIF(v_note, ''), '(quick log)') ELSE note END,
           entry_at = CASE WHEN v_has_time THEN v_time ELSE entry_at END,
           details = CASE WHEN v_has_time
             THEN public.quicklog_revision_rebase_captured_at(details, entry_at, v_time)
             ELSE details END,
           grow_id = CASE WHEN v_has_target THEN v_new_grow ELSE grow_id END,
           tent_id = CASE WHEN v_has_target THEN v_new_tent ELSE tent_id END,
           plant_id = CASE WHEN v_has_target THEN v_new_plant ELSE plant_id END
     WHERE id = v_diary.id AND user_id = uid;

    v_diary_ids := ARRAY[v_diary.id];
  END IF;

  SELECT COALESCE(MAX(r.revision_no), 0) + 1 INTO v_rev_no
    FROM public.quicklog_entry_revisions r
   WHERE r.root_id = v_root_id;

  INSERT INTO public.quicklog_entry_revisions
    (grow_event_id, diary_entry_id, root_id, user_id, actor_id,
     revision_no, kind, reason_code, reason_note, previous_state, new_state)
  VALUES
    (v_root.out_grow_event_id,
     CASE WHEN v_root.out_diary_entry_id IS NOT NULL THEN v_root.out_diary_entry_id
          WHEN array_length(v_diary_ids, 1) = 1 THEN v_diary_ids[1]
          ELSE NULL END,
     v_root_id, uid, uid, v_rev_no, 'correction',
     p_reason_code, NULLIF(p_reason_note, ''), COALESCE(v_prev, '{}'::jsonb), v_new)
  RETURNING id INTO v_rev_id;

  RETURN jsonb_build_object(
    'ok', true,
    'revision_id', v_rev_id,
    'revision_no', v_rev_no,
    'grow_event_id', v_root.out_grow_event_id,
    'diary_entry_ids', to_jsonb(v_diary_ids)
  );
END;
$$;

COMMIT;
