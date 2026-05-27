# Using ESP32 with Verdant

ESP32 is supported as a **DIY sensor source** for Verdant by POSTing readings
to Verdant's existing **generic webhook ingest** endpoint. Verdant does **not**
ship or maintain firmware, no device onboarding UI exists, and there is no
Verdant-hosted MQTT subscriber. You build the device; Verdant gives it a safe,
read-only home for its readings.

> **Read-only.** ESP32 readings flow *into* Verdant. They never trigger
> device control, automation, alerts, the Action Queue, or AI Doctor logic
> by themselves.

---

## 1. Recommended architecture (direct HTTPS)

```text
ESP32 (Arduino or ESPHome)
    │  HTTPS POST (Bearer auth)
    ▼
Verdant webhook  →  sensor_readings  →  source badge + staleness + confidence
```

This is the simplest and most robust pattern for a single ESP32 with Wi-Fi.

## 2. MQTT architecture (bridge pattern)

Verdant does **not** subscribe to MQTT directly. Use a local bridge:

```text
ESP32  ──MQTT──▶  Local MQTT broker
                       │
                       ▼
              Node-RED / Raspberry Pi bridge
                       │  HTTPS POST
                       ▼
                 Verdant webhook
```

The bridge is responsible for batching, retrying, and normalizing payloads
before they reach Verdant.

---

## 3. Payload contract

### Required fields

| Field         | Type   | Notes                                                                |
|---------------|--------|----------------------------------------------------------------------|
| `tent_id`     | uuid   | Must belong to the authenticated user. RLS-verified.                 |
| `source`      | string | Must be an allow-listed source (see §5).                             |
| `captured_at` | string | ISO 8601 UTC. Cannot be more than 5 minutes in the future.           |
| `metrics`     | object | At least one finite numeric metric value.                            |

### Recommended optional fields (inside `metadata`)

- `device_id` — stable per-device identifier (e.g. `esp32-canopy-1`)
- `rssi` — Wi-Fi signal strength in dBm
- `battery_voltage` — if the node is battery-powered
- `calibration_offset` — last applied per-sensor offset
- `sensor_model` — e.g. `SHT31`, `BME280`, `DS18B20`
- `raw_value` — pre-calibration value for audit

Verdant stores `metadata` verbatim in `sensor_readings.raw_payload`. Do not
put secrets in it.

---

## 4. Supported `source` examples

These are accepted by the validation trigger today:

- `esp32_arduino`
- `esp32_arduino_sht31` *(spec alias: `esp32_sht31`)*
- `esp32_esphome`
- `esp32_mqtt_bridge`
- `home_assistant_bridge`
- `ha_forwarded`
- `pi_bridge`
- `node_red_bridge`
- `webhook_generic`

> A DIY soil node can use `esp32_arduino` with a `metadata.device_id` like
> `esp32-soil-zone1` to express the same intent as a project-specific
> source label.

Unknown sources are rejected at the database trigger — Verdant will never
silently coerce an unknown source to `live`.

---

## 5. Sample JSON payload

```json
{
  "tent_id": "uuid",
  "source": "esp32_arduino_sht31",
  "captured_at": "2026-05-26T20:00:00Z",
  "metrics": {
    "temp_f": 76.4,
    "humidity_percent": 58,
    "vpd_kpa": 1.18
  },
  "metadata": {
    "device_id": "esp32-canopy-1",
    "sensor_model": "SHT31",
    "rssi": -61
  }
}
```

Aliases (`temp_f`, `humidity_percent`, `soil_moisture`) are normalized to
the canonical metric names (`temperature_c`, `humidity_pct`,
`soil_moisture_pct`) before insert. See `docs/v1-sensor-ingest.md` for the
full contract.

---

## 6. Safety language

- **Source-tagged.** Every ESP32 row carries its `source` and renders with
  an ESP32/Webhook badge — never a generic "live" badge.
- **Never assumed perfect.** Range gates run on every metric; out-of-range
  values are rejected, not stored as zero or smoothed away.
- **Stale ≠ healthy.** Readings older than the freshness window render as
  stale in the timeline and freshness card.
- **No device control.** ESP32 data into Verdant is one-way. Verdant does
  not send commands back to your ESP32, your relays, your fans, your
  pumps, or your lights.
- **No autonomous Action Queue.** ESP32 readings never create Action Queue
  items on their own. Growers create actions explicitly.

---

## 7. Arduino sketch example

> Placeholders only. **Do not commit real Wi-Fi credentials or bearer
> tokens to source control.** Use a secrets header, NVS, or a build-time
> define.

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ─── Placeholders — replace at build time or from NVS ────────────────
const char* WIFI_SSID     = "<YOUR_WIFI_SSID>";
const char* WIFI_PASSWORD = "<YOUR_WIFI_PASSWORD>";
const char* VERDANT_URL   = "https://<your-project>.supabase.co/functions/v1/sensor-ingest-webhook";
const char* BEARER_TOKEN  = "<YOUR_SESSION_OR_BRIDGE_TOKEN>";
const char* TENT_ID       = "<TENT_UUID>";

void connectWifi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
}

void postReading(float tempF, float humidityPct, float vpdKpa) {
  if (WiFi.status() != WL_CONNECTED) connectWifi();

  StaticJsonDocument<512> doc;
  doc["tent_id"]     = TENT_ID;
  doc["source"]      = "esp32_arduino_sht31";
  doc["captured_at"] = "2026-05-26T20:00:00Z"; // use NTP in production
  JsonObject m = doc.createNestedObject("metrics");
  m["temp_f"]          = tempF;
  m["humidity_percent"] = humidityPct;
  m["vpd_kpa"]         = vpdKpa;
  JsonObject meta = doc.createNestedObject("metadata");
  meta["device_id"]    = "esp32-canopy-1";
  meta["sensor_model"] = "SHT31";
  meta["rssi"]         = WiFi.RSSI();

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(VERDANT_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + BEARER_TOKEN);
  int status = http.POST(body);
  // Handle non-2xx: log, back off, retry on next loop.
  http.end();
}
```

Use NTP (`configTime(...)` with a pool server) to keep `captured_at`
correct. A node with a wrong clock will look stale or future-dated.

---

## 8. ESPHome YAML example

```yaml
# Placeholders only — replace before flashing.
esphome:
  name: tent-canopy

wifi:
  ssid: "<YOUR_WIFI_SSID>"
  password: "<YOUR_WIFI_PASSWORD>"

sensor:
  - platform: sht3xd
    address: 0x44
    temperature:
      name: "Canopy Temperature"
      id: canopy_temp
    humidity:
      name: "Canopy Humidity"
      id: canopy_rh
    update_interval: 60s

http_request:
  useragent: "esphome-verdant"
  verify_ssl: true

interval:
  - interval: 60s
    then:
      - http_request.post:
          url: "https://<your-project>.supabase.co/functions/v1/sensor-ingest-webhook"
          headers:
            Content-Type: application/json
            Authorization: "Bearer <YOUR_SESSION_OR_BRIDGE_TOKEN>"
          json: |-
            root["tent_id"]     = "<TENT_UUID>";
            root["source"]      = "esp32_esphome";
            root["captured_at"] = id(homeassistant_time).now().strftime("%Y-%m-%dT%H:%M:%SZ");
            JsonObject m = root.createNestedObject("metrics");
            m["temp_f"]           = id(canopy_temp).state * 9.0 / 5.0 + 32.0;
            m["humidity_percent"] = id(canopy_rh).state;
            JsonObject meta = root.createNestedObject("metadata");
            meta["device_id"]    = "tent-canopy";
            meta["sensor_model"] = "SHT31";
```

If your ESPHome version cannot inline JSON, forward through Home Assistant
with a `rest_command` and post from there using `source: ha_forwarded`.

---

## 9. Troubleshooting

**Wi-Fi dropouts.** Reconnect inside the read loop, back off on repeated
failures, and don't block the sensor read on the POST. Buffer the last few
readings locally so a brief outage doesn't lose them.

**Wrong timestamps.** Use NTP. A clock that is more than 5 minutes ahead
will be rejected by the ingest. A clock far behind will make readings
appear stale immediately.

**Bad calibration.** Send `metadata.calibration_offset` and
`metadata.raw_value` so the audit trail survives. Re-calibrate any time
you move the probe or change the medium.

**Humidity drift.** Inexpensive RH sensors drift in saturated grow
environments. Cross-check against a second sensor every 2–4 weeks and
replace probes that read above 100% or pegged low.

**pH / EC analog isolation.** pH and EC probes require **galvanically
isolated** front-ends (e.g. Atlas Scientific EZO + isolator). Sharing
ground with other analog sensors corrupts both readings and can drift
slowly enough that the data looks plausible. Verdant range-gates pH and
EC, but it cannot detect a slow drift caused by missing isolation.

---

## See also

- `docs/v1-sensor-ingest.md` — full webhook contract and unit definitions.
- `docs/sensor-webhook-ingest.md` — Gate 2B alias and read-only safety statement.
- `docs/v1-sensor-integration-scope.md` — what is in/out of V1 sensor scope.
