# Harvest Watch v2.5 — Dryback Curve Design Note (HOLD)

> **Docs-only.** This file captures a *future* design for a phenotype dryback
> curve system. It is **not approved** for V0 implementation. No database
> tables, migrations, RLS policies, edge functions, UI, AI calls, alerts,
> Action Queue writes, or automation are introduced by this note.

---

## 1. Status

- **HOLD / future design.**
- Not approved for implementation in V0.
- Outcome of the V0 Sentinel review of the originally proposed
  `phenotype_dryback_curves` + `dryback_observations` migration: **redesign
  required, ship as docs-only first.**
- This file is the canonical reference for future phased work. Any future
  migration or feature PR must link back to this document and explicitly
  resolve every requirement listed below.

## 2. Why held

- **Harvest / Cure Quick Log UI is not complete.** Operators cannot yet log
  the `harvest` or `cure_check` events that this system would consume.
- **Timeline rendering for harvest / cure events is not complete.** The
  read-path that lets a grower see and trust their own dryback history does
  not exist yet.
- **No verified dryback observation history exists.** There is no
  per-plant, sensor-provenance-backed stream of soil-moisture / VWC
  observations to fit a curve to.
- **Sensor provenance requirements are not yet enforced** for any future
  `dryback_observations` row (see §4).
- **Recommendation substrate would arrive before plant memory.** Building
  curve-fitting tables now inverts the Verdant build order
  (Diary → Sensors → AI → Automation) and risks shipping recommendations
  with no audit trail underneath them.
- **Phenotype identity is operator-asserted, not verified.** Curves keyed on
  user-entered strain / pheno labels can silently collapse unrelated grows.

## 3. Intended future capability

When the prerequisites are met, Harvest Watch v2.5 should deliver, in this
order:

- A **per-plant dryback timeline** sourced from real `sensor_readings` and
  manual snapshots, filtered by source and freshness rules.
- **Provenance-backed dryback observations** that are always traceable to a
  specific `sensor_readings` row or manual snapshot event.
- **Phenotype / operator-asserted curve comparison** — a way to compare a
  given plant's current dryback shape against a labeled reference curve.
- **Dryback trend and consistency scoring** — confidence-weighted, with
  explicit "limited evidence" states.
- **Approval-required harvest recommendations only** — never auto-executed,
  never device-controlling.

## 4. Required sensor provenance

Every future `dryback_observations` row must carry the full Verdant sensor
provenance contract. Missing any of these fields means the row must not be
written, and downstream curve fitting must reject it:

- `source` — one of `live | manual | csv | demo | stale | invalid`.
- `captured_at` — timestamp of the underlying reading, **not**
  `created_at` of the observation row.
- `tent_id` — required for ownership / RLS scoping.
- `plant_id` — required (dryback is plant- or pot-scoped).
- `confidence` — numeric confidence carried from the source reading.
- `raw_payload` — vendor lineage when available.
- `sensor_reading_id` or `sensor_snapshot_id` — **FK back to the
  originating row** for telemetry-derived observations. Non-nullable for
  any observation not entered manually by the operator.
- `grow_id` — required for cross-grow phenotype aggregation.
- `user_id` — required for RLS and ownership.

## 5. Proposed future table concepts

Described for design only. **Do not implement in this slice.**

### `dryback_observations` (future)

Per-plant, per-event measurement of dryback state, derived from a
specific sensor reading or manual snapshot. Every row links back to its
source row via `sensor_reading_id` so demo / stale / invalid telemetry can
be filtered out at read time.

### `phenotype_dryback_curves` (future)

A *derived* artifact written only by a server-side fitting job. Each row
represents a fitted expected dryback shape for an operator-asserted
phenotype label, scoped by `user_id` (never global, never cross-tenant).
Clients read only. Clients never insert or update.

## 6. Required schema safeguards

When the future migration is written, it must include all of the following.
A migration missing any of these is incorrect and must not be merged.

- `fitting_method` column constrained by a `CHECK` allow-list
  (e.g. `'linear' | 'exponential_decay' | 'piecewise' | 'manual'`).
  Free-text is forbidden.
- Numeric `CHECK` bounds on every percentage / VWC / moisture column
  (`BETWEEN 0 AND 100`) and on every fit-quality metric
  (`BETWEEN 0 AND 1`).
- `expected_curve jsonb` must have a documented JSON schema (kept in
  this docs folder) and must be guarded by at least
  `CHECK (jsonb_typeof(expected_curve) = 'object')`, ideally validated
  by a trigger.
- `user_id` ownership column on both tables, non-nullable.
- **Client RLS: `SELECT` only**, scoped by `auth.uid() = user_id`.
- **No client `INSERT` / `UPDATE` / `DELETE` policies.** All writes go
  through `SECURITY DEFINER` RPCs or edge functions that validate
  ownership and provenance.
- Explicit `GRANT` block in the same migration:
  `GRANT SELECT ON public.<table> TO authenticated;`
  `GRANT ALL ON public.<table> TO service_role;`
- Documented rollback order: drop `dryback_observations` **before**
  `phenotype_dryback_curves` if an FK exists between them; otherwise
  drop in reverse-creation order.
- `updated_at` triggers must reuse the existing
  `public.set_updated_at()` convention.
- Indexes: `(tent_id, captured_at DESC)`,
  `(plant_id, captured_at DESC)`, and an index on the curve table's
  phenotype key.

## 7. Minimum evidence thresholds

The fitting job and any UI surface must enforce:

- **No curve generation from `demo`, `stale`, or `invalid` readings.**
  These rows are excluded at the read step before fitting.
- **No curve generation below a minimum sample threshold.** A specific
  per-observation minimum (e.g. n ≥ N samples across the dry-down) must
  be set before the fitting job runs.
- **Prefer n ≥ 3 completed grows** before any "phenotype curve" language
  is shown in the UI.
- **n < 3** completed grows must remain labeled **"limited evidence"** and
  must not be presented as an authoritative phenotype expectation.
- Operator-asserted phenotype labels must be displayed as
  "operator-asserted, not verified."

## 8. Product safety rules

These rules are inherited from the Verdant core mandate and are
non-negotiable for any future Harvest Watch v2.5 surface:

- **No overconfident harvest recommendations.** Recommendations are
  suggestions, never instructions.
- **No claims from one photo or one reading.** Single-sample diagnosis is
  forbidden.
- **No automatic Action Queue creation** from dryback scoring. Every
  Action Queue item remains grower-gated.
- **No device control.** Harvest Watch must not actuate equipment.
- **Grower approval required** for any action that follows a
  recommendation.
- Bad / unknown telemetry must never be classified as healthy or used as
  fitting input.

## 9. Safer phased plan

| Phase  | Scope                                                                                                              | Gate                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **P0** | Docs-only. This file.                                                                                              | Merged as a design note.                                            |
| **P1** | Harvest / Cure **Quick Log UI** wired to the existing `harvest` / `cure_check` persistence contract.               | Operators can log harvest and cure_check events end-to-end.         |
| **P2** | **Timeline rendering** for harvest / cure events on the plant timeline.                                            | Operators can see their harvest / cure history.                     |
| **P3** | **Per-plant dryback read path** sourced from `sensor_readings` with source + freshness filtering. Presenter only.  | Operators see and trust their own dryback history. No fitting yet.  |
| **P4** | **`dryback_observations` table** with full provenance + `sensor_reading_id` FK. Server-only writes via RPC.        | Observation audit trail exists. Client RLS is SELECT-only.          |
| **P5** | **Curve-fitting job** + `phenotype_dryback_curves`. Server-only writes. Minimum-sample thresholds enforced.        | Curves derive only from labeled, fresh, owner-scoped observations.  |
| **P6** | **Approval-required recommendation surface** in the UI. Suggests; never executes; never queues without operator.   | Action Queue remains grower-gated.                                  |

Each phase must ship its own scoped PR and must not be combined with the
others.

## 10. Explicit non-goals (for this docs-only slice)

- **No migration** in this slice. No `CREATE TABLE`. No new columns.
- **No recommendation engine.** No scoring logic. No advisor module.
- **No AI scoring.** No model calls. No prompt changes.
- **No automation.** No background jobs. No edge function deploys.
- **No device control.** No actuation surface, even as a stub.
- **No UI changes.** No new routes, components, or pages.
- **No alerts.** No Action Queue writes.
- **No schema, RLS, auth, or storage changes.**

---

*Verdant is plant memory, sensor truth, cautious AI, and grower-approved
action. Harvest Watch v2.5 will only ship once the plant memory and sensor
truth it depends on are real and verifiable.*
