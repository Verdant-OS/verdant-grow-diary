
# Pheno Tracker Report

Read-only aggregation of what already exists in `pheno_*` tables plus diary events per plant, organized by hunt → candidates. Pro/Craft/Founder-gated at all three layers (client, DB RLS, edge assert — the class of bug the earlier Craft miss surfaced).

## Delivery order (three slices, each independently mergeable)

### Slice 1 — Per-plant Report panel (this turn)
Collapsible panel on the existing plant detail page. No new route. Aggregates *this plant's* pheno + diary rows.

### Slice 2 — Per-hunt Report route (follow-up)
`/pheno-hunts/:id/report` inside the existing Pheno workspace. Groups candidates by hunt with per-candidate summaries. Reuses the Slice-1 view model.

### Slice 3 — Print/PDF export (follow-up)
Print-friendly variant of the Slice-2 route (`?view=print`) using the browser's print stylesheet. No PDF library added — CSS `@media print` only, matching existing app conventions.

## Slice 1 scope (what I'll build now)

**Data assembled per plant** — one read per source, all owned by `auth.uid()` via existing RLS:
- Candidate row: `plants` (name, candidate_label, candidate_number, stage, plant_type)
- Hunt context: `pheno_hunts` via `plants.pheno_hunt_id` (name, status)
- Stage transitions: `grow_events` where `event_type = 'stage_change'`
- Stress / smoke / lab: `pheno_stress_observations`, `pheno_smoke_tests`, `pheno_lab_results`
- Keeper / reversal decisions: `pheno_keeper_decisions_log`, `pheno_reversals`
- Photos + observations: `photo_events`, `observation_events`
- Latest scores: `pheno_candidate_scores` (most recent round only)

**Empty states** honest per Verdant copy voice ("No stress observations logged yet"), never fabricated.

**Gate** — panel renders an upgrade CTA (reusing existing PaywallCta pattern) for non-Pro plans; no data fetched when gated. Server-side RLS remains the truth.

## File-level plan

**New (all pure or presenter):**
- `src/lib/phenoTrackerReportRules.ts` — pure aggregation: takes raw rows, returns `PhenoPlantReport` (grouped, sorted newest-first, deterministic tie-break on id). No React/Supabase/clock reads; time injectable.
- `src/lib/phenoTrackerReportRules.test.ts` — happy path, empty inputs, null/invalid rows, deterministic ordering, entitlement-gated shape.
- `src/hooks/usePhenoPlantReport.ts` — TanStack Query hook that fans out the reads (parallel), returns `{ report, loading, error, gated }`. Skips fetch when `hasFeature("pheno_tracker") === false`.
- `src/components/PhenoTrackerReportPanel.tsx` — presenter. Collapsible, honest empty/loading/gated states, reuses existing card/badge tokens. No business logic.

**Modified (minimal):**
- Plant detail page (locate exact file during implementation — likely `src/pages/PlantDetail.tsx` or similar) — mount `<PhenoTrackerReportPanel plantId={plant.id} />` under the existing sections. One import + one JSX line.

**Not touched this slice:**
- No schema changes. Every table already exists with the right RLS.
- No new route, no manifest changes (Slice 2).
- No new edge function. Reads only; existing SELECT policies suffice.
- No export/print code (Slice 3).

## Technical details

- All reads go through the authenticated `supabase` client — RLS already scopes to `user_id = auth.uid()`.
- Aggregation is pure: hook returns raw rows, `phenoTrackerReportRules.buildPlantReport(rows, now)` groups them. Keeps testing deterministic.
- Sort order: newest first, tiebreak by row id (ascending). Explicit — no relying on Postgres row order.
- Gate check: `hasFeature(resolvedEntitlement, "pheno_tracker")` from existing `src/lib/featureEntitlements.ts`. Craft/Founder already in `PRO_PLAN_IDS` after the recent fix.
- No `service_role`, no client entitlement grants, no localStorage flags.

## Tests (Slice 1)

Targeted unit tests in `phenoTrackerReportRules.test.ts`:
1. Happy path — plant with entries in every category returns grouped shape.
2. Empty inputs — plant with zero rows returns each group as `[]`, not undefined.
3. Null/invalid rows — malformed timestamps/nulls filtered out, not crashed.
4. Deterministic order — same inputs in shuffled order yield identical output.
5. Latest-score selection — multiple rounds returns only the newest.

No E2E in this slice (panel is a presenter over existing data; no state machine to prove). E2E added with Slice 2 route.

## Validation

- `bunx tsgo --noEmit`
- Targeted: `bunx vitest run src/lib/phenoTrackerReportRules.test.ts`
- Not running full suite (per your standing instruction — it hangs).

## Safety verdict

- No schema, RLS, edge, auth, entitlement, or Action Queue changes.
- No new copy claims (no "unlimited", no unverified integrations).
- No device control, no automation, no telemetry provenance change.
- Gate handled at three layers already; presenter is the fourth (UI) layer.

## Deferred (Slice 2 + 3, not this turn)

- `/pheno-hunts/:id/report` route + `appRouteManifest.ts` entry + mobile route-coverage test update.
- Hunt-level view model that composes per-plant reports.
- Print stylesheet + `?view=print` variant.
- Playwright E2E for the report route.

## Risks / rollback

- Risk: plant detail page location may differ from guess. Mitigation: grep before editing; report exact file in implementation notes.
- Rollback: revert 4 new files + one JSX line. Zero DB impact.

Confirm Slice 1 scope and I'll implement.
