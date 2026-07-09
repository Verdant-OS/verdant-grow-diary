
ALTER TABLE public.pheno_hunts
  ADD COLUMN IF NOT EXISTS evidence_goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;

-- Defensive: evidence_goals must be a JSON array of short text keys, not
-- arbitrary blobs. Keeps client-supplied JSON tight without breaking RLS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pheno_hunts_evidence_goals_is_array'
  ) THEN
    ALTER TABLE public.pheno_hunts
      ADD CONSTRAINT pheno_hunts_evidence_goals_is_array
      CHECK (jsonb_typeof(evidence_goals) = 'array');
  END IF;
END $$;
