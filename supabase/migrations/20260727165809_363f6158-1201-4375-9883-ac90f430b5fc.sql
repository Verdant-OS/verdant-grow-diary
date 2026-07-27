CREATE TABLE IF NOT EXISTS public.edge_metrics_alert_dispatches (
  fn text NOT NULL,
  metric text NOT NULL,
  last_fired_at timestamptz NOT NULL DEFAULT now(),
  last_value numeric NOT NULL,
  last_threshold numeric NOT NULL,
  last_requests_in_window integer NOT NULL,
  fire_count integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fn, metric)
);

GRANT ALL ON public.edge_metrics_alert_dispatches TO service_role;

ALTER TABLE public.edge_metrics_alert_dispatches ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.edge_metrics_alert_dispatches IS
  'Cooldown/dedupe state for edge-metrics-alert-check. One row per (fn, metric); the alert webhook is suppressed while now() < last_fired_at + cooldown window.';