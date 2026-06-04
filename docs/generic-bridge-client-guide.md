# Generic Bridge Client Guide — EcoWitt, Home Assistant, MQTT

> **Scope.** This guide tells external bridge clients (EcoWitt forwarders,
> Home Assistant `rest_command` integrations, MQTT → HTTP bridges,
> Node-RED flows, Pi/ESP32 scripts) how to send sensor readings into
> Verdant **safely**.
>
> Webhook sensor ingest is **read-only**. It never triggers alerts,
> Action Queue items, AI Doctor analysis, automation, or device control.
> See also:
>
> - [`v1-sensor-ingest.md`](./v1-sensor-ingest.md) — full payload contract
> - [`bridge-client-retry-guidance.md`](./bridge-client-retry-guidance.md) — retry/backoff details
> - [`bridge-tokens-and-client-retries.md`](./bridge-tokens-and-client-retries.md) — token format
> - [`sensor-truth-rules.md`](./sensor-truth-rules.md) — labeling rules
> - [`sensor-webhook-ingest.md`](./sensor-webhook-ingest.md) — spec alias

---

## 1. Endpoint

The canonical generic bridge endpoint is the Supabase Edge Function:

```
POST {SUPABASE_URL}/functions/v1/sensor-ingest-webhook
Content-Type: application/json
```

This is the **only** supported endpoint for generic bridge clients. There
is no Supabase-hosted MQTT subscriber; MQTT integrations must run a local
bridge (Node-RED, Pi, ESP32, or similar) that forwards normalized JSON
payloads to this HTTPS endpoint.

---

## 2. Required headers

| Header | Required | Notes |
|---|---|---|
| `Authorization: Bearer vbt_...` | yes | Bridge token; see §3 |
| `Content-Type: application/json` | yes | |
| `Idempotency-Key: <uuid-or-hash>` | yes for bridges | See §4 |
| `User-Agent: <client>/<version>` | recommended | Helps debugging |

### 3. Auth — bridge tokens (`vbt_...`)

```
Authorization: Bearer vbt_xxxxxxxxxxxxxxxxxxxxxxxx
```

- Bridge tokens are issued per device / per integration in the Verdant UI.
- Tokens are scoped to a specific tent/owner; the server resolves
  `user_id` and `tent_id` from the token. **Clients must never send
  `user_id` in the payload.**
- Treat tokens like passwords. Store them in your bridge's secret store
  (Home Assistant `secrets.yaml`, env vars, etc.). Never commit them.
- If a token is leaked or a device is decommissioned, rotate it in the
  Verdant UI; old tokens stop accepting writes immediately.
- **Never** send `service_role`, anon JWTs, or end-user JWTs from a
  bridge client. If your client has access to a `service_role` key,
  stop — that path is forbidden for bridges.

### 4. Idempotency

Bridge clients **must** send an `Idempotency-Key` header on every
request:

```
Idempotency-Key: 8b6c7c3a-2d2c-4b3f-9b3a-2a1d8f5a5e21
```

Recommended formats:

- A v4 UUID generated once per logical reading, **cached across retries
  of the same reading** so retries deduplicate.
- A deterministic hash of
  `tent_id + source + captured_at + metric set` if your bridge cannot
  persist UUIDs across restarts.

The server deduplicates identical `(token, Idempotency-Key)` pairs
within the dedupe window. This is what makes retries safe — see §7.

---

## 5. Source vs vendor

`source` is the **transport classification** the server trusts for
labeling. `vendor` is **lineage only** — it is preserved into
`raw_payload.vendor` for traceability but is **never used for auth,
ownership, or trust decisions**.

Allowed `source` values for bridges include:
`webhook`, `mqtt`, `pi_bridge`, `home_assistant`, `csv`, `ecowitt`.
See [`v1-sensor-ingest.md`](./v1-sensor-ingest.md) §7 for the full list.

### Examples

**EcoWitt-over-MQTT bridge** (gateway publishes to MQTT, your bridge
forwards to Verdant):

```json
{
  "source": "mqtt",
  "vendor": "ecowitt",
  "tent_id": "…",
  "captured_at": "2026-06-04T12:00:00Z",
  "metadata": { "device_id": "ecowitt-gw-1" },
  "temperature_c": 24.7,
  "humidity_pct": 58.0
}
```

**Home Assistant `rest_command`** (HA forwards a sensor state change):

```json
{
  "source": "webhook",
  "vendor": "home_assistant",
  "tent_id": "…",
  "captured_at": "2026-06-04T12:00:00Z",
  "metadata": { "entity_id": "sensor.tent_a_temp" },
  "temperature_c": 24.7,
  "humidity_pct": 58.0
}
```

**Generic MQTT bridge** (no specific vendor):

```json
{
  "source": "mqtt",
  "tent_id": "…",
  "captured_at": "2026-06-04T12:00:00Z",
  "temperature_c": 24.7,
  "humidity_pct": 58.0
}
```

MQTT topic names are **not auth**. Anyone on the broker could publish
to a topic; the bridge token is what proves the reading came from an
authorized device.

---

## 6. Payload examples

All examples assume the headers in §2. Field ranges and the canonical
contract live in [`v1-sensor-ingest.md`](./v1-sensor-ingest.md) §4–§6.

### Temperature / humidity / VPD

```json
{
  "source": "webhook",
  "vendor": "home_assistant",
  "tent_id": "…",
  "captured_at": "2026-06-04T12:00:00Z",
  "temperature_c": 24.7,
  "humidity_pct": 58.0,
  "vpd_kpa": 1.28
}
```

If you do not measure VPD directly, omit it — the server can derive it
from temperature/humidity. Do not fabricate VPD from leaf temperature
assumptions in the bridge.

### Soil moisture

```json
{
  "source": "mqtt",
  "vendor": "ecowitt",
  "tent_id": "…",
  "captured_at": "2026-06-04T12:05:00Z",
  "soil_water_content_pct": 41.2,
  "soil_temperature_c": 22.5,
  "soil_ec_ms_cm": 1.6
}
```

### CO₂

```json
{
  "source": "webhook",
  "vendor": "home_assistant",
  "tent_id": "…",
  "captured_at": "2026-06-04T12:10:00Z",
  "co2_ppm": 820
}
```

### PPFD (only if measured)

```json
{
  "source": "mqtt",
  "tent_id": "…",
  "captured_at": "2026-06-04T12:15:00Z",
  "ppfd_umol_m2_s": 612
}
```

**Do not send lux-converted PPFD.** Lux→PPFD conversion depends on the
spectrum of the light source and is unreliable for grow lights. If your
sensor only reports lux, leave PPFD out and (optionally) send lux in a
custom `raw_payload` field. The server will not synthesize PPFD from
lux, and the bridge must not either.

---

## 7. Retry and backoff

This section summarizes
[`bridge-client-retry-guidance.md`](./bridge-client-retry-guidance.md);
read that doc for code samples.

- **Per-request timeout:** 10–15 seconds.
- **Max retries:** 4 (5 attempts total).
- **Backoff:** Full Jitter exponential —
  `delay = random(0, min(maxDelay, baseDelay * 2 ** attempt))`
  with `baseDelay = 1s`, `maxDelay = 30s`.
- **Reuse the same `Idempotency-Key`** across retries of the same
  logical reading so the server deduplicates.
- **Never retry in a tight loop.** Always sleep `delay` before the next
  attempt. Never retry forever.
- **Retry:** `408`, `429`, `500–599`, network timeout / connection
  reset.
- **Do not retry automatically:** `400`, `401`, `403`, `404`, `409`,
  `422`. These indicate a client bug or bad credentials — surface the
  error and stop.
- On exhaustion, drop or persist the reading locally; **do not** queue
  unbounded retries that could flood the endpoint after an outage.

---

## 8. Sensor truth rules

Bridge clients are responsible for **honest labeling**:

- **Preserve `captured_at`** — use the timestamp the sensor actually
  measured the reading, in ISO 8601 UTC. Do not substitute "now" when
  forwarding buffered readings.
- **Preserve `raw_payload`** — pass through the original vendor frame
  in `raw_payload` so lineage is auditable. Sanitize secrets first.
- **Never fake live data.** If a reading is reconstructed, backfilled,
  or imported, set `source: "csv"` or `source: "import"` — not
  `webhook` / `mqtt`.
- **Label stale or invalid data honestly.** If a sensor reports
  out-of-range values, do not clamp them silently into the valid range
  — either drop the reading or forward it and let the server mark it
  `invalid`. Do not relabel `stale` data as fresh.

See [`sensor-truth-rules.md`](./sensor-truth-rules.md) for the full
classification list (`live`, `manual`, `demo`, `stale`, `invalid`,
`csv`, `import`, `pi_bridge`, `home_assistant`, `mqtt`, `api`).

---

## 9. What bridge clients must NOT do

- ❌ **No `service_role`.** Bridges authenticate only with `vbt_...`
  bridge tokens. If you have a `service_role` key, it does not belong
  in a bridge.
- ❌ **No `user_id` in the payload.** Ownership is derived server-side
  from the bridge token. A client-supplied `user_id` would be ignored
  at best and is a security smell at worst.
- ❌ **No device commands.** This endpoint is read-only ingest. Bridges
  must not send fan/light/pump/heater/humidifier/dehumidifier/dosing
  commands through it, and the server will not execute any.
- ❌ **No alert creation.** Bridges do not write to the alerts table.
  Alert evaluation is server-side and happens after ingest.
- ❌ **No Action Queue writes.** Bridges do not create suggested or
  approved actions. The Action Queue is grower-approved only.
- ❌ **No automation triggers.** Bridges do not invoke AI Doctor, do
  not start automations, and do not change tent targets.
- ❌ **No silent retries on `4xx` auth errors.** Surface them.

Device control is **out of scope** for bridge clients and for this
endpoint, full stop.

---

## 10. Quick reference

```http
POST /functions/v1/sensor-ingest-webhook
Authorization: Bearer vbt_xxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
Idempotency-Key: 8b6c7c3a-2d2c-4b3f-9b3a-2a1d8f5a5e21

{
  "source": "mqtt",
  "vendor": "ecowitt",
  "tent_id": "…",
  "captured_at": "2026-06-04T12:00:00Z",
  "metadata": { "device_id": "ecowitt-gw-1" },
  "temperature_c": 24.7,
  "humidity_pct": 58.0,
  "co2_ppm": 820
}
```

Expected: `202 Accepted` on success, `200 OK` on idempotent replay.
On `4xx`: do not retry automatically. On `408 / 429 / 5xx / network
timeout`: retry with Full Jitter, max 4 retries, reusing the same
`Idempotency-Key`.
