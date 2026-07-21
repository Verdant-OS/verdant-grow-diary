CREATE OR REPLACE FUNCTION public.validate_environment_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.temperature_c IS NOT NULL AND (NEW.temperature_c < -10 OR NEW.temperature_c > 60) THEN
    RAISE EXCEPTION 'temperature_c out of range';
  END IF;
  IF NEW.humidity_pct IS NOT NULL AND (NEW.humidity_pct < 0 OR NEW.humidity_pct > 100) THEN
    RAISE EXCEPTION 'humidity_pct out of range';
  END IF;
  IF NEW.co2_ppm IS NOT NULL AND NEW.co2_ppm < 0 THEN RAISE EXCEPTION 'co2_ppm < 0'; END IF;
  IF NEW.vpd_kpa IS NOT NULL AND (NEW.vpd_kpa < 0 OR NEW.vpd_kpa > 10) THEN
    RAISE EXCEPTION 'vpd_kpa out of range';
  END IF;
  IF NEW.light_hours IS NOT NULL AND (NEW.light_hours < 0 OR NEW.light_hours > 24) THEN
    RAISE EXCEPTION 'light_hours out of range';
  END IF;
  RETURN NEW;
END $$;