# V1 Sensor Ingest — Generic Webhook

Verdant V1 sensor integration is **read-only, hardware-neutral, and authenticated**.
All live or near-live readings — from ESP32, ESPHome, Arduino, Home Assistant,
Node-RED, Raspberry Pi, custom scripts, or MQTT bridge setups — enter Verdant
through one endpoint:

```
POST  /functions/v1/sensor-ingest-webhook
Authorization: Bearer <supabase_auth_jwt>
Content-Type:  application/json
```

> **Safety statement.** This endpoint is **read-only**. It does **not** trigger
> AI, alerts, the Action Queue, automation, or device control. Hardware and
> partner clouds collect the data; Verdant turns that data into plant memory,
> source-tagged sensor truth, and grower-controlled context.

---

## 1. Payload contract

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
    "rssi": -61,
    "battery_voltage": 4.1
  }
}
```

### Required fields

- `tent_id` (uuid) — must be a tent owned by the authenticated user.
- `source` — must be one of the allowed labels in §3.
- `captured_at` (ISO 8601) — rejected if more than 5 minutes in the future.
- `metrics` — must contain **at least one** valid metric.

### Metric aliases (input → canonical)

| Input alias                       | Canonical metric  | Valid range  |
|-----------------------------------|-------------------|--------------|
| `temp_c` / `temperature_c`        | `temperature_c`   | −10..60 °C   |
| `temp_f`                          | `temperature_c`   | 14..140 °F   |
| `humidity_pct` / `humidity_percent` | `humidity_pct`  | 0..100 %     |
| `vpd_kpa`                         | `vpd_kpa`         | 0..5 kPa     |
| `co2_ppm`                         | `co2_ppm`         | 250..5000    |
| `ph`                              | `ph`              | 3..10        |
| `ec` / `ec_ms_cm`                 | `ec`              | 0..10 mS/cm  |
| `ppfd`                            | `ppfd`            | 0..2500 µmol |

- Empty / null / blank values are **silently omitted** — they are never persisted as `0`.
- Out-of-range values are **rejected per-metric** and echoed in the response's `rejected[]`.
- Unknown alias keys are skipped (and reported in `skipped[]`).

### Response

```json
{
  "ok": true,
  "inserted": 7,
  "skipped_duplicate": 0,
  "rejected": [],
  "fingerprint": "…"
}
```

- `200` — at least one row inserted (or all rows were duplicates).
- `400` — payload structurally invalid or no valid metrics.
- `401` — missing/invalid bearer token.
- `403` — tent does not belong to the authenticated user.

---

## 2. Auth & ownership

- Bearer **must** be a Supabase Auth JWT for the user who owns the tent.
- The endpoint **ignores** any `user_id` in the request body. The DB column
  defaults to `auth.uid()`; RLS enforces ownership.
- Tent ownership is verified server-side before insert (clear `403` instead
  of a generic insert failure).
- No service-role key is used in this function.

> **Direct ESP32 → webhook**: V1 expects a small bridge (Pi / Node-RED /
> Home Assistant / custom script) running on a user-owned host to hold the
> JWT and refresh it. Long-lived per-tent programmatic tokens are a
> deliberate **V1.5** follow-up — they require new schema and review.

---

## 3. Supported `source` labels

Historical / device-specific (back-compat):

```
webhook_generic        — anything posting directly
pi_bridge              — Raspberry Pi forwarder
node_red_bridge        — Node-RED flow
esp32_arduino          — ESP32 with Arduino sketch
esp32_arduino_sht31    — ESP32 + SHT31 sensor
esp32_esphome          — ESPHome firmware
esp32_mqtt_bridge      — ESP32 → MQTT broker → bridge → webhook
home_assistant_bridge  — HA rest_command / automation
ha_forwarded           — forwarded from HA add-on or script
```

Contract-aligned generic transport labels (V1.1+, see
`docs/sensor-ingest-payload-contract.md`):

```
ecowitt   — EcoWitt gateway / station bridge
mqtt      — Generic MQTT broker → local bridge → webhook
csv       — Bulk historical CSV import
webhook   — Generic bridge / custom script
```

Vendor lineage (e.g. `vendor: "ecowitt"` with `source: "mqtt"`) travels in
the optional top-level `vendor` field and is preserved in
`raw_payload.vendor`. It is **never** used for auth, ownership, or
routing.

Unknown sources are rejected with `400 invalid source: <value>`. The label
is preserved verbatim on the inserted row.

---

## 4. Source badges in the UI

The Plant/Tent sensor timeline renders every reading with a visible badge
derived from `source`:

| `source`                  | Badge              |
|---------------------------|--------------------|
| `manual`                  | Manual reading     |
| `webhook_generic`         | Webhook            |
| `pi_bridge`               | Pi bridge          |
| `node_red_bridge`         | Node-RED bridge    |
| `esp32_arduino` / `esp32_arduino_sht31` | ESP32 |
| `esp32_esphome`           | ESPHome            |
| `esp32_mqtt_bridge`       | MQTT bridge        |
| `home_assistant_bridge` / `ha_forwarded` | Home Assistant |

Stale readings (no fresh row within the freshness window per tent/source)
are visually distinguished. Readings are **never** labeled "live" unless
the source and freshness support that claim.

---

## 5. Example: ESP32 (Arduino) direct POST

```cpp
HTTPClient http;
http.begin("https://<project>.functions.supabase.co/sensor-ingest-webhook");
http.addHeader("Authorization", "Bearer " + jwt);
http.addHeader("Content-Type", "application/json");
String body = "{\"tent_id\":\"...\",\"source\":\"esp32_arduino_sht31\","
              "\"captured_at\":\"2026-05-26T20:00:00Z\","
              "\"metrics\":{\"temp_c\":24.6,\"humidity_pct\":58},"
              "\"metadata\":{\"device_id\":\"esp32-canopy-1\"}}";
http.POST(body);
```

## 6. Example: ESPHome `http_request`

```yaml
http_request:
  useragent: verdant-esphome

interval:
  - interval: 60s
    then:
      - http_request.post:
          url: https://<project>.functions.supabase.co/sensor-ingest-webhook
          headers:
            Authorization: !secret verdant_jwt
            Content-Type: application/json
          json:
            tent_id: !secret tent_id
            source: esp32_esphome
            captured_at: !lambda 'return id(sntp_time).now().strftime("%Y-%m-%dT%H:%M:%SZ");'
            metrics:
              temp_c: !lambda 'return id(sht_temp).state;'
              humidity_pct: !lambda 'return id(sht_hum).state;'
            metadata:
              device_id: canopy-esp-1
```

## 7. Example: Home Assistant `rest_command`

```yaml
# configuration.yaml
rest_command:
  verdant_ingest:
    url: https://<project>.functions.supabase.co/sensor-ingest-webhook
    method: post
    headers:
      Authorization: !secret verdant_jwt
      Content-Type: application/json
    payload: >-
      {
        "tent_id": "{{ tent_id }}",
        "source": "home_assistant_bridge",
        "captured_at": "{{ now().isoformat() }}",
        "metrics": {
          "temp_c": {{ states('sensor.tent_temp') | float }},
          "humidity_pct": {{ states('sensor.tent_humidity') | float }}
        },
        "metadata": { "device_id": "ha-{{ tent_id }}" }
      }
```

Trigger from an HA automation on a 60-second interval.

## 8. MQTT pattern (recommended)

Verdant does **not** run a hosted MQTT subscriber in V1. Instead, use a
local bridge:

```
ESP32 / ESPHome / Tasmota
        │  publish (MQTT)
        ▼
   MQTT broker
        │  subscribe (local)
        ▼
Node-RED  /  Raspberry Pi  /  HA add-on
        │  POST normalized JSON
        ▼
sensor-ingest-webhook (this endpoint)
```

The bridge handles MQTT locally and forwards the normalized payload —
exactly the same body documented in §1 — to the webhook. A persistent
hosted MQTT service is intentionally deferred.

---

## 9. Deduplication

Request-level dedupe: if a row with the same `(tent_id, source, captured_at,
metric, value)` already exists, that metric is skipped (`skipped_duplicate`
counter in the response). DB-level idempotency (a uniqueness constraint) is
**not** part of V1 — a small retry storm at exactly the same `captured_at`
is safe; a payload mutated between retries will be treated as a new reading.

---

## 10. Known limitations

- No long-lived per-tent ingest tokens yet (V1.5).
- No DB-level idempotency key — request-level dedupe only.
- No staleness backfill table; staleness is derived on read.
- No MQTT subscriber inside the edge function — bridge pattern required.
- No partner cloud polling, no device control, no automation, no alerts or
  Action Queue rows created from ingested data.

## Bridge client retry & backoff

See [`bridge-client-retry-guidance.md`](./bridge-client-retry-guidance.md) for Full Jitter exponential backoff defaults and bridge-client examples.
