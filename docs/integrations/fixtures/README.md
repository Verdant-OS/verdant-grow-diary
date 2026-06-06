# Spider Farmer GGS — synthetic sample payloads

These fixtures live at
`docs/integrations/fixtures/spider-farmer-ggs-sample-payloads.json`
and are consumed by
`src/test/spider-farmer-ggs-sample-payloads.test.ts`.

## What they are

- **Synthetic** payloads hand-crafted to exercise the
  `normalizeSpiderFarmerGgsPayload` rules.
- Shaped like the canonical MQTT-to-Verdant adapter contract
  documented in [`spider-farmer-ggs.md`](./spider-farmer-ggs.md).
- Used only for read-only mapping tests.

## What they are NOT

- **Not** real exports from any Spider Farmer hardware.
- **Not** captured from a live bridge, MQTT broker, or Home
  Assistant instance.
- **Not** authoritative for source classification — Verdant
  re-derives `source`, `received_at`, `confidence`, and
  `warnings` from data quality. The `source` / `confidence`
  fields embedded in the samples are the bridge's
  self-assessment and are intentionally allowed to disagree
  with the normalizer's verdict.
- **Not** a control or write surface. No sample contains
  device commands, setpoints, or write characteristics.

## Safety

Fixtures contain only:

- the synthetic provider id `spider_farmer_ggs`
- placeholder controller ids (`ggs-fixture-00x`)
- placeholder tent ids (`tent-demo-x`)
- synthetic frame markers under `raw_payload`

They never contain real BLE MAC addresses, bearer tokens,
bridge tokens, service-role keys, or write/control language.
A static safety test enforces this.

## Coverage

| Sample id              | Exercises                                  |
| ---------------------- | ------------------------------------------ |
| `live_clean_mqtt`      | Happy-path live classification             |
| `stale_old_reading`    | 15-minute stale threshold                  |
| `invalid_timestamp`    | Bad `captured_at` → `invalid`, never fresh |
| `unit_mismatch`        | Explicit unit mismatch does not fabricate  |
| `numeric_strings_mqtt` | MQTT-style stringified numerics            |
