-- Action Queue: suggest-only, approval-gated, no device execution.

CREATE TABLE public.action_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL DEFAULT auth.uid(),
  grow_id           uuid NOT NULL REFERENCES public.grows(id) ON DELETE CASCADE,
  tent_id           uuid REFERENCES public.tents(id) ON DELETE SET NULL,
  plant_id          uuid REFERENCES public.plants(id) ON DELETE SET NULL,
  source            text NOT NULL DEFAULT 'ai_coach',
  action_type       text NOT NULL,
  target_metric     text,
  target_device     text,
  suggested_change  text NOT NULL,
  reason            text NOT NULL,
  risk_level        text NOT NULL DEFAULT 'low',
  status            text NOT NULL DEFAULT 'pending_approval',
  approved_at       timestamptz,
  rejected_at       timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT action_queue_risk_level_chk
    CHECK (risk_level IN ('low','medium','high','critical')),
  CONSTRAINT action_queue_status_chk
    CHECK (status IN ('pending_approval','approved','rejected','simulated','completed','cancelled')),
  CONSTRAINT action_queue_target_present_chk
    CHECK (target_metric IS NOT NULL OR target_device IS NOT NULL),
  CONSTRAINT action_queue_approved_at_chk
    CHECK (approved_at IS NULL OR status = 'approved'),
  CONSTRAINT action_queue_rejected_at_chk
    CHECK (rejected_at IS NULL OR status = 'rejected')
);

CREATE INDEX action_queue_user_status_idx
  ON public.action_queue (user_id, status, created_at DESC);
CREATE INDEX action_queue_grow_idx
  ON public.action_queue (grow_id);

-- updated_at trigger (reuses existing public.set_updated_at()).
CREATE TRIGGER action_queue_set_updated_at
  BEFORE UPDATE ON public.action_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.action_queue ENABLE ROW LEVEL SECURITY;

-- SELECT: only own rows.
CREATE POLICY "Users view own action_queue"
  ON public.action_queue
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT: caller must own the row AND the referenced grow.
CREATE POLICY "Users insert own action_queue"
  ON public.action_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = grow_id AND g.user_id = auth.uid()
    )
  );

-- UPDATE: caller must own the existing row AND the (possibly new) grow.
CREATE POLICY "Users update own action_queue"
  ON public.action_queue
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = grow_id AND g.user_id = auth.uid()
    )
  );

-- DELETE: only own rows.
CREATE POLICY "Users delete own action_queue"
  ON public.action_queue
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);