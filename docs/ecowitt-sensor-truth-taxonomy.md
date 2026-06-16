# EcoWitt Sensor Truth Taxonomy

Status: Dry-run only. Real EcoWitt ingest is not enabled.
Last updated: 2026-06-16

## 1. Purpose

This document defines how EcoWitt readings must be labeled and interpreted inside Verdant.

It protects against:

- fake-live data
- stale-as-current data
- invalid-as-healthy data
- source blending

It applies to:

- the read-only dry-run preview at `/operator/ecowitt-tent-preview`
- future ingest planning
- QA and operator review
- any future EcoWitt bridge work

This document does not enable real ingest. See `docs/ecowitt-future-real-ingest-gates.md`.

## 2. Allowed source labels

| Label   | Meaning                                                 | Can be treated as live? | Can trigger real ingest?       | Operator rule                                                |
| ------- | ------------------------------------------------------- | ----------------------- | ------------------------------ | ------------------------------------------------------------ |
| live    | Real connected EcoWitt/bridge reading via approved path | Yes (only after gates)  | Only after all ingest gates    | Requires endpoint/auth/schema/freshness gates                |
| manual  | User- or operator-entered value                         | No                      | No                             | Must always retain manual label                              |
| csv     | Imported/exported file data                             | No                      | No                             | Historical context only; preserve file/import provenance     |
| demo    | Sample, fixture, or demo data                           | No                      | No                             | Must be visibly labeled; never powers alerts or live state   |
| stale   | Reading beyond freshness window                         | No                      | No (unless explicitly approved) | Must degrade confidence; not shown as current                |
| invalid | Bad or suspicious telemetry                             | No                      | No                             | Must block ingest; must never be classified as healthy       |

### Definitions

- **live** — Real connected EcoWitt/bridge reading from an approved ingest path. Requires approved endpoint, auth, schema, and freshness gates. May only be used after real ingest gates are approved. Must include captured timestamp, source identity, tent context, and confidence.
- **manual** — User-entered or operator-entered value. Must never be displayed as live. Useful for context and diary/snapshot review. May support AI context later, but must retain the manual label.
- **csv** — Imported/exported file data. Must never be displayed as live. Must preserve source and file/import context. May be used for historical review but not current live state.
- **demo** — Sample/fixture/demo data. Must never be treated as real. Must never power real alerts, real ingest, or real health claims. Must be visibly labeled.
- **stale** — Old reading beyond freshness window. Must not be shown as current. Must block sendability for current ingest unless a future phase explicitly supports historical ingest. Must degrade confidence.
- **invalid** — Bad or suspicious telemetry. Must block ingest. Must never be classified as healthy. Must surface reason codes.

## 3. Label handling rules

- manual / csv / demo / stale / invalid must never be upgraded to live.
- Invalid telemetry must never be called healthy.
- Stale telemetry must never be shown as current.
- Demo data must never be shown as real.
- CSV data must not be blended into live averages.
- Manual readings must stay manually labeled.
- Unknown source must be treated as degraded/blocked until classified safely.

## 4. Required reading metadata

Every future EcoWitt reading candidate must include:

- `source`
- `captured_at`
- `tent_id`
- `plant_id` when relevant
- `confidence`
- `device_identity` or safe source identifier
- `source_identity`
- `raw_payload` only if reviewed and redacted safely

Notes:

- Missing `captured_at` means freshness cannot be proven.
- Missing real `tent_id` blocks real ingest.
- Missing device/source identity weakens traceability.

## 5. Suspicious telemetry rules

Flag any of the following:

- Celsius shown as Fahrenheit
- µS/cm shown as mS/cm
- humidity stuck at 0 or 100
- soil moisture stuck at 0 or 100
- pH outside realistic range (if pH is later supported)
- impossible or out-of-range temperature
- stale timestamp displayed as current
- missing required metric
- unknown unit
- null required value
- non-numeric metric value

## 6. Required vs optional EcoWitt metrics

| Metric                   | Required for future ingest? | Labeling / safety rule                                |
| ------------------------ | --------------------------- | ----------------------------------------------------- |
| `air_temp_f`             | Required                    | Missing blocks real ingest; range/unit checked        |
| `humidity_pct`           | Required                    | Missing blocks real ingest; 0/100 stuck → invalid     |
| `vpd_kpa`                | Optional                    | Warning if missing; range checked if present          |
| `soil_water_content_pct` | Optional                    | Warning if missing; 0/100 stuck → invalid             |
| `soil_temp_f`            | Optional                    | Warning if missing; range checked if present          |
| `soil_ec`                | Optional                    | Warning if missing; unit mismatch (µS/cm vs mS/cm) → blocked or degraded |
| `co2_ppm`                | Optional                    | Warning if missing; range checked if present          |
| `ppfd`                   | Optional                    | Warning if missing; range checked if present          |

Rules:

- Missing required metric blocks real ingest.
- Missing optional metric is warning-only unless another rule makes it blocking.
- Optional metrics must still be range/unit checked if present.

## 7. Dry-run taxonomy hits

### Blocked reasons (prevent promotion)

- `source_invalid`
- `missing_required_metric:*`
- `invalid_reason:*`
- `stale_snapshot:*`
- `non_uuid_tent_id_preview_only`

### Warnings (require review)

- `source_degraded`
- `degraded_reason:*`
- `placeholder_device_identity`
- `optional_metric_missing:*`
- `manual_or_csv_not_live`

Blocked reasons prevent promotion. Warnings require review. Warnings may become blockers in a future real-ingest implementation depending on gate decisions.

## 8. Operator examples

- Manual reading with good values → usable as manual context, not live.
- CSV reading with old timestamp → historical context only, not current.
- Demo reading → demo only, never real.
- Stale live reading → stale label, not current.
- Invalid humidity stuck at 100% → invalid/degraded until proven real.
- Soil EC unit mismatch (µS/cm shown as mS/cm) → blocked or degraded depending on rule.

## 9. Related docs

- [Dry-run operator runbook](./ecowitt-dry-run-operator-runbook.md)
- [Dry-run safety checklist](./ecowitt-dry-run-safety-checklist.md)
- [Future real ingest gates](./ecowitt-future-real-ingest-gates.md)
- [Dry-run → real ingest promotion checklist](./ecowitt-dry-run-to-real-ingest-promotion-checklist.md)
