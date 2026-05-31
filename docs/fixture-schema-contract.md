# Fixture Schema Contract

This contract describes the JSON shape used by `/fixtures/*.json`.
It is **not** a database schema. It triggers **no migrations**. It is read-only test/demo data.

## Required reading fields

Every sensor reading object in any fixture file MUST include:

| Field           | Type                          | Notes                                                                 |
|-----------------|-------------------------------|----------------------------------------------------------------------|
| `id`            | string                        | Deterministic, stable across runs. Prefix with fixture scope.        |
| `metric`        | string                        | e.g. `temp_c`, `rh_pct`, `vpd_kpa`, `ec_mScm`, `ph`.                 |
| `value`         | number \| null \| string      | `null` for missing; string only for invalid examples.                |
| `unit`          | string                        | Explicit. e.g. `C`, `F`, `%`, `kPa`, `mS/cm`, `pH`.                  |
| `captured_at`   | string (ISO 8601, UTC `Z`)    | Required. Missing → invalid example only.                            |
| `state`         | `"demo" \| "manual" \| "live" \| "stale" \| "invalid"` | Exactly one of the five. |
| `source_type`   | string                        | e.g. `demo_fixture`, `manual_snapshot`, `pi_bridge`, `home_assistant`. |
| `is_fixture`    | boolean                       | Always `true` in this kit.                                           |
| `fixture_scope` | string                        | e.g. `"one_tent_demo"`, `"bad_sensor_examples"`.                     |
| `confidence`    | number 0..1 \| `null`         | `null` for invalid/missing.                                          |
| `raw_payload`   | object \| `null`              | Echo of the source payload for debugging. No secrets.                |

## Rules

- **Deterministic IDs** — Same fixture must produce the same IDs on every load. No random/UUIDv4 at read time.
- **ISO timestamps** — All times UTC with trailing `Z`. No locale strings, no epoch ints.
- **Explicit units** — Never inferred. Mixed-unit cases must be explicit invalid examples.
- **No secrets** — No tokens, API keys, JWTs, bridge passwords, customer emails, or real names.
- **No live readings in demo files** — Demo fixtures only carry `state: "demo"` or `state: "manual"` (historic snapshots).
- **No executable payloads** — `raw_payload` is informational. It must not contain device commands, webhook URLs that mutate state, or relay instructions.
- **Fixture files do not write to live tables** — They are read-only inputs to the demo loop and tests.

## Referenced by

- `/fixtures/demo-grow-one-tent.json`
- `/fixtures/bad-sensor-data-examples.json`
- `/fixtures/demo-ai-doctor-cases.json`
