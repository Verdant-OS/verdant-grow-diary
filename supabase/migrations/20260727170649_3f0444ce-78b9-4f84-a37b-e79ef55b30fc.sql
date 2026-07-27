-- Grant operators read-only visibility into the alert dispatch/cooldown state.
-- Writes remain service-role only (the alert-check edge function).
GRANT SELECT ON public.edge_metrics_alert_dispatches TO authenticated;

DROP POLICY IF EXISTS "Operators can view alert dispatches"
  ON public.edge_metrics_alert_dispatches;

CREATE POLICY "Operators can view alert dispatches"
  ON public.edge_metrics_alert_dispatches
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'::public.app_role));