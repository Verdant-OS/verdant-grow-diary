# Home Assistant + EcoWitt MQTT Bridge — V1 (adapter slice)

Verdant's local EcoWitt MQTT runner can consume EcoWitt entities that
Home Assistant publishes over MQTT, alongside the existing direct
`ecowitt2mqtt → Mosquitto → runner` path. This document covers the
adapter's contract; it does not claim always-on continuous-live support.

> **Status:** V1 pure-adapter slice. No hosted MQTT. No device control.
> No always-on end-user service. No grower-facing mapping UI. No schema,
> RLS, Edge Function, auth, or UI changes.

---

## Supported upstream modes

| upstream_mode              | Description                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ha_core_ecowitt_push`     | Preferred. Ecowitt gateway pushes to HA Core's built-in Ecowitt integration; HA republishes as native `sensor.*` entities. |
| `ha_ecowitt_iot_poll`      | HA polls the official EcoWitt Local integration.                                                                        |
| `ecowitt_custom_upload`    | Legacy direct `ecowitt2mqtt` → `ecowitt/grow` raw aggregate topic. Preserves existing runner behavior exactly.          |
| `unknown`                  | Never inferred. Must be set explicitly in the mapping file.                                                             |

`upstream_mode` MUST come from configuration. The adapter never infers
it from topic shape, entity id, unit string, or attribute contents.

## Preferred publishing path

For the two `ha_*` upstreams the preferred HA-side publisher is
**selective JSON** — an HA automation that publishes one MQTT message
per entity with the envelope:

```json
{
  "entity_id": "sensor.ecowitt_gw1200_outdoor_temperature",
  "state": "78.6",
  "unit_of_measurement": "°F",
  "last_updated": "2026-07-22T18:00:00.000Z",
  "device_class": "temperature"
}
```

**MQTT Statestream** is supported as a legacy-compatibility path only,
because Statestream splits state, attributes, and (optionally)
per-attribute fields across sibling topics. The adapter's
`HaStatestreamAssembler` deterministically reassembles them per
entity id; it never assumes one generic `/attributes` topic layout and
never guesses the `last_updated` timestamp.

## Exact entity mapping

Mapping is versioned and lives outside code. Example:
`fixtures/home-assistant-ecowitt-mqtt/example-mapping.json`.

Rules:

- Each mapping entry is `entity_id → { metric, tent_id, plant_id?, channel?, expected_unit? }`.
- Tent id is **never inferred** from entity name, friendly name, area,
  device, or topic.
- Plant id is optional and never auto-assigned.
- Unknown entities are ignored with reason `unknown_entity`.
- Control-shaped domains (`switch.`, `light.`, `fan.`, `humidifier.`,
  `climate.`, `cover.`, `media_player.`, `automation.`, `script.`,
  `button.`, `input_boolean.`, `input_button.`, `lock.`, `vacuum.`,
  `siren.`, `valve.`, `water_heater.`, `notify.`, `remote.`,
  `select.`, `input_select.`) are dropped with reason
  `control_shaped_entity_dropped`.
- No secrets, tokens, MQTT credentials, or bridge passwords may appear
  in mapping files. Store them in the runner's environment only.

## Freshness and retained-message behavior

- Live freshness window: **15 minutes** (`ECOWITT_MQTT_STALE_MS`).
- Future skew tolerance: **5 minutes** (`ECOWITT_MQTT_FUTURE_TOLERANCE_MS`).
- Valid but old source timestamp → `stale`, never `invalid`.
- Missing or malformed source timestamp → `invalid`.
- Future timestamp outside tolerance → `invalid`.
- **Retained message without a valid source timestamp → `invalid`.** The
  MQTT broker's message-receive time is preserved as
  `broker_received_at` for auditing but MUST NOT silently replace
  `captured_at`.
- The adapter never promotes `stale` or `invalid` telemetry to `live`.

## Provenance envelope

Every result carries an envelope. **Bridge names never appear in the
`source` field.**

```ts
{
  source: "live" | "stale" | "invalid",
  provider: "ecowitt",
  transport: "mqtt",
  bridge: "home_assistant" | "ecowitt2mqtt",
  upstream_mode: "ha_core_ecowitt_push" | "ha_ecowitt_iot_poll"
              | "ecowitt_custom_upload" | "unknown",
  topic: string,
  retained: boolean,
  captured_at: string | null,       // ISO
  received_at: string | null,       // runner clock
  broker_received_at: string | null, // audit only
  tent_id, plant_id, confidence,
  reason_codes: HaAdapterReason[],
  raw_payload: unknown              // redacted at report time, never at adapter time
}
```

If the persistent schema lacks dedicated provenance columns for
`bridge` / `upstream_mode` / `retained`, callers must pass them through
the existing webhook `metadata` / `raw_payload` mechanism. **No
migration is required or proposed by this slice.**

## VPD

- VPD is derived **only** through Verdant's existing Tetens
  implementation (`calculateAirVpdKpa` in `src/lib/vpdRules.ts`).
- Pairing requires: same tent, valid temperature, valid humidity, both
  live, timestamps within `HA_VPD_PAIRING_WINDOW_MS` (default 2 min).
- Stale or invalid inputs never derive VPD.
- HA-precomputed `vpd_kpa` is **not** treated as authoritative. Any
  mapped `vpd_kpa` entity is rejected at the adapter and re-derivation
  is required.

## Idempotency

`buildHaIdempotencyKey({bridge, upstream_mode, tent_id, metric, captured_at, value})`
returns a stable string. Retained-message replays and reconnect storms
of the same source-timestamp reading produce the same key. The runner
should pass this string as the existing webhook `Idempotency-Key`
header — no DB constraint or migration is added by this slice.

## MQTT safety

- The runner is **subscribe-only**. No `mqtt.publish` calls exist in
  this module or the runner. No command / set / service topics are
  handled. No Home Assistant `services/*` calls are made.
- Control-shaped entities are dropped, never round-tripped.
- Bridge tokens, MQTT usernames, MQTT passwords, and HA long-lived
  tokens are never logged. Dry-run remains the default. Live posting to
  `sensor-ingest-webhook` requires explicit mode + configured
  `VERDANT_BRIDGE_TOKEN`.

## Real end-to-end verification checklist

One tent, one operator, one real reading. Nothing else is claimed.

1. Configure the HA-side publisher (selective JSON preferred) for one
   Ecowitt temperature entity and one humidity entity in the same tent.
2. Copy `example-mapping.json`, replace the tent UUID, restrict the
   mapping to those two entities.
3. Confirm no control-domain entities are in the mapping.
4. Start the local runner in `--dry-run`. Confirm the printed report
   shows `source: "live"`, correct `tent_id`, `bridge: "home_assistant"`,
   `upstream_mode: "ha_core_ecowitt_push"`, matching `topic`, and
   `retained: false` for freshly-published messages.
5. Restart the broker and confirm the next message is classified
   `retained: true` **and** still respects the source timestamp — a
   retained message without a source timestamp must classify `invalid`.
6. Confirm derived VPD only appears when both temp and RH are live and
   within the 2-minute pairing window and share the same tent.
7. Only after items 1–6 pass, run the runner without `--dry-run` with a
   configured `VERDANT_BRIDGE_TOKEN`.

## Continuous-live claim

**Blocked.** V1 is a validated adapter slice. Verdant does not market
continuous live sync from Home Assistant until one full end-to-end
payload → dry-run → webhook → in-app provenance path has been proven
on real hardware for at least one operator, and the "no device
control" invariant has been re-verified against the entities in that
operator's mapping.
