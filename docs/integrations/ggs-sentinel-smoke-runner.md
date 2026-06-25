# GGS Sentinel Smoke Runner

Operator-facing read-only smoke check for the Spider Farmer GGS 3-in-1
Soil Sensor Pro ingestion path. Confirms that a tent has recent canonical
sensor rows, correct vendor provenance, and a fresh snapshot before any
"live Sentinel" sign-off.

> **Read-only by contract.** The smoke runner NEVER writes alerts, NEVER
> creates Action Queue items, NEVER inserts diary entries, NEVER calls AI
> models, and NEVER issues device commands. It only reads existing
> `sensor_readings` rows plus the `get_latest_tent_sensor_snapshot` RPC.

## Data inputs

The smoke runner reads:

- `sensor_readings` rows for the selected `tent_id`, filtered to canonical
  GGS metrics (`soil_moisture_pct`, `ec`, `soil_temp_c`), within the last
  4 hours.
- `get_latest_tent_sensor_snapshot(_tent_id)` RPC result.

Each row is expected to preserve:

| Field         | Required | Why                                              |
| ------------- | -------- | ------------------------------------------------ |
| `metric`      | yes      | Must be a canonical GGS metric key.              |
| `value`       | yes      | Numeric, finite.                                 |
| `source`      | yes      | Must be a canonical source label (see below).    |
| `captured_at` | yes      | Used for freshness + ladder ordering.            |
| `tent_id`     | yes      | Scoping. Never cross-tent.                       |
| `plant_id`    | when relevant | Preserved if present; never rendered raw.  |
| `confidence`  | when present | Preserved by the read path.                  |
| `raw_payload` | yes      | Only `raw_payload.source_app` is read for vendor provenance. The full payload is **never** rendered. |

Allowed `source` labels: `live | manual | csv | demo | stale | invalid`.
Non-canonical labels (`ggs_live`, `ggs_csv`, etc.) are **forbidden** and
block sign-off.

## Safe to display

The smoke runner and its evidence view-model surface only these safe
fields:

- Check `id`, `label`, `status`, optional short `detail`.
- Verdict / state (e.g. `PASS_LIVE_SENTINEL_READY`, `BLOCKED_NO_EC`).
- Metric key (`soil_moisture_pct`, `ec`, `soil_temp_c`) + friendly label.
- Numeric `value` of the latest safe row.
- Canonical `source` label.
- Vendor provenance tag (`raw_payload.source_app`) only.
- `captured_at` and a friendly `ageLabel` (e.g. `"3m ago"`).
- Freshness state (`fresh | aging | stale | missing`).
- Next-step operator guidance strings.

## Never render

- `raw_payload` body or any nested keys other than `source_app`.
- Bridge tokens, device IDs, passkeys, API keys, service-role keys, or
  any other private credentials.
- Internal user IDs or private identifiers that are not already part of
  the public operator surface.
- Aggressive cultivation advice based on weak telemetry.

## Verdict ladder

States returned by `evaluateGgsSentinelReadiness`:

| State                                  | Meaning                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `PASS_LIVE_SENTINEL_READY`             | All canonical rows present, fresh, canonical source, vendor tagged.       |
| `BLOCKED_NO_GGS_ROWS`                  | No canonical GGS metric rows found in the window.                         |
| `BLOCKED_NO_SOIL_TEMP_C`               | Missing `soil_temp_c` row.                                                |
| `BLOCKED_NO_EC`                        | Missing `ec` row.                                                         |
| `BLOCKED_VENDOR_PROVENANCE_MISSING`    | At least one row lacks `raw_payload.source_app = "spider_farmer_ggs"`.    |
| `BLOCKED_SOURCE_NOT_CANONICAL`         | At least one row uses a forbidden non-canonical source label.             |
| `BLOCKED_STALE_READING`                | At least one row is past the freshness window.                            |
| `BLOCKED_RAW_PAYLOAD_RENDER_RISK`      | Reserved — a render path attempted to expose `raw_payload`.               |
| `BLOCKED_VALIDATION_ERROR`             | The runner itself failed (network, RPC error). Re-run after resolution.   |

Any `BLOCKED_*` state must be treated as "not ready". Missing, stale, or
invalid telemetry must **never** be displayed as healthy.

## Freshness rules

Freshness is computed per metric against `SPIDER_FARMER_GGS_STALE_MS`
(15 min by default):

- `fresh` — age ≤ 75% of the window.
- `aging` — age > 75% of the window but ≤ window.
- `stale` — age > window.
- `missing` — no row found for the metric.
- `invalid` — represented in the broader sensor read-path as `source = "invalid"`; the smoke runner refuses to mark it healthy.

## Evidence on the timeline

The derived evidence card is built by
`buildGgsSentinelEvidenceViewModel()` in
`src/lib/ggsSentinelEvidenceViewModel.ts` and rendered by
`src/components/GgsSentinelEvidenceTimelineCard.tsx`. The card:

- Is clearly labeled "GGS Sentinel evidence" and "Derived · read-only".
- Maps the smoke-runner state to a `PASS | BLOCKED | WARN | UNKNOWN`
  verdict.
- Lists the checks that produced the result.
- Shows freshness state and `captured_at`/age per metric.
- Surfaces a `Freshness warning` block when any metric is `stale` or
  `missing`.
- Surfaces rule-based next-step operator guidance such as:
  - "Check latest sensor ingestion"
  - "Confirm source label is canonical"
  - "Verify soil temperature row"
  - "Verify EC row"
  - "Refresh evidence"

The card **does not** create or mutate timeline events. When no
smoke-runner evaluation is available, the card is not rendered (empty
state is acceptable).

## Operator panel

`src/components/GgsSentinelSmokeRunnerPanel.tsx` is the operator-facing
runner. It shows:

- A clear status headline (`Not run yet` until the first run completes).
- The last-run verdict and state.
- A freshness summary across the canonical metrics.
- Rule-based next-step guidance for stale / missing / invalid rows.

All guidance is read-only. None of the buttons or links write data or
control devices.
