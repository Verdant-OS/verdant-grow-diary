-- public.alerts: persistent user-visible alerts saved from generated candidates.
-- Strictly user-owned via RLS. No service_role. No client-trusted user_id.
CREATE TABLE IF NOT EXISTS public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  grow_id uuid NOT NULL REFERENCES public.grows(id) ON DELETE CASCADE,
  tent_id uuid REFERENCES public.tents(id) ON DELETE SET NULL,
  plant_id uuid REFERENCES public.plants(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'environment_alerts',
  severity text NOT NULL,
  metric text,
  title text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alerts_severity_check
    CHECK (severity IN ('info','watch','warning','critical')),
  CONSTRAINT alerts_status_check
    CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  CONSTRAINT alerts_acknowledged_at_status_check
    CHECK (acknowledged_at IS NULL OR status = 'acknowledged'),
  CONSTRAINT alerts_resolved_at_status_check
    CHECK (resolved_at IS NULL OR status = 'resolved')
);

CREATE INDEX IF NOT EXISTS alerts_user_id_idx ON public.alerts (user_id);
CREATE INDEX IF NOT EXISTS alerts_grow_id_idx ON public.alerts (grow_id);
CREATE INDEX IF NOT EXISTS alerts_status_idx ON public.alerts (status);
CREATE INDEX IF NOT EXISTS alerts_severity_idx ON public.alerts (severity);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- SELECT: own rows only.
CREATE POLICY "Users view own alerts"
  ON public.alerts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT: must be own row AND the grow must be owned by the caller.
CREATE POLICY "Users insert own alerts"
  ON public.alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = alerts.grow_id
        AND g.user_id = auth.uid()
    )
  );

-- UPDATE: own rows; cannot move row to another user or to a grow not owned by caller.
CREATE POLICY "Users update own alerts"
  ON public.alerts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.grows g
      WHERE g.id = alerts.grow_id
        AND g.user_id = auth.uid()
    )
  );

-- DELETE: own rows only.
CREATE POLICY "Users delete own alerts"
  ON public.alerts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- updated_at trigger using the existing public.set_updated_at() helper.
DROP TRIGGER IF EXISTS set_updated_at_alerts ON public.alerts;
CREATE TRIGGER set_updated_at_alerts
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();