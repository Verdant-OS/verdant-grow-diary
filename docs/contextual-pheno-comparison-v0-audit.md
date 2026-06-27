# Contextual Pheno Comparison — V0 Audit (read-only foundation)

## Summary

This document records a read-only feasibility audit for the proposed
**Contextual Pheno Comparison** feature in Verdant, scoped strictly to the V0
One-Tent Loop. The goal of this slice is to prove what comparison evidence
Verdant can already surface from existing rows — plants, diary/timeline
entries, photos, and sensor snapshots — **without** introducing new schema,
materialized views, AI insights, PDF export, or sharing.

No schema, RLS, Edge Function, migration, AI, alert, or Action Queue change is
introduced. Comparison logic is implemented as a single pure view-model
(`src/lib/contextualPhenoComparisonViewModel.ts`) with targeted tests and a
static safety scan.

## Why the full implementation is too large for this slice

The full Contextual Pheno Comparison vision implies:

- persistent comparison sessions (new table)
- saved selection decisions (new table)
- materialized plant-context views (new view + refresh policy)
- a formal trait scoring system (new schema + RLS)
- AI-generated comparison insights (model calls + cost surface)
- PDF export and share links (new artifact + storage path)
- multi-plant selection routing/UI

All of those would require schema, RLS, AI gateway use, and a sharing surface
— each of which is explicitly out of scope for V0 (Gate 1: 30-second Quick
Log). Shipping any of them now risks fake-live data classification, blind
automation pathways, and broad rewrites against an unproven UX. A read-only
foundation is the safe slice.

## Existing data Verdant can use now

Discovered while auditing `src/lib/` (representative, not exhaustive):

- **Plant metadata**: `src/lib/plantProfileContextViewModel.ts`,
  `src/lib/plantGrowContextRules.ts`, `src/lib/plantTentRelationshipRules.ts`
  already expose `stage`, `strain`, `growId`, `tentId`, and status fields in a
  null-safe way. `plantId` and `plantLabel` are universal.
- **Diary / timeline evidence**: `src/lib/diaryTimelineViewModel.ts`,
  `src/lib/growDiaryTimelineRules.ts`, and `src/lib/plantRecentActivityRecap.ts`
  expose counts of diary entries, photos, watering, feeding, and training-like
  events.
- **Sensor snapshots**: `src/lib/sensor/sensorSourceRules.ts` defines the
  canonical sources (`live | manual | csv | demo | stale | invalid`). Existing
  Ecowitt and GGS adapters provide `captured_at`, `tent_id`, optional
  `plant_id`, and `confidence`/source labels.
- **AI Doctor context**: `src/lib/aiDoctorContextCompiler.ts` and
  `src/lib/aiDoctorReadinessViewModel.ts` already aggregate trusted vs.
  untrusted sources per plant. Their source-quality breakdown is the model we
  reuse here (without making any AI call).
- **Alerts**: `src/lib/alerts.ts` and `alertFreshnessContext.ts` expose a
  per-plant/per-tent alert count surface.

All of these are already null-safe pure helpers, which is exactly what the V0
comparison view-model needs.

## Existing data Verdant cannot safely infer (must not fake)

- **Formal trait scores** (`structure`, `vigor`, `aroma`, `yield estimate`).
  No table or scorer exists. Free-text grower notes must NOT be parsed into
  pseudo-scores.
- **Phenotype "winner" selection**. There is no rubric, no audit trail, no
  approval flow. We must not rank plants automatically.
- **Strain / medium / pot size inference** from notes, tent names, or photos.
  `plantProfileContextViewModel.ts` already enforces this rule; we inherit it.
- **Environmental "healthy" claims** when the only available sensor readings
  are demo / stale / invalid / unknown. The view-model surfaces trust
  warnings instead.
- **AI commentary** about why one plant is preferable. Out of scope; would
  require gated model calls.

## Safe V0 comparison contract

Implemented in `src/lib/contextualPhenoComparisonViewModel.ts`:

```text
buildContextualPhenoComparisonView(inputs): ContextualPhenoComparisonView
  inputs:  2..4 ContextualPhenoPlantInput rows (caller-loaded, no I/O)
  output:
    - caveat (immutable string, no auto-winner)
    - per-plant comparison cards
        plant identity (id, label, grow, tent, strain, stage, status)
        evidence counts (diary, photos, watering, feeding, training, sensors, alerts)
        sensor sourceCounts split per canonical source (no merging)
        environmentSummary built from TRUSTED readings only
          (live | manual | csv; demo/stale/invalid/unknown excluded)
        trustWarnings list (deterministic, sorted)
        missingContext list
        comparisonNotes (verbatim grower notes; whitespace stripped)
    - crossPlantMissingContext
    - sourceQualitySummary (aggregate split per canonical source)
  errors: too_few_plants | too_many_plants | duplicate_plant_ids
```

Determinism guarantees:

- output is a pure function of input
- plants are stably ordered by `plantLabel`, then `plantId`, then input index
- trust warnings are sorted alphabetically
- invalid numeric values (`NaN`, `Infinity`) are ignored, never averaged

## Blocked / future schema items (NOT implemented in V0)

These are explicitly future work and must not be added in this slice:

- `pheno_comparison_sessions` (persistence of a comparison run)
- `pheno_selection_decisions` (grower's chosen pheno + rationale)
- `plant_context_materialized` view (refreshable aggregate)
- `plant_trait_scores` (formal scoring per trait per plant)
- AI Doctor "comparison insight" generator (model call + cost meter)
- PDF / share artifact path (storage bucket + signed URL flow)
- Action Queue suggestions ("propose to keep / cull plant X")

When any of these are picked up later, they each need: dedicated audit,
schema + RLS + grants, server-side enforcement, and runtime harness tests.

## Safety constraints honored by this slice

- No Supabase reads or writes from the view-model.
- No AI / model calls; no cost surface introduced.
- No Action Queue, alert, or device-control wording.
- Demo / stale / invalid / unknown sensor sources are never folded into
  trusted averages and never described as healthy.
- No ranking, "winner", "best pheno", or automatic-selection language appears
  in source — enforced by the static safety scan inside
  `src/test/contextual-pheno-comparison-view-model.test.ts`.
- Approval-required philosophy preserved: this module only describes
  available context; the grower decides.

## Recommended next slice (after V0 foundation)

1. Read-only route/component mock at `/internal/pheno-comparison-preview`
   that renders `buildContextualPhenoComparisonView` against fixture data or
   existing plant rows loaded via current hooks.
2. No new schema, no AI, no PDF/share, no Action Queue.
3. Add presenter-level snapshot tests for source-quality badges and the
   missing-context block, reusing the AI Doctor readiness badge styling
   conventions.

Only after that preview lands and is reviewed should any of the
"Blocked / future" schema items be considered.
