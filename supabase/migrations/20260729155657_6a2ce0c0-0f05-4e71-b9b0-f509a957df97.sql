-- Diary entry audit log
CREATE TABLE public.diary_entry_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  diary_entry_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('update','delete')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID,
  changed_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_snapshot JSONB
);

CREATE INDEX idx_diary_entry_audit_log_entry ON public.diary_entry_audit_log (diary_entry_id, changed_at DESC);
CREATE INDEX idx_diary_entry_audit_log_user ON public.diary_entry_audit_log (user_id, changed_at DESC);

GRANT SELECT ON public.diary_entry_audit_log TO authenticated;
GRANT ALL ON public.diary_entry_audit_log TO service_role;

ALTER TABLE public.diary_entry_audit_log ENABLE ROW LEVEL SECURITY;

-- Read-only for the owner of the underlying diary entry
CREATE POLICY "Users view own diary audit rows"
  ON public.diary_entry_audit_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Operators view all diary audit rows"
  ON public.diary_entry_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'::app_role));

-- No INSERT/UPDATE/DELETE policies: the trigger below (SECURITY DEFINER) is
-- the only writer. Client roles cannot mutate audit rows.

-- Trigger function: capture field diff on UPDATE, full snapshot on DELETE.
CREATE OR REPLACE FUNCTION public.log_diary_entry_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  diff JSONB := '{}'::jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.note IS DISTINCT FROM OLD.note THEN
      diff := diff || jsonb_build_object('note', jsonb_build_object('from', to_jsonb(OLD.note), 'to', to_jsonb(NEW.note)));
    END IF;
    IF NEW.photo_url IS DISTINCT FROM OLD.photo_url THEN
      diff := diff || jsonb_build_object('photo_url', jsonb_build_object('from', to_jsonb(OLD.photo_url), 'to', to_jsonb(NEW.photo_url)));
    END IF;
    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
      diff := diff || jsonb_build_object('stage', jsonb_build_object('from', to_jsonb(OLD.stage), 'to', to_jsonb(NEW.stage)));
    END IF;
    IF NEW.entry_at IS DISTINCT FROM OLD.entry_at THEN
      diff := diff || jsonb_build_object('entry_at', jsonb_build_object('from', to_jsonb(OLD.entry_at), 'to', to_jsonb(NEW.entry_at)));
    END IF;
    IF NEW.grow_id IS DISTINCT FROM OLD.grow_id THEN
      diff := diff || jsonb_build_object('grow_id', jsonb_build_object('from', to_jsonb(OLD.grow_id), 'to', to_jsonb(NEW.grow_id)));
    END IF;
    IF NEW.plant_id IS DISTINCT FROM OLD.plant_id THEN
      diff := diff || jsonb_build_object('plant_id', jsonb_build_object('from', to_jsonb(OLD.plant_id), 'to', to_jsonb(NEW.plant_id)));
    END IF;
    IF NEW.tent_id IS DISTINCT FROM OLD.tent_id THEN
      diff := diff || jsonb_build_object('tent_id', jsonb_build_object('from', to_jsonb(OLD.tent_id), 'to', to_jsonb(NEW.tent_id)));
    END IF;
    IF NEW.details IS DISTINCT FROM OLD.details THEN
      diff := diff || jsonb_build_object('details', jsonb_build_object('from', OLD.details, 'to', NEW.details));
    END IF;

    IF diff <> '{}'::jsonb THEN
      INSERT INTO public.diary_entry_audit_log
        (diary_entry_id, user_id, action, actor_id, changed_fields, previous_snapshot)
      VALUES
        (OLD.id, OLD.user_id, 'update', auth.uid(), diff, NULL);
    END IF;

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.diary_entry_audit_log
      (diary_entry_id, user_id, action, actor_id, changed_fields, previous_snapshot)
    VALUES
      (OLD.id, OLD.user_id, 'delete', auth.uid(), '{}'::jsonb, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER diary_entries_audit_update
  AFTER UPDATE ON public.diary_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_diary_entry_change();

CREATE TRIGGER diary_entries_audit_delete
  AFTER DELETE ON public.diary_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_diary_entry_change();