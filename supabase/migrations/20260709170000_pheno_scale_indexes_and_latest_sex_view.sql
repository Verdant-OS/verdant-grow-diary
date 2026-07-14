-- Pheno hunt scale fixes (2026-07-09 data-layer audit):
--
-- 1. The two append-only logs are read per-hunt ordered by time, but their
--    composite indexes put plant_id in the middle — Postgres had to sort
--    every hunt row on each page load. Add time-ordered per-hunt indexes.
-- 2. The workspace/keepers pages only need the LATEST sex observation per
--    candidate, yet the client fetched the entire append-only history and
--    discarded all but the newest row per plant in JS. Provide a
--    latest-per-plant view (DISTINCT ON) so the transfer stays one row per
--    candidate no matter how much history accumulates.
--
-- The view uses security_invoker so the base table's owner-scoped RLS
-- applies to every read — it grants no new visibility.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_pheno_keeper_decisions_log_hunt_time
  ON public.pheno_keeper_decisions_log (hunt_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_pheno_sex_observations_hunt_time
  ON public.pheno_sex_observations (hunt_id, observed_at DESC);

CREATE OR REPLACE VIEW public.pheno_sex_observations_latest
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (hunt_id, plant_id)
  hunt_id,
  plant_id,
  user_id,
  sex,
  herm_observed,
  note,
  observed_at
FROM public.pheno_sex_observations
ORDER BY hunt_id, plant_id, observed_at DESC;

GRANT SELECT ON public.pheno_sex_observations_latest TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
