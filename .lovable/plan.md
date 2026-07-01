# Verdant Quick Log Activity Types v1a — end-to-end wiring plan

The shared foundation (constants, rules, saved-items breakdown, timeline label resolver, and their tests) already shipped in a prior slice. What's outstanding is the UI wiring, the actual save routing per activity in `QuickLog.tsx` / `DailyCheck.tsx` / the Plant page fast-actions, and the additional test coverage. Doing all of that atomically in one turn against `QuickLog.tsx` (1864 lines) and `DailyCheck.tsx` (1126 lines) would violate the "small additive slice" rule and put the Quick Log path — Gate 1 — at real regression risk.

I want to split this into three tightly-scoped sub-slices, each independently reviewable, testable, and revertable. All three keep the same hard fences: no schema/RLS/Edge/auth/grant changes, no Harvest save path, no fake observation mapping for Harvest, no recommendation/diagnosis copy, no sensor-truth weakening, no Action Queue changes.

## Sub-slice v1a.1 — Activity picker unification (UI-only, no save changes)

Goal: every entry-point uses `QUICK_LOG_ACTIVITY_DEFINITIONS` as its label/description/safety-note/disabled source.

Files:
- `src/components/QuickLog.tsx` — replace the local activity/type array with a presenter driven by `QUICK_LOG_ACTIVITY_LIST`. Existing save handlers stay in place; only the picker grid + safety copy source changes. Harvest renders disabled with `disabledReason`.
- `src/pages/DailyCheck.tsx` — same treatment for its fast-action grid.
- `src/components/PlantDetailQuickActions.tsx` (or the plant fast-action menu it drives) — reuse the shared list where it currently duplicates labels.
- Tests: extend `src/components/QuickLog.test.tsx` and add `src/test/quick-log-activity-picker.test.tsx` to assert every supported activity label is present, Harvest shows the disabled reason, and no duplicate taxonomy leaks.

Fences: no save-path edits, no dispatch changes, no timeline changes. Zero risk to persistence.

## Sub-slice v1a.2 — Save routing wiring

Goal: each supported activity persists through the correct existing RPC using `planQuickLogPersistence`.

- Route Note/Watering → `quicklog_save_manual` with `p_action=note|water`.
- Route Feeding/Training/Photo/Environment check/Issue/Defoliation → `createQuickLogEvent` (already wraps `quicklog_save_event`).
- Defoliation submits `event_type=training` with `details.subtype="defoliation"` via the existing `p_details` field on `createQuickLogEvent` (no new field, no schema change).
- Issue/observation submits `event_type=observation` with `details.subtype="issue"`.
- Manual sensor snapshot continues to use the existing manual sensor path (already working from prior slice).
- Harvest: submit is blocked at the presenter (button disabled + guard in submit handler that returns early with the shared disabled copy). No RPC call, no `verdant:entry-created` dispatch.
- `verdant:entry-created` fires only on RPC success. Failed save shows an error state; no Saved-to-Timeline banner.

Tests: `src/test/quick-log-activity-save-routing.test.ts` — mocks `supabase.rpc` and asserts the exact RPC name + payload per activity, plus zero-call assertions for Harvest and for unsupported ids.

## Sub-slice v1a.3 — Post-save + Timeline consistency + full test sweep

- Confirm `buildDailyCheckSavedItems` already emits the right saved-breakdown labels for the new activities (from prior slice) and add any missing wiring in `DailyCheck.tsx` post-submit rendering.
- Confirm Timeline card rendering calls `resolveQuickLogEventTimelineLabel` so Defoliation renders only with the subtype fence and generic training stays Training.
- Add: `src/test/quick-log-activity-timeline-labels.test.ts`, extend `quick-log-post-save-saved-items.test.ts` with defoliation/issue/environment cases, add a Harvest-exclusion test asserting Harvest never appears in saved breakdown or Timeline.
- Run the full validation battery listed in the task (targeted vitest files + `sensor-safety-check.mjs` + `assert-sensor-intelligence-safety.mjs` + `test:docs-demo-safety` + `test:client-secret-boundary` + `tsgo --noEmit`) and report exact counts.

## What stays out of scope (v1b blockers)

- Real Harvest logging (DB validator + RPC allow-list + optional harvest schema).
- Any change to `validate_grow_event`, `quicklog_save_event`, or `quicklog_save_manual`.
- Any Action Queue, alerts, AI Doctor, or device-control behavior.

## Ask

Approve this three-slice split and I'll start with v1a.1 immediately in the next turn. If you'd rather I collapse it into one mega-turn against `QuickLog.tsx` + `DailyCheck.tsx` I can, but I'd flag that as higher regression risk to Gate 1 and want that acknowledged before proceeding.
