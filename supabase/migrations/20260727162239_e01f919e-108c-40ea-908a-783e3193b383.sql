-- 1. CREATE TABLE
CREATE TABLE public.edge_function_metric_events (
  id BIGSERIAL PRIMARY KEY,
  fn TEXT NOT NULL,
  event_type TEXT NOT NULL,
  request_id UUID NULL,
  outcome TEXT NULL,
  duration_ms NUMERIC(12,2) NULL,
  window_ms INTEGER NULL,
  requests_in_window INTEGER NULL,
  duration_ms_mean_in_window NUMERIC(12,2) NULL,
  duration_ms_max_in_window NUMERIC(12,2) NULL,
  counters JSONB NULL,
  deploy_version TEXT NOT NULL DEFAULT 'unknown',
  supabase_env TEXT NOT NULL DEFAULT 'unknown',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT edge_function_metric_events_event_type_chk
    CHECK (event_type IN ('request_metric','metric_snapshot')),
  CONSTRAINT edge_function_metric_events_fn_len_chk
    CHECK (char_length(fn) BETWEEN 1 AND 128),
  CONSTRAINT edge_function_metric_events_outcome_len_chk
    CHECK (outcome IS NULL OR char_length(outcome) BETWEEN 1 AND 64),
  CONSTRAINT edge_function_metric_events_deploy_version_len_chk
    CHECK (char_length(deploy_version) BETWEEN 1 AND 128),
  CONSTRAINT edge_function_metric_events_supabase_env_len_chk
    CHECK (char_length(supabase_env) BETWEEN 1 AND 128)
);

COMMENT ON TABLE public.edge_function_metric_events IS
  'Append-only observability sink for edge function request_metric and metric_snapshot events. Service-role writes only; operator reads only. Safe to truncate/retain on a rolling window.';

CREATE INDEX edge_function_metric_events_fn_observed_at_idx
  ON public.edge_function_metric_events (fn, observed_at DESC);
CREATE INDEX edge_function_metric_events_fn_event_type_observed_at_idx
  ON public.edge_function_metric_events (fn, event_type, observed_at DESC);
CREATE INDEX edge_function_metric_events_deploy_version_idx
  ON public.edge_function_metric_events (deploy_version);
CREATE INDEX edge_function_metric_events_supabase_env_idx
  ON public.edge_function_metric_events (supabase_env);
CREATE INDEX edge_function_metric_events_outcome_idx
  ON public.edge_function_metric_events (outcome)
  WHERE outcome IS NOT NULL;

-- 2. GRANT
-- No anon: never public.
-- authenticated: SELECT only, gated by operator role via RLS.
-- service_role: full access for edge functions.
GRANT SELECT ON public.edge_function_metric_events TO authenticated;
GRANT ALL ON public.edge_function_metric_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.edge_function_metric_events_id_seq TO service_role;

-- 3. ENABLE RLS
ALTER TABLE public.edge_function_metric_events ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES
-- Operators (via existing public.has_role) may read. No client-side write
-- policies exist, so authenticated users cannot INSERT/UPDATE/DELETE even
-- though they hold the GRANT — RLS denies by default when no policy matches.
CREATE POLICY "Operators can read edge function metric events"
  ON public.edge_function_metric_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'));
