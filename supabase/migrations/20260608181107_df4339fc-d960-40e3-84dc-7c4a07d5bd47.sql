-- Widen quicklog_save_manual to accept an optional p_details jsonb and
-- persist a companion diary_entries row carrying it (e.g. the Quick Log
-- sensor snapshot envelope built client-side by buildSensorSnapshotSavePayload).
--
-- Backward compatibility:
--   * The new parameter has DEFAULT NULL. Existing callers continue to work
--     and never trigger the diary_entries insert.
--   * Existing grow_events / watering_events / environment_events writes are
--     unchanged (same order, same columns, same trigger semantics).
--
-- Security posture (unchanged):
--   * SECURITY DEFINER with hardened search_path.
--   * auth.uid() is the source of truth for user_id.
--   * Ownership of plant / tent / grow is verified against auth.uid() before
--     any write occurs.
--   * p_details cannot override ownership: user_id, grow_id, tent_id,
--     plant_id, and auth_uid keys are stripped from p_details before persist.
--   * p_details must be a JSON object; arrays / scalars are rejected.
--   * Execute privilege is granted only to authenticated.

-- Drop the prior 9-arg overload to avoid PostgREST overload ambiguity.
DROP FUNCTION IF EXISTS public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz
);

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
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_target_type');
  END IF;

  IF p_target_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_target_id');
  END IF;

  IF p_action NOT IN ('water','note') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_action');
  END IF;

  IF p_action = 'water'
     AND (p_volume_ml IS NULL OR p_volume_ml <= 0) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_volume');
  END IF;

  -- p_details must be a JSON object when supplied (no arrays / scalars).
  IF p_details IS NOT NULL AND jsonb_typeof(p_details) <> 'object' THEN
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
    RETURN jsonb_build_object('ok', false, 'reason', 'target_not_owned');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.grows g
     WHERE g.id = v_grow_id AND g.user_id = uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'grow_not_owned');
  END IF;

  v_has_sensors := (p_temperature_c IS NOT NULL
                    OR p_humidity_pct IS NOT NULL
                    OR p_vpd_kpa IS NOT NULL);

  v_parent_type := CASE
    WHEN p_action = 'water' THEN 'watering'
    ELSE 'observation'
  END;

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
