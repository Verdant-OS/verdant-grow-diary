ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS plant_type text NOT NULL DEFAULT 'unknown';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plants_plant_type_check'
      AND conrelid = 'public.plants'::regclass
  ) THEN
    ALTER TABLE public.plants
      ADD CONSTRAINT plants_plant_type_check
      CHECK (plant_type IN ('autoflower', 'photoperiod', 'unknown'));
  END IF;
END $$;

COMMENT ON COLUMN public.plants.plant_type IS
  'Declared plant type: autoflower | photoperiod | unknown. Grower-entered only, never inferred. unknown blocks cross-plant ranking and strong AI readiness.';

NOTIFY pgrst, 'reload schema';