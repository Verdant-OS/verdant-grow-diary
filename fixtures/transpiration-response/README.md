# Transpiration Response — golden fixtures

Deterministic golden test fixtures for `src/lib/transpirationResponseRules.ts`.

Consumed by `src/test/transpiration-response-golden-fixtures.test.ts`.

## What they are

- **Synthetic** windows hand-crafted to pin the current skeleton behavior.
- Each case asserts a stable, observable subset of the result:
  - `status`
  - `confidence`
  - presence/null of the primary metric (`waterLossRatePerVpdPerSize`)
  - presence/null of the supporting metric (`waterLossRatePerVpd`)
  - presence/null of the soil-moisture proxy metric
  - sorted `warnings`
  - sorted `confidenceReasons`

## What they are NOT

- **Not** real grow data.
- **Not** sourced from any live sensor, load-cell, controller, or grower.
- **Not** a UI fixture. The skeleton has no UI, no charts, and no
  Supabase wiring.
- **Not** authoritative for numeric metric values. Numeric values are
  derived by the pure rules module and are intentionally not pinned in
  the fixtures so that future precision changes do not cause noisy diffs.
- **Not** a control or write surface. No fixture contains alerts,
  Action Queue items, device commands, or automation hooks.

## Safety

The fixtures contain only:

- synthetic `windowId`s (`golden-N`)
- placeholder `plantId` / `tentId` values
- synthetic weights and VPD readings

They never contain real sensor payloads, raw provenance dumps, bearer
tokens, bridge tokens, service-role keys, BLE MAC addresses, or any
write/control language. The static safety test on the rules module
enforces that the skeleton itself cannot reach React, Supabase, alerts,
Action Queue, AI Doctor, or device-control modules.

## Coverage

| Case id | Exercises |
| ------- | --------- |
| `valid_load_cell_with_plant_weight_kg` | Happy-path high confidence |
| `valid_manual_with_plant_weight_kg`    | Manual weight → medium confidence |
| `valid_weight_no_size_proxy`           | Primary null, supporting present, `size_unnormalized` |
| `missing_vpd`                          | No VPD readings → insufficient |
| `unrealistic_vpd`                      | VPD outside realistic band → insufficient |
| `stale_load_cell_window`               | End weight older than staleness threshold |
| `weight_jump_only_boundary`            | Boundary unreliable → insufficient |
| `end_weight_greater_than_start`        | Unexplained weight gain → invalid |
| `soil_moisture_proxy_path`             | Soil moisture parked → never produces weight metrics |
