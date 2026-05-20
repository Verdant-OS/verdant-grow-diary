CREATE TABLE public.action_queue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  action_queue_id uuid NOT NULL REFERENCES public.action_queue(id) ON DELETE CASCADE,
  grow_id uuid NOT NULL REFERENCES public.grows(id),
  event_type text NOT NULL,
  previous_status text,
  new_status text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT action_queue_events_event_type_check CHECK (
    event_type IN ('created','simulated','approved','rejected','completed','cancelled','note')
  )
);

CREATE INDEX idx_aqe_action ON public.action_queue_events(action_queue_id, created_at DESC);
CREATE INDEX idx_aqe_user ON public.action_queue_events(user_id, created_at DESC);

ALTER TABLE public.action_queue_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own action_queue_events"
ON public.action_queue_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own action_queue_events"
ON public.action_queue_events
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.action_queue a
    WHERE a.id = action_queue_events.action_queue_id AND a.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.grows g
    WHERE g.id = action_queue_events.grow_id AND g.user_id = auth.uid()
  )
);

CREATE POLICY "Users delete own action_queue_events"
ON public.action_queue_events
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);