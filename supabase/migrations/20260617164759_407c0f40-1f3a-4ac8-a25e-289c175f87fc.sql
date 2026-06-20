-- Add soil_temp_c as an allowed long-format sensor metric with bounds.
-- Also update get_latest_tent_sensor_snapshot to read the canonical
-- soil_temp_c metric instead of the legacy 'soil_temp' key that no
-- ingest path actually writes.

CREATE OR REPLACE FUNCTION public.validate_sensor_reading()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.metric NOT IN (
    'temperature_c','humidity_pct','vpd_kpa','co2_ppm','soil_moisture_pct',
    'soil_temp_c','ph','ec','ppfd'
  ) THEN
    RAISE EXCEPTION 'invalid sensor metric: %', NEW.metric;
  END IF;
  IF NEW.quality NOT IN ('ok','degraded','stale','invalid') THEN
    RAISE EXCEPTION 'invalid sensor quality: %', NEW.quality;
  END IF;
  IF NEW.source NOT IN (
    'live','manual','csv','demo','stale','invalid',
    'pi_bridge','sim',
    'webhook_generic','node_red_bridge',
    'esp32_arduino','esp32_arduino_sht31','esp32_esphome','esp32_mqtt_bridge',
    'home_assistant_bridge','ha_forwarded',
    'ecowitt','mqtt','webhook'
  ) THEN
    RAISE EXCEPTION 'invalid sensor source: %', NEW.source;
  END IF;
  IF NEW.value IS NULL OR NEW.value = 'NaN'::numeric THEN
    RAISE EXCEPTION 'sensor value must be a finite number';
  END IF;
  IF NEW.captured_at IS NOT NULL AND NEW.captured_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'captured_at cannot be more than 5 minutes in the future';
  END IF;
  -- Realistic root-zone temperature bounds. Reject only impossible values;
  -- never silently clamp. Range -20°C..80°C covers worst-case shipping/
  -- summer-greenhouse extremes while still rejecting unit-mistake outliers.
  IF NEW.metric = 'soil_temp_c' AND (NEW.value < -20 OR NEW.value > 80) THEN
    RAISE EXCEPTION 'soil_temp_c out of range: %', NEW.value;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_latest_tent_sensor_snapshot(_tent_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH latest AS (
    SELECT metric, value, captured_at, source
    FROM sensor_readings
    WHERE tent_id = _tent_id
      AND captured_at > now() - interval '4 hours'
    ORDER BY captured_at DESC
  )
  SELECT jsonb_build_object(
    'captured_at', (SELECT max(captured_at) FROM latest),
    'source',      (SELECT source FROM latest LIMIT 1),
    'temperature', (SELECT value FROM latest WHERE metric = 'temperature_c' LIMIT 1),
    'humidity',    (SELECT value FROM latest WHERE metric = 'humidity_pct'  LIMIT 1),
    'vpd',         (SELECT value FROM latest WHERE metric = 'vpd_kpa'       LIMIT 1),
    'soil_temp',   (SELECT value FROM latest WHERE metric = 'soil_temp_c'   LIMIT 1),
    'soil_ec',     (SELECT value FROM latest WHERE metric = 'ec'            LIMIT 1),
    'ppfd',        (SELECT value FROM latest WHERE metric = 'ppfd'          LIMIT 1)
  );
$function$;