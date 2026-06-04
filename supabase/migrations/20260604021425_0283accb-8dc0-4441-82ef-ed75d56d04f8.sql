-- Atomic dedupe safety net for sensor_readings.
--
-- A bridge that retries (MQTT at-least-once, Ecowitt webhook redelivery,
-- Home Assistant push retry) MUST NOT create duplicate readings. Today the
-- sensor-ingest-webhook function does a SELECT-then-INSERT which is racy
-- under concurrent identical POSTs. This partial unique index closes that
-- window at the database level.
--
-- Scope is deliberately narrow: only rows that have a captured_at timestamp
-- (the contract requires it for ingest) are covered. Legacy rows with NULL
-- captured_at are left untouched.

CREATE UNIQUE INDEX IF NOT EXISTS sensor_readings_dedupe_uidx
  ON public.sensor_readings (user_id, tent_id, source, metric, captured_at)
  WHERE captured_at IS NOT NULL;

COMMENT ON INDEX public.sensor_readings_dedupe_uidx IS
  'Partial unique index: (user_id, tent_id, source, metric, captured_at). '
  'Prevents duplicate sensor readings from bridge retries when captured_at '
  'is present. Required by docs/sensor-ingest-payload-contract.md.';
