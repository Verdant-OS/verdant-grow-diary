# Sensor ingest provenance safety

Verdant keeps **sensor truth** separate from **integration provenance**.

## Canonical `sensor_readings.source`

`sensor_readings.source` is intentionally small and must stay one of:

```text
live
manual
csv
demo
stale
invalid
```

These values describe the trust/state class Verdant should use when rendering source badges, freshness warnings, and AI Doctor context. They are not vendor names, transports, protocols, bridge names, app names, or ingestion methods.

## Provenance belongs outside `source`

Vendor and transport details belong in `raw_payload` or a future provenance registry, for example:

```json
{
  "source": "live",
  "raw_payload": {
    "source_app": "spider_farmer_ggs",
    "transport": "api",
    "vendor": "spider_farmer",
    "external_device_id": "redacted-device-id"
  }
}
```

```json
{
  "source": "live",
  "raw_payload": {
    "source_app": "raspberry_pi_bridge",
    "transport": "mqtt",
    "bridge": "tent_bridge_01"
  }
}
```

```json
{
  "source": "csv",
  "raw_payload": {
    "source_app": "spider_farmer_ggs",
    "transport": "csv_export",
    "vendor": "spider_farmer"
  }
}
```

## Non-canonical examples

Do **not** write these into `sensor_readings.source`:

```text
api
mqtt
mqtt_esp32
home_assistant
pi_bridge
raspberry_pi_bridge
esp32_bridge
webhook
ble
cron
import
csv_import
file_import
spider_farmer_ggs
ggs_api
ggs_export
ecowitt
unknown
```

Use the closest canonical source instead:

| Ingest path | Canonical `source` | Provenance location |
|---|---:|---|
| Spider Farmer GGS API | `live` | `raw_payload.source_app = "spider_farmer_ggs"`, `raw_payload.transport = "api"` |
| Raspberry Pi MQTT bridge | `live` | `raw_payload.source_app = "raspberry_pi_bridge"`, `raw_payload.transport = "mqtt"` |
| ESP32 MQTT bridge | `live` | `raw_payload.source_app = "esp32_bridge"`, `raw_payload.transport = "mqtt"` |
| Home Assistant webhook | `live` | `raw_payload.source_app = "home_assistant"`, `raw_payload.transport = "webhook"` |
| Spider Farmer CSV export | `csv` | `raw_payload.source_app = "spider_farmer_ggs"`, `raw_payload.transport = "csv_export"` |
| Grower-entered Quick Log | `manual` | `raw_payload.source_app = "manual_quick_log"`, `raw_payload.transport = "manual_entry"` |

## Health is not a source property

Do not add fields such as `treat_as_healthy` to a source registry. A reading is not healthy just because it came from `live` or `mqtt`.

Health/trust requires validation of:

- timestamp freshness
- metric range
- unit sanity
- source class
- confidence
- suspicious stuck values
- stale or invalid telemetry flags

A live reading can still be invalid or stale.

## Schema posture

No schema change is required for this slice.

Future schema work may introduce an `sensor_integrations` or `sensor_devices` table, but it must not expand canonical `sensor_readings.source`. The source label remains the trust/state class; provenance remains metadata.

## Stop-ship checks

A migration or ingest path should be rejected if it:

- adds `mqtt`, `api`, `home_assistant`, `pi_bridge`, vendor names, or `unknown` as canonical `source` values
- treats a source as healthy without validating timestamp/range/unit/freshness
- marks demo, stale, invalid, or unknown telemetry as healthy
- stores service tokens, passkeys, or private bridge credentials in rendered UI
- weakens RLS or writes sensor rows directly from client UI
