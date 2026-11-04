# Grow-scoped pickers: keep the active grow as the context

Status: DRAFT spec, Claude. Founder decisions recorded 2026-11-03 (§7): D1 (a), D2 (a), D3 (b) always.
Source findings: grower workflow audit 2026-11-03, finding 1 ("Context does not travel
consistently") and finding 10 ("Account clutter overwhelms selection").
Deploy branch audited: `verdant-grow-diary` at `72e17e5` (#2775).

The audit asked for "one explicit grow/tent context" and to "ask rather than silently selecting a
different tent". This spec does that with the context the app already has, the **active grow**. It
does **not** add a remembered tent or plant target. That stays banned and test-pinned
(`src/test/quick-log-remembered-target-write-paths.test.tsx`; CLAUDE.md: "remembered-target and
only-plant auto-selection are banned").

## 1. Evidence (established fact, deploy branch)

| Audit observation                                                                         | Cause in source                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sensors opened "UX Audit Test Tent", not the active grow's tent                           | `Sensors.tsx:105` calls `useGrowTents()` with no grow, so every non-archived tent in the account is listed newest first (`growRepo.ts:25-27`). With no route tent, `resolveGrowTentSelection` returns `availableIds[0]` (`growTentSelectionRules.ts:49`), i.e. the newest tent in any grow      |
| Daily Check opened with "Dry Tent" selected                                               | `DailyCheck.tsx:161` calls `useTents()` (all grows); with no route tent and no plant, `DailyCheck.tsx:322-327` sets the tent to `selectableTents[0]`                                                                                                                                            |
| Global Quick Log listed all account tents and plants                                      | `QuickLogV2Sheet.tsx:817-832` passes every grow id as visible to `buildQuickLogV2TargetOptions` (`quickLogV2Rules.ts:63`), so targets from all grows appear in one list                                                                                                                         |
| Action Queue said it was scoped to the active grow while its switcher said "Switch grow…" | The page filters by `urlGrowId ?? activeGrowId` (`ActionQueue.tsx:407`) but passes only `urlGrowId` to `GrowBreadcrumbs` (`ActionQueue.tsx:1011`). With no grow in the URL, `GrowSwitcher` gets `currentGrowId = null` and shows the "Switch grow…" placeholder (`GrowBreadcrumbs.tsx:152-163`) |
| An active grow already exists                                                             | `src/store/grows.tsx:69-119` keeps `activeGrowId` per owner (`verdant.activeGrow.<ownerId>`) and falls back to the first grow (`:266-269`)                                                                                                                                                      |

`practical observation`: the audit account has 15 tents across several grows, including test and
legacy tents. Ordering "newest first across all grows" puts whatever was created last, often a test
tent, in front of the grower.

## 2. Requirements

- **R1. The active grow is the default scope.** Sensors, Daily Check and the global Quick Log list
  the active grow's non-archived tents and plants first, under the grow's name. Tents and plants of
  other grows stay reachable below them in a collapsed "Other grows" group (D1 a). A grow in the
  route (`/grows/:growId/...`) wins over the active grow, as today.
- **R2. No silent tent choice outside the active grow.** With no route tent and no explicit grower
  choice, Sensors and Daily Check preselect a tent only when the active grow has exactly one
  non-archived tent, and only once the tent list has loaded (D2 a). They never fall back to the
  newest tent in another grow. Quick Log does not use this rule (R4).
- **R3. Ask when there is no single answer.** When D2 does not preselect, Sensors and Daily Check
  show "Choose a tent" with no tent selected, and fetch no tent readings until one is chosen. They
  never show another grow's readings under the current page.
- **R4. Quick Log targets stay explicit.** The global Quick Log keeps today's rule: no target is
  preselected unless it comes from the route (or the confirmed sole-plant tent launch from #2793).
  Only the ordering and grouping of the list change (R1). No last-used target is stored or restored.
- **R5. Name the scope the page uses.** Where a page filters by the active grow, its grow switcher
  shows that grow, not "Switch grow…". Action Queue passes the same grow id it filters by.
- **R6. Large accounts (finding 10).** Every tent and plant picker covered here always offers
  type-to-filter by name, whatever the number of options (D3 b). Filtering matches across both the
  active grow's group and the "Other grows" group, and a match inside a collapsed group expands it.
  Archived tents and plants stay hidden as today.
- **R7. Copy is data.** Group headings ("Other grows"), "Choose a tent" and any helper text live in a
  constants module with exact-string tests.

## 3. Out of scope

- Remembering a last-used tent or plant (banned).
- Any schema, RLS or storage change. The active grow stays in its existing per-owner local storage.
- Merging capture flows (finding 9) or Timeline unification (finding 5).
- Dashboard, which already scopes by `urlGrowId` (`Dashboard.tsx:190-192`).

## 4. Safety fences

- No page shows a tent's readings as current for a tent the grower did not choose or the route did
  not name, except the D2 single-tent case on Sensors and Daily Check within the active grow.
- Unknown or loading tent lists never preselect (same as `tentsLoaded` gating today).
- Quick Log never writes to a target the grower did not see selected beside Save.
- The active grow fallback (`grows[0]` when none stored) is unchanged.

## 5. Acceptance tests

Pure rules (a new `src/lib/growScopedPickerRules.ts`, no React or I/O):

1. Given tents in grows A (active) and B, the ordered options put all of A's tents first under A's
   name, then B's under a collapsed "Other grows" group (D1 a).
2. With no route tent and no explicit choice: active grow has one tent → that tent (D2 a); two or
   more → no selection; zero → no selection. A newer tent in grow B is never selected.
3. A route grow overrides the active grow for scope and preselection.
4. Archived tents never appear; a list still loading never preselects.
5. Deterministic order: grow group, then tent name (stable tie-break by id).

Components:

6. Sensors with an active grow of two tents and no route tent shows "Choose a tent" and makes no
   sensor-readings request until a tent is chosen.
7. Daily Check with no route tent and no plant does not select a tent from another grow.
8. Global Quick Log lists the active grow's targets first; no target is preselected
   (`quick-log-remembered-target-write-paths.test.tsx` stays green unchanged).
9. Action Queue with no grow in the URL shows the active grow's name in the switcher, not
   "Switch grow…".
10. Every covered picker shows the filter, including one with a single option. Typing filters by
    name across both groups and expands "Other grows" when a match is there; clearing the filter
    restores the full grouped list.

Each new test must fail before the change (RED count in the PR body).

## 6. File-level plan (implementation slice, not this PR)

- New: `src/lib/growScopedPickerRules.ts`, `src/constants/growScopedPickerCopy.ts`, tests above.
- Edit: `src/pages/Sensors.tsx` (scope tents to the route or active grow; D2 preselection;
  "Choose a tent"), `src/lib/growTentSelectionRules.ts` or a wrapper (no cross-grow fallback),
  `src/pages/DailyCheck.tsx` (replace the `selectableTents[0]` default), `src/components/QuickLogV2Sheet.tsx`
  (grouped options only; target rule untouched), `src/pages/ActionQueue.tsx` (pass `effectiveGrowId`
  to `GrowBreadcrumbs`).
- Untouched: Quick Log save path, remembered-target guards, the active-grow store, schema.

Collision check at `72e17e5`: no open PR touches `Sensors.tsx`, `DailyCheck.tsx`,
`growTentSelectionRules.ts`, `sensorRouteTentIntentRules.ts`, `GrowBreadcrumbs.tsx` or
`src/store/grows.tsx`. #2814 changes one line in `QuickLogV2Sheet.tsx` (the Water prefill), unrelated.

## 7. Founder decisions

Recorded 2026-11-03 (Matthew): **D1 (a)** other grows shown in a collapsed group; **D2 (a)**
preselect only when the active grow has exactly one tent, on Sensors and Daily Check only, never
while the tent list is loading, and Quick Log's target rule unchanged; **D3 (b)** always show
type-to-filter (not the recommended threshold). The options are kept below for the record.

- **D1. Other grows in pickers.** (a) Show them below the active grow under a collapsed "Other grows"
  group. (b) Hide them; switching grow is the way to reach them. **Recommended: (a)**: a grower
  logging in a second room should not have to leave the sheet, and the active grow still comes first.
- **D2. Preselecting a tent with no route tent.** (a) Preselect only when the active grow has exactly
  one tent; otherwise ask. (b) Never preselect; always ask. **Recommended: (a)** for Sensors and Daily
  Check, which read rather than write; Quick Log keeps its own rule (R4).
- **D3. Type-to-filter threshold.** (a) More than 8 options. (b) Always. (c) Never in this slice.
  **Recommended: (a)**.

## 8. Unknowns

- `NOT_MEASURED`: which build production served during the audit (no `/version.json` recorded).
- `NOT_MEASURED`: how many accounts have more than one grow or more than 8 tents; no usage data read.
- `inference`: "Dry Tent" and "UX Audit Test Tent" were the newest tents in the audit account; the
  audit does not record creation dates.
