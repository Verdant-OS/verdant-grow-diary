-- Verdant Phase 1 — tents, plants, sensor_readings

CREATE TABLE public.tents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  name            text NOT NULL,
  brand           text,
  size            text,
  stage           text NOT NULL DEFAULT 'seedling',
  light_on        boolean NOT NULL DEFAULT true,
  light_schedule  text,
  light_wattage   integer,
  is_archived     boolean NOT NULL DEFAULT false,
  schema_version  smallint NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tents IS
  'Grow tents / spaces owned by a user. Soft-referenced by plants and sensor_readings.';

CREATE INDEX idx_tents_user_active
  ON public.tents (user_id, is_archived, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_tent_stage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stage NOT IN ('seedling','veg','flower','flush','harvest','cure') THEN
    RAISE EXCEPTION 'invalid tent stage: %', NEW.stage;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_tents_validate_stage
  BEFORE INSERT OR UPDATE ON public.tents
  FOR EACH ROW EXECUTE FUNCTION public.validate_tent_stage();

CREATE TRIGGER trg_tents_set_updated_at
  BEFORE UPDATE ON public.tents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tents"
  ON public.tents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tents"
  ON public.tents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tents"
  ON public.tents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own tents"
  ON public.tents FOR DELETE USING (auth.uid() = user_id);


CREATE TABLE public.plants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  tent_id         uuid,
  name            text NOT NULL,
  strain          text,
  stage           text NOT NULL DEFAULT 'seedling',
  started_at      timestamptz NOT NULL DEFAULT now(),
  health          text NOT NULL DEFAULT 'healthy',
  photo_url       text,
  last_note       text,
  is_archived     boolean NOT NULL DEFAULT false,
  schema_version  smallint NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plants IS
  'Individual plants owned by a user. Optionally assigned to a tent via tent_id (soft ref).';

CREATE INDEX idx_plants_user_active
  ON public.plants (user_id, is_archived, created_at DESC);
CREATE INDEX idx_plants_user_tent
  ON public.plants (user_id, tent_id);

CREATE OR REPLACE FUNCTION public.validate_plant_row()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.stage NOT IN ('seedling','veg','flower','flush','harvest','cure') THEN
    RAISE EXCEPTION 'invalid plant stage: %', NEW.stage;
  END IF;
  IF NEW.health NOT IN ('healthy','watch','issue') THEN
    RAISE EXCEPTION 'invalid plant health: %', NEW.health;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_plants_validate
  BEFORE INSERT OR UPDATE ON public.plants
  FOR EACH ROW EXECUTE FUNCTION public.validate_plant_row();

CREATE TRIGGER trg_plants_set_updated_at
  BEFORE UPDATE ON public.plants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own plants"
  ON public.plants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own plants"
  ON public.plants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own plants"
  ON public.plants FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own plants"
  ON public.plants FOR DELETE USING (auth.uid() = user_id);


CREATE TABLE public.sensor_readings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  tent_id     uuid NOT NULL,
  ts          timestamptz NOT NULL DEFAULT now(),
  metric      text NOT NULL,
  value       numeric NOT NULL,
  quality     text NOT NULL DEFAULT 'ok',
  source      text NOT NULL DEFAULT 'manual',
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sensor_readings IS
  'Append-only environment telemetry. Long format: one row per (tent, metric, ts).';

CREATE INDEX idx_sensor_readings_tent_ts
  ON public.sensor_readings (user_id, tent_id, ts DESC);
CREATE INDEX idx_sensor_readings_tent_metric_ts
  ON public.sensor_readings (user_id, tent_id, metric, ts DESC);

CREATE OR REPLACE FUNCTION public.validate_sensor_reading()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sensor_readings_validate
  BEFORE INSERT OR UPDATE ON public.sensor_readings
  FOR EACH ROW EXECUTE FUNCTION public.validate_sensor_reading();

ALTER TABLE public.sensor_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own readings"
  ON public.sensor_readings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own readings"
  ON public.sensor_readings FOR INSERT WITH CHECK (auth.uid() = user_id);