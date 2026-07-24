-- Environment-events canonical sensor-band guard (defense-in-depth).
--
-- Reconciles the SERVER-side plausibility guard onto the single canonical band
-- already enforced client-side by src/lib/sensorReadingNormalizationRules.ts
-- (isTemperatureValid: -10..60 °C, isHumidityValid: 0..100, isVpdValid:
-- 0..10 kPa). Quick Log v1 (environmentCheckQuickLogRules) and v2
-- (quickLogV2SavePayload) both block out-of-band air-sensor values before the
-- RPC is called; this trigger is the last line of defense so NO writer — a
-- future non-Quick-Log path, a direct table insert, or a service_role script —
-- can persist a physically impossible reading.
--
-- The prior validate_environment_event() (migration 20260518152526) guarded
-- humidity (0..100) but had NO temperature bound at all and only rejected a
-- negative VPD, leaving the >10 kPa (and fat-fingered "240 °C") gap this closes.
--
-- Scope: temperature_c and vpd_kpa are brought onto the canonical band; the
-- existing humidity_pct / co2_ppm / light_hours checks are preserved verbatim.
-- Water-temperature and EC are not part of this table and are unchanged.
--
-- Safe to apply: a BEFORE INSERT OR UPDATE trigger only fires on WRITES, so
-- pre-existing rows are never scanned (no full-table lock, no VALIDATE step,
-- no data rewrite). Any historical out-of-band row simply stays until it is
-- next written. Nullability is preserved: a NULL metric is always allowed.
--
-- Not applied to production by this PR. PRE-DEPLOYMENT audit (read-only) to
-- estimate how many historical rows would be outside the new bounds — run it,
-- do NOT remediate here:
--   SELECT count(*) AS out_of_band
--     FROM public.environment_events
--    WHERE (temperature_c IS NOT NULL AND (temperature_c < -10 OR temperature_c > 60))
--       OR (vpd_kpa       IS NOT NULL AND (vpd_kpa       < 0   OR vpd_kpa       > 10));
-- A non-zero count is informational only (the trigger will not touch those
-- rows) but flags corrupt history worth reviewing before rollout.

CREATE OR REPLACE FUNCTION public.validate_environment_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Air temperature: canonical -10..60 °C (mirrors isTemperatureValid).
  IF NEW.temperature_c IS NOT NULL AND (NEW.temperature_c < -10 OR NEW.temperature_c > 60) THEN
    RAISE EXCEPTION 'temperature_c out of range';
  END IF;
  IF NEW.humidity_pct IS NOT NULL AND (NEW.humidity_pct < 0 OR NEW.humidity_pct > 100) THEN
    RAISE EXCEPTION 'humidity_pct out of range';
  END IF;
  IF NEW.co2_ppm IS NOT NULL AND NEW.co2_ppm < 0 THEN RAISE EXCEPTION 'co2_ppm < 0'; END IF;
  -- VPD: canonical 0..10 kPa (mirrors isVpdValid). Previously only a negative
  -- value was rejected, so an implausible >10 kPa reading could persist.
  IF NEW.vpd_kpa IS NOT NULL AND (NEW.vpd_kpa < 0 OR NEW.vpd_kpa > 10) THEN
    RAISE EXCEPTION 'vpd_kpa out of range';
  END IF;
  IF NEW.light_hours IS NOT NULL AND (NEW.light_hours < 0 OR NEW.light_hours > 24) THEN
    RAISE EXCEPTION 'light_hours out of range';
  END IF;
  RETURN NEW;
END $$;

-- Trigger trg_validate_environment (BEFORE INSERT OR UPDATE) is already bound to
-- this function from migration 20260518152526; CREATE OR REPLACE updates it in
-- place, so no trigger re-creation, GRANT, or RLS change is required.
