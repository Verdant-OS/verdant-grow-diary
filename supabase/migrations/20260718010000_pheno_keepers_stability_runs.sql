ALTER TABLE public.pheno_keepers
  ADD COLUMN IF NOT EXISTS stability_runs jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Defensive: stability_runs must be a JSON array of small
-- {runLabel, observedAt, traits, note} grow-out objects, not arbitrary
-- blobs. Semantic validation (known trait axis keys, in-range values,
-- bounds) lives in the app layer (sanitizeStabilityRuns), not SQL — the
-- same split already used for evidence_goals and breeding_objective.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pheno_keepers_stability_runs_is_array'
  ) THEN
    ALTER TABLE public.pheno_keepers
      ADD CONSTRAINT pheno_keepers_stability_runs_is_array
      CHECK (jsonb_typeof(stability_runs) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN public.pheno_keepers.stability_runs IS
  'Grower-recorded grow-outs of this keeper''s clone over separate runs (e.g. [{"runLabel":"Winter 2026","observedAt":"2026-02-01","traits":{"nose_loudness":8},"note":""}]). A read-only reference the UI uses to show whether traits held on re-grow. It never claims a phenotype is permanently stable, guaranteed, or a keeper — it only reflects what the grower recorded across runs.';
