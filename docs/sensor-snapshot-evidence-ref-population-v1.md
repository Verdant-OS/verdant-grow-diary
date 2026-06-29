# Sensor Snapshot → Alert Evidence Ref Population v1 — Audit & Blocker

**Status:** Helper IMPLEMENTED · Env-alert write-path population BLOCKED.

## Goal
Populate `alerts.originating_timeline_events` with safe `sensor_snapshot`
refs when environment/sensor alerts are created from a known sensor
reading/snapshot row.

## Audit findings

| Question | Answer |
|---|---|
| Does the env-alert creation path have a real sensor reading/snapshot ID at write time? | **No.** `SensorSnapshot` (`src/lib/sensorSnapshot.ts`) is an aggregated latest-values object; it has `source`, `ts`, metric values, and `device_id` — but **no `id`** that points back to a single `sensor_readings` row. |
| Does it have `captured_at`? | Aggregated `ts` only; not a row capture. |
| Does it have a Verdant-safe source label? | Yes (`SnapshotSource`). |
| Does it have enough label context for a safe badge label? | Yes (via metric on the alert). |
| Does the existing alert save path accept refs? | **Yes** — `saveAlert` accepts an optional `originating_timeline_events` list and normalizes via the shared rules. |
| Can this be implemented without schema/RLS changes? | Yes. |

Because the **id question is "no"**, v1 must NOT populate refs from this
path. Inferring a snapshot id from alert timestamps, tent/plant/metric, or
alert prose is explicitly disallowed by the spec. The env-alert hook
continues to call `saveAlert` without `originating_timeline_events`, which
persists the safe `[]` default via `normalizeOriginatingTimelineEvents`.

## Implemented

- `src/lib/sensorSnapshotEvidenceRefRules.ts` — pure helper
  `buildSensorSnapshotEvidenceRefs(input)`:
  - Returns `[]` for null / non-object / missing-id / missing-`captured_at`
    / non-truth-source / forbidden-field inputs.
  - Routes through the shared `normalizeOriginatingTimelineEvents` so
    source labels stay in lock-step with the persistence/adapter layer.
  - Honest labels: `live | manual | csv | demo | stale | invalid |
    imported` preserved; provider strings → `unknown`; `unavailable` → no
    ref.
  - Never throws.
- `buildSensorSnapshotLabel(metric)` for diagnosis-free badge labels
  (`"VPD sensor snapshot"`, `"Temperature sensor snapshot"`, …).

## Tests

- `src/test/sensor-snapshot-evidence-ref-rules.test.ts` — happy path,
  rejection paths, forbidden-field rejection (incl. `raw_payload`,
  `service_role`, `bridge_token`, `api_token`, `prompt`, `completion`,
  `model_output`), label safety.
- `src/test/sensor-snapshot-evidence-ref-population-v1-blocked.test.ts` —
  regression fence on `usePersistEnvironmentAlerts.ts`: hook does not
  import the helper, does not pass `originating_timeline_events`, does not
  infer from prose/metric/timestamp/alert id; `saveAlert` defaults to `[]`.

## Unblocking later (Phase 2 — out of scope here)

Carry an explicit `sensor_reading.id` (or snapshot row id) end-to-end
from the latest-reading query into `SensorSnapshot` (or a sibling type),
then pass `{ id, captured_at, source, metric }` from the env-alert hook
into `buildSensorSnapshotEvidenceRefs` and forward the result to
`saveAlert({ originating_timeline_events: ... })`. No schema change is
required on `alerts` — the column already exists.
