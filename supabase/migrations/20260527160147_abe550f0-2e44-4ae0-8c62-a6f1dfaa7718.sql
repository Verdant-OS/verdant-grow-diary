
CREATE TABLE public.sensor_ingest_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tent_id UUID NOT NULL,
  auth_type TEXT NOT NULL,
  bridge_token_id UUID,
  source TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  rows_received INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sensor_ingest_audit_log_auth_type_check
    CHECK (auth_type IN ('jwt','bridge'))
);

CREATE INDEX idx_sensor_ingest_audit_log_user_created
  ON public.sensor_ingest_audit_log (user_id, created_at DESC);
CREATE INDEX idx_sensor_ingest_audit_log_tent_created
  ON public.sensor_ingest_audit_log (tent_id, created_at DESC);

GRANT SELECT ON public.sensor_ingest_audit_log TO authenticated;
GRANT ALL ON public.sensor_ingest_audit_log TO service_role;

ALTER TABLE public.sensor_ingest_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ingest audit"
  ON public.sensor_ingest_audit_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
