-- Immutable audit trail for the alerts table.
CREATE TABLE public.alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  alert_id uuid NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  grow_id uuid NOT NULL REFERENCES public.grows(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  previous_status text,
  new_status text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alert_events_event_type_chk
    CHECK (event_type IN ('created','acknowledged','resolved','dismissed','reopened')),
  CONSTRAINT alert_events_prev_status_chk
    CHECK (previous_status IS NULL OR previous_status IN ('open','acknowledged','resolved','dismissed')),
  CONSTRAINT alert_events_new_status_chk
    CHECK (new_status IS NULL OR new_status IN ('open','acknowledged','resolved','dismissed'))
);

CREATE INDEX alert_events_alert_id_idx ON public.alert_events(alert_id);
CREATE INDEX alert_events_user_id_created_at_idx
  ON public.alert_events(user_id, created_at DESC);

ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;

-- Users can view their own alert events.
CREATE POLICY "Users view own alert_events"
ON public.alert_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert an alert event only for alerts AND grows they own.
CREATE POLICY "Users insert own alert_events"
ON public.alert_events
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.alerts a
    WHERE a.id = alert_events.alert_id AND a.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM public.grows g
    WHERE g.id = alert_events.grow_id AND g.user_id = auth.uid()
  )
);

-- No UPDATE policy. No DELETE policy. Append-only, immutable audit history.
