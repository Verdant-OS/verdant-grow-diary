-- Record an owner decision and its audit event as one PostgreSQL transaction.
--
-- The existing grower UI used two independent client writes. A successful
-- action_queue UPDATE followed by a failed action_queue_events INSERT could
-- therefore leave lifecycle state without the history that explains it.
--
-- This additive RPC is the only new write seam in this migration:
--   * identity is resolved from auth.uid();
--   * the caller's own action row is locked before transition evaluation;
--   * the expected status is a compare-and-swap precondition;
--   * only the existing approval-required transition graph is accepted;
--   * row status/timestamps and the audit event commit or roll back together;
--   * a retry is reused only when the matching audit event already exists.
-- During this expand step, authenticated clients retain the legacy write
-- grants so the currently deployed UI remains functional. The later contract
-- migration makes lifecycle UPDATE/DELETE writes RPC-only.
--
-- This records grower intent and manual completion only. It performs no
-- equipment actuation and creates no automated follow-up.

BEGIN;

CREATE FUNCTION public.action_queue_transition(
  p_action_queue_id uuid,
  p_transition text,
  p_expected_status text,
  p_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_action public.action_queue%ROWTYPE;
  v_new_status text;
  v_event_type text;
  v_expected_status_allowed boolean := false;
  v_transitioned_at timestamptz;
  v_event_id uuid;
  v_existing_event_at timestamptz;
  v_updated_count integer := 0;
  v_note text := NULLIF(btrim(p_note), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_action_queue_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_action');
  END IF;

  CASE p_transition
    WHEN 'approve' THEN
      v_expected_status_allowed := p_expected_status IN ('pending_approval', 'simulated');
      v_new_status := 'approved';
      v_event_type := 'approved';
    WHEN 'simulate' THEN
      v_expected_status_allowed := p_expected_status = 'pending_approval';
      v_new_status := 'simulated';
      v_event_type := 'simulated';
    WHEN 'reject' THEN
      v_expected_status_allowed := p_expected_status = 'pending_approval';
      v_new_status := 'rejected';
      v_event_type := 'rejected';
    WHEN 'complete' THEN
      v_expected_status_allowed := p_expected_status IN ('approved', 'simulated');
      v_new_status := 'completed';
      v_event_type := 'completed';
    WHEN 'cancel' THEN
      v_expected_status_allowed :=
        p_expected_status IN ('pending_approval', 'approved', 'simulated');
      v_new_status := 'cancelled';
      v_event_type := 'cancelled';
    ELSE
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_transition');
  END CASE;

  IF v_expected_status_allowed IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'illegal_transition');
  END IF;

  SELECT aq.*
    INTO v_action
    FROM public.action_queue AS aq
   WHERE aq.id = p_action_queue_id
     AND aq.user_id = v_uid
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'action_not_found');
  END IF;

  -- A retried request may arrive after the original response was lost. Reuse
  -- only a fully recorded transition; a legacy status-only write is a conflict
  -- and is never presented as an atomic success.
  IF v_action.status IS DISTINCT FROM p_expected_status THEN
    IF v_action.status = v_new_status THEN
      SELECT aqe.id, aqe.created_at
        INTO v_event_id, v_existing_event_at
        FROM public.action_queue_events AS aqe
       WHERE aqe.action_queue_id = v_action.id
         AND aqe.user_id = v_uid
         AND aqe.grow_id = v_action.grow_id
         AND aqe.event_type = v_event_type
         AND aqe.previous_status = p_expected_status
         AND aqe.new_status = v_new_status
         AND aqe.note IS NOT DISTINCT FROM v_note
       ORDER BY aqe.created_at DESC, aqe.id DESC
       LIMIT 1;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'ok', true,
          'action_queue_id', v_action.id,
          'previous_status', p_expected_status,
          'new_status', v_new_status,
          'event_id', v_event_id,
          'transitioned_at', v_existing_event_at,
          'reused', true
        );
      END IF;
    END IF;

    RETURN jsonb_build_object('ok', false, 'reason', 'status_conflict');
  END IF;

  -- Capture lifecycle time only after acquiring the row lock and validating
  -- the compare-and-swap precondition. Lock contention must never backdate
  -- the status or its audit event.
  v_transitioned_at := clock_timestamp();

  UPDATE public.action_queue AS aq
     SET status = v_new_status,
         approved_at = CASE
           WHEN p_transition = 'approve' THEN v_transitioned_at
           ELSE aq.approved_at
         END,
         rejected_at = CASE
           WHEN p_transition = 'reject' THEN v_transitioned_at
           ELSE aq.rejected_at
         END,
         completed_at = CASE
           WHEN p_transition = 'complete' THEN v_transitioned_at
           ELSE aq.completed_at
         END
   WHERE aq.id = v_action.id
     AND aq.user_id = v_uid
     AND aq.status = p_expected_status;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'action_queue transition compare-and-swap failed'
      USING ERRCODE = '40001';
  END IF;

  -- Deliberately do not catch this INSERT. Any constraint, trigger, or storage
  -- failure aborts the RPC statement and rolls back the row UPDATE above.
  INSERT INTO public.action_queue_events (
    user_id,
    action_queue_id,
    grow_id,
    event_type,
    previous_status,
    new_status,
    note,
    created_at
  )
  VALUES (
    v_uid,
    v_action.id,
    v_action.grow_id,
    v_event_type,
    p_expected_status,
    v_new_status,
    v_note,
    v_transitioned_at
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'ok', true,
    'action_queue_id', v_action.id,
    'previous_status', p_expected_status,
    'new_status', v_new_status,
    'event_id', v_event_id,
    'transitioned_at', v_transitioned_at,
    'reused', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.action_queue_transition(uuid, text, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.action_queue_transition(uuid, text, text, text)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.action_queue_transition(uuid, text, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.action_queue_transition(uuid, text, text, text) IS
  'Atomically records an owner-scoped Action Queue lifecycle transition and its audit event.';

COMMIT;

NOTIFY pgrst, 'reload schema';
