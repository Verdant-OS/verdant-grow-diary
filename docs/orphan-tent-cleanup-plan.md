# Orphan Tent Cleanup Plan (AUDIT / PLAN ONLY)

Status: **Plan only. No data, schema, FK, RLS, or code changes.**
Source audit: `src/lib/orphanTentReferenceAudit.ts`, `scripts/run-orphan-tent-audit.ts`.

## Summary

Read-only audit confirms a single deleted tent is the sole source of every
orphan `tent_id` reference in the database. All 12 orphan rows belong to
**one user**, **one grow** (`Flowering`), and **one missing tent**. Sensor
data is entirely **manual** (no live device stream is tied to the missing
tent). This is a safe, low-blast-radius cleanup — but it still requires
explicit operator approval before any mutation runs.

## Affected missing tent (redacted)

| Field           | Value                                  |
| --------------- | -------------------------------------- |
| tent_id preview | `********…4b62`                        |
| grow_id         | `fee28aa8-…-3b005f4d83c2` (`Flowering`)|
| distinct users  | 1 (sensor user = plant user = diary user) |
| surviving sibling tents on this grow | **0** |

No row remains in `public.tents` for this id, and no other tent currently
belongs to the same grow — so there is no in-place "active tent" to
reassign to without operator intent.

## Affected rows by table

| Table             | Orphan rows | Distinct missing tents |
| ----------------- | ----------- | ---------------------- |
| `sensor_readings` | 8           | 1                      |
| `plants`          | 2           | 1                      |
| `diary_entries`   | 2           | 1                      |
| `grow_events`, `ai_doctor_sessions`, `alerts`, `action_queue`, `bridge_tokens`, `sensor_ingest_audit_log` | 0 | — |

## Available context per table

### `sensor_readings` (8 rows)

- Columns we'd use: `id`, `tent_id`, `ts`, `captured_at`, `metric`, `value`,
  `source`, `device_id`, `user_id`.
- Window: 2026-05-19 19:33 → 19:43 UTC (≈10 min burst).
- Sources: `manual` only. Device IDs: none.
- Metrics: `temperature_c` (2), `humidity_pct` (2), `vpd_kpa` (2),
  `soil_moisture_pct` (1), `co2_ppm` (1).
- `tent_id` is **NOT NULL** — nulling is not an option here.

### `plants` (2 rows)

- Columns we'd use: `id`, `tent_id`, `grow_id`, `user_id`, `stage`,
  `is_archived`, `created_at`.
- Stages: `veg`, `seedling`. Archived flags: one archived, one not.
- `grow_id` = `Flowering` (matches diary + sensor user).
- `tent_id` is **nullable** — safe to null.

### `diary_entries` (2 rows)

- Columns we'd use: `id`, `tent_id`, `grow_id`, `plant_id`, `user_id`,
  `entry_at`, `created_at`.
- 1 distinct `plant_id` referenced. Same grow as the plants.
- `tent_id` is **nullable** — safe to null.

## Cleanup option matrix

| Option | sensor_readings | plants | diary_entries | Notes |
| ------ | --------------- | ------ | ------------- | ----- |
| A. Restore missing tent row (re-insert with original UUID, `grow_id` = `Flowering`, owner = original user, `is_archived=true`, `name='Recovered Tent (auto-restored)'`) | ✅ | ✅ | ✅ | Preserves history end-to-end. No data loss. Reversible by re-deleting the recovered tent. |
| B. Set `tent_id = NULL` where nullable | ❌ NOT NULL | ✅ | ✅ | Cheapest. Breaks tent→plant/diary attribution but keeps rows. |
| C. Reassign to an existing active tent | ⚠️ no surviving tent on this grow | ⚠️ same | ⚠️ same | Requires operator to **pick** a target tent. Risk of misattribution. |
| D. Delete orphan rows | ⚠️ destroys 8 manual readings | ⚠️ destroys 2 plant rows (one archived) | ⚠️ destroys 2 diary entries | Highest data loss. Not reversible without backup. |
| E. Leave as historical orphan | ✅ | ✅ | ✅ | Zero risk now, but `tent_id` keeps dangling — audit count stays at 12. |

## Recommended option

**Option A — restore the missing tent as an archived placeholder.**

Rationale:

1. All 12 orphans share the **same** missing `tent_id`, **same** grow,
   **same** owner. Restoring a single archived tent row clears every
   orphan in one minimal mutation.
2. `sensor_readings.tent_id` is NOT NULL, so Option B can't cover the
   8-row majority of the orphans without a schema change (out of scope).
3. Option D would destroy 8 manual readings + 2 plants + 2 diary
   entries — irreversible without backups and against Verdant's "plant
   memory" principle.
4. Restoration is reversible: archived tent can be re-deleted later
   (which would simply recreate the same orphan state we have today).

Fallback plan if operator rejects restoration:

- **Option B** for `plants` and `diary_entries` only (4 of 12 rows).
- Defer `sensor_readings` — either accept them as historical orphans
  (Option E) or open a separate slice to consider a `tent_id` nullability
  change (schema work, out of scope here).

## Risks

- **Restoration UUID collision:** none expected — the id was already
  deleted from `public.tents` and is the only reference target across
  all orphan rows.
- **User confusion:** an "auto-restored" archived tent appears in the
  user's tent list filtered to archived. Mitigation: clearly mark
  `name = 'Recovered Tent (auto-restored)'` and set `is_archived = true`
  so it does **not** show up in active-tent surfaces or sensor pairing.
- **RLS:** insert must respect existing `tents` policy
  (`auth.uid() = user_id` AND owning the grow). A migration running as
  `service_role` is the only safe executor — not a client call.
- **Sensor truth rules:** restoration does not relabel readings; they
  remain `source = 'manual'`. No "live" claim is introduced.

## Rollback plan per option

| Option | Rollback |
| ------ | -------- |
| A | `DELETE FROM public.tents WHERE id = '<restored-id>';` — returns the system to the current 12-orphan state. |
| B | Re-set `tent_id` from a pre-mutation snapshot (capture `id, tent_id` for affected rows before nulling and store as a CSV in `/mnt/documents/orphan-tent-snapshot-<ts>.csv`). |
| C | Same snapshot strategy as B; restore original `tent_id`. |
| D | Requires database point-in-time restore. **No application-level rollback possible.** |
| E | N/A (no mutation). |

For Options A/B/C the pre-mutation snapshot is a **prerequisite**, not
optional.

## Required approval before mutation

Before any data mutation runs, the operator must explicitly confirm:

1. Chosen option (A / B / C / D / E).
2. Snapshot CSV captured to `/mnt/documents/` (for A/B/C).
3. Mutation will run as a one-shot migration (no edge function, no
   client code, no recurring job).
4. Audit script (`bun run scripts/run-orphan-tent-audit.ts`) will be
   re-run **after** the mutation and is expected to report **0** orphan
   rows (Option A) or the predicted residual (Options B/C/E).
5. No schema, FK, RLS, or edge-function change is bundled with the
   cleanup — those are separate, future slices.

Until all five are confirmed, this plan stays read-only.
