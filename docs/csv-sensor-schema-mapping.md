# CSV Sensor Schema Mapping

> Documentation only. CSV import is **not live data**. Imported readings
> are labeled `csv` (or whichever generic transport label the CSV
> represents) and must never be displayed as `live`.

## Allowed sources

CSV ingest payloads must set `source` to a value from the canonical
allow-list. Source is **not auth** — it is a transport/origin label
Verdant validates. The canonical labels include:

- `csv` — bulk historical CSV import
- `manual` — grower-entered values transcribed into CSV
- `ecowitt` — CSV exported from an EcoWitt gateway/station
- `mqtt` — CSV captured from an MQTT broker
- `webhook` — CSV captured from a generic webhook bridge
- Historical labels (back-compat): `webhook_generic`, `pi_bridge`,
  `node_red_bridge`, `esp32_arduino`, `esp32_arduino_sht31`,
  `esp32_esphome`, `esp32_mqtt_bridge`, `home_assistant_bridge`,
  `ha_forwarded`

`vendor` is **optional** and **lineage only**. Vendor is **not auth** —
it never affects authorization, ownership, routing, permissions,
`source`, `user_id`, or `tent_id`. It is preserved in `raw_payload` for
analytics and debugging.

## Column → normalized field

| CSV column (case-insensitive aliases)                | Normalized field        |
|------------------------------------------------------|-------------------------|
| `timestamp`, `captured_at`, `date_time`, `recorded_at` | `captured_at`          |
| `temp_f`, `temperature_f`, `air_temp_f`, `temp1f`    | `temp_f`                |
| `temp_c`, `temperature_c`, `air_temp_c`              | `temp_c` (or normalized to `temp_f` before storage) |
| `humidity`, `rh`, `humidity_pct`, `humidity1`        | `humidity`              |
| `co2`, `co2_ppm`                                     | `co2_ppm`               |
| `soilmoisture1`, `soil_water_content`, `vwc`         | `soil_water_content`    |
| `soil_ec`, `substrate_ec`                            | `soil_ec`               |
| `soil_temp`, `substrate_temp`                        | `soil_temp`             |
| `ppfd`                                               | `ppfd`                  |
| `reservoir_ec`                                       | `reservoir_ec`          |
| `reservoir_ph`                                       | `reservoir_ph`          |
| `source`                                             | `source` (validated against allow-list) |
| `vendor`                                             | `vendor` (lineage only) |

## Rules

- `source` MUST be one of the allow-listed canonical labels. Unknown,
  partial, or fuzzy values (`"eco"`, `"mq"`) are rejected.
- `source` matching is **trimmed and case-insensitive** at the ingest
  boundary: `" EcoWitt "` → `"ecowitt"`, `"MQTT"` → `"mqtt"`,
  `" WebHook "` → `"webhook"`, `" CSV "` → `"csv"`. Empty or
  whitespace-only values are rejected.
- `vendor` is lineage only. Trim non-empty vendor strings; drop
  empty/whitespace-only values. Vendor never changes `source`,
  `user_id`, `tent_id`, or ownership.
- ISO 8601 timestamps **with timezone** are preferred for
  `captured_at`. Naive local times should be converted before import.
- `raw_payload` should preserve the original CSV row values when
  available (untransformed string keys) so vendor lineage and
  unit-conversion provenance are auditable.
- CSV imports are **not live data**. The freshness/`live` label is
  derived on read; CSV rows must never render as `live`.

## Sample payloads

A minimal EcoWitt-shaped CSV sample lives at
[`samples/ecowitt-sensor-readings.csv`](./samples/ecowitt-sensor-readings.csv).

For the full payload contract (JSON shape, idempotency, dedupe,
auth rules), see
[`sensor-ingest-payload-contract.md`](./sensor-ingest-payload-contract.md).

For retry / backoff guidance for bridge clients posting CSV-derived
readings, see
[`bridge-client-retry-guidance.md`](./bridge-client-retry-guidance.md).
