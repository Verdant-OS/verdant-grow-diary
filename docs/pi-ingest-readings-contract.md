# pi-ingest-readings — Edge Function Contract (DOCS ONLY)

**Status:** Contract + static guardrail tests only. **No implementation yet.**
This document defines the future Supabase Edge Function named
`pi-ingest-readings`. The function does **not** exist in this commit and
must not be created in this task.

This is a **docs/tests only** scope. No Edge Function code, no service_role
usage, no schema changes, no UI changes, no Home Assistant / MQTT / Pi
bridge implementation, no automation, no device control, no alert
persistence changes, no Action Queue changes, no AI Doctor changes, and
no PPFD / soil EC / reservoir expansion are introduced here.

---

## 1. Purpose

`pi-ingest-readings` is a **read-only-into-Verdant** sensor ingestion
endpoint. An external bridge (Raspberry Pi, Home Assistant adapter,
SensorPush proxy, etc.) sends batches of sensor readings. Verdant stores
them as normalized rows in `sensor_readings`.

Hard scope rules:

- **No device control.** The endpoint never sends commands to equipment.
- **No automation.** The endpoint never triggers automated actions.
- **No Action Queue creation.** The endpoint never inserts into
  `action_queue` and never schedules actions.
- **No alert creation inside the endpoint.** Alerts are derived
  downstream through existing snapshot + alert persistence gates only.
- **Writes only to `sensor_readings`.** No other tables.

---

## 2. Supported sources

The current `sensor_readings.source` enum continues to allow exactly:

- `manual`
- `pi_bridge`
- `sim`

For this endpoint specifically:

- Accepted external source MUST normalize to `pi_bridge`.
- Reject `sim`.
- Reject `manual`.
- Reject unknown sources like `home_assistant`, `mqtt`, `sensorpush`,
  `csv_import` unless they are explicitly mapped to `pi_bridge` by the
  pure normalization rules in `src/lib/sensorIngestNormalizationRules.ts`
  at a later date.

No new source enum values are introduced.

---

## 3. Request shape

```json
{
  "tent_id": "uuid",
  "device_id": "sensorpush-gateway-1",
  "captured_at": "2026-05-22T12:00:00Z",
  "source": "pi_bridge",
  "readings": [
    { "metric": "temperature_c", "value": 24.2, "unit": "c" },
    { "metric": "humidity_pct",  "value": 58,   "unit": "%" },
    { "metric": "vpd_kpa",       "value": 1.18, "unit": "kpa" }
  ],
  "raw": {}
}
```

`raw` is preserved verbatim into `sensor_readings.raw_payload`. It is
never used for validation or normalization.

---

## 4. Response shape

Success:

```json
{ "ok": true, "inserted": 3, "rejected": 0 }
```

Failure:

```json
{
  "ok": false,
  "error": "invalid_metric",
  "message": "Unsupported metric: soil_ec"
}
```

Failure responses MUST NOT include partial insert counts. Failure means
zero rows were written.

---

## 5. Validation rules

- `tent_id` required.
- `device_id` required.
- `captured_at` required.
- `captured_at` MUST NOT be more than 5 minutes in the future.
- **No silent timestamp clamping.** Out-of-window timestamps are
  rejected with a 400 response.
- `readings` array required and non-empty.
- Reject unknown metrics.
- Reject unknown units.
- Reject non-finite values (`NaN`, `Infinity`, `-Infinity`).
- Reject unknown sources.
- Reject `sim` as an endpoint source.
- Reject `manual` as an endpoint source.
- Preserve the raw payload **only** in `raw_payload`.
- **Batch must be all-or-nothing.** The endpoint must not write
  partial batches. If any reading fails validation, zero rows are
  inserted and the function returns a 400.

---

## 6. Current supported metrics

The metric whitelist for this endpoint at contract time is exactly:

- `temperature_c`
- `humidity_pct`
- `vpd_kpa`
- `co2_ppm`
- `soil_moisture_pct`

Explicitly **not supported yet** (must be rejected by this endpoint
until the V0 safety contract is expanded with separate schema work):

- `ppfd`
- `dli`
- `soil_ec`
- `soil_temp`
- `reservoir_ec`
- `reservoir_ph`
- `reservoir_temp`

---

## 7. Auth / security expectations

Future implementation requirements (do not implement in this task):

- **No unauthenticated writes.** The endpoint must verify the caller
  before any write.
- **No browser / client secret exposure.** Bridge credentials never
  ship to the browser bundle.
- **No public anonymous insert endpoint.** Anonymous callers receive
  401 and zero rows are inserted.
- Future auth should use a **signed bridge token or HMAC** scheme.
- `service_role` may **only** be used **inside the Edge Function**
  **after** the bridge token has been verified. It is never exposed to
  the client and never used before verification.
- Failed auth returns **401 and inserts zero rows**.
- Invalid payload returns **400 and inserts zero rows**.
- Rate limiting and device-level abuse guards MUST be considered
  before production rollout.

---

## 8. Ownership / RLS expectations

- The bridge cannot choose an arbitrary `user_id`.
- The endpoint must resolve ownership from the verified bridge
  credential.
- `tent_id` must belong to the authenticated/verified owner.
- **No client-provided `user_id` is accepted.**
- No cross-user tent inserts. A bridge owned by user A cannot insert
  readings against a tent owned by user B.

---

## 9. Persistence / alert behavior

- The endpoint only inserts into `sensor_readings`.
- The endpoint does not derive alerts.
- The endpoint does not persist alerts directly.
- Dashboard / alert pipeline may later derive alerts from these
  readings through existing safe paths
  (`snapshotFromReadings` → `isSnapshotPersistable` →
  `environmentAlertPersistence`).
- `sim` data never persists alerts (already enforced by
  `isSnapshotPersistable`).
- `pi_bridge` readings may only become persistable through the
  existing snapshot + alert persistence gates. The endpoint itself
  performs zero alert work.

---

## 10. Stop-ship conditions

Any of the following blocks shipping the endpoint:

- Endpoint writes without verified auth.
- Endpoint accepts a client-provided `user_id`.
- Endpoint uses `service_role` before verifying the bridge token.
- Endpoint writes to anything except `sensor_readings`.
- Endpoint creates alerts or `action_queue` rows directly.
- Endpoint accepts unsupported metrics.
- Endpoint accepts `sim` or `manual` as a bridge source.
- Endpoint silently clamps `captured_at`.
- Endpoint partially inserts invalid batches.
- Endpoint introduces automation or device-control surfaces.

---

## 11. Future implementation checklist

Tracked for future build prompts. Do not implement here.

- [ ] Implement the Edge Function `pi-ingest-readings`.
- [ ] Add HMAC / token verification.
- [ ] Add a device / bridge registration model.
- [ ] Add an idempotency strategy (e.g. `(device_id, captured_at, metric)`).
- [ ] Add a rate-limit strategy.
- [ ] Add RLS / ownership tests.
- [ ] Add a local Pi client example.
- [ ] Add Home Assistant / MQTT adapters later (separate scope).
