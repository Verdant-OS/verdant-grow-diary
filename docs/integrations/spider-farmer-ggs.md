# Spider Farmer GGS Integration (Experimental, Read-Only)

**Status:** Experimental read-only GGS-compatible bridge contract.
Mapping rules + documentation only. No transport connection, no UI,
no writes, no device control. **Not production-ready.**

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
| `captured_at` is malformed or in the future > 5m  | `invalid` |
| No readings could be mapped                       | `invalid` |
| `captured_at` missing entirely                    | `stale`   |
| `captured_at` older than 15 minutes               | `stale`   |
| Otherwise                                         | `live`    |

Unknown / unmappable payloads **never** resolve to `live`. A missing
`captured_at` never silently inherits "now" — the draft stays
degraded with `captured_at_missing`.

## Supported readings

The normalizer accepts these keys (with common aliases):

- `temp_f`, `temp_c` (dropped + warned if outside 14–130 °F / -10–55 °C)
- `humidity`
- `vpd_kpa`
- `ppfd`
- `co2_ppm`
- `soil_water_content`
- `soil_ec`
- `soil_temp_f`, `soil_temp_c` (bounds enforced)
- `ph` (optional, surfaced as warning if outside 3.0–9.0)

Numeric string values (e.g. `"78.4"`) are normalized only when they
parse cleanly with no trailing units; whitespace-only strings and
ambiguous values (`"78F"`, `"warm"`) are ignored.

### Unit conversion

Celsius ↔ Fahrenheit conversion only happens when the payload
includes an **explicit** `unit` field (`"C"` or `"F"`). Ambiguous
payloads are left as-is; we do not guess. Converted values are
range-checked before being added.

### Validation warnings

The normalizer emits `warnings` (never throws). Warnings are
returned in deterministic (sorted) order. Possible values:

- `humidity_out_of_range`
- `vpd_implausible`
- `ppfd_negative`, `ppfd_implausible_high`
- `co2_negative`, `co2_implausible_high`
- `soil_water_content_out_of_range`
- `soil_ec_implausible`
- `temp_f_out_of_range`, `temp_c_out_of_range`
- `soil_temp_f_out_of_range`, `soil_temp_c_out_of_range`
- `ph_out_of_realistic_range`
- `captured_at_missing`, `captured_at_invalid`, `captured_at_future`
- `reading_stale`
- `no_readings_mapped`
- `payload_not_object`

Out-of-range values are **dropped** from `readings` so a downstream
gauge cannot accidentally render a healthy number from a bad
sample.

## Canonical MQTT → Verdant adapter contract

Any external bridge (ESP32 firmware, Home Assistant automation,
Raspberry Pi script) that wants to feed Verdant **must** emit
objects shaped like this. Verdant ingests these read-only and
normalizes them through `normalizeSpiderFarmerGgsPayload`.

```ts
interface SpiderFarmerGgsAdapterMessage {
  provider: "spider_farmer_ggs";
  transport: "mqtt" | "home_assistant" | "bridge";
  source: "live" | "stale" | "invalid"; // bridge's self-assessment; Verdant re-derives
  captured_at: string; // ISO-8601 UTC at the device
  received_at: string; // ISO-8601 UTC at the bridge
  tent_id: string | null;
  controller_id: string | null; // stable per physical GGS controller
  confidence: number; // 0..1
  readings: {
    temp_f?: number; temp_c?: number;
    humidity?: number;
    vpd_kpa?: number;
    ppfd?: number;
    co2_ppm?: number;
    soil_water_content?: number;
    soil_ec?: number;
    soil_temp_f?: number; soil_temp_c?: number;
    ph?: number;
  };
  raw_payload: unknown; // verbatim bridge frame, for audit
}
```

Verdant **re-derives** `source`, `received_at`, `confidence`, and
`warnings` from data quality. The bridge's self-assessment is
informational only.

## Output contract (Verdant draft)

```ts
interface SpiderFarmerGgsDraft {
  provider: "spider_farmer_ggs";
  transport: "mqtt" | "home_assistant" | "bridge" | "unknown";
  source: "live" | "stale" | "invalid";
  captured_at: string | null;
  received_at: string;             // when Verdant normalized it
  tent_id: string | null;
  controller_id: string | null;
  confidence: number;              // 0..0.9
  readings: { /* dropped if invalid */ };
  context: { fan_state?: string; light_state?: string };
  raw_payload: unknown;            // verbatim
  warnings: string[];              // sorted, deterministic
}
```

The original payload is preserved verbatim under `raw_payload` for
audit. The normalizer is a pure function — same input + same `now`
produces the same output.

## Firmware / PlatformIO

No firmware source, PlatformIO project, or ESP32 binary ships in
this repository. Any companion firmware lives in an external
"GGS-compatible bridge" project and is **out of scope here**.

If a reference firmware is published separately, it must follow
these rules before it can claim Verdant compatibility:

- Status string must read **"experimental read-only
  GGS-compatible bridge"** — never "production-ready".
- BLE peer MACs must be placeholders such as
  `AA:BB:CC:DD:EE:01` (leaf), `AA:BB:CC:DD:EE:02` (gateway),
  `AA:BB:CC:DD:EE:03` (root). No real hardware MACs in tree.
- Numeric placeholders must be valid C++ literals (e.g. `0x00`,
  `0xAB`) — never `0xXX`, which does not compile.
- `platformio.ini` must define real `[env:leaf]`, `[env:gateway]`,
  and `[env:root]` sections with `src_filter` pointing at files
  that exist; `pio run -e leaf -e gateway -e root` must succeed.
- Required libraries (e.g. `bblanchon/ArduinoJson@^7`, `NimBLE-Arduino`)
  must be listed under `lib_deps`.
- OTA must be either disabled in the default example
  (`upload_protocol = esptool`) or require an `OTA_PASSWORD` build
  flag with no default value committed.
- Firmware must publish only — it must not subscribe to any GGS
  control topic or expose write characteristics.

## Out of scope (for now)

- MQTT client connection in Verdant.
- Home Assistant connector wiring.
- Persistence into `sensor_readings`.
- UI surfaces (dashboard cards, setup wizard, settings entry).
- Any Action Queue side effects.
- Companion firmware / PlatformIO build.

When those phases land, they must each follow
`docs/sensor-integration-migration-checklist.md`.
