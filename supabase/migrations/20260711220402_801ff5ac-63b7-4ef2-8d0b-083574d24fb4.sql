-- Close PostgREST timeout gap on sensor_readings reads.
--
-- Observed via pg_stat_statements: the two slowest queries in the whole
-- database are RLS-only sensor_readings reads ordered by (ts DESC,
-- created_at DESC) — no WHERE besides RLS's user_id filter — with mean
-- 50 ms and max ~7 s across ~9k calls. The existing composite indexes
-- all start with (user_id, tent_id, ...), so they cannot serve the
-- planner when no tent filter is present. A second cluster of slow
-- reads is tent-scoped but sorts by captured_at DESC, which none of
-- the current indexes cover either.
--
-- These indexes match the exact predicate + sort of the observed
-- offenders. Reads get a direct index scan; write cost impact is one
-- extra btree entry per row (sensor_readings inserts are already
-- indexed by 3 other btrees, so this is a small marginal cost).

CREATE INDEX IF NOT EXISTS idx_sensor_readings_user_ts_created
  ON public.sensor_readings (user_id, ts DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_user_tent_captured_at
  ON public.sensor_readings (user_id, tent_id, captured_at DESC);
