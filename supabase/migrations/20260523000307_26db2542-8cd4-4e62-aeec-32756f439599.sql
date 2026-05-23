-- Add ingestion-ready nullable columns to sensor_readings
ALTER TABLE public.sensor_readings
  ADD COLUMN IF NOT EXISTS device_id text NULL,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb NULL,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz NULL;

-- Update validator trigger to enforce captured_at <= now() + 5 min when set.
-- Existing metric/source/quality/value checks preserved exactly.
CREATE OR REPLACE FUNCTION public.validate_sensor_reading()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.metric NOT IN (
    'temperature_c','humidity_pct','vpd_kpa','co2_ppm','soil_moisture_pct'
  ) THEN
    RAISE EXCEPTION 'invalid sensor metric: %', NEW.metric;
  END IF;
  IF NEW.quality NOT IN ('ok','degraded','stale','invalid') THEN
    RAISE EXCEPTION 'invalid sensor quality: %', NEW.quality;
  END IF;
  IF NEW.source NOT IN ('manual','pi_bridge','sim') THEN
    RAISE EXCEPTION 'invalid sensor source: %', NEW.source;
  END IF;
  IF NEW.value IS NULL OR NEW.value = 'NaN'::numeric THEN
    RAISE EXCEPTION 'sensor value must be a finite number';
  END IF;
  IF NEW.captured_at IS NOT NULL AND NEW.captured_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'captured_at cannot be more than 5 minutes in the future';
  END IF;
  RETURN NEW;
END $function$;

-- Make sure trigger exists (idempotent)
DROP TRIGGER IF EXISTS validate_sensor_reading_trg ON public.sensor_readings;
CREATE TRIGGER validate_sensor_reading_trg
  BEFORE INSERT OR UPDATE ON public.sensor_readings
  FOR EACH ROW EXECUTE FUNCTION public.validate_sensor_reading();