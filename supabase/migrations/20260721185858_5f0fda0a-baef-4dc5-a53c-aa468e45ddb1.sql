ALTER TABLE public.pheno_hunts
  ADD COLUMN IF NOT EXISTS breeding_objective jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pheno_hunts_breeding_objective_is_array'
  ) THEN
    ALTER TABLE public.pheno_hunts
      ADD CONSTRAINT pheno_hunts_breeding_objective_is_array
      CHECK (jsonb_typeof(breeding_objective) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN public.pheno_hunts.breeding_objective IS
  'Grower-authored target trait axes + acceptance thresholds for this hunt (e.g. [{"axisKey":"nose_loudness","comparator":"gte","threshold":7}]). A read-only comparison reference for the UI: it is never a ranking, never a keeper decision, and a candidate is only ever compared against this hunt''s own targets, never against other candidates.';