-- Idempotency key for edge_function_metric_events. Nullable so historical
-- rows (written before this migration) remain valid, but any new row that
-- supplies a key participates in dedup via the partial unique index below.
-- Keys are opaque strings minted by the edge function writer (see
-- schedulePersist in supabase/functions/founder-slots-remaining) and are
-- deterministic per logical event (e.g. `${fn}:req:${request_id}` for a
-- request_metric, `${fn}:snap:${window_start_ms}` for a metric_snapshot).
ALTER TABLE public.edge_function_metric_events
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL;

ALTER TABLE public.edge_function_metric_events
  DROP CONSTRAINT IF EXISTS edge_function_metric_events_idempotency_key_len_chk;
ALTER TABLE public.edge_function_metric_events
  ADD CONSTRAINT edge_function_metric_events_idempotency_key_len_chk
  CHECK (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 1 AND 200);

-- Partial UNIQUE index: enforces at-most-one row per non-null key.
-- ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL lets the
-- fire-and-forget writer PostgREST-upsert with resolution=merge-duplicates
-- so runtime retries no-op instead of inflating counters.
CREATE UNIQUE INDEX IF NOT EXISTS
  edge_function_metric_events_idempotency_key_uidx
  ON public.edge_function_metric_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.edge_function_metric_events.idempotency_key IS
  'Opaque per-event dedup key minted by the edge function writer. Repeated inserts with the same key are collapsed to a single row via the partial unique index. Nullable to preserve legacy rows written before this column existed.';