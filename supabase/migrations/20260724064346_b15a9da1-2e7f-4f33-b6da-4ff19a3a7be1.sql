-- Defensive backfill: ensure every plant has a valid plant_type.
-- Column already NOT NULL DEFAULT 'unknown' (migration 20260722010000); this
-- normalizes any row whose value has drifted outside the allowed set and
-- re-asserts the default/NOT NULL guard idempotently.

ALTER TABLE public.plants
  ALTER COLUMN plant_type SET DEFAULT 'unknown';

UPDATE public.plants
SET plant_type = 'unknown'
WHERE plant_type IS NULL
   OR btrim(plant_type) = ''
   OR lower(btrim(plant_type)) NOT IN ('autoflower', 'photoperiod', 'unknown');

ALTER TABLE public.plants
  ALTER COLUMN plant_type SET NOT NULL;