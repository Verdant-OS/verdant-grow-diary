-- Evidence Linkage Persistence v1
-- Add safe originating timeline event references to alerts and action_queue.
-- Each value is a JSON array of {id, kind, source, occurred_at?, label?} refs.
-- Default '[]' makes the column safe-by-default; existing rows resolve to no
-- linked refs. The CHECK guarantees the column shape stays an array so the
-- read-side adapter never has to deal with scalar/object impostors.
-- RLS is unchanged: existing owner-scoped policies cover the new column.

ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS originating_timeline_events jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.alerts
  DROP CONSTRAINT IF EXISTS alerts_originating_timeline_events_is_array;
ALTER TABLE public.alerts
  ADD CONSTRAINT alerts_originating_timeline_events_is_array
  CHECK (jsonb_typeof(originating_timeline_events) = 'array');

COMMENT ON COLUMN public.alerts.originating_timeline_events IS
  'Safe originating timeline event refs (id, kind, source, occurred_at?, label?). Never raw payloads or tokens.';

ALTER TABLE public.action_queue
  ADD COLUMN IF NOT EXISTS originating_timeline_events jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.action_queue
  DROP CONSTRAINT IF EXISTS action_queue_originating_timeline_events_is_array;
ALTER TABLE public.action_queue
  ADD CONSTRAINT action_queue_originating_timeline_events_is_array
  CHECK (jsonb_typeof(originating_timeline_events) = 'array');

COMMENT ON COLUMN public.action_queue.originating_timeline_events IS
  'Safe originating timeline event refs (id, kind, source, occurred_at?, label?). Never raw payloads or tokens.';
