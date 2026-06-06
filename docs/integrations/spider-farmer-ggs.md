# Spider Farmer GGS Integration (Read-Only)

**Status:** Mapping rules + documentation only. No transport
connection, no UI, no writes, no device control.

Verdant's Spider Farmer GGS support is **strictly read-only**. We
ingest sensor readings that arrive through a local bridge and turn
them into Verdant sensor truth. We do not — under any circumstance
— send commands to Spider Farmer hardware.

## Hard rules

- ❌ No light control, schedule writes, dimming, or on/off commands.
- ❌ No fan/exhaust control or speed writes.
- ❌ No setpoint writes (temperature, humidity, VPD, CO₂, etc.).
- ❌ No firmware, calibration, or configuration writes back to the
  device.
- ❌ No MQTT publish from Verdant to the GGS controller or any
  Spider Farmer topic.
- ✅ Read normalized readings only.
- ✅ Surface fan/light state as **context** for AI Doctor; never as
  a control affordance.

If a future phase ever introduces guardrailed control, it must go
through Verdant's existing safety progression
(`observe-only → approval-required → simulation → guardrailed
automation`) and is out of scope for this integration.

## Transport vs. Source

MQTT, Home Assistant, and local bridges are **transport** layers.
They are not Verdant's source-truth label.

Source-truth labels remain governed by
[`docs/sensor-truth-rules.md`](../sensor-truth-rules.md). For Spider
Farmer GGS specifically, the normalizer in
`src/lib/spiderFarmerGgsMappingRules.ts` resolves the `source`
field as follows:

| Condition                                         | `source`  |
| ------------------------------------------------- | --------- |
| Payload is not an object                          | `invalid` |
| `captured_at` is malformed or in the future > 5m | `invalid` |
| No readings could be mapped                       | `invalid` |
| `captured_at` missing entirely                    | `stale`   |
| `captured_at` older than 15 minutes               | `stale`   |
| Otherwise                                         | `live`    |

Unknown / unmappable payloads **never** resolve to `live`.

## Supported readings

The normalizer accepts these keys (with common aliases):

- `temp_f`, `temp_c`
- `humidity`
- `vpd_kpa`
- `ppfd`
- `co2_ppm`
- `soil_water_content`
- `soil_ec`
- `soil_temp_f`, `soil_temp_c`
- `ph` (optional, surfaced as warning if outside 3.0–9.0)

### Unit conversion

Celsius ↔ Fahrenheit conversion only happens when the payload
includes an **explicit** `unit` field (`"C"` or `"F"`). Ambiguous
payloads are left as-is; we do not guess.

### Validation warnings

The normalizer emits `warnings` (never throws) for:

- `humidity_out_of_range` (RH outside 0–100)
- `vpd_implausible`
- `ppfd_negative`, `ppfd_implausible_high`
- `co2_negative`, `co2_implausible_high`
- `soil_water_content_out_of_range`
- `soil_ec_implausible`
- `ph_out_of_realistic_range`
- `captured_at_missing`, `captured_at_invalid`, `captured_at_future`
- `reading_stale`
- `no_readings_mapped`
- `payload_not_object`

Out-of-range values are **dropped** from `readings` so a downstream
gauge cannot accidentally render a healthy number from a bad
sample.

## Output contract

```ts
interface SpiderFarmerGgsDraft {
  provider: "spider_farmer_ggs";
  transport: "mqtt" | "home_assistant" | "bridge" | "unknown";
  source: "live" | "stale" | "invalid";
  captured_at: string | null;
  tent_id: string | null;
  confidence: number;            // 0..0.9
  readings: { /* dropped if invalid */ };
  context: { fan_state?: string; light_state?: string };
  raw_payload: unknown;          // verbatim
  warnings: string[];
}
```

The original payload is preserved verbatim under `raw_payload` for
audit. The normalizer is a pure function — same input + same `now`
produces the same output.

## Out of scope (for now)

- MQTT client connection in Verdant.
- Home Assistant connector wiring.
- Persistence into `sensor_readings`.
- UI surfaces (dashboard cards, setup wizard, settings entry).
- Any Action Queue side effects.

When those phases land, they must each follow
`docs/sensor-integration-migration-checklist.md`.
