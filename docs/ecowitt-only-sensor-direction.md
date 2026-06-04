# EcoWitt-Only Sensor Direction

**Status:** Active  
**Scope:** Verdant's current physical sensor path.

## Current sensor path

Verdant's active physical sensor direction is **EcoWitt-only**:

```
EcoWitt sensors (WH45 CO2/THP, WH31 temp/RH, WH51 soil moisture, …)
  → EcoWitt gateway / console (GW1100, GW2000, HP25xx, etc.)
  → EcoWitt custom upload  OR  Home Assistant EcoWitt integration
  → Verdant listener / bridge
  → Supabase `sensor_readings`
  → Dashboard / Alerts / AI Doctor / Action Queue
```

This replaces any earlier exploratory SwitchBot examples in copy, presets,
and tests. SwitchBot is **not** an active or planned integration.

## What's preserved

Verdant remains hardware-neutral at the architecture layer. The following
generic concepts are unchanged and supported:

- Manual readings (`source = manual`, optional `manual:<note>` device id)
- CSV import (`source = csv`)
- Demo / simulated data (`source = sim`, never displayed as Live)
- Stale / invalid quality flags
- Home Assistant bridges (`source = home_assistant_bridge` / `ha_forwarded`)
- MQTT bridges (`source = mqtt` / `esp32_mqtt_bridge`)
- Raspberry Pi bridges (`source = pi_bridge`)
- Generic webhook ingest (`source = webhook` / `webhook_generic`)
- ESP32 / ESPHome bridges

EcoWitt is the **only physical hardware example** shown in active copy.

## Manual device presets

Preset device notes shown in `ManualSensorReadingCard`:

- `ecowitt-wh45` — EcoWitt WH45 CO2/THP Monitor
- `ecowitt-wh31` — EcoWitt WH31 Temp/RH Sensor
- `ecowitt-wh51` — EcoWitt WH51 Soil Moisture Sensor
- `ecowitt-gateway` — EcoWitt gateway
- `sensorpush`, `pulse`, `ac-infinity`, `aroya-export`, `handheld-meter`,
  `smart-home-copy`, `memory` (generic, retained)

A manual reading with one of these notes is still labeled
`Manual reading · <note>` — it is **never** upgraded to Live.

## Safety guarantees

This direction does not change any safety contract:

- Manual readings never display as Live.
- Approval-required Action Queue is unchanged.
- No new schema, RLS, edge function, or auth changes.
- No device control. No automation. No `service_role` in client code.
- No new sensor integrations are added by this direction.

## Enforcement

A static safety scan keeps Verdant EcoWitt-only:

- Script: `scripts/assert-ecowitt-only-sensor-direction.mjs`
- CI: `.github/workflows/ecowitt-only-safety-scan.yml`
- Test: `src/test/ecowitt-only-sensor-direction.test.ts`

Any reintroduction of SwitchBot in source, docs, tests, fixtures, prompts,
or workflows fails CI.
