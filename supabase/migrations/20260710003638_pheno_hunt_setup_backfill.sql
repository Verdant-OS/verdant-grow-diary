-- Backfill: hunts created before guided setup shipped are stamped as
-- setup-complete. Bounded by the guided-setup migration's timestamp so
-- re-application can never force-complete a new-flow hunt mid-setup.
UPDATE public.pheno_hunts
SET setup_completed_at = created_at
WHERE setup_completed_at IS NULL
  AND created_at < '2026-07-09T23:06:46Z';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pheno_hunts_notes_length'
      AND conrelid = 'public.pheno_hunts'::regclass
  ) THEN
    ALTER TABLE public.pheno_hunts
      ADD CONSTRAINT pheno_hunts_notes_length
      CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 4000);
  END IF;
END $$;

COMMENT ON COLUMN public.pheno_hunts.setup_completed_at IS
  'When guided setup was completed. NULL = setup in progress (workspace shows the setup progress card). Legacy hunts backfilled to created_at.';;
