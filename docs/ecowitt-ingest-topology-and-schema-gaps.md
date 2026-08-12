# EcoWitt Ingest — Actual Topology and Schema Gaps

**Status:** Findings record. Audit input for Phase 1.8. No code, schema, policy, or deployment changed.
**Recorded:** 2026-08-07
**Recorded by:** Claude (Knowledge Library & Product Specification Architect)

Every claim below was verified by reading the cited file in this repository. Nothing here is
inferred from external documentation. Companion record:
[Phase 1.7 verification](./ecowitt-real-ingest-phase-1-7-verification-record.md).

## Why this file exists

Several Phase 1.8 design documents were produced by sessions without repository access. They
share a common assumption — that the gateway posts directly to a Supabase Edge Function over
HTTPS, into `ecowitt_*` tables holding one wide row per sample. **Every part of that is wrong
for this repository**, and because each document built on the previous one, the error
compounded across setup, debugging, TLS, and parsing guidance.

This file records what is actually true, so Phase 1.8 starts from the real system.

## 1. The gateway cannot reach `ecowitt-real-ingest`

`supabase/functions/_shared/ecowittRealIngestAuth.ts` requires an `Authorization: Bearer`
header. With no header it returns `unauthorized` / `missing_authorization_header`:

```ts
if (headerValue == null || typeof headerValue !== "string") {
  return result("unauthorized", "missing_authorization_header");
}
```

The EcoWitt Customized-server configuration exposes six fields — Enable, Protocol, Server
IP/Hostname, Path, Port, Upload interval. **None of them sets a request header.** A GW1200
pointed at `ecowitt-real-ingest` therefore receives `401` on every POST, permanently. This is
not a misconfiguration that can be corrected by adjusting path, port, or TLS.

**Consequence:** any setup guide instructing an operator to point the gateway at
`<project>.supabase.co/functions/v1/ecowitt-real-ingest` is wrong and will never succeed.

## 2. The real path runs through a local listener

`tools/ecowitt-testbench/ecowitt_listener.py` is a Flask app serving **plain HTTP**:

```python
PORT = int(os.environ.get("VERDANT_TESTBENCH_PORT", "8787"))
app.run(host="0.0.0.0", port=PORT, debug=False)
# "[verdant-testbench] listening on http://localhost:{PORT}"
```

It forwards with `requests.post(url, json=outbound, headers=headers, timeout=10)` to
`VERDANT_INGEST_URL`. Per `tools/ecowitt-testbench/test_forwarding_contract.py`, that target is
`sensor-ingest-webhook` — **not** `ecowitt-real-ingest`:

```python
INGEST_URL = "https://example.supabase.co/functions/v1/sensor-ingest-webhook"
```

Effective topology:

```text
GW1200 --plain HTTP, LAN, no auth--> ecowitt_listener.py :8787
       --requests.post + Bearer token--> sensor-ingest-webhook --> sensor_readings

ecowitt-real-ingest (Phase 1.7) is NOT on this path.
```

Two things follow:

- **The gateway never speaks TLS.** TLS exists only on the second hop, spoken by Python
  `requests`. IoT TLS concerns — incomplete chains, TLS 1.2 availability, absent custom CA
  stores, SNI-vs-IP — do not apply to any hop in this system.
- **The header-free proxy that external drafts propose building already exists.** It is the
  listener.

The forwarder strips `PASSKEY` from any forwarded raw payload and asserts the outbound body
never contains the bridge token, an `Authorization` value, a JWT-shaped string, or service-role
markers. Tent binding comes from the `VERDANT_TENT_ID` environment variable, **not** from the
payload — so device-identity-by-PASSKEY, as external drafts model it, is not how this path
resolves scope.

## 3. Resolved: `source = "ecowitt"` is remapped — but it remaps to `live`, fail-open

`ecowitt_listener.py` sets `WEBHOOK_TRANSPORT_SOURCE = "ecowitt"` and emits it as `source` in
the forwarded body. This is **not** a stored mislabel:
`supabase/functions/sensor-ingest-webhook/storageMapping.ts` remaps every incoming transport
label to a canonical stored source before insert, preserving the original as
`raw_payload.metadata.transport_source` and `raw_payload.vendor`, and stamps `user_id` from the
authenticated identity, never the body. The design is sound.

The mapping's destination is the finding:

```ts
// mapStoredSourceForTransport
if (typeof incoming !== "string" || incoming.length === 0) return "live";
// canonical labels pass through unchanged
// Known transport/vendor labels that must collapse to canonical "live".
return "live";
```

- `"ecowitt"` → **`live`**. The webhook path — the one that already writes to
  `sensor_readings` — stores EcoWitt rows as `source='live'`.
- **Unknown or empty inputs also default to `live`.** The code comment justifies this
  ("never quarantined accidentally; per-row quality classification is the source of truth for
  stale/invalid"), but the direction is fail-open: a garbled, missing, or unrecognized
  transport label receives the **most trusted** stored source. `AGENTS.md` states bad or
  unknown telemetry must never be shown as healthy; a fail-closed default (`invalid`, or
  reject) would match that rule. This is a **gate 4 (live-label fencing) decision**, and it is
  concrete, not hypothetical: the only fence between an authenticated webhook POST and a
  `source='live'` row today is possession of the bridge token.
- A caller-supplied canonical label passes through unchanged — a body claiming `demo` stays
  `demo`, and a body claiming `live` stays `live`.

Whether any `source='live'` EcoWitt rows exist in the live project (the listener last received
gateway traffic 2026-06-24; whether forwarding was enabled with a valid token is unknown) is a
live-row-state question this record does not answer.

Note for Phase 1.8: `buildStoredRow` also folds an `Idempotency-Key` into `raw_payload` when
supplied — an idempotency mechanism already exists on this path and must be audited before any
new key design is invented.

## 4. The storage schema is long format

`public.sensor_readings`, created in
`supabase/migrations/20260516204601_eb069c76-870d-4f19-8d23-800be7bbfe01.sql`:

| Column       | Type          | Notes                           |
| ------------ | ------------- | ------------------------------- |
| `id`         | `uuid`        | PK, `gen_random_uuid()`         |
| `user_id`    | `uuid`        | NOT NULL, defaults `auth.uid()` |
| `tent_id`    | `uuid`        | NOT NULL                        |
| `ts`         | `timestamptz` | NOT NULL, defaults `now()`      |
| `metric`     | `text`        | NOT NULL, trigger-constrained   |
| `value`      | `numeric`     | NOT NULL                        |
| `quality`    | `text`        | NOT NULL, default `'ok'`        |
| `source`     | `text`        | NOT NULL, default `'manual'`    |
| `created_at` | `timestamptz` | NOT NULL                        |

Table comment: _"Append-only environment telemetry. Long format: one row per (tent, metric, ts)."_

`validate_sensor_reading()` constrains values by trigger, not CHECK:

- `metric` ∈ `temperature_c`, `humidity_pct`, `vpd_kpa`, `co2_ppm`, `soil_moisture_pct`
- `quality` ∈ `ok`, `degraded`, `stale`, `invalid`

Also present: `public.observation_events`, `public.sensor_ingest_audit_log`.

**Not present anywhere:** `ecowitt_devices`, `ecowitt_observations`, `ecowitt_ingest_events`,
`ecowitt_device_latest`, any `stations` table, or any device/gateway registry.

### Corrections this forces

| External draft assumption               | Repository reality                                       |
| --------------------------------------- | -------------------------------------------------------- |
| One wide row per sample                 | One row **per metric** — a single POST expands to N rows |
| `metrics` jsonb column                  | No jsonb column; `value numeric` per metric row          |
| Key on whole-payload fingerprint        | No row exists for a whole payload to be unique on        |
| `tenant_id` / `device_id` columns       | `user_id` / `tent_id`; no device column                  |
| Device registry keyed by `passkey_hash` | No registry table exists                                 |

The natural key candidate is `(user_id, tent_id, metric, ts)`.

## 5. Blocking gap: multi-channel soil has nowhere to go

No migration ever adds `plant_id`, a channel column, or a device column to `sensor_readings`
(verified: the only `ALTER TABLE public.sensor_readings` statements enable RLS and set the
`user_id` default).

A WH51 deployment is typically one probe per plant or per pot, arriving as
`soilmoisture1..8` (up to 16 on some firmware). The schema offers a single
`soil_moisture_pct` metric per `(tent, ts)`:

```text
soilmoisture1=42  ┐
soilmoisture2=38  ├─► soil_moisture_pct    one metric, one tent, one ts
soilmoisture3=51  ┘
```

Writing every channel produces rows colliding on `(tent_id, 'soil_moisture_pct', ts)`. Writing
one silently discards the rest.

This also puts the schema in tension with `AGENTS.md`, which states a reading should carry
`plant_id` when relevant. For per-plant soil probes it is relevant, and the column does not exist.

**This is the first Phase 1.8 decision, and it is an owner decision.** Options, without a
recommendation between the first three:

1. Add `plant_id` plus a channel-to-plant binding surface.
2. Keep tent-level only and designate one channel, with the others explicitly dropped and the
   designated probe named in the UI.
3. Add a channel column without plant binding, deferring the plant question.

Averaging channels into one value should be rejected: it manufactures a number no sensor
reported, and a dry pot beside a wet one reads as healthy. That is a Sensor Truth violation.

Related: the allowed metric vocabulary (`co2_ppm`, `vpd_kpa`) was designed for a different
sensor family than EcoWitt, whose output is largely pressure, rain, wind, battery, and
per-channel temp/RH. Where unmapped metrics go is a second open decision.

## 6. Consequence for Phase 1.8 sequencing

Idempotency key design cannot be settled first. A key identifies a row, and it is not yet
decided how many rows a POST produces or what distinguishes them. Order:

1. Resolve soil channel cardinality (§5) — owner decision
2. Resolve unmapped-metric policy (§5) — owner decision
3. Decide the fail-open `live` default in `mapStoredSourceForTransport` (§3) — gate 4, owner
   decision
4. Then idempotency, starting from the existing `Idempotency-Key` mechanism (§3), against a
   known row shape
5. Then RLS review of the resulting write path

## 7. Not verified in this record

- Whether `ecowitt-real-ingest` is deployed to `knkwiiywfkbqznbxwqfh`
- Whether any of this differs on the deploy branch (`verdant-grow-diary`); this was read from a
  worktree based on `main`
- Any live row state. No Supabase query was issued.

## Rollback

Delete this file. It records observations only; nothing depends on it.
