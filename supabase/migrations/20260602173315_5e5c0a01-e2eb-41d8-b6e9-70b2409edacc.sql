-- Atomic QuickLog manual save RPC.
-- SECURITY DEFINER so it can write the two related rows in one transaction
-- with server-side ownership checks (RLS bypass acceptable because ownership
-- is verified explicitly below against tents/plants/grows for auth.uid()).

CREATE OR REPLACE FUNCTION public.quicklog_save_manual(
  p_target_type   text,
  p_target_id     uuid,
  p_action        text,
  p_volume_ml     numeric        DEFAULT NULL,
  p_note          text           DEFAULT NULL,
  p_temperature_c numeric        DEFAULT NULL,
  p_humidity_pct  numeric        DEFAULT NULL,
  p_vpd_kpa       numeric        DEFAULT NULL,
  p_occurred_at   timestamptz    DEFAULT NULL
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

  -- Defense-in-depth: confirm grow ownership too.
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

  RETURN jsonb_build_object(
    'ok', true,
    'grow_event_id', v_parent_event,
    'environment_event_id', v_env_child
  );
END;
$$;

REVOKE ALL ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quicklog_save_manual(
  text, uuid, text, numeric, text, numeric, numeric, numeric, timestamptz
) TO authenticated;