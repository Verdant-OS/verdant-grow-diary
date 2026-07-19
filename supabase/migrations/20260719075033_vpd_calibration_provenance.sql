-- VPD calibration provenance v1.
--
-- Adds immutable grower-owned calibration facts and exact measurement lineage.
-- Existing sensor_readings remain unchanged. This migration does not create
-- alerts, Action Queue items, automations, or device-control behavior.

CREATE TABLE public.vpd_calibration_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tent_id uuid NOT NULL REFERENCES public.tents(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  sensor_label text,
  sensor_commissioned_at timestamptz,
  placement text NOT NULL,
  temperature_verified_at timestamptz NOT NULL,
  temperature_reference text NOT NULL,
  temperature_reference_value_c numeric(6,2) NOT NULL,
  temperature_sensor_value_c numeric(6,2) NOT NULL,
  temperature_correction_offset_c numeric(7,3)
    GENERATED ALWAYS AS (temperature_reference_value_c - temperature_sensor_value_c) STORED,
  temperature_verified_at_operating_conditions boolean NOT NULL DEFAULT false,
  humidity_verified_at timestamptz NOT NULL,
  humidity_reference_rh_pct numeric(5,2) NOT NULL,
  humidity_sensor_rh_pct numeric(5,2) NOT NULL,
  humidity_correction_offset_pct numeric(6,3)
    GENERATED ALWAYS AS (humidity_reference_rh_pct - humidity_sensor_rh_pct) STORED,
  evidence_source text NOT NULL DEFAULT 'manual',
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vpd_calibration_records_device_id_check
    CHECK (char_length(btrim(device_id)) BETWEEN 1 AND 200),
  CONSTRAINT vpd_calibration_records_reference_check
    CHECK (char_length(btrim(temperature_reference)) BETWEEN 1 AND 500),
  CONSTRAINT vpd_calibration_records_placement_check
    CHECK (placement IN ('canopy', 'above_canopy', 'below_canopy', 'unknown')),
  CONSTRAINT vpd_calibration_records_humidity_reference_check
    CHECK (humidity_reference_rh_pct >= 75 AND humidity_reference_rh_pct <= 100),
  CONSTRAINT vpd_calibration_records_temperature_values_check
    CHECK (
      temperature_reference_value_c >= -50
      AND temperature_reference_value_c <= 100
      AND temperature_sensor_value_c >= -50
      AND temperature_sensor_value_c <= 100
    ),
  CONSTRAINT vpd_calibration_records_humidity_sensor_value_check
    CHECK (humidity_sensor_rh_pct >= 0 AND humidity_sensor_rh_pct <= 100),
  CONSTRAINT vpd_calibration_records_source_check
    CHECK (evidence_source IN ('manual', 'csv')),
  CONSTRAINT vpd_calibration_records_dates_check
    CHECK (
      temperature_verified_at <= recorded_at + interval '5 minutes'
      AND humidity_verified_at <= recorded_at + interval '5 minutes'
      AND (
        sensor_commissioned_at IS NULL
        OR sensor_commissioned_at <= GREATEST(temperature_verified_at, humidity_verified_at)
      )
    )
);

COMMENT ON TABLE public.vpd_calibration_records IS
  'Append-only grower evidence for temperature/RH verification and canopy placement. A row is evidence, not a client-authored verified-status flag.';
COMMENT ON COLUMN public.vpd_calibration_records.humidity_reference_rh_pct IS
  'RH verification reference point. Decision-grade VPD requires 75 through 100 percent; this is not a grow-room setpoint.';
COMMENT ON COLUMN public.vpd_calibration_records.temperature_verified_at_operating_conditions IS
  'Grower attestation that temperature was compared with the named reference near room operating conditions.';
COMMENT ON COLUMN public.vpd_calibration_records.temperature_correction_offset_c IS
  'Database-derived correction applied to air temperature: reference value minus sensor value.';
COMMENT ON COLUMN public.vpd_calibration_records.humidity_correction_offset_pct IS
  'Database-derived correction applied to RH: reference point minus sensor value at that point.';

CREATE INDEX vpd_calibration_records_user_tent_device_idx
  ON public.vpd_calibration_records (user_id, tent_id, device_id, recorded_at DESC);

CREATE TABLE public.vpd_measurement_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tent_id uuid NOT NULL REFERENCES public.tents(id) ON DELETE CASCADE,
  vpd_reading_id uuid NOT NULL UNIQUE REFERENCES public.sensor_readings(id) ON DELETE RESTRICT,
  air_temperature_reading_id uuid NOT NULL REFERENCES public.sensor_readings(id) ON DELETE RESTRICT,
  humidity_reading_id uuid NOT NULL REFERENCES public.sensor_readings(id) ON DELETE RESTRICT,
  calibration_record_id uuid REFERENCES public.vpd_calibration_records(id) ON DELETE RESTRICT,
  measurement_basis text NOT NULL,
  leaf_temperature_c numeric(6,2),
  leaf_temperature_measured_at timestamptz,
  leaf_temperature_method text,
  algorithm_version text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vpd_measurement_provenance_basis_check
    CHECK (measurement_basis IN ('leaf', 'air_estimate', 'grower_entered')),
  CONSTRAINT vpd_measurement_provenance_leaf_temperature_check
    CHECK (leaf_temperature_c IS NULL OR (leaf_temperature_c >= -50 AND leaf_temperature_c <= 100)),
  CONSTRAINT vpd_measurement_provenance_leaf_method_check
    CHECK (
      leaf_temperature_method IS NULL
      OR leaf_temperature_method IN ('infrared', 'contact_probe', 'measured_offset')
    ),
  CONSTRAINT vpd_measurement_provenance_shape_check
    CHECK (
      (
        measurement_basis = 'leaf'
        AND calibration_record_id IS NOT NULL
        AND leaf_temperature_c IS NOT NULL
        AND leaf_temperature_measured_at IS NOT NULL
        AND leaf_temperature_method IS NOT NULL
        AND algorithm_version = 'tetens_leaf_air_v1'
      )
      OR (
        measurement_basis = 'air_estimate'
        AND calibration_record_id IS NULL
        AND leaf_temperature_c IS NULL
        AND leaf_temperature_measured_at IS NULL
        AND leaf_temperature_method IS NULL
        AND algorithm_version = 'tetens_air_v1'
      )
      OR (
        measurement_basis = 'grower_entered'
        AND calibration_record_id IS NULL
        AND leaf_temperature_c IS NULL
        AND leaf_temperature_measured_at IS NULL
        AND leaf_temperature_method IS NULL
        AND algorithm_version IS NULL
      )
    )
);

COMMENT ON TABLE public.vpd_measurement_provenance IS
  'Append-only lineage for a persisted VPD reading. Leaf basis is accepted only when the database can prove calibrated, contemporaneous canopy evidence and formula parity.';
COMMENT ON COLUMN public.vpd_measurement_provenance.measurement_basis IS
  'leaf is decision-grade after validation; air_estimate and grower_entered remain non-target evidence.';

CREATE INDEX vpd_measurement_provenance_user_tent_recorded_idx
  ON public.vpd_measurement_provenance (user_id, tent_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION public.validate_vpd_measurement_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vpd public.sensor_readings%ROWTYPE;
  v_air public.sensor_readings%ROWTYPE;
  v_humidity public.sensor_readings%ROWTYPE;
  v_calibration public.vpd_calibration_records%ROWTYPE;
  v_vpd_observed_at timestamptz;
  v_air_observed_at timestamptz;
  v_humidity_observed_at timestamptz;
  v_corrected_air_temp_c numeric;
  v_corrected_humidity_pct numeric;
  v_air_saturation_kpa numeric;
  v_leaf_saturation_kpa numeric;
  v_expected_vpd numeric;
BEGIN
  SELECT *
    INTO v_vpd
    FROM public.sensor_readings
   WHERE id = NEW.vpd_reading_id
     AND user_id = NEW.user_id
     AND tent_id = NEW.tent_id
     AND metric = 'vpd_kpa';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vpd_reading_id must reference the caller-owned tent VPD row';
  END IF;

  SELECT *
    INTO v_air
    FROM public.sensor_readings
   WHERE id = NEW.air_temperature_reading_id
     AND user_id = NEW.user_id
     AND tent_id = NEW.tent_id
     AND metric = 'temperature_c';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'air_temperature_reading_id must reference the caller-owned tent temperature row';
  END IF;

  SELECT *
    INTO v_humidity
    FROM public.sensor_readings
   WHERE id = NEW.humidity_reading_id
     AND user_id = NEW.user_id
     AND tent_id = NEW.tent_id
     AND metric = 'humidity_pct';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'humidity_reading_id must reference the caller-owned tent humidity row';
  END IF;

  IF v_air.value < -50 OR v_air.value > 100 THEN
    RAISE EXCEPTION 'air temperature is outside the accepted VPD range';
  END IF;
  IF v_humidity.value < 0 OR v_humidity.value > 100 THEN
    RAISE EXCEPTION 'humidity is outside the accepted VPD range';
  END IF;

  v_vpd_observed_at := COALESCE(v_vpd.captured_at, v_vpd.ts);
  v_air_observed_at := COALESCE(v_air.captured_at, v_air.ts);
  v_humidity_observed_at := COALESCE(v_humidity.captured_at, v_humidity.ts);

  IF abs(extract(epoch FROM (v_air_observed_at - v_humidity_observed_at)))
       > extract(epoch FROM interval '15 minutes')
     OR abs(extract(epoch FROM (v_vpd_observed_at - v_air_observed_at)))
       > extract(epoch FROM interval '15 minutes')
     OR abs(extract(epoch FROM (v_vpd_observed_at - v_humidity_observed_at)))
       > extract(epoch FROM interval '15 minutes') THEN
    RAISE EXCEPTION 'VPD, temperature, and humidity readings must be within 15 minutes';
  END IF;

  IF NEW.measurement_basis = 'leaf' THEN
    SELECT *
      INTO v_calibration
      FROM public.vpd_calibration_records
     WHERE id = NEW.calibration_record_id
       AND user_id = NEW.user_id
       AND tent_id = NEW.tent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'calibration_record_id must reference caller-owned tent evidence';
    END IF;

    IF v_calibration.placement <> 'canopy' THEN
      RAISE EXCEPTION 'decision-grade leaf VPD requires canopy placement';
    END IF;
    IF v_calibration.temperature_verified_at_operating_conditions IS NOT TRUE THEN
      RAISE EXCEPTION 'temperature must be verified at operating conditions';
    END IF;
    IF v_calibration.humidity_reference_rh_pct < 75
       OR v_calibration.humidity_reference_rh_pct > 100 THEN
      RAISE EXCEPTION 'humidity reference must be between 75 and 100 percent';
    END IF;
    IF v_calibration.temperature_verified_at > v_vpd_observed_at + interval '5 minutes'
       OR v_calibration.humidity_verified_at > v_vpd_observed_at + interval '5 minutes'
       OR v_vpd_observed_at - v_calibration.temperature_verified_at > interval '365 days'
       OR v_vpd_observed_at - v_calibration.humidity_verified_at > interval '365 days' THEN
      RAISE EXCEPTION 'temperature and humidity verification must be current at observation time';
    END IF;
    IF v_calibration.sensor_commissioned_at IS NOT NULL
       AND v_calibration.sensor_commissioned_at > v_vpd_observed_at THEN
      RAISE EXCEPTION 'sensor commissioned date cannot be after the observation';
    END IF;
    IF v_air.device_id IS NOT NULL
       AND v_air.device_id <> v_calibration.device_id THEN
      RAISE EXCEPTION 'temperature reading device does not match calibration evidence';
    END IF;
    IF v_humidity.device_id IS NOT NULL
       AND v_humidity.device_id <> v_calibration.device_id THEN
      RAISE EXCEPTION 'humidity reading device does not match calibration evidence';
    END IF;
    IF v_air.quality <> 'ok' OR v_humidity.quality <> 'ok' OR v_vpd.quality <> 'ok' THEN
      RAISE EXCEPTION 'decision-grade leaf VPD requires ok-quality source rows';
    END IF;
    IF v_air.source IN ('demo', 'sim', 'stale', 'invalid')
       OR v_humidity.source IN ('demo', 'sim', 'stale', 'invalid') THEN
      RAISE EXCEPTION 'decision-grade leaf VPD cannot use demo, stale, or invalid sources';
    END IF;
    IF v_humidity.value = 0 OR v_humidity.value = 100 THEN
      RAISE EXCEPTION 'exact humidity extremes cannot support decision-grade VPD';
    END IF;
    IF abs(extract(epoch FROM (NEW.leaf_temperature_measured_at - v_air_observed_at)))
         > extract(epoch FROM interval '15 minutes')
       OR abs(extract(epoch FROM (NEW.leaf_temperature_measured_at - v_humidity_observed_at)))
         > extract(epoch FROM interval '15 minutes') THEN
      RAISE EXCEPTION 'leaf temperature and room readings must be within 15 minutes';
    END IF;

    v_corrected_air_temp_c :=
      v_air.value + v_calibration.temperature_correction_offset_c;
    v_corrected_humidity_pct :=
      v_humidity.value + v_calibration.humidity_correction_offset_pct;
    IF v_corrected_air_temp_c < -50 OR v_corrected_air_temp_c > 100 THEN
      RAISE EXCEPTION 'corrected air temperature is outside the accepted VPD range';
    END IF;
    IF v_corrected_humidity_pct <= 0 OR v_corrected_humidity_pct >= 100 THEN
      RAISE EXCEPTION 'corrected humidity cannot support decision-grade VPD';
    END IF;

    v_air_saturation_kpa :=
      0.6108 * exp((17.27 * v_corrected_air_temp_c) / (v_corrected_air_temp_c + 237.3));
    v_leaf_saturation_kpa :=
      0.6108 * exp((17.27 * NEW.leaf_temperature_c) / (NEW.leaf_temperature_c + 237.3));
    v_expected_vpd :=
      v_leaf_saturation_kpa - (v_air_saturation_kpa * v_corrected_humidity_pct / 100);
  ELSIF NEW.measurement_basis = 'air_estimate' THEN
    v_air_saturation_kpa := 0.6108 * exp((17.27 * v_air.value) / (v_air.value + 237.3));
    v_expected_vpd := v_air_saturation_kpa * (1 - v_humidity.value / 100);
  ELSE
    IF v_vpd.source NOT IN ('manual', 'csv') THEN
      RAISE EXCEPTION 'grower-entered VPD requires manual or CSV provenance';
    END IF;
    RETURN NEW;
  END IF;

  IF abs(v_vpd.value - v_expected_vpd) > 0.02 THEN
    RAISE EXCEPTION 'persisted VPD does not match the declared measurement basis';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_vpd_measurement_provenance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_vpd_measurement_provenance() TO service_role;

CREATE TRIGGER vpd_measurement_provenance_validate
  BEFORE INSERT ON public.vpd_measurement_provenance
  FOR EACH ROW EXECUTE FUNCTION public.validate_vpd_measurement_provenance();

REVOKE ALL ON public.vpd_calibration_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.vpd_measurement_provenance FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.vpd_calibration_records TO authenticated;
GRANT SELECT, INSERT ON public.vpd_measurement_provenance TO authenticated;
GRANT ALL ON public.vpd_calibration_records TO service_role;
GRANT ALL ON public.vpd_measurement_provenance TO service_role;

ALTER TABLE public.vpd_calibration_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vpd_measurement_provenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own VPD calibration records"
  ON public.vpd_calibration_records
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users insert own VPD calibration records"
  ON public.vpd_calibration_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND recorded_at <= now() + interval '5 minutes'
    AND EXISTS (
      SELECT 1
        FROM public.tents
       WHERE id = tent_id
         AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users view own VPD measurement provenance"
  ON public.vpd_measurement_provenance
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users insert own VPD measurement provenance"
  ON public.vpd_measurement_provenance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND recorded_at <= now() + interval '5 minutes'
    AND EXISTS (
      SELECT 1
        FROM public.tents
       WHERE id = tent_id
         AND user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
        FROM public.sensor_readings
       WHERE id = vpd_reading_id
         AND user_id = auth.uid()
         AND tent_id = vpd_measurement_provenance.tent_id
         AND metric = 'vpd_kpa'
    )
    AND EXISTS (
      SELECT 1
        FROM public.sensor_readings
       WHERE id = air_temperature_reading_id
         AND user_id = auth.uid()
         AND tent_id = vpd_measurement_provenance.tent_id
         AND metric = 'temperature_c'
    )
    AND EXISTS (
      SELECT 1
        FROM public.sensor_readings
       WHERE id = humidity_reading_id
         AND user_id = auth.uid()
         AND tent_id = vpd_measurement_provenance.tent_id
         AND metric = 'humidity_pct'
    )
    AND (
      calibration_record_id IS NULL
      OR EXISTS (
        SELECT 1
          FROM public.vpd_calibration_records
         WHERE id = calibration_record_id
           AND user_id = auth.uid()
           AND tent_id = vpd_measurement_provenance.tent_id
      )
    )
  );
