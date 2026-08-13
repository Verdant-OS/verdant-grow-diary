# EcoWitt Per-Plant Soil Binding — Option C Specification

**Status:** Specification. Paper only — authorizes **no** code, migration, or deployment.
**Requested:** 2026-08-13 by the owner ("Build"), superseding the D2 fence that deferred
Option C. Recorded here rather than executed: Option C requires a production schema
migration, a binding surface, and read-model work, and the governing
[Phase 1.8 specification](./ecowitt-real-ingest-phase-1-8-specification.md) is still
`HOLD — approvable` (V3/V6 `BLOCKED`).
**Author:** Claude (Knowledge Library & Product Specification Architect)

## Why this exists

A grower with four WH51 probes in one flower tent can store **one** of them today. All
four emit `soil_moisture_pct` for the same `(user_id, tent_id, source, captured_at)`, so
`sensor_readings_dedupe_uidx` treats probes 2–4 as duplicates and
`upsert(..., ignoreDuplicates: true)` silently discards them. Verified by V2 (2026-08-12):
8 rows in, 4 distinct keys, no error surfaced.

Option A (designate one probe per tent) is shipped and honest, but it collects a quarter of
the available signal in exactly the case per-plant soil matters most — one probe per plant
during flower.

## The one-line problem

```text
dedupe key today:  (user_id, tent_id, source, metric, captured_at)
                    └─ nothing in here distinguishes probe 1 from probe 4 ─┘
```

## C1 — Probe identity in the row (decides everything downstream)

`sensor_readings.device_id text NULL` **already exists**, is unused by the EcoWitt path,
carries no FK, and is absent from every index. It is the natural probe-identity carrier.

**Decision required:** adopt `device_id` as the stable per-probe identity, formatted
`ecowitt:ch<N>` (e.g. `ecowitt:ch3`), and add it to the dedupe index.

**Why this is not the Option B the owner rejected.** The D2 ruling rejected B because it
was a _transitional_ index change that would be redone for C — "churns row identity
twice." Implementing C directly changes the index **once**, so that objection is satisfied
rather than violated. This spec asks the owner to confirm that reading before any
migration.

**Migration safety (established fact):** all 29,743 existing rows have
`device_id IS NULL`. Postgres treats NULLs as distinct in unique indexes, so widening the
index cannot collide existing rows and cannot fail on legacy data. The consequence to
accept deliberately: a legacy NULL-`device_id` row and a new `ecowitt:chN` row for the same
instant are distinct keys and will not dedupe against each other. Since the EcoWitt path
never populated `device_id`, this only matters across the migration boundary itself.

## C2 — Channel → plant binding surface

Three candidates, all using existing tables:

| Option                                       | Shape                                                                                                                                | Trade-off                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **C2a — extend `hardware_config`**           | `soil_channels: [{ "channel": 1, "plant_id": "uuid" }]`                                                                              | No migration; but silently changes a shape the router and V2 already depend on, and jsonb gives no FK to `plants` |
| **C2b — reuse `soil_moisture_calibrations`** | It already carries `user_id, grow_id, tent_id, plant_id, device_id, label, is_active` with a unique active-probe index               | Zero new tables; but overloads a _calibration_ table with _routing_ meaning — two lifecycles in one row           |
| **C2c — new `ecowitt_channel_bindings`**     | `(user_id, tent_id, channel, plant_id, device_id, label, is_active)`, FK to `plants`, unique on active `(user_id, tent_id, channel)` | Honest separation, real FK, own lifecycle; one new table + RLS                                                    |

**Recommendation: C2c.** `soil_moisture_calibrations` proves the pattern works (its
`active_probe_uidx` on `COALESCE(plant_id, …), COALESCE(device_id, '')` is the precedent to
copy), but a binding that decides _where a reading is filed_ should not share a row with
dry/wet calibration points that a grower edits for unrelated reasons. C2a is rejected: the
router's `soil_channels: number[]` contract is load-bearing and V2-verified.

## C3 — Router and row-builder changes

- `ecowittChannelTentRouter.ts`: keep `soil_channels: number[]` (unchanged contract);
  routing still resolves tent by channel.
- `ecowittRoutedRowBuilder.ts`: populate `device_id = "ecowitt:ch<N>"` on every routed
  soil row, and carry `plant_id` resolved from the binding **into `raw_payload`** — not
  into a top-level column, which stays contract-forbidden.
- Air channels are unchanged: one WH31 per tent remains correct; this spec is soil-only.

**Explicitly out of scope:** adding a `plant_id` **column** to `sensor_readings`. The V0
contract's requirement that rows "include `plant_id` when relevant" is satisfied by
`raw_payload` under the existing D5 ruling (amend the contract, not the schema).

## C4 — Read models

Per-plant soil must not regress the V5a fences (PR #917). Every consumer that groups soil
by tent needs a per-probe grouping path:

- Plant Detail: that plant's own probe series
- Tent views: either the designated probe (Option A behavior, preserved) or an explicitly
  labeled multi-probe view — never an average, per the standing D2 fence
- AI Doctor context: per-plant soil where a binding exists; absence must read as absent,
  never as the tent's other probe

## C5 — Binding UI

The minimum that makes C usable: in tent settings, list detected soil channels (the
gateway already reports which exist), and let the grower assign each to a plant in that
tent, or leave it unassigned. Unassigned channels store with `device_id` and no
`plant_id` — data preserved, attribution absent, which is honest.

## Sequencing (each step independently revertible)

1. `ecowitt_channel_bindings` table + RLS (owner-scoped select/insert/update; no delete)
2. New migration widening `sensor_readings_dedupe_uidx` to include `device_id`; a new
   pinning test asserting the new column order, leaving the historical test untouched
3. Row builder populates `device_id`; targeted tests re-running the V2 fixture and
   asserting **8 rows / 8 distinct keys** where V2 recorded 8/4
4. Read models + fences (V5a-style pinning tests)
5. Binding UI
6. Re-run V2 as a regression gate

## Prerequisites before step 1

- **Phase 1.8 spec at `APPROVED`** — V3 and V6 still `BLOCKED` on production access
- **Owner confirmation** that C supersedes the D2 "do not modify the pinned dedupe index"
  fence, on the once-not-twice reasoning in C1
- **C2 choice ratified** (C2c recommended)

## What Option A holders lose by waiting

Nothing. Option A is forward-compatible: a designated probe simply becomes the first bound
probe, and its historical rows keep their NULL `device_id`. No backfill or relabeling is
implied by this spec, and none is authorized.

## Rollback

Delete this file. It specifies; nothing executes from it.
