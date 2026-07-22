# Home Assistant + EcoWitt MQTT Bridge — V1 dry-run runner

Verdant's local EcoWitt MQTT runner can now consume EcoWitt entities that Home
Assistant publishes over MQTT while preserving the existing direct
`ecowitt2mqtt → Mosquitto → runner` route.

> **Status:** Home Assistant routes are integrated for local **dry-run only**.
> No hosted MQTT, no schema/RLS/Edge/auth/UI changes, no device control, and no
> continuous-live claim.

## Routes

| Route | Configuration | Behavior |
|---|---|---|
| Existing direct EcoWitt | No `HA_MQTT_MAPPING_PATH` | Existing `ecowitt_raw` runner behavior is preserved. |
| HA selective JSON | Mapping has `adapter_mode: "ha_json"` | One JSON envelope per HA sensor entity. Dry-run only. |
| HA MQTT Statestream | Mapping has `adapter_mode: "ha_statestream"` | Deterministically assembles state and sibling attribute topics. Dry-run only. |

## Config-only routing

The runner does **not** inspect an MQTT topic and guess which parser to use.
Routing is explicit:

1. If `HA_MQTT_MAPPING_PATH` is absent, the runner keeps the existing
   `ecowitt_raw` route and `ECOWITT_MQTT_TOPIC` behavior.
2. If `HA_MQTT_MAPPING_PATH` is present, the version-1 JSON config must declare:
   - `adapter_mode`: `ha_json` or `ha_statestream`
   - `mqtt_topic`: the exact MQTT subscription filter
   - `bridge`: `home_assistant`
   - `upstream_mode`: `ha_core_ecowitt_push` or `ha_ecowitt_iot_poll`
   - exact entity mappings
3. HA routes refuse to start unless `--dry-run` is present.

Example selective-JSON config:
`fixtures/home-assistant-ecowitt-mqtt/example-mapping.json`.

Example Statestream config:
`fixtures/home-assistant-ecowitt-mqtt/example-statestream-mapping.json`.

Run either HA route with:

```bash
HA_MQTT_MAPPING_PATH=fixtures/home-assistant-ecowitt-mqtt/example-mapping.json \
  bun run scripts/dev/ecowitt-mqtt-runner.ts --dry-run
```

The mapping file, not the topic shape, selects the adapter.

## Supported upstream modes

| `upstream_mode` | Meaning |
|---|---|
| `ha_core_ecowitt_push` | EcoWitt gateway pushes locally to HA Core's built-in EcoWitt integration. |
| `ha_ecowitt_iot_poll` | HA uses EcoWitt's local-poll integration. |

`ecowitt_custom_upload` remains the direct `ecowitt_raw` path and is not valid
inside a Home Assistant runner mapping. `unknown` is rejected for HA runner
configuration instead of being presented as trusted provenance.

## Selective HA JSON envelope

Preferred HA-side publishing uses one JSON object per entity:

```json
{
  "entity_id": "sensor.ecowitt_gw1200_outdoor_temperature",
  "state": "78.6",
  "unit_of_measurement": "°F",
  "last_updated": "2026-07-22T18:00:00.000Z",
  "device_class": "temperature"
}
```

The runner also accepts the boundary aliases `value` for `state` and `unit` for
`unit_of_measurement`. They are normalized immediately. It never fills a
missing source timestamp with broker receive time.

## Real MQTT Statestream assembly

The runner's `DeterministicHaStatestreamAssembler` supports Home Assistant's
sibling-topic shape:

```text
<prefix>/<domain>/<object_id>/state
<prefix>/<domain>/<object_id>/last_updated
<prefix>/<domain>/<object_id>/last_changed
<prefix>/<domain>/<object_id>/<attribute_name>
```

Example:

```text
homeassistant/sensor/ecowitt_gw1200_outdoor_temperature/state
homeassistant/sensor/ecowitt_gw1200_outdoor_temperature/last_updated
homeassistant/sensor/ecowitt_gw1200_outdoor_temperature/unit_of_measurement
homeassistant/sensor/ecowitt_gw1200_outdoor_temperature/device_class
```

Messages may arrive in any order. The assembler waits for state plus a source
timestamp and any required unit metadata before emitting a complete reading.
An aggregate `/attributes` JSON topic is accepted only for compatibility; it is
not required.

The MQTT packet's retained flag is captured from the **state** topic. A later
non-retained attribute topic cannot erase retained provenance. Identical
complete assemblies are suppressed deterministically.

## Exact entity mapping

Each entry is:

```text
entity_id → metric + tent_id + optional plant_id/channel + expected_unit
```

Rules:

- Tent and plant are never inferred from names, areas, devices, or topics.
- Duplicate entity mappings are rejected.
- Unknown entities are rejected by the adapter; they are never auto-assigned.
- `upstream_mode` is copied from configuration only.
- Control-shaped entities remain blocked by the pure adapter.
- Mapping files must not contain credentials, tokens, or private environment
  values.

## Freshness and retained messages

- Freshness window: **15 minutes**.
- Future skew tolerance: **5 minutes**.
- Valid and fresh → `live`.
- Valid but old → `stale`.
- Missing/malformed timestamp → `invalid`.
- Retained HA JSON without a source timestamp → `invalid`.
- Incomplete retained Statestream state remains pending and is never emitted as
  live until source timestamp metadata arrives.
- `broker_received_at` is audit context only and never replaces `captured_at`.

## VPD pairing

The runner caches validated live temperature and humidity readings by:

```text
tent_id + plant_id (when present) + configured channel
```

VPD is derived only when both readings:

- are live and valid;
- map to the same pairing identity;
- are within the adapter's two-minute pairing window.

Verdant's existing Tetens implementation remains authoritative. HA-precomputed
VPD is not trusted as a substitute.

## Idempotency

The pure adapter's reading is strengthened at the runner boundary. The runner
key includes:

```text
provider
bridge
upstream_mode
exact entity identity (or the sorted temp+RH pair for derived VPD)
tent_id
plant_id
channel
metric
captured_at
normalized value
canonical unit
```

This keeps exact replays stable while preventing two probes in the same tent
from colliding when they share a timestamp and value.

## Dry-run report

Each complete HA reading prints a redacted report containing:

- adapter and `upstream_mode`;
- source classification;
- provider, transport, bridge, topic, and retained flag;
- captured/received/broker timestamps;
- mapped tent/plant;
- normalized readings and idempotency keys;
- the explicit note that nothing was sent or stored.

Pending and duplicate Statestream events are logged without pretending a
reading was ingested.

## Safety boundary

- HA routes do not call the ingest webhook.
- No MQTT publish calls.
- No Home Assistant service calls.
- No direct Supabase writes.
- No alerts or Action Queue writes.
- No device commands or command-topic handling.
- Bridge tokens and MQTT passwords are not used by HA dry-run reports.

## Real verification gate

Before enabling any future HA webhook posting:

1. Capture one real EcoWitt entity through HA.
2. Confirm config-routed `ha_json` or `ha_statestream` selection.
3. Confirm fresh, stale, invalid, and retained behavior.
4. Confirm same-channel temperature/RH derives VPD only inside the pairing
   window.
5. Confirm exact replay yields the same idempotency key.
6. Confirm two soil channels cannot collide.
7. Confirm no MQTT publish or HA service call exists.
8. Then separately design and review the persistence boundary.

## Continuous-live claim

**Blocked.** Verdant can accurately say the HA adapters are wired into the local
runner for deterministic dry-run validation. It cannot claim continuous live
Home Assistant sync until a real end-to-end MQTT → adapter → webhook → durable
row → UI provenance test and restart/replay endurance test are complete.
