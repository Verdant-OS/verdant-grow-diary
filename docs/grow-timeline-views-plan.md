# Verdant — Unified Grow Timeline & Chart Overlay Views

> Version: 1.0 (Draft, design-only)
> Status: Planning. **No SQL applied. No migrations. No app code changes. No UI, routes, RPCs, or Edge Functions.**
> Scope: Two read-only Postgres views that join the spine (`grow_events`) with its typed subtype tables to produce UI-ready records for (a) the Timeline page and (b) the Sensor Chart event-overlay layer.

---

## 0. Goals & Non-Goals

### Goals
- Provide a **single query surface** for the Timeline UI so the client doesn't fan out 6 subtype joins per page.
- Provide a **minimal, fast** query surface for chart overlays — just enough columns to draw markers and hydrate tooltips on demand.
- Inherit RLS automatically from the underlying tables — no new policies, no `SECURITY DEFINER` surprises.
- Stay **read-only and additive** — zero risk to existing writers, QuickLog, Dashboard, or app code.

### Non-Goals
- No write paths. No `INSTEAD OF` triggers.
- No materialized views (Phase 1). Plain views only.
- No UI wiring, hooks, or React Query code in this doc.
- No new tables. No column changes on existing tables.
- No changes to `grow_events` validation triggers.

---

## 1. View: `grow_event_timeline_view`

### 1.1 Purpose
A denormalized, type-aware timeline row per `grow_events` record, with the matching subtype payload flattened into a single JSONB `payload` plus a small set of "headline" scalar columns the UI commonly needs (volume, ph, technique, severity, photo_url). Drives the Timeline page, the diary feed, and the future AI Doctor context window.

### 1.2 Source Tables
- `grow_events` (spine — required)
- `watering_events` LEFT JOIN on `event_id`
- `feeding_events` LEFT JOIN on `event_id`
- `training_events` LEFT JOIN on `event_id`
- `observation_events` LEFT JOIN on `event_id`
- `photo_events` LEFT JOIN on `event_id`
- `environment_events` LEFT JOIN on `event_id`

Each `grow_events` row has exactly one matching subtype row (by design); LEFT JOIN handles in-flight inserts and tolerates orphan spines without breaking the timeline.

### 1.3 Columns

| Column | Type | Source | Notes |
|---|---|---|---|
| `id` | uuid | `grow_events.id` | PK of the spine row |
| `user_id` | uuid | `grow_events.user_id` | RLS subject |
| `grow_id` | uuid | `grow_events.grow_id` | – |
| `tent_id` | uuid \| null | `grow_events.tent_id` | – |
| `plant_id` | uuid \| null | `grow_events.plant_id` | – |
| `event_type` | text | `grow_events.event_type` | watering \| feeding \| training \| observation \| photo \| environment |
| `occurred_at` | timestamptz | `grow_events.occurred_at` | Primary sort key |
| `note` | text \| null | `grow_events.note` | Free-text caption |
| `source` | text | `grow_events.source` | manual / voice / import / ai |
| `created_at` | timestamptz | `grow_events.created_at` | – |
| `updated_at` | timestamptz | `grow_events.updated_at` | – |
| `headline_volume_ml` | numeric \| null | watering.volume_ml ∥ feeding.volume_ml | Coalesced for irrigation-style rows |
| `headline_ph` | numeric \| null | watering.ph ∥ feeding.ph | – |
| `headline_ec_ms_cm` | numeric \| null | watering.ec_ms_cm ∥ feeding.ec_ms_cm | – |
| `headline_technique` | text \| null | training.technique | – |
| `headline_severity` | text \| null | observation.severity | info/watch/warn/critical |
| `headline_photo_url` | text \| null | photo.photo_url | Thumbnail in feed |
| `headline_temp_c` | numeric \| null | environment.temperature_c | – |
| `headline_humidity_pct` | numeric \| null | environment.humidity_pct | – |
| `payload` | jsonb | subtype row → `to_jsonb(...)` | Full subtype columns for detail panels |

### 1.4 event_type → Subtype Mapping

| event_type | Joined subtype | Headline columns populated |
|---|---|---|
| `watering` | `watering_events` | volume_ml, ph, ec_ms_cm |
| `feeding` | `feeding_events` | volume_ml, ph, ec_ms_cm |
| `training` | `training_events` | technique |
| `observation` | `observation_events` | severity |
| `photo` | `photo_events` | photo_url |
| `environment` | `environment_events` | temp_c, humidity_pct |

Only the subtype matching `event_type` will have non-null source data; all other LEFT-joined columns are NULL by construction (subtype validation trigger enforces this).

### 1.5 Soft-Delete Handling
View definition includes `WHERE grow_events.is_deleted = false`. Subtype rows have no `is_deleted` column — they ride along with the spine. The view never returns soft-deleted events. A separate `grow_event_timeline_view_all` is **not** planned; if admin/recovery surfaces ever need deleted rows, add it later.

### 1.6 RLS / Security
- The view is created without `SECURITY DEFINER` and without `security_barrier = false` overrides.
- Postgres views default to invoker-rights → queries run with the caller's `auth.uid()`.
- Each underlying table already has `Users view own *` SELECT policies keyed on `user_id = auth.uid()` and `Operators view all *` for the operator role.
- Net effect: a user querying the view sees only their own events; operators see all. **No new policies required.**
- Grant: `GRANT SELECT ON public.grow_event_timeline_view TO authenticated;` (no anon grant).

### 1.7 Indexes Required on Source Tables
The view's selectivity comes from filtering `grow_events` by `(user_id, grow_id, occurred_at)`. Subtype joins are PK lookups on `event_id`.

Indexes that should exist (verify before shipping; **only add if missing**):

| Table | Index | Purpose |
|---|---|---|
| `grow_events` | `(user_id, occurred_at DESC) WHERE is_deleted = false` | Primary timeline scan |
| `grow_events` | `(grow_id, occurred_at DESC) WHERE is_deleted = false` | Per-grow timeline |
| `grow_events` | `(user_id, event_type, occurred_at DESC) WHERE is_deleted = false` | Filtered feeds |
| `watering_events` | PK on `event_id` | (already implicit) |
| `feeding_events` | PK on `event_id` | (already implicit) |
| `training_events` | PK on `event_id` | (already implicit) |
| `observation_events` | PK on `event_id` | (already implicit) |
| `photo_events` | PK on `event_id` | (already implicit) |
| `environment_events` | PK on `event_id` | (already implicit) |

Index additions are the **only** schema change this plan recommends, and only the three partial indexes on `grow_events`. Listed separately in §5.

### 1.8 TypeScript Output Interface

```ts
export type GrowEventType =
  | 'watering' | 'feeding' | 'training'
  | 'observation' | 'photo' | 'environment';

export interface GrowEventTimelineRow {
  id: string;
  user_id: string;
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  event_type: GrowEventType;
  occurred_at: string;      // ISO
  note: string | null;
  source: 'manual' | 'voice' | 'import' | 'ai';
  created_at: string;
  updated_at: string;
  headline_volume_ml: number | null;
  headline_ph: number | null;
  headline_ec_ms_cm: number | null;
  headline_technique: string | null;
  headline_severity: 'info' | 'watch' | 'warn' | 'critical' | null;
  headline_photo_url: string | null;
  headline_temp_c: number | null;
  headline_humidity_pct: number | null;
  payload: Record<string, unknown>;
}
```

### 1.9 React Query Consumption (later, not now)

```ts
useQuery({
  queryKey: ['timeline', growId, range],
  queryFn: () => supabase
    .from('grow_event_timeline_view')
    .select('*')
    .eq('grow_id', growId)
    .gte('occurred_at', range.from)
    .lte('occurred_at', range.to)
    .order('occurred_at', { ascending: false })
    .limit(50),
  staleTime: 30_000,
});
```

- Pagination via `range()` or keyset on `occurred_at`.
- Invalidate `['timeline', growId]` after any mutation that calls a `create_*_event` RPC.

### 1.10 Future Chart Overlay Support
Not the primary consumer (the second view is). However, the Timeline page can reuse this view to render a "mini-overlay" strip above the chart by filtering `event_type IN ('watering','feeding','training')` and grouping by day.

---

## 2. View: `chart_event_markers_view`

### 2.1 Purpose
Minimal, high-cardinality-friendly row set used to draw vertical markers on the Sensor Chart (Recharts). Returns only what's needed to position a marker and label its group; tooltip hydration falls back to `grow_event_timeline_view` lazily by `id`.

### 2.2 Source Tables
- `grow_events` (spine — required)
- No subtype joins. Marker color/group is derived from `event_type` alone.

(Optional Phase 2: LEFT JOIN `photo_events` for thumbnail dots. Not in v1.)

### 2.3 Columns

| Column | Type | Source | Notes |
|---|---|---|---|
| `id` | uuid | `grow_events.id` | Used to fetch full payload on hover |
| `user_id` | uuid | `grow_events.user_id` | RLS subject |
| `grow_id` | uuid | `grow_events.grow_id` | Required filter |
| `tent_id` | uuid \| null | `grow_events.tent_id` | Optional filter for tent-scoped charts |
| `event_type` | text | `grow_events.event_type` | Drives marker color |
| `marker_group` | text | derived | `irrigation` \| `stress` \| `visual` \| `notes` \| `environment` |
| `occurred_at` | timestamptz | `grow_events.occurred_at` | X-axis coordinate |

### 2.4 event_type → marker_group Mapping

| event_type | marker_group | Default visibility on chart |
|---|---|---|
| watering | irrigation | on |
| feeding | irrigation | on |
| training | stress | on |
| photo | visual | on |
| observation | notes | off |
| environment | environment | off |

Mapping is encoded inline in the view via `CASE WHEN`.

### 2.5 Soft-Delete Handling
Same as §1.5 — `WHERE is_deleted = false` baked into the view.

### 2.6 RLS / Security
Inherits invoker-rights from `grow_events` SELECT policies. No new policies. Grant `SELECT` to `authenticated` only.

### 2.7 Indexes Required on Source Tables
Reuses the partial indexes listed in §1.7. The dominant query is:

```sql
SELECT id, event_type, marker_group, occurred_at
FROM chart_event_markers_view
WHERE grow_id = $1
  AND occurred_at BETWEEN $2 AND $3;
```

Covered by `(grow_id, occurred_at DESC) WHERE is_deleted = false`.

### 2.8 TypeScript Output Interface

```ts
export type MarkerGroup =
  | 'irrigation' | 'stress' | 'visual' | 'notes' | 'environment';

export interface ChartEventMarkerRow {
  id: string;
  user_id: string;
  grow_id: string;
  tent_id: string | null;
  event_type: GrowEventType;
  marker_group: MarkerGroup;
  occurred_at: string;  // ISO
}
```

### 2.9 React Query Consumption (later, not now)

```ts
// Markers — long staleTime, share cache across chart re-renders
useQuery({
  queryKey: ['chart-markers', growId, range],
  queryFn: () => supabase
    .from('chart_event_markers_view')
    .select('*')
    .eq('grow_id', growId)
    .gte('occurred_at', range.from)
    .lte('occurred_at', range.to)
    .order('occurred_at', { ascending: true }),
  staleTime: 60_000,
});

// Tooltip — lazy, per-marker
useQuery({
  queryKey: ['timeline-row', markerId],
  queryFn: () => supabase
    .from('grow_event_timeline_view')
    .select('*')
    .eq('id', markerId)
    .maybeSingle(),
  enabled: !!hoveredMarkerId,
});
```

### 2.10 Future Chart Overlay Support
This view *is* the chart overlay surface. Future enhancements (non-breaking):
- Add a `thumb_url text NULL` column from a `photo_events` LEFT JOIN for thumbnail dots.
- Add a `marker_count` aggregate variant (`chart_event_markers_daily_view`) if marker density becomes a perf concern at wide zoom-out.
- Add a `severity_rank smallint NULL` column to size observation markers by severity.

All future additions are column-additive and won't break consumers selecting `*` because Recharts series rendering is column-name driven.

---

## 3. Cross-View Notes

### 3.1 Why two views, not one
- Timeline needs rich payload → wide row, slower scan, paginated.
- Chart needs many small rows over a range → narrow row, fast scan, no joins.
- Splitting them keeps each query plan optimal and lets React Query cache them at different `staleTime`s.

### 3.2 What both views deliberately exclude
- Soft-deleted rows (`is_deleted = true`).
- Any spine row missing required scalar fields (none today, but the view is defensive: it filters `event_type IS NOT NULL`).
- Operator-only fields (none currently — operator visibility is row-scoped, not column-scoped).

### 3.3 What both views deliberately preserve
- Original `occurred_at` (no rounding, no time-bucketing — that's the client's job).
- Original `user_id` (RLS depends on it).
- Original `event_type` casing (matches enum-via-trigger values).

---

## 4. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | RLS bypass via view if created with `SECURITY DEFINER` by accident | Low | Critical | Explicitly create with default invoker rights; add a `rls-selftest` case for the view. |
| 2 | View becomes slow on large timelines (>10k events/user) | Medium | Medium | Partial indexes in §1.7; consider Phase-2 materialized view keyed on `(grow_id, date_trunc('day', occurred_at))`. |
| 3 | JSONB `payload` bloats response size | Medium | Low | Timeline UI selects explicit columns; `payload` only requested for detail panels. |
| 4 | LEFT JOIN to all 6 subtypes scans unrelated tables | Medium | Medium | Postgres plans this as 6 hash joins on PK; cost is low. Re-evaluate after EXPLAIN ANALYZE on real data. |
| 5 | Operator role accidentally exposes private notes via the view | Low | High | Mirrors existing operator policies on each subtype; no new exposure surface. |
| 6 | Future subtype tables (e.g., harvest_events) silently missing from view | High over time | Medium | Add a checklist item in the migration runbook: "any new event_type → update both views in same PR." |
| 7 | Schema drift between `payload` JSONB shape and TS interface | Medium | Low | Generate TS types from `select * from view limit 0` via the existing Supabase types pipeline. |
| 8 | View dependency blocks future ALTER on subtype columns | Medium | Low | Document `DROP VIEW … CASCADE` recreate pattern; keep views in their own migration. |
| 9 | Marker density crashes Recharts at year-long zoom | Medium | Medium | Client-side decimation; Phase-2 daily-aggregate view if needed. |
| 10 | `headline_*` coalescing hides data when subtype trigger evolves | Low | Low | View is one file — easy to update alongside subtype changes. |

---

## 5. Open Questions

1. Should `grow_event_timeline_view` include `grow.stage` and `tent.name` denormalized for one-shot rendering, or should the client join client-side via existing caches? (Lean: denormalize once we confirm those tables are stable.)
2. Should `payload` strip large fields (e.g., long `feeding_events.recipe` JSON) for the timeline list view, with a separate detail fetch? (Lean: no, until proven slow.)
3. Do operators need a separate `grow_event_timeline_view_admin` that includes `is_deleted = true` rows? (Lean: defer.)
4. Should `marker_group` be a Postgres enum or text? (Lean: text + CASE in the view — no migration cost.)
5. Do we need a `chart_event_markers_view` variant scoped by `tent_id` for multi-grow tents? (Lean: filter in WHERE clause; no extra view.)
6. Should the views expose `schema_version` from `grow_events` so the client can branch on payload shape? (Lean: yes, add it to both views — cheap.)
7. Is there a need for a `grow_event_counts_view` (per-day per-type histogram) for the chart's "density" mini-strip? (Lean: defer to Phase 2.)
8. Should we add `signed_url_path` for `photo_events.photo_url` resolution at view time? (No — signed URLs are time-bound; resolve client-side.)

---

## 6. Recommended SQL Migration Order

Each step is a separate migration, independently revertible via `DROP VIEW` / `DROP INDEX CONCURRENTLY`.

1. **Index audit migration** — add the three partial indexes on `grow_events` listed in §1.7 *only if* `pg_indexes` confirms they're missing. Use `CREATE INDEX CONCURRENTLY` to avoid table locks.
2. **Create `chart_event_markers_view`** — smallest surface, lowest risk, validates the invoker-rights RLS model end-to-end.
3. **`rls-selftest` extension** — add cases that query the markers view as user A, expect 0 rows owned by user B.
4. **Create `grow_event_timeline_view`** — the wider view; ship after markers view is proven in production.
5. **`rls-selftest` extension** — repeat the user-A/user-B isolation test for the timeline view.
6. **Grant** — `GRANT SELECT ON … TO authenticated;` (and only authenticated) in the same migration as each view.
7. **(Phase 2)** — daily-aggregate materialized view, photo-thumbnail join, denormalized `grow.stage` / `tent.name`.
8. **(Phase 2)** — TypeScript type regeneration via the standard Supabase types pipeline.

No app code, no UI, no RPC, no Edge Function changes in steps 1–6.

---

## 7. Manual QA Checklist

Run after migrations land in the Test backend, before promoting to Live. All steps are read-only — no test data needs cleanup beyond the unique `QA_NOTE` prefix used in prior Code Drops.

### 7.1 Setup
- [ ] `typeof supabase === 'object'` in the browser console of an authenticated session.
- [ ] Capture `window.USER_ID` from `supabase.auth.getUser()`.
- [ ] Pick a `window.GROW_ID` owned by USER_ID.
- [ ] Confirm at least one event of each `event_type` exists for that grow (insert via the existing `create_watering_event` RPC + manual inserts if other RPCs aren't built yet; otherwise scope tests to the types that do have rows).

### 7.2 `chart_event_markers_view`
- [ ] `SELECT count(*) FROM chart_event_markers_view WHERE grow_id = :GROW_ID` returns > 0.
- [ ] All returned rows have `user_id = :USER_ID`.
- [ ] No row has `event_type` outside the 6 allowed values.
- [ ] No row has `marker_group` outside the 5 allowed values.
- [ ] Soft-delete probe: pick one event id, `UPDATE grow_events SET is_deleted = true WHERE id = :ID`, re-query view → row gone. Revert.
- [ ] Cross-user isolation: as user B, `SELECT … WHERE grow_id = :GROW_ID` → 0 rows.

### 7.3 `grow_event_timeline_view`
- [ ] `SELECT * FROM grow_event_timeline_view WHERE grow_id = :GROW_ID ORDER BY occurred_at DESC LIMIT 10` returns rows with non-null `payload`.
- [ ] For a `watering` row: `headline_volume_ml` and `headline_ph` match the underlying `watering_events` row.
- [ ] For a `training` row: `headline_technique` matches `training_events.technique`.
- [ ] For an `observation` row: `headline_severity` matches `observation_events.severity`.
- [ ] For a `photo` row: `headline_photo_url` matches `photo_events.photo_url`.
- [ ] For an `environment` row: `headline_temp_c` and `headline_humidity_pct` match `environment_events`.
- [ ] Cross-user isolation: as user B, `SELECT count(*) WHERE grow_id = :GROW_ID` → 0.
- [ ] Soft-delete probe: same as §7.2; row disappears from this view too.

### 7.4 Performance smoke
- [ ] `EXPLAIN ANALYZE` of the markers query uses the `(grow_id, occurred_at)` partial index (Index Scan, not Seq Scan).
- [ ] `EXPLAIN ANALYZE` of the timeline query shows hash joins on subtype PKs, total cost reasonable for the row count.

### 7.5 Security
- [ ] `\dp public.grow_event_timeline_view` and `\dp public.chart_event_markers_view` show grants only to `authenticated`, not `anon`.
- [ ] Anon REST probe: `curl …/rest/v1/grow_event_timeline_view?select=*` with only `apikey: <ANON>` returns `[]` or `401`, never another user's data.

---

*Document maintained by Verdant Product & Engineering.
Last updated: 2026-05-19. Design-only — no SQL, no code, no schema changes applied.*
