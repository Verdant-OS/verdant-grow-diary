-- pi-ingest idempotency storage foundation
-- Storage only: no Edge Function, no service_role, no automation, no
-- device control, no alert persistence, no Action Queue, no AI Doctor,
-- no sensor_readings schema changes.

CREATE TABLE public.pi_ingest_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tent_id uuid NOT NULL REFERENCES public.tents(id) ON DELETE CASCADE,
  bridge_id text NOT NULL,
  device_id text NOT NULL,
  metric text NOT NULL,
  captured_at timestamptz NOT NULL,
  idempotency_key text NOT NULL,
  sensor_reading_id uuid NULL REFERENCES public.sensor_readings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pi_ingest_idem_key_nonempty CHECK (idempotency_key <> ''),
  CONSTRAINT pi_ingest_idem_bridge_nonempty CHECK (bridge_id <> ''),
  CONSTRAINT pi_ingest_idem_device_nonempty CHECK (device_id <> ''),
  CONSTRAINT pi_ingest_idem_metric_allowed CHECK (
    metric IN (
      'temperature_c',
      'humidity_pct',
      'vpd_kpa',
      'co2_ppm',
      'soil_moisture_pct'
    )
  ),
  CONSTRAINT pi_ingest_idem_captured_at_not_future CHECK (
    captured_at <= now() + interval '5 minutes'
  ),
  CONSTRAINT pi_ingest_idem_unique_per_owner UNIQUE (user_id, idempotency_key)
);

CREATE INDEX pi_ingest_idem_user_tent_created_idx
  ON public.pi_ingest_idempotency_keys (user_id, tent_id, created_at DESC);

CREATE INDEX pi_ingest_idem_user_bridge_created_idx
  ON public.pi_ingest_idempotency_keys (user_id, bridge_id, created_at DESC);

ALTER TABLE public.pi_ingest_idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pi_ingest_idempotency_keys"
  ON public.pi_ingest_idempotency_keys
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own pi_ingest_idempotency_keys"
  ON public.pi_ingest_idempotency_keys
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.tents t
      WHERE t.id = pi_ingest_idempotency_keys.tent_id
        AND t.user_id = auth.uid()
    )
  );
