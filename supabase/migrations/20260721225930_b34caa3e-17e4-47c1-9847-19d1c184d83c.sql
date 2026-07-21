
-- Guard: prevent row owners from mutating decision fields on public.action_queue.
-- Only operators (public.has_role(auth.uid(),'operator')) or service_role may
-- change status / approved_at / rejected_at. Owner UPDATEs on other columns
-- continue to work under the existing RLS policy.

CREATE OR REPLACE FUNCTION public.action_queue_guard_decision_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_uid  uuid := auth.uid();
  v_is_operator boolean := false;
  v_status_changed boolean :=
    (NEW.status IS DISTINCT FROM OLD.status);
  v_approved_changed boolean :=
    (NEW.approved_at IS DISTINCT FROM OLD.approved_at);
  v_rejected_changed boolean :=
    (NEW.rejected_at IS DISTINCT FROM OLD.rejected_at);
BEGIN
  -- Nothing decision-related changed: allow.
  IF NOT (v_status_changed OR v_approved_changed OR v_rejected_changed) THEN
    RETURN NEW;
  END IF;

  -- service_role bypass (edge functions, admin scripts).
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Operator check via existing security-definer role helper.
  IF v_uid IS NOT NULL THEN
    v_is_operator := public.has_role(v_uid, 'operator'::public.app_role);
  END IF;

  IF v_is_operator THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'action_queue.status/approved_at/rejected_at can only be modified by operators'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.action_queue_guard_decision_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_action_queue_guard_decision_fields
  ON public.action_queue;

CREATE TRIGGER trg_action_queue_guard_decision_fields
BEFORE UPDATE OF status, approved_at, rejected_at
ON public.action_queue
FOR EACH ROW
EXECUTE FUNCTION public.action_queue_guard_decision_fields();

COMMENT ON FUNCTION public.action_queue_guard_decision_fields() IS
  'Blocks non-operator, non-service_role UPDATEs that change action_queue decision fields (status, approved_at, rejected_at). Owners keep RLS-scoped UPDATE on other columns.';
