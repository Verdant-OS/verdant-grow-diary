-- 1. Extend feeding_events with structured nutrient log columns.
-- feeding_events has 0 rows in this project; we still backfill defensively.
ALTER TABLE public.feeding_events
  ADD COLUMN IF NOT EXISTS line_id      TEXT,
  ADD COLUMN IF NOT EXISTS products     JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ec_in        NUMERIC,
  ADD COLUMN IF NOT EXISTS ec_out       NUMERIC,
  ADD COLUMN IF NOT EXISTS runoff_ml    NUMERIC,
  ADD COLUMN IF NOT EXISTS runoff_ph    NUMERIC,
  ADD COLUMN IF NOT EXISTS runoff_ec    NUMERIC,
  ADD COLUMN IF NOT EXISTS water_temp_c NUMERIC;

UPDATE public.feeding_events SET line_id = 'unknown' WHERE line_id IS NULL;
ALTER TABLE public.feeding_events ALTER COLUMN line_id SET NOT NULL;

-- products must always be a JSON array.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'feeding_events_products_is_array'
       AND conrelid = 'public.feeding_events'::regclass
  ) THEN
    ALTER TABLE public.feeding_events
      ADD CONSTRAINT feeding_events_products_is_array
      CHECK (jsonb_typeof(products) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN public.feeding_events.line_id IS
  'Feeding line / nutrient program identifier the recipe came from.';
COMMENT ON COLUMN public.feeding_events.products IS
  'Ordered list of products applied (jsonb array). Validated by trigger on insert.';

-- 2. Indexes.
CREATE INDEX IF NOT EXISTS idx_feeding_events_user_line
  ON public.feeding_events (user_id, line_id);
-- event_id already covered by primary key.

-- 3. Extend validate_feeding_event with the new numeric range checks.
CREATE OR REPLACE FUNCTION public.validate_feeding_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.ph IS NOT NULL AND (NEW.ph < 0 OR NEW.ph > 14) THEN
    RAISE EXCEPTION 'ph out of range';
  END IF;
  IF NEW.ec_ms_cm IS NOT NULL AND NEW.ec_ms_cm < 0 THEN
    RAISE EXCEPTION 'ec_ms_cm < 0';
  END IF;
  IF NEW.volume_ml IS NOT NULL AND NEW.volume_ml < 0 THEN
    RAISE EXCEPTION 'volume_ml < 0';
  END IF;
  IF NEW.ec_in  IS NOT NULL AND NEW.ec_in  < 0 THEN RAISE EXCEPTION 'ec_in < 0';  END IF;
  IF NEW.ec_out IS NOT NULL AND NEW.ec_out < 0 THEN RAISE EXCEPTION 'ec_out < 0'; END IF;
  IF NEW.runoff_ml IS NOT NULL AND NEW.runoff_ml < 0 THEN
    RAISE EXCEPTION 'runoff_ml < 0';
  END IF;
  IF NEW.runoff_ec IS NOT NULL AND NEW.runoff_ec < 0 THEN
    RAISE EXCEPTION 'runoff_ec < 0';
  END IF;
  IF NEW.runoff_ph IS NOT NULL AND (NEW.runoff_ph < 0 OR NEW.runoff_ph > 14) THEN
    RAISE EXCEPTION 'runoff_ph out of range';
  END IF;
  IF NEW.line_id IS NULL OR length(btrim(NEW.line_id)) = 0 THEN
    RAISE EXCEPTION 'line_id is required';
  END IF;
  IF jsonb_typeof(NEW.products) <> 'array' THEN
    RAISE EXCEPTION 'products must be a jsonb array';
  END IF;
  RETURN NEW;
END
$function$;

-- 4. Transactional RPC. Mirrors create_watering_event exactly:
--    SECURITY INVOKER + ownership pre-checks + reliance on existing
--    direct INSERT RLS policies on grow_events and feeding_events.
CREATE OR REPLACE FUNCTION public.create_feeding_event(
  _grow_id       uuid,
  _line_id       text,
  _products      jsonb,
  _tent_id       uuid        DEFAULT NULL,
  _plant_id      uuid        DEFAULT NULL,
  _occurred_at   timestamptz DEFAULT now(),
  _note          text        DEFAULT NULL,
  _ph            numeric     DEFAULT NULL,
  _ec_in         numeric     DEFAULT NULL,
  _ec_out        numeric     DEFAULT NULL,
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
  IF _line_id IS NULL OR length(btrim(_line_id)) = 0 THEN
    RAISE EXCEPTION 'line_id is required' USING ERRCODE = '22023';
  END IF;
  IF _products IS NULL OR jsonb_typeof(_products) <> 'array' THEN
    RAISE EXCEPTION 'products must be a jsonb array' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.grows WHERE id = _grow_id AND user_id = uid
  ) THEN
    RAISE EXCEPTION 'grow not found or not owned by caller'
      USING ERRCODE = '42501';
  END IF;

  IF _tent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tents WHERE id = _tent_id AND user_id = uid
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
    (uid, _grow_id, _tent_id, _plant_id, 'feeding', 'manual', _occurred_at, _note)
  RETURNING id INTO new_event;

  INSERT INTO public.feeding_events
    (event_id, user_id, line_id, products,
     ph, ec_in, ec_out,
     runoff_ml, runoff_ph, runoff_ec, water_temp_c)
  VALUES
    (new_event, uid, _line_id, _products,
     _ph, _ec_in, _ec_out,
     _runoff_ml, _runoff_ph, _runoff_ec, _water_temp_c);

  RETURN new_event;
END;
$$;

COMMENT ON FUNCTION public.create_feeding_event(
  uuid, text, jsonb, uuid, uuid, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) IS
  'Transactional Feeding Log insert with ownership validation for grow_id, tent_id, plant_id, plant<->tent consistency. SECURITY INVOKER — relies on existing RLS on grow_events and feeding_events. Mirrors create_watering_event.';

REVOKE EXECUTE ON FUNCTION public.create_feeding_event(
  uuid, text, jsonb, uuid, uuid, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_feeding_event(
  uuid, text, jsonb, uuid, uuid, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_feeding_event(
  uuid, text, jsonb, uuid, uuid, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_feeding_event(
  uuid, text, jsonb, uuid, uuid, timestamptz, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) TO service_role;