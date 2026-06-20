# Sensor Source Badges v1

Verdant treats sensor data as untrusted by default. **Unlabeled, stale,
demo, invalid, or unknown telemetry must never display as healthy / current /
live data**, in any surface, ever.

This document describes the v1 unified visibility layer:

- `src/lib/sensorSnapshotFreshnessRules.ts` — pure resolver
- `src/components/SensorSourceBadge.tsx` — reusable badge presenter (pre-existing)
- `src/components/SensorSnapshotCard.tsx` — read-only snapshot card presenter

It complements the existing `sensorSnapshotStatusContract`,
`SensorSourceBadge`, `TimelineSensorSourceBadge`, and timeline source
classification rules. The v1 resolver is additive — it does not replace
the existing per-surface adapters.

## Allowed source vocabulary

Top-level effective source is **locked** to:

```
live | manual | csv | demo | stale | invalid
```

Vendor / source-app lineage (`ggs_controller`, `ecowitt_api`,
`pi_bridge_v1`, `manual_quick_log`, `csv_spiderfarmer_export`, ...) is
carried as a separate, safe `sourceDetail` string. The resolver rejects
detail strings containing spaces, slashes, quotes, or other unsafe
characters, so secrets and free-form payloads cannot leak through.

## Effective source rules

The resolver flips `effectiveSource` when needed to protect the grower:

| Input                                  | `effectiveSource` | Tone     |
| -------------------------------------- | ----------------- | -------- |
| `live` fresh                           | `live`            | ok       |
| `manual` fresh                         | `manual`          | info     |
| `csv` fresh                            | `csv`             | info     |
| `demo` (any age)                       | `demo`            | sample   |
| `live`/`manual`/`csv` past stale window| `stale`           | warning  |
| `invalid` (label or `invalid: true`)   | `invalid`         | danger   |
| Unknown / missing source               | `invalid`         | danger   |
| Missing `captured_at`                  | `invalid`         | danger   |
| Future `captured_at`                   | `invalid`         | danger   |

`isHealthySensorDisplay()` returns `true` **only** for `fresh + ok`.
Manual and CSV readings are intentionally not "green" — they are
trustworthy provenance, but not live device truth.

## Staleness rules

- `captured_at` is the source of truth for age. Missing or future
  timestamps are never treated as current.
- Environment metrics (`temp`, `rh`, `vpd`): default stale window
  **15 minutes** (`DEFAULT_ENVIRONMENT_STALE_WINDOW_MS`).
- Soil metrics (`soil`, `ec`, `ph`): default stale window
  **60 minutes** (`DEFAULT_SOIL_STALE_WINDOW_MS`).
- Mixed snapshots adopt the stricter environment window.
- Thresholds may be overridden per-call via `ResolveOptions`. Defaults
  live in the resolver, never in JSX.

## Visual language

`SensorSourceBadge` renders the canonical six-state vocabulary using
semantic tokens. `SensorSnapshotCard` wraps the badge with:

- captured-at age label (e.g. `5m ago`)
- optional safe `sourceDetail` chip
- optional confidence percentage
- compact safe metric grid (no raw payload)
- warning copy when stale / invalid / demo / missing

Stale, invalid, demo, and unknown states all render in non-green tones.

## Quick Log behavior

Quick Log already surfaces sensor context through
`quickLogSnapshotStripAdapter` and the existing in-page sensor preview
copy (`Sensor context is usable / not usable enough to attach`). The
v1 resolver and card are available as a unified primitive for future
Quick Log polish, but **this slice does not rewire Quick Log** — the
existing wiring already enforces the no-fake-live-data contract.

When Quick Log shows the v1 card, expected copy for stale/invalid/missing
readings is:

> Sensor context is stale, invalid, or unavailable. You can still save
> the log, but this context will be marked accordingly.

Quick Log save **must not be blocked** because sensors are missing.

## Timeline behavior

Timeline rendering already uses `TimelineSensorSourceBadge` driven by
`timelineSensorSourceBadgeRules`. The v1 card may be used in future
timeline drilldowns where richer per-event sensor context exists. The
card never mutates timeline events and never renders `raw_payload`.

## AI Doctor context expectation

AI Doctor consumers should pass the resolver's `effectiveSource`,
`freshness`, `ageMs`, and `reasonCodes` into the readiness/context
pipeline so missing/stale/demo data is reported as "missing info" rather
than silently treated as healthy evidence.

## Stop-ship guardrails

- No raw payload, secret, token, or private identifier may be returned
  by the resolver or rendered by the card.
- No schema, RLS, Edge Function, auth, or migration changes are made by
  this slice.
- No Supabase writes, no AI calls, no Action Queue writes, no device
  control, no automation are introduced.
- Demo data must always render as demo, regardless of age.
- Invalid / unknown / missing data must always render non-healthy.

## Intentionally not implemented in v1

- Rewiring of the existing Quick Log and Timeline badge surfaces — they
  already enforce the safety contract through their own adapters.
- Persistence of `sensor_context_snapshot` shape changes — the resolver
  only formats existing data for display.
- New Supabase tables, columns, RPCs, or Edge Functions.
- Vendor allow-list expansion beyond safe lowercase ASCII labels.
