-- Pheno Hunt guided setup: legacy backfill + notes bound.
--
-- Follow-up to 20260709230646 (evidence_goals / notes / setup_completed_at):
--
-- 1. Backfill: hunts created BEFORE guided setup shipped are stamped as
--    setup-complete. Without this, every pre-existing hunt shows the
--    "finish setup" card forever — and a canceled/expired prior-Pro user
--    cannot clear it at all, because the RESTRICTIVE pheno-entitlement RLS
--    blocks their UPDATE. Bounded by the guided-setup migration's own
--    timestamp so re-application can never force-complete a new-flow hunt
--    that is legitimately mid-setup.
--
-- 2. Notes bound: the client trims to 4000 chars; enforce the same bound
--    in the database as defense in depth.
--
-- SAFETY: no RLS, grant, or trigger change; no readiness claim is stored.

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
  'When guided setup was completed. NULL = setup in progress (workspace shows the setup progress card). Legacy hunts backfilled to created_at.';
