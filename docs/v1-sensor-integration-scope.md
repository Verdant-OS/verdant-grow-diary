# Verdant — V1 Sensor Integration Scope

> **Status:** Specification only. Docs commit; no production code changes.
> **Owner:** Sensors surface area.
> **Decision date:** locks the V1 ingest shape so partner/bridge work can
> proceed in parallel.

---

## 1. Core decision

**Verdant V1 sensor integration is read-only, hardware-neutral, and centered
on a single generic authenticated webhook that normalizes incoming readings
into `sensor_readings`.**

The Verdant product surface is **the generic webhook ingest endpoint.**

MQTT, ESP32, ESPHome, Tasmota, Raspberry Pi, Node-RED, and Home Assistant are
**bridge / source patterns** that send data **into** the webhook. They are
not the product surface.

### Important correction

> **Do not implement a long-running MQTT subscriber inside Supabase Edge
> Functions for V1.**

Edge Functions are short-lived request handlers. A persistent MQTT subscriber
is the wrong shape. MQTT must be handled **locally by a bridge**:

```
ESP32 / ESPHome / Tasmota
        │ publish
        ▼
   MQTT broker (local)
        │ subscribe
        ▼
Node-RED  or  Raspberry Pi bridge
        │ POST JSON
        ▼
  Verdant webhook ingest
        │
        ▼
     sensor_readings
```

---

## 2. V1 priority order

1. **Generic authenticated webhook ingest** — the single production surface.
2. **Source badges + staleness visibility** in UI (timeline, tent detail,
   plant detail, freshness card).
3. **ESP32 / ESPHome / Arduino examples** that POST to the webhook
   (docs + reference snippets).
4. **Home Assistant automation examples** that POST to the webhook
   (REST command + automation YAML).
5. **MQTT bridge documentation only** — Node-RED flow + Pi bridge script.
   No in-app MQTT.
6. **Later:** dedicated MQTT service, partner integrations, or first-party
   firmware **only if** real demand and a clear safety review justify them.

---

## 3. Supported source labels (V1)

Every `sensor_readings.source` value must be one of the following. New labels
require a docs PR before code use.

| `source`                 | Origin                                                                  | UI badge |
| ------------------------ | ----------------------------------------------------------------------- | -------- |
| `manual`                 | Quick Log (grower-entered values)                                       | Manual   |
| `csv_import_ac_infinity` | Gate 2A CSV Drop — AC Infinity exports                                  | CSV      |
| `webhook_generic`        | Any caller hitting the webhook without a more specific tag              | Webhook  |
| `pi_bridge`              | Raspberry Pi bridge script POSTing to webhook                           | Pi       |
| `node_red_bridge`        | Node-RED flow POSTing to webhook                                        | Node-RED |
| `esp32_arduino_sht31`    | ESP32 + Arduino sketch with SHT31, direct HTTPS POST                    | ESP32    |
| `esp32_esphome`          | ESP32 running ESPHome with an HTTP request component                    | ESPHome  |
| `esp32_mqtt_bridge`      | ESP32 publishes MQTT → local bridge POSTs to webhook                    | ESP32    |
| `home_assistant_bridge`  | Home Assistant `rest_command` / automation POSTing to webhook           | HA       |

Rules:

- Source is **always explicit**. Never default to `live`.
- Unknown / missing source → reject the row (HTTP 400) — do not store.
- UI must visually distinguish `manual`, `csv_*`, `webhook_*`, `esp32_*`,
  bridge sources, and any future first-party live source.

---

## 4. Safety rules (V1)

- ✅ **Read-only only.** Ingest writes `sensor_readings` and nothing else.
- ❌ No device control of any kind.
- ❌ No automation triggered by ingest.
- ❌ No alerts created **directly** from ingest in V1. (Alerts may be
  derived later by a separate review surface; that is not this scope.)
- ❌ No `action_queue` rows created directly from ingest in V1.
- ❌ No AI Doctor logic in the ingest path. Ingest is dumb and fast.
- ❌ Never trust client-provided `user_id`. Ownership is derived from the
  tent ↔ grow ↔ user join, enforced by RLS.
- ❌ No `service_role` in any bridge example, client code, or doc snippet.
- ✅ Every reading **must** have an explicit `source`.
- ✅ Stale or invalid readings must not be shown as healthy. Freshness rules
  follow the existing `manualSensorFreshnessRules.ts` thresholds, extended
  to live/bridge sources with the same `fresh / aging / stale` ladder.
- ✅ Validate at the boundary: types, ranges, `captured_at` parseable, tent
  exists and is owned by the authenticated caller.

---

## 5. Webhook payload contract

### Endpoint

```
POST {SUPABASE_FUNCTIONS_URL}/ingest-sensor-reading
Authorization: Bearer <ingest_token>      # per-tent or per-bridge token
Content-Type: application/json
```

### Body

```json
{
  "tent_id": "uuid",
  "source": "esp32_arduino_sht31",
  "captured_at": "2026-05-26T20:00:00Z",
  "metrics": {
    "temp_f": 76.4,
    "humidity_percent": 58,
    "vpd_kpa": 1.18,
    "ph": 6.2,
    "ec": 1.4,
    "co2_ppm": 722,
    "ppfd": 510
  },
  "metadata": {
    "device_id": "esp32-canopy-1",
    "sensor_model": "SHT31",
    "rssi": -61
  }
}
```

### Field rules

- `tent_id` — required, uuid; ownership verified server-side via RLS.
- `source` — required, must be in the §3 list.
- `captured_at` — required, ISO 8601, parseable, not > 24h in the future.
- `metrics` — required; at least one finite numeric metric. Unknown keys
  are dropped, never stored under a typo.
- `metadata` — optional; stored verbatim under `raw_payload.metadata` for
  debugging. Never used for control logic.

### Response

- `200` `{ "ok": true, "reading_id": "..." }` on success.
- `400` on validation failure with a machine-readable `code` plus a short
  human message. Never echo secrets.
- `401` / `403` on auth / ownership failure.
- `409` on duplicate `(tent_id, source, captured_at, device_id?)` collisions
  (idempotency by design — bridges can safely retry).

### Idempotency

- Webhook computes a deterministic dedupe key from
  `(tent_id, source, captured_at, metadata.device_id ?? null)`.
- Repeated POSTs of the same key return the original `reading_id`.

---

## 6. Out of scope for V1

- ❌ MQTT subscriber Edge Function.
- ❌ Home Assistant OAuth flow or in-app HA integration UI.
- ❌ Any device control (fans, lights, pumps, heaters, humidifiers,
  dehumidifiers, dosing, irrigation valves).
- ❌ Setpoint changes pushed to hardware.
- ❌ Irrigation / fan / light commands.
- ❌ Partner cloud API polling (AC Infinity cloud, Pulse, Trolmaster, etc.).
- ❌ Brand-specific dashboards.
- ❌ Official Verdant ESP32 firmware.
- ❌ Alerts auto-generated by ingest.
- ❌ AI Doctor analysis inside the ingest path.

These may be revisited post-V1 with a dedicated scope doc each.

---

## 7. Why webhook-first?

- **Lowest implementation risk.** A single authenticated POST endpoint is
  small, well-understood, easy to test, and easy to harden.
- **Hardware-neutral.** Works with ESP32, Raspberry Pi, Node-RED, Home
  Assistant, custom Python scripts, shell scripts, or anything that can
  speak HTTPS + JSON.
- **Keeps Verdant out of device control.** The webhook only accepts
  observations; it cannot drive equipment. Safety-by-construction.
- **Clean bridge path for future partners.** Partners build a bridge, not
  a tightly-coupled integration. The contract is public and stable.
- **No long-running infra.** No persistent MQTT subscriber to babysit,
  no broker to host, no socket reconnect logic in Edge Functions.
- **Composable.** A grower can mix `manual` + `csv_import_ac_infinity` +
  `esp32_arduino_sht31` + `home_assistant_bridge` on the same tent without
  Verdant caring how each one got there.

---

## 8. Bridge pattern examples (docs only, illustrative)

### 8.1 ESP32 + Arduino + SHT31

```cpp
// Pseudocode — full sketch lives in docs/bridges/esp32-sht31.md (future).
// POSTs every 5 minutes, retries on failure, never holds device state.
```

Source tag: `esp32_arduino_sht31`.

### 8.2 ESPHome

```yaml
http_request:
  useragent: esphome-verdant
http_request.post:
  url: !secret verdant_ingest_url
  headers:
    Authorization: !secret verdant_ingest_token
  json:
    tent_id: !secret tent_id
    source: esp32_esphome
    captured_at: !lambda 'return id(sntp_time).now().strftime("%Y-%m-%dT%H:%M:%SZ");'
    metrics:
      temp_f: !lambda 'return id(temp_f_sensor).state;'
      humidity_percent: !lambda 'return id(humidity_sensor).state;'
```

Source tag: `esp32_esphome`.

### 8.3 Home Assistant `rest_command`

```yaml
rest_command:
  verdant_ingest:
    url: !secret verdant_ingest_url
    method: POST
    headers:
      Authorization: !secret verdant_ingest_token
    content_type: 'application/json'
    payload: >
      {
        "tent_id": "{{ tent_id }}",
        "source": "home_assistant_bridge",
        "captured_at": "{{ now().isoformat() }}",
        "metrics": {
          "temp_f": {{ states('sensor.tent_temp_f') | float }},
          "humidity_percent": {{ states('sensor.tent_humidity') | float }}
        }
      }
```

Source tag: `home_assistant_bridge`.

### 8.4 MQTT → Node-RED → webhook

```
[ MQTT in: tent/+/sensors ]
        ▼
[ function: normalize to Verdant payload, set source='node_red_bridge' ]
        ▼
[ http request: POST {{verdant_ingest_url}} ]
```

Source tag: `node_red_bridge` (or `esp32_mqtt_bridge` when the upstream
device is an ESP32 publishing over MQTT).

### 8.5 Raspberry Pi bridge

Long-running Python script on a Pi reads I²C / serial sensors, batches every
N seconds, POSTs to the webhook with `source: "pi_bridge"`. Retries with
exponential backoff. Never stores credentials beyond the Pi.

---

## 9. Validation

This is a docs-only change.

- ✅ Markdown lint if available.
- ✅ No production code changes.
- ✅ No schema changes.
- ✅ No new dependencies.

---

## 10. Recommended next implementation prompt

> Implement the Verdant V1 generic authenticated sensor ingest webhook.
>
> Scope:
> 1. Supabase Edge Function `ingest-sensor-reading` matching the §5 contract
>    in `docs/v1-sensor-integration-scope.md`.
> 2. Per-tent ingest token table + RLS (token never leaves server; never
>    exposed to client code).
> 3. Idempotent insert into `sensor_readings` keyed by
>    `(tent_id, source, captured_at, metadata.device_id)`.
> 4. Strict source allow-list from §3 (reject unknown sources with 400).
> 5. Pure validator in `src/lib/sensorIngestRules.ts` with full Vitest
>    coverage: happy path, missing/invalid fields, future timestamp, empty
>    metrics, unknown source, duplicate dedupe, tent ownership failure.
> 6. UI source badges for the new sources in the timeline + freshness card,
>    reusing the existing badge pattern from Gate 1B/2A.
>
> Hard constraints (mirrors §4): read-only ingest, no device control, no
> automation, no alerts created by ingest, no Action Queue rows created by
> ingest, no AI Doctor in the ingest path, no client-trusted `user_id`,
> no `service_role` in client code, no long-running MQTT subscriber, no
> partner cloud polling.
>
> Validation: full Vitest suite green, targeted ingest tests, edge function
> deploy check, manual smoke POST with curl against a real tent token.
>
> Out of scope (do not add): MQTT Edge subscriber, HA OAuth UI, device
> control, setpoints, partner polling, brand dashboards, first-party
> firmware. Any of these requires its own scope doc first.

---

*End of scope. Bridge patterns and partner integrations are deliberately
deferred behind the single webhook surface.*
