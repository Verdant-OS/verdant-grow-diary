CREATE INDEX IF NOT EXISTS idx_grow_events_grow_type_time
  ON public.grow_events (grow_id, event_type, occurred_at DESC);