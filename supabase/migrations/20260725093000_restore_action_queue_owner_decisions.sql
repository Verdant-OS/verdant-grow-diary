-- Restore the grower-owned Action Queue lifecycle.
--
-- The table's existing UPDATE RLS policy already limits authenticated writes
-- to the row owner and validates the referenced grow/tent/plant lineage. A
-- later decision-field trigger accidentally narrowed every lifecycle
-- transition to operators, which left the grower-facing Approve / Reject /
-- Simulate / Complete / Cancel controls unable to update the grower's own row.
--
-- This guard keeps the defense in depth:
--   * service_role may transition rows for audited server workflows;
--   * operators may transition rows for support/operations;
--   * an authenticated grower may transition only a row they already own;
--   * changing user_id during a decision update is rejected;
--   * the existing RLS policy continues to enforce grow/tent/plant lineage.
-- No equipment command or automation is introduced by this migration.

CREATE OR REPLACE FUNCTION public.action_queue_guard_decision_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_uid uuid := auth.uid();
  v_is_owner boolean := false;
  v_is_operator boolean := false;
  v_status_changed boolean := NEW.status IS DISTINCT FROM OLD.status;
  v_approved_changed boolean := NEW.approved_at IS DISTINCT FROM OLD.approved_at;
  v_rejected_changed boolean := NEW.rejected_at IS DISTINCT FROM OLD.rejected_at;
  v_completed_changed boolean := NEW.completed_at IS DISTINCT FROM OLD.completed_at;
BEGIN
  IF NOT (
    v_status_changed
    OR v_approved_changed
    OR v_rejected_changed
    OR v_completed_changed
  ) THEN
    RETURN NEW;
  END IF;

  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL THEN
    v_is_owner := OLD.user_id = v_uid AND NEW.user_id = OLD.user_id;
    v_is_operator := public.has_role(v_uid, 'operator'::public.app_role);
  END IF;

  IF v_is_owner OR v_is_operator THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'action_queue decision fields can only be modified by the row owner, operators, or service_role'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.action_queue_guard_decision_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_action_queue_guard_decision_fields
  ON public.action_queue;

CREATE TRIGGER trg_action_queue_guard_decision_fields
BEFORE UPDATE OF status, approved_at, rejected_at, completed_at
ON public.action_queue
FOR EACH ROW
EXECUTE FUNCTION public.action_queue_guard_decision_fields();

COMMENT ON FUNCTION public.action_queue_guard_decision_fields() IS
  'Allows action_queue decision changes only for the row owner, operators, or service_role; existing RLS continues to enforce owner and lineage scope.';
