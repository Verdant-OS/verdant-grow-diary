# Sensor Ingest Payload Contract (Ecowitt + MQTT + CSV + Manual + Webhook)

Status: Draft — documentation + validation contract only. No Edge Function is
implemented from this document. This contract MUST be satisfied before any new
sensor ingest Edge Function (Ecowitt, MQTT, Home Assistant, webhook, CSV
uploader, etc.) is written.

This document is binding for future bridges. UI must never invent fields a
bridge did not supply.

---

## 1. Canonical payload fields

Every sensor ingest payload (regardless of transport) MUST be normalized into
the following shape before it reaches the database:

| Field          | Required | Notes |
|----------------|----------|-------|
| `source`       | yes      | One of the supported source values below. |
| `vendor`       | no       | Vendor lineage string (e.g. `ecowitt`, `ecowitt-gw2000`, `home-assistant`, `mosquitto`). Drives display label when `source` alone is ambiguous. |
| `captured_at`  | yes      | ISO-8601 UTC. The instant the sensor physically captured the reading. See §5. |
| `tent_id`      | yes      | Verdant tent UUID. Ownership MUST be verified server-side. |
| `plant_id`     | no       | Optional Verdant plant UUID when the reading is plant-scoped (e.g. soil probe). |
| `metrics`      | yes      | Object of metric key → numeric value. See §4. |
| `raw_payload`  | yes*     | Original vendor payload preserved verbatim where the schema column exists. Required for Ecowitt / MQTT / webhook. CSV may omit when row already _is_ the raw form. |
| `confidence`   | no       | Float in `[0, 1]`. Bridges MAY supply; UI MUST treat missing as "unknown", not "high". |
| `bridge_id` / `source_id` | conditional | Required for bridge-authenticated ingest (Pi bridge, MQTT bridge, Ecowitt gateway). Used for dedupe and provenance. |

No other top-level fields are accepted. Unknown fields MUST be dropped before
insert and MUST NOT be silently mapped onto canonical fields.

---

## 2. Supported `source` values

Initial allow-list:

- `ecowitt`
- `manual`
- `csv`
- `mqtt`
- `webhook`
- `stale`     (computed; never accepted from a bridge)
- `invalid`   (computed; never accepted from a bridge)
- `unknown`   (fallback when lineage cannot be proven)

`stale` and `invalid` are display/derived states only. A bridge MUST NOT
submit `source: "stale"` or `source: "invalid"`. A bridge MUST NOT submit
`source: "live"` — "live" is not a source, it is a freshness state of a known
source and is forbidden when the underlying source is `unknown`.

---

## 3. Demo / fixture isolation

- Demo, sample, seed, and internal test fixtures MUST NOT be written through
  the ingest path. They live in dev-only modules and MUST be labeled as
  `demo` at the UI layer.
- An ingest payload MUST NOT carry `source: "demo"`. The ingest endpoint MUST
  reject it.

---

## 4. Metric keys

Canonical metric keys (extensible, but new keys require a contract update):

| Key                   | Unit            | Notes |
|-----------------------|-----------------|-------|
| `air_temp_f` or `temperature` | °F (when `_f`) / °C (`temperature`) | Bridges SHOULD prefer the unit-suffixed key. UI MUST NOT guess units. |
| `humidity`            | % RH            | `0..100`. |
| `vpd`                 | kPa             | Computed by bridge OR by Verdant from temp+RH. Never both. |
| `co2_ppm`             | ppm             | Non-negative integer. |
| `soil_water_content`  | % VWC           | `0..100`. |
| `soil_temp`           | °C              | |
| `soil_ec`             | mS/cm           | Non-negative. |
| `reservoir_ph`        | pH              | `0..14`. |
| `reservoir_ec`        | mS/cm           | Non-negative. |
| `ppfd`                | µmol/m²/s       | MUST be a true PPFD measurement. MUST NOT be estimated from lux, watts, or a light-percentage slider. If only lux/watt/% is available, the bridge MUST omit `ppfd` rather than synthesize it. |

Any metric value that is `null`, `NaN`, `Infinity`, `-Infinity`, or outside
its physical range MUST be dropped from `metrics` before insert and the
reading MUST be flagged so the UI can show `invalid` for that metric.

---

## 5. Timestamp rule — `captured_at` vs `occurred_at`

- `captured_at` is the moment the **sensor physically read** the value.
- `occurred_at` (used elsewhere in Verdant for diary/log events) is the
  moment a **grower action happened**. These are not interchangeable.
- A missing `captured_at` MUST NOT be silently backfilled from `occurred_at`,
  `created_at`, `received_at`, or "now". A reading missing `captured_at`
  MUST be rejected (or stored as `invalid` if the schema requires it).
- Staleness checks (e.g. >30 min old) MUST use `captured_at`, never
  `created_at` / `received_at`.

---

## 6. Source-truth display rules

- Ecowitt readings display as **Ecowitt** when `source = ecowitt` OR
  `vendor` carries Ecowitt lineage.
- MQTT readings display as **MQTT** only when `source = mqtt`. A reading
  that merely _transited_ an MQTT broker but originated from Ecowitt MUST
  display as Ecowitt (vendor lineage wins for naming the data origin).
- `unknown` source MUST NEVER render as "Live".
- Demo / internal fixtures MUST NEVER render as real / live readings.
- A reading classified as `stale` or `invalid` MUST NOT render as
  current/healthy and MUST NOT satisfy "fresh reading" gates anywhere in
  the app (Dashboard snapshot, Alerts, AI Doctor inputs).

---

## 7. Validation rules

A bridge / Edge Function MUST reject (HTTP 4xx, no insert) when:

1. `captured_at` is in the future beyond a small clock-skew tolerance
   (suggested: > 5 minutes ahead of server time).
2. `captured_at` is malformed or not ISO-8601.
3. Any submitted metric value is non-finite or outside its physical range
   (the whole reading is rejected only if _every_ metric is invalid;
   otherwise the invalid metric is dropped and the reading is flagged).
4. `ppfd` is present but was derived from lux / watts / light-%.
5. `tent_id` is missing or not owned by the authenticated principal.
6. `source` is not in the allow-list of §2, or is `stale` / `invalid` /
   `demo` / `live`.
7. `raw_payload` is missing for a transport that supports it
   (Ecowitt, MQTT, webhook).
8. The payload includes a client-supplied `user_id`. **Client-supplied
   `user_id` MUST NEVER be trusted.** Ownership is resolved server-side
   from the authenticated session or bridge credential.

---

## 8. Edge Function guardrails (binding for future implementation)

When the production ingest Edge Function is built, it MUST:

1. **Authenticate first.** Verify the bridge credential or user session
   _before_ reading the payload body for ownership decisions.
2. **Verify ownership.** Resolve `tent_id` → owning user via a
   security-definer function or join; reject on mismatch.
3. **Validate before insert.** Run §7 rules. No partial inserts of
   rejected payloads.
4. **Idempotency / dedupe.** Each insert MUST be deduped on
   `(source, bridge_id|source_id, tent_id, captured_at, metric-fingerprint)`
   so re-delivered Ecowitt / MQTT messages do not double-write.
5. **No alert creation.** The ingest function MUST NOT insert into
   `alerts`. Alert evaluation is a separate, observable path.
6. **No Action Queue rows.** The ingest function MUST NOT insert into
   `action_queue`. Action Queue items require grower approval and a
   different code path.
7. **No device commands.** No fan/light/pump/heater/dehumidifier/dosing
   commands may be issued from ingest.
8. **No automation.** No cascading writes, no auto-run flows, no
   "auto-resolve" of alerts.
9. **No `service_role` before validation.** `service_role` MUST NOT be
   used to bypass RLS for unvalidated payloads. If elevated writes are
   required after validation, they must be scoped and logged.
10. **Preserve `raw_payload`.** Store the original vendor payload alongside
    the normalized row when the schema supports it.

---

## 9. Forbidden behaviors (summary)

- No fake-live fallback when source is unknown or stale.
- No device control from ingest.
- No automatic alert creation from ingest.
- No automatic Action Queue creation from ingest.
- No trust of client-supplied `user_id`.
- No silent backfill of `captured_at` from `occurred_at` / `created_at` / now.
- No PPFD estimation from lux / watts / light-%.
- No demo data flowing through the ingest path.

---

## 10. Canonical endpoint

**`POST /functions/v1/sensor-ingest-webhook` is the canonical generic ingest
endpoint** for bridge clients (MQTT, Ecowitt, Home Assistant, generic
webhook). The pi-specific HMAC path `pi-ingest-readings` remains in place
for the Raspberry Pi bridge and is not affected by this contract.

Authentication: `Authorization: Bearer <vbt_…>` (tent-scoped bridge token)
or a user JWT.

### Idempotency

Bridge clients **MUST** send a stable `Idempotency-Key: <opaque>` header
on every request. The key should be stable across retries of the same
logical batch (e.g. a hash of `vendor + device_id + captured_at + metrics`)
and unique across distinct batches.

The endpoint enforces atomic dedupe at the database layer via the partial
unique index `sensor_readings_dedupe_uidx` on
`(user_id, tent_id, source, metric, captured_at)`. This is the
authoritative dedupe guarantee — concurrent identical POSTs cannot create
duplicate rows. The `Idempotency-Key` header is preserved in `raw_payload`
for traceability and post-hoc reconciliation.

Missing `Idempotency-Key` is not rejected (browser/JWT flows may omit it),
but bridge integrations without it MUST be flagged in their integration
review.

### Error surface

The endpoint returns terse JSON error bodies only:
`unauthorized`, `forbidden_tent`, `invalid_json`, `invalid_payload`,
`tent_lookup_failed`, `insert_failed`, `server_misconfigured`,
`auth_lookup_failed`, `method_not_allowed`. It never echoes PG constraint
messages, payload values, tokens, bridge ids, secrets, or internal table
names.

---

## 11. Rollout

This document is the gate. A new ingest Edge Function may be opened for
review only when:

- It cites this contract.
- Its tests cover §7 validation and §8 guardrails.
- Its UI surface respects §6 source-truth display rules.

---

## 12. Example payloads (V1.1 — contract-aligned vocabulary)

The pure normalizer (`src/lib/sensorWebhookIngestRules.ts`) and the DB
trigger `public.validate_sensor_reading()` both accept the four
contract transports (`ecowitt`, `mqtt`, `csv`, `webhook`) in addition to
the historical device-specific labels (`esp32_*`, `home_assistant_bridge`,
`pi_bridge`, …). All examples below assume a server-issued bridge token
(`Authorization: Bearer vbt_…`) or a user JWT.

### 12.1 EcoWitt over MQTT (local broker → bridge → webhook)

```json
POST /functions/v1/sensor-ingest-webhook
Authorization: Bearer vbt_abcdef…
Idempotency-Key: ecowitt-gw2000-2026-05-26T20:00:00Z

{
  "tent_id": "11111111-1111-1111-1111-111111111111",
  "source": "mqtt",
  "vendor": "ecowitt",
  "captured_at": "2026-05-26T20:00:00Z",
  "metrics": {
    "temp_c": 24.6,
    "humidity_pct": 58,
    "co2_ppm": 720
  },
  "metadata": {
    "device_id": "ecowitt-gw2000",
    "sensor_model": "WH32"
  }
}
```

Notes:
- Row `source` is persisted as `"mqtt"`.
- `vendor: "ecowitt"` is preserved verbatim in `raw_payload.vendor` and
  is **never** used for ownership, auth, or routing.

### 12.2 Home Assistant `rest_command` (HA → webhook)

```yaml
# configuration.yaml
rest_command:
  verdant_publish:
    url: "https://<project>.functions.supabase.co/sensor-ingest-webhook"
    method: POST
    headers:
      authorization: "Bearer !secret verdant_bridge_token"
      content-type: "application/json"
      idempotency-key: "{{ tent }}-{{ now().isoformat() }}"
    payload: >-
      {
        "tent_id": "{{ tent }}",
        "source": "webhook",
        "vendor": "home_assistant",
        "captured_at": "{{ now().isoformat() }}",
        "metrics": {
          "temp_c": {{ states('sensor.tent_temp') | float }},
          "humidity_pct": {{ states('sensor.tent_rh') | float }}
        },
        "metadata": { "device_id": "ha-tent-canopy" }
      }
```

Notes:
- Row `source` is persisted as `"webhook"`.
- `vendor: "home_assistant"` is preserved in `raw_payload.vendor` only.
- Bridge token is tent-scoped, hashed at rest, and revocable. HA cannot
  see other tents even if the token leaks.

### 12.3 Generic CSV import

```json
POST /functions/v1/sensor-ingest-webhook
Authorization: Bearer <user JWT>
Idempotency-Key: csv-2026-05-26-batch-7

{
  "tent_id": "11111111-1111-1111-1111-111111111111",
  "source": "csv",
  "vendor": "manual-export",
  "captured_at": "2026-05-26T20:00:00Z",
  "metrics": { "temp_c": 24.6, "humidity_pct": 58 }
}
```

### Vendor lineage rules (binding)

- `vendor` is OPTIONAL.
- `vendor` MUST be a non-empty string. Non-string values are dropped from
  `raw_payload`.
- `vendor` is preserved verbatim in `raw_payload.vendor` and is the
  authoritative lineage field for analytics / display.
- `vendor` is NEVER an allow-list. Unknown vendors are accepted and
  preserved; the security boundary remains the `source` allow-list, the
  JWT/bridge token, and tent ownership.
- `vendor` MUST NOT be used by any code path for authorization, ownership,
  alerting, Action Queue routing, or device control.
