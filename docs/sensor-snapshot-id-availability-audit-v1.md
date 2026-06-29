# Sensor Snapshot ID Availability Audit v1

**Verdict: BLOCKED.** No runtime changes made. The pure helper
`buildSensorSnapshotEvidenceRefs` stays in place for callers that already
hold a real id; the env-alert path continues to persist `[]` via
`saveAlert`'s default.

## Findings (file + line evidence)

### Where SensorSnapshot is constructed

- `src/lib/sensorSnapshot.ts:109` — `snapshotFromReadings(rows)` aggregates
  **multiple** `sensor_readings` rows:
  - L113–116: picks `latestTs = rows[0].ts` and filters `latest = rows.filter(r => r.ts === latestTs)`.
  - L117–120: `get(metric)` pulls one row per metric (`temperature_c`, `humidity_pct`, `vpd_kpa`, `co2_ppm`, `soil_moisture_pct`, `soil_ec`, `soil_temp_c`, `ppfd`).
  - L156–168: returns a single aggregated `SensorSnapshot`. **N rows in → 1 snapshot out, with no canonical "source row".**
- `src/lib/sensorSnapshot.ts:186` — `snapshotFromDiary(entryAt, snap)` builds
  from a diary blob. **No sensor row exists.**

### Where SensorSnapshot is loaded

- `src/hooks/useLatestSensorSnapshot.ts:49–55` — `sensor_readings` SELECT:
  ```ts
  .select("ts,metric,value,source,tent_id,created_at,raw_payload")
  ```
  **`id` is NOT selected.** Even if it were, each metric contributes its own row id.

### Q&A from the audit checklist

| Question | Answer (line refs) |
|---|---|
| Where is SensorSnapshot constructed? | `src/lib/sensorSnapshot.ts:109` (readings), `:186` (diary). |
| Does the construction site select `sensor_readings.id`? | **No.** `useLatestSensorSnapshot.ts:51` omits `id`. |
| Can `id` be selected safely without changing matching/ordering? | Yes mechanically — but it would be **N ids per snapshot**, not one canonical row id. |
| Does a single SensorSnapshot correspond to one row or many? | **Many** — one row per metric at `latestTs` (`sensorSnapshot.ts:114–115`). |
| If multi-row, can one safe ref be represented honestly? | **No.** Picking one metric's row would silently privilege one metric over others; cannot fairly represent the aggregate as a single sensor_snapshot ref without inference. |
| Does `usePersistEnvironmentAlerts` receive the same row that had the id? | **No.** It receives the aggregated `SensorSnapshot` only (`usePersistEnvironmentAlerts.ts:23,52,109–113`). |
| Is `captured_at` available from the same row? | Per-row `ts` exists pre-aggregation, but the snapshot keeps only the shared `latestTs`. |
| Is a Verdant source label available from the same row? | Per-row yes (`live`/`manual`/`csv`/`sim`); post-aggregation only the resolved `SnapshotSource` survives (`sensorSnapshot.ts:131–142`). |
| Can `buildSensorSnapshotEvidenceRefs` be used without inference? | **Not in this path.** No single id+captured_at+source triple exists at the alert write boundary without per-metric drill-through or schema work. |

### Decision-rule application

The aggregated path matches the "multiple rows" branch of the decision
rules:

> If SensorSnapshot is aggregated from multiple rows: do not attach a
> single row ID unless there is already a canonical source row ID. Keep
> blocked. Document need for explicit snapshot_id/group id or per-metric
> evidence refs.

There is **no** canonical source-row id today (no `snapshot_group_id`
column on `sensor_readings`; no snapshots table).

## Unblock paths (ordered cheapest → most invasive)

1. **Per-metric env alerts attach the single contributing row's ref.**
   Env alerts are already metric-scoped (`environmentAlerts.ts` produces
   one alert per out-of-range metric). For each alert, the contributing
   row is unambiguous: it is the single `sensor_readings` row at
   `latestTs` whose `metric` matches the alert's `metric`. This is
   selection-by-equality (no nearest, no parsing, no inference).
   - **Required code changes (out of scope for v1):**
     - `useLatestSensorSnapshot.ts:51` add `id` to the SELECT.
     - `SensorReadingLike` (`sensorSnapshot.ts:90`) add `id?: string | null`.
     - Extend `SensorSnapshot` with `metric_refs?: Partial<Record<MetricName, { id; captured_at; source }>>` populated inside `snapshotFromReadings` from `latest`.
     - In `usePersistEnvironmentAlerts.ts:193`, for each `a` look up `metric_refs[a.metric]` and (when present) call `buildSensorSnapshotEvidenceRefs(...)`; pass result to `saveAlert({ originating_timeline_events: ... })`.
     - Lock tests: id pass-through preserves snapshot values; null/missing metric ref falls back to `[]`; no nearest/prose/timestamp matching.
2. **Add a `snapshot_group_id` on `sensor_readings`** (schema change — out of scope: spec forbids).
3. **Persist multiple refs per alert (one per contributing row).** Honest
   but overstates evidence for a metric-scoped alert.

Recommendation: park (1) as a small follow-up slice ("Sensor Snapshot Ref
Population v2 — per-metric refs"). It does not require schema/RLS/Edge
changes and is purely a typed pass-through plus a one-line lookup.

## Code state after this audit

- **Files changed:** none (audit-only). Documentation update only.
- **Lock tests already in place** (added in v1):
  - `src/test/sensor-snapshot-evidence-ref-population-v1-blocked.test.ts`
    fences `usePersistEnvironmentAlerts.ts` against importing the helper,
    passing `originating_timeline_events`, or inferring refs from
    prose/metric/timestamp/alert id.
  - `src/test/sensor-snapshot-evidence-ref-rules.test.ts` covers the pure
    helper's safe behavior (forbidden-field rejection, honest sources,
    no-throw on malformed input).

## Validation

- `bunx vitest run` on the 8 affected suites (sensor-snapshot helper,
  blocked lock, evidence-ref-population v1, persistence-v1 safety,
  positive-path, empty-fallbacks, adapter, alerts-foundation):
  **131/131 passed** (re-run unchanged from the v1 turn).
- `node scripts/sensor-safety-check.mjs` → **OK (no violations)**.
- `bunx tsgo --noEmit` → **clean**.

## Safety verdict

**Safe.** No runtime, schema, RLS, Edge, AI, automation, or device-control
changes. Env-alert writes continue to persist `[]` via the safe default.

## Risk / rollback

**Zero runtime risk** (docs-only). Rollback: delete this file.
