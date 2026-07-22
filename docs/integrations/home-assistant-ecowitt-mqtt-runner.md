# Home Assistant + EcoWitt MQTT Runner — Dry-Run Integration

Verdant's existing local EcoWitt MQTT runner supports three explicit paths:

| Path | Selection | Current capability |
|---|---|---|
| `ecowitt_raw` | `HA_MQTT_MAPPING_PATH` is absent | Existing direct EcoWitt normalization and validated webhook behavior remain unchanged. |
| `ha_json` | Mapping file declares `adapter_mode: "ha_json"` | Consumes selective Home Assistant JSON envelopes in dry-run mode. |
| `ha_statestream` | Mapping file declares `adapter_mode: "ha_statestream"` | Assembles Home Assistant Statestream sibling topics deterministically in dry-run mode. |

Home Assistant modes are local validation paths only. They do not call the
Verdant ingest webhook, write Supabase rows, create alerts or Action Queue
items, publish MQTT messages, or call Home Assistant services.

## Configuration is authoritative

Set one environment variable:

```bash
HA_MQTT_MAPPING_PATH=fixtures/home-assistant-ecowitt-mqtt/example-mapping.json
```

The version-1 JSON file must declare:

```json
{
  "version": 1,
  "adapter_mode": "ha_json",
  "mqtt_topic": "verdant/ecowitt/ha-json/#",
  "bridge": "home_assistant",
  "upstream_mode": "ha_core_ecowitt_push",
  "entities": []
}
```

Runner routing rules:

- The runner does not infer an adapter from topic shape.
- The runner does not accept `HA_MQTT_ADAPTER` or `HA_MQTT_TOPIC` routing
  overrides.
- `adapter_mode`, `mqtt_topic`, and `upstream_mode` come from the mapping file.
- `upstream_mode` must be `ha_core_ecowitt_push` or
  `ha_ecowitt_iot_poll` for Home Assistant runner modes.
- Exact entity-to-tent mappings remain mandatory. Tent, plant, and channel are
  never inferred from names or topics.
- Duplicate entities and malformed mappings fail startup.

Examples:

- Selective JSON:
  `fixtures/home-assistant-ecowitt-mqtt/example-mapping.json`
- Statestream:
  `fixtures/home-assistant-ecowitt-mqtt/example-statestream-mapping.json`

## Run selective HA JSON dry-run

```bash
HA_MQTT_MAPPING_PATH=fixtures/home-assistant-ecowitt-mqtt/example-mapping.json \
  bun run scripts/dev/ecowitt-mqtt-runner.ts --dry-run
```

A preferred message contains:

```json
{
  "entity_id": "sensor.ecowitt_gw1200_outdoor_temperature",
  "state": "78.6",
  "unit_of_measurement": "°F",
  "last_updated": "2026-07-22T18:00:00.000Z"
}
```

Boundary aliases `value` and `unit` are accepted and immediately normalized.
`captured_at` may be accepted as an explicit source timestamp alias, but broker
receive time is never used as a replacement for a missing source timestamp.

## Run HA Statestream dry-run

```bash
HA_MQTT_MAPPING_PATH=fixtures/home-assistant-ecowitt-mqtt/example-statestream-mapping.json \
  bun run scripts/dev/ecowitt-mqtt-runner.ts --dry-run
```

The runner delegates the actual wire assembly to Verdant's canonical
`HaStatestreamAssembler`, which consumes sibling topics such as:

```text
homeassistant/sensor/ecowitt_gw1200_outdoor_temperature/state
homeassistant/sensor/ecowitt_gw1200_outdoor_temperature/last_updated
homeassistant/sensor/ecowitt_gw1200_outdoor_temperature/unit_of_measurement
homeassistant/sensor/ecowitt_gw1200_outdoor_temperature/device_class
```

The runner adds readiness and replay handling around that assembler:

- state may arrive before or after attributes;
- source timestamp is required before a mapped reading is emitted;
- required temperature units must be present in the source topics or explicitly
  declared by the exact mapping;
- the MQTT packet retained flag comes from the state topic and is not erased by
  later attribute messages;
- identical complete assemblies are suppressed deterministically;
- a literal aggregate `/attributes` topic is not required.

## Freshness and retained-state rules

The existing EcoWitt freshness constants remain authoritative:

- valid and within 15 minutes → `live`;
- valid but older than 15 minutes → `stale`;
- future timestamp beyond five minutes → `invalid`;
- missing or malformed source timestamp → `invalid`;
- retained HA JSON without a source timestamp → `invalid`;
- retained Statestream state without a source timestamp remains pending and is
  never reported as live.

`received_at` and `broker_received_at` are audit metadata only.

## VPD pairing

The runner maintains a small in-memory cache for validated live temperature and
humidity readings. Pairing identity is:

```text
tent_id + plant_id when mapped + configured channel
```

VPD is derived only when the two readings:

- share that exact identity;
- are both live and valid;
- fall inside Verdant's two-minute pairing window.

The calculation stays in the existing `deriveVpdIfPaired` / Tetens rules. The
runner does not trust a Home Assistant precomputed VPD entity as authoritative.

## Idempotency

The runner preserves the canonical adapter `hav2` idempotency key. Its preimage
contains provider, bridge, upstream mode, exact entity identity, tent, optional
plant, channel, metric, source timestamp, normalized value, and canonical unit.

Consequences:

- exact reconnect/replay messages produce the same key;
- equal values from two soil channels do not collide;
- derived VPD has a stable identity based on its source temperature and
  humidity entities.

## Dry-run output

A complete reading prints a redacted report containing:

- adapter and configured upstream mode;
- `live`, `stale`, or `invalid` source classification;
- provider, transport, bridge, topic, retained flag, and timestamps;
- mapped tent and optional plant;
- canonical readings and idempotency keys;
- an explicit `posted: false` / nothing stored notice.

Pending and duplicate Statestream parts are logged as pending or duplicate, not
as successful ingestion.

## Safety and claim boundary

Home Assistant routes require `--dry-run`. Without it, startup is blocked.
`--sample` and `--invalid` remain raw EcoWitt route flags and are rejected when
an HA mapping is loaded.

Safe claim:

> Verdant can consume and validate EcoWitt sensor messages that Home Assistant
> publishes over MQTT through a config-routed local dry-run runner.

Blocked claim:

> Continuous live Home Assistant sync.

That claim stays blocked until a real hardware message passes MQTT → adapter →
validated webhook → durable row → UI provenance verification, including stale,
invalid, retained replay, restart, and duplicate checks.
