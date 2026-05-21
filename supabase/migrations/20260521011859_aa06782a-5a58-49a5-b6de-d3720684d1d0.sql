-- Lead activity history table
CREATE TABLE IF NOT EXISTS public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL DEFAULT auth.uid(),
  event_type text NOT NULL,
  old_status text,
  new_status text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_events_event_type_check
    CHECK (event_type IN ('status_change','note','contacted','follow_up_set'))
);

CREATE INDEX IF NOT EXISTS lead_events_lead_id_created_at_idx
  ON public.lead_events(lead_id, created_at DESC);

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Operators view lead_events" ON public.lead_events;
CREATE POLICY "Operators view lead_events"
ON public.lead_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'operator'::app_role));

DROP POLICY IF EXISTS "Operators insert lead_events" ON public.lead_events;
CREATE POLICY "Operators insert lead_events"
ON public.lead_events
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'operator'::app_role)
  AND actor_user_id = auth.uid()
);
-- Intentionally no UPDATE / DELETE policies: history is append-only.

-- Trigger: when status changes on leads, record a lead_events row.
CREATE OR REPLACE FUNCTION public.log_lead_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.lead_events
      (lead_id, actor_user_id, event_type, old_status, new_status)
    VALUES
      (NEW.id, COALESCE(auth.uid(), NEW.id), 'status_change', OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_log_status_change ON public.leads;
CREATE TRIGGER leads_log_status_change
AFTER UPDATE OF status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.log_lead_status_change();
