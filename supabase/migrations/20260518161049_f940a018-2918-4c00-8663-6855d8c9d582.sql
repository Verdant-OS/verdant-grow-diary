CREATE OR REPLACE FUNCTION public.create_watering_event(
  _grow_id       uuid,
  _volume_ml     numeric,
  _tent_id       uuid        DEFAULT NULL,
  _plant_id      uuid        DEFAULT NULL,
  _occurred_at   timestamptz DEFAULT now(),
  _note          text        DEFAULT NULL,
  _ph            numeric     DEFAULT NULL,
  _ec_ms_cm      numeric     DEFAULT NULL,
  _runoff_ml     numeric     DEFAULT NULL,
  _runoff_ph     numeric     DEFAULT NULL,
  _runoff_ec     numeric     DEFAULT NULL,
  _water_temp_c  numeric     DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid              uuid := auth.uid();
  new_event        uuid;
  plant_tent_id    uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF _grow_id IS NULL THEN
    RAISE EXCEPTION 'grow_id is required' USING ERRCODE = '22023';
  END IF;

  IF _volume_ml IS NULL OR _volume_ml <= 0 THEN
    RAISE EXCEPTION 'volume_ml must be > 0' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.grows
     WHERE id = _grow_id AND user_id = uid
  ) THEN
    RAISE EXCEPTION 'grow not found or not owned by caller'
      USING ERRCODE = '42501';
  END IF;

  IF _tent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tents
       WHERE id = _tent_id AND user_id = uid
    ) THEN
      RAISE EXCEPTION 'tent not found or not owned by caller'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF _plant_id IS NOT NULL THEN
    SELECT tent_id INTO plant_tent_id
      FROM public.plants
     WHERE id = _plant_id AND user_id = uid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'plant not found or not owned by caller'
        USING ERRCODE = '42501';
    END IF;

    IF _tent_id IS NOT NULL
       AND (plant_tent_id IS NULL OR plant_tent_id <> _tent_id) THEN
      RAISE EXCEPTION 'plant is not assigned to the provided tent'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.grow_events
    (user_id, grow_id, tent_id, plant_id, event_type, source, occurred_at, note)
  VALUES
    (uid, _grow_id, _tent_id, _plant_id, 'watering', 'manual', _occurred_at, _note)
  RETURNING id INTO new_event;

  INSERT INTO public.watering_events
    (event_id, user_id, volume_ml, ph, ec_ms_cm,
     runoff_ml, runoff_ph, runoff_ec, water_temp_c)
  VALUES
    (new_event, uid, _volume_ml, _ph, _ec_ms_cm,
     _runoff_ml, _runoff_ph, _runoff_ec, _water_temp_c);

  RETURN new_event;
END;
$$;

COMMENT ON FUNCTION public.create_watering_event(
  uuid, numeric, uuid, uuid, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric
) IS
  'Transactional Water Log insert with ownership validation for grow_id, tent_id, plant_id, and plant<->tent consistency. SECURITY INVOKER — relies on existing RLS.';

REVOKE EXECUTE ON FUNCTION public.create_watering_event(
  uuid, numeric, uuid, uuid, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_watering_event(
  uuid, numeric, uuid, uuid, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_watering_event(
  uuid, numeric, uuid, uuid, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_watering_event(
  uuid, numeric, uuid, uuid, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric
) TO service_role;