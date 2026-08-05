-- Contract the legacy Action Queue write surface only after:
--   1. 20260726093000_action_queue_transition_rpc.sql is deployed;
--   2. the RPC-backed frontend is deployed and verified.
--
-- This intentionally lives in a separate migration/commit so production can
-- roll out expand -> frontend -> contract without breaking either UI version.

BEGIN;

-- Client-created suggestions always enter the approval-required state. Keep
-- the existing owner + grow/tent/plant lineage checks and add lifecycle
-- initialization checks so INSERT cannot bypass the transition RPC.
DROP POLICY IF EXISTS "Users insert own action_queue" ON public.action_queue;

CREATE POLICY "Users insert own action_queue"
  ON public.action_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = action_queue.user_id
    AND action_queue.status = 'pending_approval'
    AND action_queue.approved_at IS NULL
    AND action_queue.rejected_at IS NULL
    AND action_queue.completed_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.grows AS g
      WHERE g.id = action_queue.grow_id
        AND g.user_id = auth.uid()
    )
    AND (
      action_queue.tent_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.tents AS t
        WHERE t.id = action_queue.tent_id
          AND t.user_id = auth.uid()
          AND t.grow_id = action_queue.grow_id
      )
    )
    AND (
      action_queue.plant_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.plants AS p
        WHERE p.id = action_queue.plant_id
          AND p.user_id = auth.uid()
          AND p.grow_id = action_queue.grow_id
      )
    )
    AND (
      action_queue.plant_id IS NULL
      OR action_queue.tent_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.plants AS p
        WHERE p.id = action_queue.plant_id
          AND p.user_id = auth.uid()
          AND p.grow_id = action_queue.grow_id
          AND p.tent_id = action_queue.tent_id
      )
    )
  );

-- Lifecycle mutations are canonical only through the owner-scoped RPC.
-- Removing both policies and table privileges makes that invariant hold even
-- if a future client accidentally issues a direct UPDATE or DELETE.
DROP POLICY IF EXISTS "Users update own action_queue" ON public.action_queue;
DROP POLICY IF EXISTS "Users delete own action_queue" ON public.action_queue;
REVOKE UPDATE, DELETE ON TABLE public.action_queue FROM PUBLIC;
REVOKE UPDATE, DELETE ON TABLE public.action_queue FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.action_queue FROM authenticated;

-- Audit history is append-only. Authenticated callers may record only an
-- initial created event or a note whose status matches the current owner row.
-- Transition events are written exclusively inside action_queue_transition.
DROP POLICY IF EXISTS "Users insert own action_queue_events"
  ON public.action_queue_events;
DROP POLICY IF EXISTS "Users delete own action_queue_events"
  ON public.action_queue_events;

CREATE POLICY "Users append own non-transition action_queue_events"
  ON public.action_queue_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = action_queue_events.user_id
    AND action_queue_events.event_type IN ('created', 'note')
    AND EXISTS (
      SELECT 1
      FROM public.grows AS g
      WHERE g.id = action_queue_events.grow_id
        AND g.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.action_queue AS aq
      WHERE aq.id = action_queue_events.action_queue_id
        AND aq.user_id = auth.uid()
        AND aq.grow_id = action_queue_events.grow_id
        AND (
          (
            action_queue_events.event_type = 'created'
            AND aq.status = 'pending_approval'
            AND action_queue_events.previous_status IS NULL
            AND action_queue_events.new_status = 'pending_approval'
          )
          OR
          (
            action_queue_events.event_type = 'note'
            AND NULLIF(btrim(action_queue_events.note), '') IS NOT NULL
            AND action_queue_events.previous_status IS NOT DISTINCT FROM aq.status
            AND action_queue_events.new_status IS NOT DISTINCT FROM aq.status
          )
        )
    )
  );

REVOKE UPDATE, DELETE ON TABLE public.action_queue_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON TABLE public.action_queue_events FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.action_queue_events FROM authenticated;

COMMENT ON FUNCTION public.action_queue_guard_decision_fields() IS
  'Defense-in-depth for privileged action_queue writes; authenticated lifecycle changes use action_queue_transition because direct UPDATE is revoked.';

COMMIT;

NOTIFY pgrst, 'reload schema';
