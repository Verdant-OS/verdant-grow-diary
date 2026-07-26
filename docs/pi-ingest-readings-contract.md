# pi-ingest-readings — Edge Function Contract

**Repository status:** Implemented and covered by static, unit, and deployed-smoke
test harnesses. The handler lives at
`supabase/functions/pi-ingest-readings/index.ts`; its server-only credential
lookup, AES-GCM secret resolver, HMAC verification, ownership checks,
idempotency lookup, and atomic commit helpers live beside it. Database support
is defined by the versioned `pi_ingest_*` migrations.

**Deployment status:** Repository presence does not prove that a particular
Supabase project is running this revision. Confirm migration history, function
revision, required secret names, and the deployed smoke test before calling the
endpoint production-ready.

The implementation remains ingestion-only: no automation, device control,
direct alert persistence, Action Queue writes, AI Doctor writes, or unsupported
PPFD / soil EC / reservoir expansion belongs in this endpoint.

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
    { "metric": "humidity_pct", "value": 58, "unit": "%" },
    { "metric": "vpd_kpa", "value": 1.18, "unit": "kpa" }
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

Implementation requirements:

- **No unauthenticated writes.** The endpoint must verify the caller
  before any write.
- **No browser / client secret exposure.** Bridge credentials never
  ship to the browser bundle.
- **No public anonymous insert endpoint.** Anonymous callers receive
  401 and zero rows are inserted.
- Auth uses a **timestamped HMAC signature** tied to a server-resolved bridge
  credential.
- `service_role` may **only** be used **inside the Edge Function**. Before
  HMAC verification it is limited to the minimum encrypted-credential lookup
  needed to verify the signature. Ownership/idempotency reads and every write
  occur only after verification. The key is never exposed to the client.
- Failed auth returns **401 and inserts zero rows**.
- Invalid payload returns **400 and inserts zero rows**.
- Rate limiting and device-level abuse guards remain required production
  rollout checks.

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
- Endpoint performs a `service_role` write before HMAC verification, or uses
  it pre-verification for anything beyond the minimum encrypted-credential
  lookup.
- Endpoint writes to anything except `sensor_readings`.
- Endpoint creates alerts or `action_queue` rows directly.
- Endpoint accepts unsupported metrics.
- Endpoint accepts `sim` or `manual` as a bridge source.
- Endpoint silently clamps `captured_at`.
- Endpoint partially inserts invalid batches.
- Endpoint introduces automation or device-control surfaces.

---

## 11. Implementation and rollout checklist

- [x] Implement the Edge Function `pi-ingest-readings`.
- [x] Add timestamped HMAC verification.
- [x] Add the encrypted bridge credential model.
- [x] Add atomic idempotency storage and commit behavior.
- [ ] Verify the rate-limit and device-abuse strategy in the target deployment.
- [x] Add static, unit, ownership, and RLS-oriented guardrail tests.
- [ ] Verify all required migrations and function revisions in the target
      Supabase project.
- [ ] Run the deployed smoke harness against a disposable bridge credential and
      tent.
- [ ] Add a local Pi client example.
- [ ] Add Home Assistant / MQTT adapters later (separate scope).

---

## 12. Bridge secret resolution strategy (audit finding)

This section captures the result of the bridge credential secret-model
audit. It governs how the resolver and Edge Function handle bridge HMAC
secrets.

### 12.1 Finding

The current durable table `pi_ingest_bridge_credentials` stores
`secret_hash`, never plaintext. Standard HMAC verification (as
implemented in `src/lib/piIngestAuthRules.ts` via `computeHmacSha256Hex`)
requires the **raw shared secret material** to recompute the signature
over the canonical signing string.

Therefore:

- **`secret_hash` alone cannot verify a standard HMAC signature.** A
  one-way hash of the secret is not usable as the HMAC key without
  redefining the protocol so that the hash _is_ the shared secret —
  which would make the stored hash functionally equivalent to plaintext
  secret material.
- **A resolver must not map `secret_hash` to `BridgeCredential.secret`.**
  Doing so would silently turn the hash column into sensitive credential
  material while pretending it is only a hash.
- **Usable secret material must be resolved server-side**, inside the
  Edge Function, through a server-only mechanism. The browser/client
  bundle must never receive raw secret material.

### 12.2 Required properties

1. The browser/client must never receive the raw bridge secret.
2. If a credential-issuance UI is later added, the bridge secret is
   shown to the operator **only once at creation** and never retrievable
   again from the server.
3. The database must not store the plaintext bridge secret.
4. Standard HMAC verification requires server-side access to **usable
   shared secret material** (raw secret bytes).
5. `secret_hash` alone is **not** sufficient to verify an HMAC signature.
6. A resolver must not pass `secret_hash` as `secret` on
   `BridgeCredential` unless the column is explicitly redefined as
   sensitive secret material (renamed and documented as such).
7. The Edge Function must fail closed unless the encrypted-secret resolution
   strategy is configured and succeeds.

### 12.3 Strategy options

**Option A — Encrypted shared secret (implemented).**
Store `secret_ciphertext` in the database, encrypted with a
server-only environment key held by the Edge Function runtime. The
Edge Function decrypts at verification time and uses the plaintext
secret only in-memory to recompute HMAC. Plaintext is never returned
to the client and never logged.

**Option B — Server-side secret store / Vault reference.**
Store an opaque reference (e.g. a Vault key id) in the database. The
Edge Function resolves the actual secret server-side through the
managed secret store. The database row by itself is non-sensitive.

**Option C — Treat the stored value as credential material (not
recommended).** Only acceptable if the column is renamed to clearly
indicate it is sensitive HMAC key material and is protected with the
same care as plaintext secret. Default posture is to reject this
option.

### 12.4 Preferred direction

- Do **not** use `secret_hash` as `BridgeCredential.secret`.
- The resolver must not map `secret_hash` to raw `secret`.
- The endpoint must only verify HMAC after resolving usable
  secret material through a server-only mechanism (Option A or B).
