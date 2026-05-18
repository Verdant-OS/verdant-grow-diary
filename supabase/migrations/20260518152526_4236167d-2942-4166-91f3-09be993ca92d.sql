
-- =====================================================================
-- Manual Grow Events Timeline
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Spine table: grow_events
-- ---------------------------------------------------------------------
CREATE TABLE public.grow_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  grow_id      UUID NOT NULL,
  tent_id      UUID,
  plant_id     UUID,
  event_type   TEXT NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note         TEXT,
  source       TEXT NOT NULL DEFAULT 'manual',
  is_deleted   BOOLEAN NOT NULL DEFAULT false,
  deleted_at   TIMESTAMPTZ,
  schema_version SMALLINT NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.grow_events IS
  'Spine of the manual grow events timeline. One row per logged event; typed payload lives in a matching subtype table keyed by id.';

-- ---------------------------------------------------------------------
-- 2. Subtype tables
-- ---------------------------------------------------------------------
CREATE TABLE public.watering_events (
  event_id     UUID PRIMARY KEY REFERENCES public.grow_events(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  volume_ml    NUMERIC,
  ph           NUMERIC,
  ec_ms_cm     NUMERIC,
  runoff_ml    NUMERIC,
  runoff_ph    NUMERIC,
  runoff_ec    NUMERIC,
  water_temp_c NUMERIC,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.watering_events IS 'Watering-specific payload (volume, pH, EC, runoff).';

CREATE TABLE public.feeding_events (
  event_id      UUID PRIMARY KEY REFERENCES public.grow_events(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  volume_ml     NUMERIC,
  ph            NUMERIC,
  ec_ms_cm      NUMERIC,
  recipe        JSONB NOT NULL DEFAULT '{}'::jsonb,
  nutrient_brand TEXT,
  schedule_week INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.feeding_events IS 'Feeding-specific payload (recipe JSONB, pH, EC, schedule).';

CREATE TABLE public.training_events (
  event_id       UUID PRIMARY KEY REFERENCES public.grow_events(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL,
  technique      TEXT NOT NULL,
  intensity      TEXT,
  affected_nodes INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.training_events IS 'Training-specific payload (LST, topping, defoliation, etc.).';

CREATE TABLE public.observation_events (
  event_id      UUID PRIMARY KEY REFERENCES public.grow_events(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  symptom_type  TEXT[] NOT NULL DEFAULT '{}',
  severity      TEXT,
  affected_area TEXT,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.observation_events IS 'Structured symptom/observation intake for AI Doctor packets.';

CREATE TABLE public.photo_events (
  event_id    UUID PRIMARY KEY REFERENCES public.grow_events(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  photo_url   TEXT NOT NULL,
  caption     TEXT,
  width_px    INT,
  height_px   INT,
  taken_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.photo_events IS 'Photo log payload pointing at storage object.';

CREATE TABLE public.environment_events (
  event_id       UUID PRIMARY KEY REFERENCES public.grow_events(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL,
  temperature_c  NUMERIC,
  humidity_pct   NUMERIC,
  vpd_kpa        NUMERIC,
  co2_ppm        NUMERIC,
  light_on       BOOLEAN,
  light_hours    NUMERIC,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.environment_events IS 'Manual environment snapshot, complementary to sensor_readings.';

-- ---------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------
CREATE INDEX idx_grow_events_user_time     ON public.grow_events (user_id, occurred_at DESC);
CREATE INDEX idx_grow_events_grow_time     ON public.grow_events (grow_id, occurred_at DESC);
CREATE INDEX idx_grow_events_tent_time     ON public.grow_events (tent_id, occurred_at DESC) WHERE tent_id IS NOT NULL;
CREATE INDEX idx_grow_events_plant_time    ON public.grow_events (plant_id, occurred_at DESC) WHERE plant_id IS NOT NULL;
CREATE INDEX idx_grow_events_type_time     ON public.grow_events (event_type, occurred_at DESC);
CREATE INDEX idx_grow_events_active        ON public.grow_events (user_id, occurred_at DESC) WHERE is_deleted = false;

CREATE INDEX idx_watering_events_user      ON public.watering_events (user_id);
CREATE INDEX idx_feeding_events_user       ON public.feeding_events (user_id);
CREATE INDEX idx_feeding_events_recipe_gin ON public.feeding_events USING GIN (recipe);
CREATE INDEX idx_training_events_user      ON public.training_events (user_id);
CREATE INDEX idx_observation_events_user   ON public.observation_events (user_id);
CREATE INDEX idx_observation_events_sym_gin ON public.observation_events USING GIN (symptom_type);
CREATE INDEX idx_photo_events_user         ON public.photo_events (user_id);
CREATE INDEX idx_environment_events_user   ON public.environment_events (user_id);

-- ---------------------------------------------------------------------
-- 4. Validation triggers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_grow_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.event_type NOT IN (
    'watering','feeding','training','observation','photo','environment'
  ) THEN
    RAISE EXCEPTION 'invalid event_type: %', NEW.event_type;
  END IF;
  IF NEW.source NOT IN ('manual','voice','import','ai') THEN
    RAISE EXCEPTION 'invalid source: %', NEW.source;
  END IF;
  IF NEW.is_deleted = true AND NEW.deleted_at IS NULL THEN
    NEW.deleted_at := now();
  END IF;
  IF NEW.is_deleted = false THEN
    NEW.deleted_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_grow_event
BEFORE INSERT OR UPDATE ON public.grow_events
FOR EACH ROW EXECUTE FUNCTION public.validate_grow_event();

CREATE OR REPLACE FUNCTION public.validate_event_subtype_owner()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  parent_user UUID;
  parent_type TEXT;
  expected_type TEXT := TG_ARGV[0];
BEGIN
  SELECT user_id, event_type INTO parent_user, parent_type
  FROM public.grow_events WHERE id = NEW.event_id;
  IF parent_user IS NULL THEN
    RAISE EXCEPTION 'parent grow_event not found: %', NEW.event_id;
  END IF;
  IF parent_user <> NEW.user_id THEN
    RAISE EXCEPTION 'subtype user_id does not match parent grow_event user_id';
  END IF;
  IF parent_type <> expected_type THEN
    RAISE EXCEPTION 'subtype % attached to grow_event of type %', expected_type, parent_type;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_watering_owner
BEFORE INSERT OR UPDATE ON public.watering_events
FOR EACH ROW EXECUTE FUNCTION public.validate_event_subtype_owner('watering');

CREATE TRIGGER trg_validate_feeding_owner
BEFORE INSERT OR UPDATE ON public.feeding_events
FOR EACH ROW EXECUTE FUNCTION public.validate_event_subtype_owner('feeding');

CREATE TRIGGER trg_validate_training_owner
BEFORE INSERT OR UPDATE ON public.training_events
FOR EACH ROW EXECUTE FUNCTION public.validate_event_subtype_owner('training');

CREATE TRIGGER trg_validate_observation_owner
BEFORE INSERT OR UPDATE ON public.observation_events
FOR EACH ROW EXECUTE FUNCTION public.validate_event_subtype_owner('observation');

CREATE TRIGGER trg_validate_photo_owner
BEFORE INSERT OR UPDATE ON public.photo_events
FOR EACH ROW EXECUTE FUNCTION public.validate_event_subtype_owner('photo');

CREATE TRIGGER trg_validate_environment_owner
BEFORE INSERT OR UPDATE ON public.environment_events
FOR EACH ROW EXECUTE FUNCTION public.validate_event_subtype_owner('environment');

-- Range validators
CREATE OR REPLACE FUNCTION public.validate_watering_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.volume_ml IS NOT NULL AND NEW.volume_ml < 0 THEN RAISE EXCEPTION 'volume_ml < 0'; END IF;
  IF NEW.ph IS NOT NULL AND (NEW.ph < 0 OR NEW.ph > 14) THEN RAISE EXCEPTION 'ph out of range'; END IF;
  IF NEW.runoff_ph IS NOT NULL AND (NEW.runoff_ph < 0 OR NEW.runoff_ph > 14) THEN RAISE EXCEPTION 'runoff_ph out of range'; END IF;
  IF NEW.ec_ms_cm IS NOT NULL AND NEW.ec_ms_cm < 0 THEN RAISE EXCEPTION 'ec_ms_cm < 0'; END IF;
  IF NEW.runoff_ec IS NOT NULL AND NEW.runoff_ec < 0 THEN RAISE EXCEPTION 'runoff_ec < 0'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_watering BEFORE INSERT OR UPDATE ON public.watering_events
FOR EACH ROW EXECUTE FUNCTION public.validate_watering_event();

CREATE OR REPLACE FUNCTION public.validate_feeding_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ph IS NOT NULL AND (NEW.ph < 0 OR NEW.ph > 14) THEN RAISE EXCEPTION 'ph out of range'; END IF;
  IF NEW.ec_ms_cm IS NOT NULL AND NEW.ec_ms_cm < 0 THEN RAISE EXCEPTION 'ec_ms_cm < 0'; END IF;
  IF NEW.volume_ml IS NOT NULL AND NEW.volume_ml < 0 THEN RAISE EXCEPTION 'volume_ml < 0'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_feeding BEFORE INSERT OR UPDATE ON public.feeding_events
FOR EACH ROW EXECUTE FUNCTION public.validate_feeding_event();

CREATE OR REPLACE FUNCTION public.validate_training_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.technique NOT IN ('lst','topping','fim','defoliation','supercropping','scrog','manifold','other') THEN
    RAISE EXCEPTION 'invalid technique: %', NEW.technique;
  END IF;
  IF NEW.intensity IS NOT NULL AND NEW.intensity NOT IN ('light','medium','heavy') THEN
    RAISE EXCEPTION 'invalid intensity: %', NEW.intensity;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_training BEFORE INSERT OR UPDATE ON public.training_events
FOR EACH ROW EXECUTE FUNCTION public.validate_training_event();

CREATE OR REPLACE FUNCTION public.validate_observation_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.severity IS NOT NULL AND NEW.severity NOT IN ('info','watch','warn','critical') THEN
    RAISE EXCEPTION 'invalid severity: %', NEW.severity;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_observation BEFORE INSERT OR UPDATE ON public.observation_events
FOR EACH ROW EXECUTE FUNCTION public.validate_observation_event();

CREATE OR REPLACE FUNCTION public.validate_environment_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.humidity_pct IS NOT NULL AND (NEW.humidity_pct < 0 OR NEW.humidity_pct > 100) THEN
    RAISE EXCEPTION 'humidity_pct out of range';
  END IF;
  IF NEW.co2_ppm IS NOT NULL AND NEW.co2_ppm < 0 THEN RAISE EXCEPTION 'co2_ppm < 0'; END IF;
  IF NEW.vpd_kpa IS NOT NULL AND NEW.vpd_kpa < 0 THEN RAISE EXCEPTION 'vpd_kpa < 0'; END IF;
  IF NEW.light_hours IS NOT NULL AND (NEW.light_hours < 0 OR NEW.light_hours > 24) THEN
    RAISE EXCEPTION 'light_hours out of range';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_environment BEFORE INSERT OR UPDATE ON public.environment_events
FOR EACH ROW EXECUTE FUNCTION public.validate_environment_event();

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.grow_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watering_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feeding_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observation_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.environment_events  ENABLE ROW LEVEL SECURITY;

-- Helper macro replicated per table (no DO blocks needed)

-- grow_events
CREATE POLICY "Users view own grow_events"   ON public.grow_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Operators view all grow_events" ON public.grow_events FOR SELECT TO authenticated USING (has_role(auth.uid(),'operator'));
CREATE POLICY "Users insert own grow_events" ON public.grow_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own grow_events" ON public.grow_events FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own grow_events" ON public.grow_events FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- watering_events
CREATE POLICY "Users view own watering_events"   ON public.watering_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Operators view all watering_events" ON public.watering_events FOR SELECT TO authenticated USING (has_role(auth.uid(),'operator'));
CREATE POLICY "Users insert own watering_events" ON public.watering_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own watering_events" ON public.watering_events FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own watering_events" ON public.watering_events FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- feeding_events
CREATE POLICY "Users view own feeding_events"   ON public.feeding_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Operators view all feeding_events" ON public.feeding_events FOR SELECT TO authenticated USING (has_role(auth.uid(),'operator'));
CREATE POLICY "Users insert own feeding_events" ON public.feeding_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own feeding_events" ON public.feeding_events FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own feeding_events" ON public.feeding_events FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- training_events
CREATE POLICY "Users view own training_events"   ON public.training_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Operators view all training_events" ON public.training_events FOR SELECT TO authenticated USING (has_role(auth.uid(),'operator'));
CREATE POLICY "Users insert own training_events" ON public.training_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own training_events" ON public.training_events FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own training_events" ON public.training_events FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- observation_events
CREATE POLICY "Users view own observation_events"   ON public.observation_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Operators view all observation_events" ON public.observation_events FOR SELECT TO authenticated USING (has_role(auth.uid(),'operator'));
CREATE POLICY "Users insert own observation_events" ON public.observation_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own observation_events" ON public.observation_events FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own observation_events" ON public.observation_events FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- photo_events
CREATE POLICY "Users view own photo_events"   ON public.photo_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Operators view all photo_events" ON public.photo_events FOR SELECT TO authenticated USING (has_role(auth.uid(),'operator'));
CREATE POLICY "Users insert own photo_events" ON public.photo_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own photo_events" ON public.photo_events FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own photo_events" ON public.photo_events FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- environment_events
CREATE POLICY "Users view own environment_events"   ON public.environment_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Operators view all environment_events" ON public.environment_events FOR SELECT TO authenticated USING (has_role(auth.uid(),'operator'));
CREATE POLICY "Users insert own environment_events" ON public.environment_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own environment_events" ON public.environment_events FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own environment_events" ON public.environment_events FOR DELETE TO authenticated USING (auth.uid() = user_id);
