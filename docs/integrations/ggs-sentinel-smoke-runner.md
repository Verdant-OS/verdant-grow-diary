# GGS Sentinel Smoke Runner — contract

Status: experimental read-only verdict over real Spider Farmer GGS rows.

## What this is

A read-only operator surface that answers one question: are the current
Spider Farmer GGS rows in `sensor_readings` good enough that the rest of
Verdant should treat them as live, canonical, and fresh? The answer is a
single `SentinelState` plus a per-metric freshness explanation.

## What this is not

- Not automation. The Sentinel never writes, never commands, never publishes.
- Not AI. There is no model call in the runner or the page.
- Not the Action Queue. The Sentinel never enqueues, mutates, or approves
  actions.
- Not the ingest path. This module only **reads** rows produced by the
  existing GGS bridge / mapping pipeline.
- Not a freshness threshold change. Long-window memory, refresh policy,
  and any back-pressure mechanism are out of scope.

## Hard constraints

- Read-only. No `.insert(`, `.update(`, `.delete(`, `.upsert(`, `.rpc(`,
  `functions.invoke`, no `service_role`, no `action_queue` write, no
  device command, no setpoint change, no MQTT publish.
- No `raw_payload` rendering. The verdict surface does not include the
  field and the presenter has no path that could surface it.
- No fabricated `now`. The runner takes an injected `Date` so tests are
  deterministic and timestamps are never invented.
- `quality` values are validated against a closed vocabulary
  (`live | stale | invalid`). Anything else degrades the verdict.

## Verdict ladder

Evaluated in order; the first matching code wins. Freshness guidance
(`MetricFreshnessAssessment`) is computed in parallel but **never** enters
this ladder.

1. `BLOCKED_NO_GGS_ROWS` — no rows at all.
2. `BLOCKED_VENDOR_PROVENANCE_MISSING` — no row tagged `spider_farmer_ggs`.
3. `BLOCKED_SOURCE_NOT_CANONICAL` — any row carries a different `source`
   value, or a `quality` outside `{live, stale, invalid}`.
4. `BLOCKED_VALIDATION_ERROR` — any row missing/invalid `metric`,
   `value`, or `captured_at`.
5. `BLOCKED_NO_SOIL_TEMP_C` — required metric absent.
6. `BLOCKED_NO_EC` — required metric absent.
7. `BLOCKED_STALE_READING` — latest required metric beyond stale
   threshold, or any row carries `quality=stale|invalid`.
8. `BLOCKED_RAW_PAYLOAD_RENDER_RISK` — defensive; unreachable by
   construction (verdict surface does not include `raw_payload`).
9. `PASS_LIVE_SENTINEL_READY` — all required metrics present, fresh,
   canonical, valid.

## Freshness vocabulary

Per-metric, explanatory only:

| State              | Meaning                                                     |
|--------------------|-------------------------------------------------------------|
| `fresh`            | Latest row is within the aging threshold.                   |
| `fresh_but_aging`  | Latest row is past aging but still within the stale window. |
| `stale`            | Latest row is past the stale window.                        |
| `missing`          | No row found for this metric.                               |

The aging threshold is `SPIDER_FARMER_GGS_AGING_MS` (half of the stale
window). Aging metrics **do not** flip the verdict to
`BLOCKED_STALE_READING` — they only explain the row to the operator.

## Required metrics

The Sentinel requires:

- `soil_temp_c`
- `soil_ec`

Ambient temperature, humidity, VPD, PPFD, CO2, soil water content, and
pH are not required for `PASS_LIVE_SENTINEL_READY` and have no dedicated
`BLOCKED_*` code in this slice.

## Where it lives

- `src/lib/ggsSentinelSmokeRunner.ts` — pure rules (no React, no
  Supabase).
- `src/lib/ggsSentinelSmokeRunnerViewModel.ts` — presenter helpers
  (pure).
- `src/components/GgsSentinelSmokeRunnerPanel.tsx` — presenter
  component.
- `src/pages/OperatorGgsRealPayloadIngest.tsx` — operator route mounted
  at `/operator/ggs-real-payload-ingest`.

## Adapter contract

The runner accepts rows shaped like:

```text
metric: string         // "soil_temp_c" | "soil_ec" for required metrics
value: number          // finite numeric
source: string         // canonical: "spider_farmer_ggs"
quality: string        // canonical vocabulary: live | stale | invalid
captured_at: string    // ISO timestamp (or null, which forces stale/missing)
```

Wider rows are tolerated; only these fields are read.

## Safety verdict

Read-only. No fake live data. Demo / manual / stale / invalid data is
never re-labeled as healthy. No device control. No automation. No
Action Queue mutation. No AI call. No `raw_payload` rendering.
