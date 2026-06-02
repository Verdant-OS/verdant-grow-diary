ALTER TABLE public.ai_doctor_sessions
  ADD COLUMN IF NOT EXISTS sensor_snapshot_status text,
  ADD COLUMN IF NOT EXISTS sensor_snapshot_reason_code text,
  ADD COLUMN IF NOT EXISTS counts_as_healthy_evidence boolean,
  ADD COLUMN IF NOT EXISTS sensor_evidence_mode text,
  ADD COLUMN IF NOT EXISTS sensor_evidence_evaluated_at timestamptz;

ALTER TABLE public.ai_doctor_sessions
  DROP CONSTRAINT IF EXISTS ai_doctor_sessions_sensor_snapshot_status_chk;
ALTER TABLE public.ai_doctor_sessions
  ADD CONSTRAINT ai_doctor_sessions_sensor_snapshot_status_chk
  CHECK (
    sensor_snapshot_status IS NULL
    OR sensor_snapshot_status IN ('usable','stale','invalid','needs_review','no_data')
  );

ALTER TABLE public.ai_doctor_sessions
  DROP CONSTRAINT IF EXISTS ai_doctor_sessions_sensor_evidence_mode_chk;
ALTER TABLE public.ai_doctor_sessions
  ADD CONSTRAINT ai_doctor_sessions_sensor_evidence_mode_chk
  CHECK (
    sensor_evidence_mode IS NULL
    OR sensor_evidence_mode IN ('healthy','cautionary','unsafe','missing')
  );