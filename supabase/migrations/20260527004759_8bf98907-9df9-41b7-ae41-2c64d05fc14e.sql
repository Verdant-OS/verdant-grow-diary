CREATE OR REPLACE FUNCTION public.validate_sensor_reading()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.metric NOT IN (
    'temperature_c','humidity_pct','vpd_kpa','co2_ppm','soil_moisture_pct',
    'ph','ec','ppfd'
  ) THEN
    RAISE EXCEPTION 'invalid sensor metric: %', NEW.metric;
  END IF;
  IF NEW.quality NOT IN ('ok','degraded','stale','invalid') THEN
    RAISE EXCEPTION 'invalid sensor quality: %', NEW.quality;
  END IF;
  IF NEW.source NOT IN (
    'manual','pi_bridge','sim',
    'webhook_generic','node_red_bridge',
    'esp32_arduino','esp32_arduino_sht31','esp32_esphome','esp32_mqtt_bridge',
    'home_assistant_bridge','ha_forwarded'
  ) THEN
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