CREATE OR REPLACE FUNCTION public.log_lead_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
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

REVOKE EXECUTE ON FUNCTION public.log_lead_status_change() FROM PUBLIC, anon, authenticated;
