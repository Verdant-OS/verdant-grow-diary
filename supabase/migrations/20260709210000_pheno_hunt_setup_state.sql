-- Pheno Hunt guided setup state: persisted goal + explicit setup confirmation.
--
-- Adds two nullable columns to public.pheno_hunts:
--   goal               — the grower's stated hunt goal, persisted so the
--                        workspace Evidence Packet Map can display it and
--                        "continue setup" can restore it across devices.
--   setup_confirmed_at — stamped when the grower reviews and confirms their
--                        hunt setup. NULL = setup still in progress (the
--                        workspace shows a "Continue setup" banner).
--
-- SAFETY: no RLS or grant change. Row policies on pheno_hunts already scope
-- SELECT/UPDATE/DELETE to the owner, and the RESTRICTIVE pheno-entitlement
-- RLS policies keep Free / canceled / expired users write-blocked at the
-- database even if they bypass the UI.
--
-- Readiness honesty: the setup -> ready-for-tracking -> comparison-ready
-- ladder is DERIVED from recorded evidence in the client view model
-- (phenoHuntOnboardingViewModel). It is never stored as a claim; these
-- columns only persist what the grower actually did (goal text, confirm
-- timestamp).

ALTER TABLE public.pheno_hunts
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS setup_confirmed_at timestamptz;

-- Bounded free text — defense in depth behind client-side validation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pheno_hunts_goal_length'
      AND conrelid = 'public.pheno_hunts'::regclass
  ) THEN
    ALTER TABLE public.pheno_hunts
      ADD CONSTRAINT pheno_hunts_goal_length
      CHECK (goal IS NULL OR char_length(goal) BETWEEN 1 AND 500);
  END IF;
END $$;

-- Backfill: hunts created before guided setup existed are treated as
-- confirmed so existing workspaces never regress to "continue setup".
UPDATE public.pheno_hunts
SET setup_confirmed_at = created_at
WHERE setup_confirmed_at IS NULL;

COMMENT ON COLUMN public.pheno_hunts.goal IS
  'Grower-stated hunt goal captured during guided setup; shown in the workspace Evidence Packet Map. 1-500 chars or NULL (legacy hunts).';
COMMENT ON COLUMN public.pheno_hunts.setup_confirmed_at IS
  'When the grower confirmed hunt setup. NULL = setup in progress (continue-setup banner).';
