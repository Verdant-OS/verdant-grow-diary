-- plants.plant_type — declared autoflower / photoperiod / unknown.
-- Autoflower/photoperiod plan (locked 2026-07-21), Step 5.
--
-- Grower-entered ONLY: forms offer Autoflower / Photoperiod / "Not sure"
-- (stored as 'unknown'). The default is 'unknown' — Verdant never silently
-- assumes photoperiod, and nothing infers the type from strain text.
-- Downstream: 'unknown' blocks cross-plant pheno ranking (comparability
-- fence) and blocks "strong" AI Doctor readiness. The column is CORE — no
-- entitlement gates the type field itself.

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
