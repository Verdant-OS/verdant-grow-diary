-- Pheno male-evaluation dedupe (2026-07-09 commercial-scale audit, M1):
--
-- pheno_male_evaluations declares UNIQUE (hunt_id, plant_id) to enforce "one
-- card per male per hunt". But hunt_id is nullable (a male can be evaluated
-- for a program that spans hunts, mirroring pheno_crosses), and Postgres
-- treats NULLs as DISTINCT in a unique index — so for standalone evaluations
-- (hunt_id IS NULL) a single male plant can accumulate unlimited duplicate
-- cards, defeating the constraint exactly where it was meant to hold. Add a
-- partial unique index over plant_id for the hunt-less rows to close the gap.
--
-- NOTE: like the pheno_male_evaluations foundation
-- (20260709120000_pheno_male_evaluations_foundation.sql), this migration is
-- delivered as a file for review + per-PR Supabase preview validation and is
-- intentionally NOT applied to the live project by this change — it lands with
-- the foundation when the male-evaluation slice is deployed.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS pheno_male_evaluations_plant_no_hunt_key
  ON public.pheno_male_evaluations (plant_id)
  WHERE hunt_id IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
