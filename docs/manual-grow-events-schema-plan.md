# Manual Grow Events — Schema Plan

> Version: 1.0 (Draft, design-only)
> Status: Planning. **No SQL is applied. No app code changes. No modifications to existing tables.**
> Scope: Define the future relational shape of Verdant's manual grow events timeline so that watering, feeding, training, observation, photo, and environment logs become first-class, queryable, AI-ready records.

---

## 0. Goals & Non-Goals

### Goals
- Introduce a normalized **event timeline** that complements (does not replace) the existing `diary_entries` free-form journal.
- Make every manual log **type-safe**, **query-efficient**, and **chart-overlayable** alongside `sensor_readings`.
- Provide structured payloads that future AI Doctor diagnosis packets can consume without NLP on free text.
- Preserve full backward compatibility with Phase 1 tables (`tents`, `plants`, `sensor_readings`, `grows`, `diary_entries`).

### Non-Goals
- No SQL migrations in this document.
- No edits to existing tables.
- No UI or app code changes.
- No data backfill strategy (covered in a later doc).

---

## 1. Architectural Overview

### 1.1 Pattern: Parent Event + Typed Detail Tables
We adopt a **supertype/subtype** (a.k.a. "class table inheritance") pattern:

```text
                 ┌─────────────────────┐
                 │    grow_events      │  ← supertype (timeline spine)
                 │  (id, user_id,      │
                 │   grow_id, type,    │
                 │   occurred_at, ...) │
                 └──────────┬──────────┘
                            │ 1:1 by event_id
        ┌───────────┬───────┼────────┬──────────────┬────────────────┐
        ▼           ▼       ▼        ▼              ▼                ▼
 watering_events feeding_ training_ observation_ photo_events environment_
                 events   events    events                    events
```

**Why this shape:**
- `grow_events` is the single source of truth for ordering, filtering, and chart overlays.
- Subtype tables hold strongly-typed fields, validated columns, and indexes specific to that event class.
- New event types can be added without altering the spine.
- One JOIN gives AI Doctor a full structured packet per event.

### 1.2 Relationship to Existing `diary_entries`
- `diary_entries` remains untouched and continues to power the existing Timeline UI.
- `grow_events` is **additive**. A future migration may optionally project legacy `diary_entries` into `grow_events` (read-only view), but that is out of scope here.
- During transition both can coexist; UI will gradually prefer `grow_events` for typed surfaces (charts, AI, presets).

---

## 2. Shared Conventions

Applied to every new table below.

| Concern | Convention |
|---|---|
| Primary key | `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| Ownership | `user_id uuid NOT NULL` (matches `auth.uid()` via RLS) |
| Timestamps | `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` (trigger via existing `set_updated_at()`) |
| Soft delete | `is_deleted boolean NOT NULL DEFAULT false` (preferred over hard delete for timeline integrity) |
| Schema versioning | `schema_version smallint NOT NULL DEFAULT 1` (matches existing `tents`/`plants` convention) |
| Validation | Use **triggers**, not CHECK constraints, for any time-relative or enum-evolving rules (per project standard) |
| Linking | `grow_id uuid NOT NULL` always; `tent_id`/`plant_id` optional but indexed |
| Provenance | `source text NOT NULL DEFAULT 'manual'` ∈ {`manual`, `quick_log`, `voice`, `bulk`, `preset`, `pi_bridge`} |

---

## 3. Table: `grow_events` (spine)

### 3.1 Purpose
The canonical, type-agnostic timeline row. Every manual entry, regardless of category, gets exactly one row here. This is what charts overlay, what the AI Doctor packetizes, and what the Timeline UI paginates.

### 3.2 Columns

| Column | Type | Req | Notes |
|---|---|---|---|
| `id` | uuid | ✓ | PK |
| `user_id` | uuid | ✓ | Owner; RLS subject |
| `grow_id` | uuid | ✓ | Logical scope |
| `tent_id` | uuid | – | Optional spatial scope |
| `plant_id` | uuid | – | Optional plant scope |
| `event_type` | text | ✓ | Enum: `watering` \| `feeding` \| `training` \| `observation` \| `photo` \| `environment` |
| `occurred_at` | timestamptz | ✓ | When the event happened (user-editable) |
| `stage` | text | – | Snapshot of grow stage at time of event |
| `note` | text | – | Free-text caption (≤ 2000 chars, trigger-validated) |
| `source` | text | ✓ | Default `manual` |
| `schema_version` | smallint | ✓ | Default 1 |
| `is_deleted` | boolean | ✓ | Default false |
| `created_at` | timestamptz | ✓ | Default `now()` |
| `updated_at` | timestamptz | ✓ | Default `now()` |

### 3.3 Required vs Optional
- **Required:** `user_id`, `grow_id`, `event_type`, `occurred_at`.
- **Optional:** `tent_id`, `plant_id`, `stage`, `note`.

### 3.4 Indexes
- `(user_id, occurred_at DESC)` — primary timeline query.
- `(grow_id, occurred_at DESC)` — per-grow timeline.
- `(tent_id, occurred_at DESC) WHERE tent_id IS NOT NULL` — partial, for tent overlays.
- `(plant_id, occurred_at DESC) WHERE plant_id IS NOT NULL` — partial, for plant overlays.
- `(user_id, event_type, occurred_at DESC)` — filtered timeline (e.g., "all feedings").
- `(grow_id, event_type, occurred_at DESC)` — chart series fetch.

### 3.5 RLS Design
Mirror `diary_entries` exactly, plus operator read-through:

| Policy | Cmd | Expression |
|---|---|---|
| Users view own events | SELECT | `auth.uid() = user_id` |
| Users insert own events | INSERT | `auth.uid() = user_id` (with check) |
| Users update own events | UPDATE | `auth.uid() = user_id` |
| Users delete own events | DELETE | `auth.uid() = user_id` (prefer soft delete in app) |
| Operators view all events | SELECT | `has_role(auth.uid(), 'operator')` |

### 3.6 Validation Trigger Responsibilities
- Enforce `event_type` enum.
- Enforce `source` enum.
- Enforce `note` length ≤ 2000.
- Enforce `occurred_at <= now() + interval '1 day'` (clock-skew tolerance).
- Enforce ownership cross-check: `grow_id`, `tent_id`, `plant_id` all belong to `user_id`.

---

## 4. Table: `watering_events`

### 4.1 Purpose
Typed payload for plain-water irrigation events. Drives "days since last water" metrics, runoff trend charts, and overwatering risk signals for AI Doctor.

### 4.2 Columns

| Column | Type | Req | Notes |
|---|---|---|---|
| `event_id` | uuid | ✓ | PK + FK → `grow_events.id` ON DELETE CASCADE |
| `user_id` | uuid | ✓ | Denormalized for RLS performance |
| `volume_ml` | integer | – | Total water applied |
| `water_ph` | numeric(4,2) | – | 0.00–14.00 |
| `water_ec_ms_cm` | numeric(5,2) | – | mS/cm |
| `runoff_ph` | numeric(4,2) | – | – |
| `runoff_ec_ms_cm` | numeric(5,2) | – | – |
| `runoff_volume_ml` | integer | – | – |
| `temperature_c` | numeric(4,1) | – | Water temperature |
| `method` | text | – | Enum: `top_water` \| `bottom_water` \| `drip` \| `flood_drain` \| `hand_mist` |
| `notes` | text | – | Method-specific notes |

### 4.3 Required vs Optional
- **Required:** `event_id`, `user_id`.
- **Optional (but recommended):** at least one of `volume_ml`, `water_ph`. Enforced in app layer, not DB, to keep fast-capture path open.

### 4.4 Indexes
- `(user_id)` — RLS support.
- `(event_id)` — implicit via PK.

### 4.5 RLS Design
Same shape as `grow_events`. Additionally, all writes must verify the parent `grow_events` row is owned by `auth.uid()` (trigger-enforced, not just RLS).

---

## 5. Table: `feeding_events`

### 5.1 Purpose
Typed payload for nutrient-bearing irrigation. Distinct from watering because dosage, recipe, and EC/PPM accuracy matter for deficiency/toxicity diagnosis.

### 5.2 Columns

| Column | Type | Req | Notes |
|---|---|---|---|
| `event_id` | uuid | ✓ | PK + FK → `grow_events.id` CASCADE |
| `user_id` | uuid | ✓ | RLS denorm |
| `mix_volume_ml` | integer | ✓ | Total mixed solution |
| `mix_ph` | numeric(4,2) | ✓ | Post-mix pH |
| `mix_ec_ms_cm` | numeric(5,2) | – | – |
| `mix_ppm_500` | integer | – | PPM 500-scale |
| `mix_ppm_700` | integer | – | PPM 700-scale |
| `runoff_ph` | numeric(4,2) | – | – |
| `runoff_ec_ms_cm` | numeric(5,2) | – | – |
| `nutrient_brand` | text | – | e.g., "General Hydroponics" |
| `recipe` | jsonb | – | Array of `{product, dose_ml_per_l}` |
| `target_stage` | text | – | Recipe target stage (may differ from current) |
| `preset_id` | uuid | – | Future FK → `log_presets.id` |

### 5.3 Required vs Optional
- **Required:** `event_id`, `user_id`, `mix_volume_ml`, `mix_ph`.
- **Recommended:** `mix_ec_ms_cm` or `mix_ppm_*`.

### 5.4 Indexes
- `(user_id)`.
- `(preset_id) WHERE preset_id IS NOT NULL` — preset usage analytics.
- GIN on `recipe` — searchable nutrient history.

### 5.5 RLS Design
Same as `watering_events`. Operators get SELECT-only.

---

## 6. Table: `training_events`

### 6.1 Purpose
Capture structural manipulations (LST, topping, FIM, defoliation, supercropping, mainlining). Powers recovery-window reminders and AI assessment of stress-induced symptoms.

### 6.2 Columns

| Column | Type | Req | Notes |
|---|---|---|---|
| `event_id` | uuid | ✓ | PK + FK CASCADE |
| `user_id` | uuid | ✓ | – |
| `technique` | text | ✓ | Enum: `lst` \| `topping` \| `fim` \| `defoliation` \| `supercropping` \| `mainlining` \| `scrog` \| `transplant` \| `other` |
| `intensity` | smallint | – | 1–5 subjective stress |
| `tools_used` | text[] | – | e.g., `{'scissors','soft_ties'}` |
| `affected_node_count` | smallint | – | Count of nodes touched |
| `expected_recovery_days` | smallint | – | Surfaced as reminder |
| `before_photo_event_id` | uuid | – | Optional FK to a `photo_events.event_id` |
| `after_photo_event_id` | uuid | – | – |

### 6.3 Required vs Optional
- **Required:** `event_id`, `user_id`, `technique`.

### 6.4 Indexes
- `(user_id)`.
- `(technique, user_id)` — analytics by technique.

### 6.5 RLS Design
Same pattern.

---

## 7. Table: `observation_events`

### 7.1 Purpose
Structured-but-flexible record of what the grower noticed. Bridges the gap between a free-text note and an AI-Doctor-ready symptom packet.

### 7.2 Columns

| Column | Type | Req | Notes |
|---|---|---|---|
| `event_id` | uuid | ✓ | PK + FK CASCADE |
| `user_id` | uuid | ✓ | – |
| `category` | text | ✓ | Enum: `general` \| `health` \| `pest` \| `disease` \| `deficiency` \| `toxicity` \| `environment` \| `milestone` |
| `severity` | smallint | – | 1–5 |
| `affected_area` | text[] | – | `{leaves, stems, buds, roots, whole_plant}` |
| `symptom_location` | text[] | – | `{upper_canopy, lower_canopy, tips, margins, veins, internodes}` |
| `symptom_type` | text[] | – | `{yellowing, browning, spotting, curling, wilting, droop, stretching, holes, webbing, slime}` |
| `progression` | text | – | Enum: `sudden_24h` \| `fast_2_3d` \| `gradual_1w` \| `stable` |
| `suspected_cause` | text | – | Free text |
| `confidence` | smallint | – | 1–5 grower self-rated |
| `extra` | jsonb | – | Forward-compatible bag |

### 7.3 Required vs Optional
- **Required:** `event_id`, `user_id`, `category`.

### 7.4 Indexes
- `(user_id)`.
- `(user_id, category)` — symptom history queries.
- GIN on `symptom_type` — multi-symptom search for AI Doctor.
- GIN on `affected_area`.

### 7.5 RLS Design
Same. Operator-readable for community moderation of disease reports.

---

## 8. Table: `photo_events`

### 8.1 Purpose
First-class photo records. The photo itself lives in the `diary-photos` storage bucket; this table holds metadata, EXIF, AI-vision results, and pointers used by Timeline, charts (timelapse overlay), and AI Doctor.

### 8.2 Columns

| Column | Type | Req | Notes |
|---|---|---|---|
| `event_id` | uuid | ✓ | PK + FK CASCADE |
| `user_id` | uuid | ✓ | – |
| `storage_path` | text | ✓ | Path inside `diary-photos` bucket |
| `mime_type` | text | – | e.g., `image/jpeg` |
| `width_px` | integer | – | – |
| `height_px` | integer | – | – |
| `bytes` | integer | – | Sanity / quota |
| `captured_at` | timestamptz | – | From EXIF, may differ from `occurred_at` |
| `camera_model` | text | – | EXIF |
| `iso` | integer | – | EXIF |
| `shot_type` | text | – | Enum: `close_up` \| `whole_plant` \| `canopy` \| `roots` \| `runoff` \| `equipment` \| `other` |
| `ai_vision_summary` | jsonb | – | Future on-device or edge inference output |
| `is_primary` | boolean | – | One per event flagged as headline |

### 8.3 Required vs Optional
- **Required:** `event_id`, `user_id`, `storage_path`.

### 8.4 Indexes
- `(user_id)`.
- `(event_id)` — implicit.
- `(user_id, captured_at DESC) WHERE captured_at IS NOT NULL` — timelapse builder.

### 8.5 RLS Design
- Same row-level shape.
- **Storage policies** for `diary-photos` already exist; this table only references paths and does not change bucket policies.

---

## 9. Table: `environment_events`

### 9.1 Purpose
Manual environment snapshots — what the grower read off a hygrometer, controller, or eyeball. Distinct from `sensor_readings`, which holds continuous device telemetry. Manual entries are sparse, intentional, and often associated with anomalies.

### 9.2 Columns

| Column | Type | Req | Notes |
|---|---|---|---|
| `event_id` | uuid | ✓ | PK + FK CASCADE |
| `user_id` | uuid | ✓ | – |
| `temperature_c` | numeric(4,1) | – | – |
| `humidity_pct` | numeric(5,2) | – | 0–100 |
| `vpd_kpa` | numeric(4,2) | – | Computed or manual |
| `co2_ppm` | integer | – | – |
| `leaf_surface_temp_c` | numeric(4,1) | – | IR thermometer reading |
| `light_on` | boolean | – | Lights-on snapshot context |
| `light_ppfd` | integer | – | µmol/m²/s |
| `instrument` | text | – | e.g., `vivosun_hygrometer`, `apera_ph60` |
| `sensor_reading_ids` | uuid[] | – | Optional cross-link to nearest `sensor_readings` rows |

### 9.3 Required vs Optional
- **Required:** `event_id`, `user_id`.
- **Recommended:** at least one of `temperature_c`, `humidity_pct`, `co2_ppm`.

### 9.4 Indexes
- `(user_id)`.
- `(event_id)` — implicit.

### 9.5 RLS Design
Same as siblings.

---

## 10. Relationship to Phase 1 Tables

| Phase 1 Table | Relationship | Change Required? |
|---|---|---|
| `tents` | Optional `tent_id` reference on `grow_events`. Validated by trigger (ownership). | **No changes to `tents`.** |
| `plants` | Optional `plant_id` reference on `grow_events`. Trigger-validated ownership. | **No changes to `plants`.** |
| `sensor_readings` | `environment_events.sensor_reading_ids` optionally cross-links nearest telemetry rows for correlation. No FK constraint (telemetry is high-volume and may be pruned). | **No changes to `sensor_readings`.** |
| `grows` | Required `grow_id` on `grow_events`. Trigger-validated ownership. | **No changes to `grows`.** |
| `diary_entries` | Coexists. A later (out-of-scope) migration may emit shadow `grow_events` rows from new `diary_entries` inserts via trigger, but Phase 1 makes no such change. | **No changes.** |

All references use `uuid` columns without DB-level FKs to Phase 1 tables (matching the existing project pattern: see `diary_entries.grow_id`, `plants.tent_id`). Ownership integrity is enforced by trigger + RLS, not declarative FK, to preserve flexibility and avoid lock contention.

---

## 11. Relationship to Future Chart Overlays

The Sensor Data chart (Recharts) will gain an **event-overlay layer**:

- Query: `grow_events` filtered by `(grow_id, occurred_at BETWEEN range)`.
- Render: vertical markers on the time axis, colored by `event_type`.
- Tooltip: hydrates from subtype table (`feeding_events`, `watering_events`, etc.) on hover.
- Correlation: feedings preceding a temperature/RH excursion become visible at a glance.

**Why the spine matters:** the chart needs *one* fast indexed query (`(grow_id, occurred_at)`) to draw all markers; subtype JOINs happen lazily per tooltip. This is only possible because of the supertype design.

Planned overlay event groupings:
| Group | Event types | Default visibility |
|---|---|---|
| Irrigation | watering, feeding | On |
| Stress | training | On |
| Environment | environment | Off (redundant with sensor curve) |
| Visual | photo | On (thumbnail dots) |
| Notes | observation | Off |

---

## 12. Relationship to Future AI Doctor Diagnosis Packets

An AI Doctor diagnosis packet is a **bounded JSON document** sent to the `ai-coach` edge function. Today it is mostly free text; the new schema enables a structured packet:

```text
{
  grow:        { id, stage, age_days, medium },
  recent_events: [
    { type, occurred_at, payload: {…subtype columns…} },
    …last N events ordered by occurred_at DESC
  ],
  symptoms:    [ observation_events rows where category in
                 ('health','pest','disease','deficiency','toxicity') ],
  feedings:    [ last 5 feeding_events ],
  waterings:   [ last 5 watering_events ],
  environment: [ last 24h of environment_events + sensor_readings aggregates ],
  photos:      [ photo_events rows with storage_path → signed URL ],
  trainings:   [ last 30d training_events ]
}
```

Benefits:
- **Deterministic** packet shape → testable AI prompts.
- **Token-bounded** — subtype columns limit free-text noise.
- **Photo-grounded** — `photo_events.storage_path` produces signed URLs for vision models.
- **Symptom-first** — `observation_events.symptom_type[]` directly feeds vector / rules-based pre-filters.

No DB change is required to *enable* AI Doctor — only the read query and packet builder change, which is application-layer work for a later doc.

---

## 13. Constraints Re-Confirmed

- **`user_id` ownership is required on every new table.** RLS enforces it; trigger cross-checks parent `grow_events.user_id` matches subtype `user_id`.
- **No destructive changes** to any existing table.
- **No alterations** to `tents`, `plants`, or `sensor_readings`.
- **No UI changes.**
- **No code changes.**

---

## 14. Migration Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Dual write between `diary_entries` and `grow_events` causes drift | Medium | Medium | Phase rollout: `grow_events` is read-only-additive at first; `diary_entries` remains source of truth until parity tests pass. |
| 2 | Subtype `user_id` denorm drifts from spine | Low | High (RLS bypass risk) | Trigger on subtype INSERT/UPDATE re-asserts `subtype.user_id = grow_events.user_id`. |
| 3 | Soft-deleted spine rows orphan subtype data visually | Medium | Low | App-layer query always filters `is_deleted = false`; subtype rows ride along via JOIN. |
| 4 | High-volume timeline queries without proper composite indexes | Medium | Medium | Indexes listed per table; monitor `pg_stat_statements` after rollout. |
| 5 | RLS recursion if policies inadvertently reference each other | Low | High | Reuse the existing `has_role()` SECURITY DEFINER pattern; never inline role checks across tables. |
| 6 | EXIF / photo metadata reveals geolocation in shared diaries | Medium | High (privacy) | Strip GPS EXIF at upload time (app concern, flagged here). |
| 7 | JSONB `recipe` / `ai_vision_summary` schema drift | Medium | Low | `schema_version` per row; reader code branches. |
| 8 | Backfill of legacy `diary_entries` is irreversible if mis-mapped | High if attempted | High | Out of scope; defer until v2 of this plan. |
| 9 | Chart overlay queries scan unbounded ranges | Medium | Medium | Always require `(grow_id, occurred_at BETWEEN …)`; enforce in repo helpers. |
| 10 | Operator policies expose private diary data unintentionally | Low | High | Mirror existing `diary_entries` operator policies; no broader scope. |

---

## 15. Open Questions

1. Should `event_type` be a Postgres `ENUM` or `text` with trigger validation? (Project precedent leans toward `text` + trigger for evolvability.)
2. Should subtype tables carry their own `occurred_at`, or always defer to the spine? (Plan: defer to spine; subtype rows are immutable in time.)
3. Do we need a **`bulk_event_group_id`** column on `grow_events` to tie together bulk-logged entries? (Likely yes, but defer to QuickLog v2 implementation doc.)
4. Should `photo_events` support multiple photos per event, or strictly one row per photo? (Plan: one row per photo, joined many-to-one to spine.)
5. Does `environment_events.sensor_reading_ids` need a maintained correlation, or compute on read? (Plan: compute on read until proven slow.)
6. Should `feeding_events.recipe` reference a future `nutrient_products` table, or stay JSONB? (Defer; JSONB now, normalize later if community catalog is built.)
7. Operator role: read-only on all events, or also `pest`/`disease` write-through for moderation? (Plan: read-only Phase 1.)
8. Retention policy: do we ever hard-delete soft-deleted rows? (Plan: never automatically; user-initiated only.)
9. Do we expose a `grow_events_view` that pre-joins the most common subtype columns for the Timeline UI? (Likely yes in Phase 2.)
10. Does AI Doctor need a server-side **packet builder edge function**, or is client-side assembly acceptable? (Plan: edge function for token-budget enforcement.)

---

## 16. Recommended Migration Order

When the team is ready to implement (separate PRs, separate migrations):

1. **`grow_events` spine** — table + indexes + RLS + validation trigger. Ship behind a feature flag; no readers yet.
2. **`watering_events`** — first subtype; smallest blast radius, validates the supertype pattern end-to-end.
3. **`feeding_events`** — adds JSONB `recipe`; validates GIN index path.
4. **`environment_events`** — adds cross-link array to `sensor_readings`; validates correlation query plan.
5. **`photo_events`** — touches storage bucket conventions; validate signed URL flow and EXIF stripping.
6. **`training_events`** — adds optional self-referential FKs to `photo_events`; validates ordering of migrations.
7. **`observation_events`** — richest field set and most GIN indexes; ship last so prior tables stabilize first.
8. **(Phase 2)** Read-side helpers: `src/lib/events.ts` typed repo, `useEvents` hook, Timeline overlay query.
9. **(Phase 2)** Chart overlay layer in `SensorChart.tsx`.
10. **(Phase 3)** AI Doctor packet builder edge function consuming all subtype rows.
11. **(Phase 4, optional)** Backfill / projection from `diary_entries` → `grow_events`.

Each step is independently revertible (DROP TABLE on the new table only) and ships with:
- Migration SQL
- RLS self-test in `supabase/functions/rls-selftest/`
- Typed repo additions in `src/lib/db.ts`
- Unit tests per the project's testing standard (Part 10 of workspace rules)

---

*Document maintained by Verdant Product & Engineering.
Last updated: 2026-05-18. Design-only — no SQL, no code, no schema changes applied.*
