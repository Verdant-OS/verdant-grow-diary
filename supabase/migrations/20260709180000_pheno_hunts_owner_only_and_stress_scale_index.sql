-- Pheno hunt posture + scale (2026-07-09 commercial-scale audit):
--
-- H1 — pheno_hunts was the ONLY pheno table granting operators cross-tenant
-- access: "Operators view all pheno_hunts" (SELECT) and "Operators update all
-- pheno_hunts" (UPDATE) both keyed only on has_role(...,'operator'). Every
-- CHILD table (scores, sex obs, keeper decisions/log, keepers, crosses,
-- stress, reversals) is strictly owner-scoped with no operator policy, so a
-- grower's candidate data is private while an operator could read — and worse,
-- UPDATE — any grower's hunt header (the operator UPDATE WITH CHECK only
-- re-verified the operator role, never pinning user_id, so it permitted
-- reassigning a hunt's owner). Drop both so pheno_hunts matches the owner-only
-- posture of everything hanging off it. No operator UI reads pheno_hunts (the
-- one operator crosses surface is unmounted), so this removes access nothing
-- in the app relies on.
--
-- M2 — pheno_stress_observations is read per hunt ordered by time
-- (WHERE hunt_id = $1 ORDER BY created_at DESC) but had only single-column
-- indexes, forcing a sort of every one of a hunt's stress rows on each load.
-- Add the covering composite.

BEGIN;

DROP POLICY IF EXISTS "Operators view all pheno_hunts" ON public.pheno_hunts;
DROP POLICY IF EXISTS "Operators update all pheno_hunts" ON public.pheno_hunts;

CREATE INDEX IF NOT EXISTS idx_pheno_stress_observations_hunt_time
  ON public.pheno_stress_observations (hunt_id, created_at DESC);

COMMIT;

NOTIFY pgrst, 'reload schema';
