-- Soil moisture calibration v1.
-- Stores grower-entered dry/wet raw calibration points for read-time use.
-- This migration does not alter historical sensor_readings values.

CREATE TABLE public.soil_moisture_calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  grow_id uuid NOT NULL REFERENCES public.grows(id) ON DELETE CASCADE,
  tent_id uuid NOT NULL REFERENCES public.tents(id) ON DELETE CASCADE,
  plant_id uuid REFERENCES public.plants(id) ON DELETE SET NULL,
  device_id text,
  label text,
  medium text,
  sensor_depth_cm numeric,
  dry_raw numeric NOT NULL,
  wet_raw numeric NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT soil_moisture_calibrations_distinct_points_check
    CHECK (dry_raw <> wet_raw),
  CONSTRAINT soil_moisture_calibrations_finite_points_check
    CHECK (dry_raw <> 'NaN'::numeric AND wet_raw <> 'NaN'::numeric),
  CONSTRAINT soil_moisture_calibrations_source_check
    CHECK (source IN ('manual', 'csv', 'demo')),
  CONSTRAINT soil_moisture_calibrations_depth_check
    CHECK (sensor_depth_cm IS NULL OR (sensor_depth_cm >= 0 AND sensor_depth_cm <= 1000))
);

COMMENT ON TABLE public.soil_moisture_calibrations IS
  'Grower-owned soil moisture dry/wet raw calibration points. Read-time metadata only.';
COMMENT ON COLUMN public.soil_moisture_calibrations.dry_raw IS
  'Raw sensor value observed at the dry reference point.';
COMMENT ON COLUMN public.soil_moisture_calibrations.wet_raw IS
  'Raw sensor value observed at the wet reference point.';
COMMENT ON COLUMN public.soil_moisture_calibrations.source IS
  'Calibration evidence source. Allowed values: manual, csv, demo.';

CREATE INDEX soil_moisture_calibrations_user_grow_tent_idx
  ON public.soil_moisture_calibrations (user_id, grow_id, tent_id, is_active, created_at DESC);

CREATE INDEX soil_moisture_calibrations_plant_idx
  ON public.soil_moisture_calibrations (user_id, plant_id)
  WHERE plant_id IS NOT NULL;

CREATE UNIQUE INDEX soil_moisture_calibrations_active_probe_uidx
  ON public.soil_moisture_calibrations (
    user_id,
    grow_id,
    tent_id,
    COALESCE(plant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(device_id, '')
  )
  WHERE is_active;

CREATE TRIGGER soil_moisture_calibrations_set_updated_at
  BEFORE UPDATE ON public.soil_moisture_calibrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.soil_moisture_calibrations TO authenticated;
GRANT ALL ON public.soil_moisture_calibrations TO service_role;

ALTER TABLE public.soil_moisture_calibrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own soil moisture calibrations"
  ON public.soil_moisture_calibrations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own soil moisture calibrations"
  ON public.soil_moisture_calibrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = grow_id AND g.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.tents t
      WHERE t.id = tent_id AND t.user_id = auth.uid()
    )
    AND (
      plant_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = plant_id
          AND p.user_id = auth.uid()
          AND (p.grow_id IS NULL OR p.grow_id = grow_id)
          AND (p.tent_id IS NULL OR p.tent_id = tent_id)
      )
    )
  );

CREATE POLICY "Users update own soil moisture calibrations"
  ON public.soil_moisture_calibrations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = grow_id AND g.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.tents t
      WHERE t.id = tent_id AND t.user_id = auth.uid()
    )
    AND (
      plant_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.plants p
        WHERE p.id = plant_id
          AND p.user_id = auth.uid()
          AND (p.grow_id IS NULL OR p.grow_id = grow_id)
          AND (p.tent_id IS NULL OR p.tent_id = tent_id)
      )
    )
  );

CREATE POLICY "Users delete own soil moisture calibrations"
  ON public.soil_moisture_calibrations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
