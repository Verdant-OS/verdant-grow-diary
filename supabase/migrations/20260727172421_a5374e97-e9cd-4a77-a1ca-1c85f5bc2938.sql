CREATE TABLE public.edge_metrics_webhook_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_id uuid NOT NULL,
  fn text NOT NULL,
  metric text NOT NULL,
  attempt integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('delivered','transient_failure','permanent_failure','exhausted')),
  status_code integer,
  ok boolean NOT NULL DEFAULT false,
  transient boolean NOT NULL DEFAULT false,
  error text,
  delay_before_ms integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  value numeric,
  threshold numeric,
  requests_in_window integer,
  request_id text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX edge_metrics_webhook_attempts_dispatch_idx
  ON public.edge_metrics_webhook_attempts (dispatch_id, attempt);
CREATE INDEX edge_metrics_webhook_attempts_fn_metric_time_idx
  ON public.edge_metrics_webhook_attempts (fn, metric, attempted_at DESC);
CREATE INDEX edge_metrics_webhook_attempts_attempted_at_idx
  ON public.edge_metrics_webhook_attempts (attempted_at DESC);

GRANT SELECT ON public.edge_metrics_webhook_attempts TO authenticated;
GRANT ALL ON public.edge_metrics_webhook_attempts TO service_role;

ALTER TABLE public.edge_metrics_webhook_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can view webhook attempts"
  ON public.edge_metrics_webhook_attempts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'));
