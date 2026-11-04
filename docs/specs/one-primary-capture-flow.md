# One primary capture flow

Status: draft spec. Needs founder decisions D1 to D3 (§6). Spec only; no application code.

Source: live grower audit 2026-11-03, finding 9, "Multiple daily-capture concepts compete". This
spec also covers the part of finding 4 that is still open: the Field Edition block sits ahead of
the Water/Feed/Note action.

Measured on the deploy branch `verdant-grow-diary` at `c03f64a`.

## 1. Problem

The audit says a grower has to learn product distinctions before recording an observation:

- Global Quick Log is a sheet with three actions.
- `/daily-check` is titled "Quick Log". It has its own activity types, a "Choose today's check"
  block, and a separate six-step guided check.
- "Daily Grow Check", "Fast Check", "Routine Walk", "Deep Evidence Walk" and "Alert Walk" all
  appear as separate concepts.

The audit recommends one primary capture flow, with optional guides inside it.

## 2. What exists (source-traced)

| Concept                   | Where                                                                                                                | What it is                                                                                                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global Quick Log          | `src/components/AppShell.tsx` (header + and mobile FAB) opens `QuickLogV2Sheet`                                      | Sheet with three actions: `water`, `note`, `feed` (`src/lib/quickLogV2Rules.ts:9`).                                                                                                                                                                                       |
| Field Edition visit modes | `GROW_WALK_VISIT_MODES` in `src/lib/growWalkContracts.ts:4-21`                                                       | Four modes: **Fast Check** (default), **Routine Walk**, **Deep Evidence Walk**, **Alert Walk**. They render through `GuidedGrowWalkPanel` in `QuickLogV2Sheet.tsx:3586` and in `QuickLog.tsx:2302`. Presentation only: never part of a save payload (`QuickLog.tsx:474`). |
| `/daily-check` page       | `src/routes/_app/daily-check.tsx` renders `src/pages/DailyCheck.tsx`                                                 | `PageHeader title="Quick Log"` (563–564).                                                                                                                                                                                                                                 |
| Choose today's check      | `DailyCheck.tsx:928-946`                                                                                             | Two buttons. Either a plant Quick Log note or a current-tent manual sensor snapshot counts as today's Daily Grow Check.                                                                                                                                                   |
| Six-step guided check     | `DailyCheck.tsx` step cards                                                                                          | Step 1 · Select tent/plant (595), 2 · Review environment (1119), 3 · Manual sensor snapshot (1136), 4 · Quick Log (1173), 5 · Handheld readings (1218), 6 · Review alerts & pending actions (1266).                                                                       |
| All activity types        | `QuickLogAllActivitiesSection` (`DailyCheck.tsx:683`)                                                                | Driven by `QUICK_LOG_ACTIVITY_DEFINITIONS` (`src/constants/quickLogActivityTypes.ts:135`), which has ten types: note, photo, watering, feeding, environment_check, training, defoliation, issue_observation, manual_sensor_snapshot, harvest.                             |
| Daily Grow Check          | Dashboard, Plant Detail and Grow Room cards (`DailyGrowCheckStatusCard`, `DashboardDailyGrowCheckPanel`, and others) | The "checked today" status, derived from those two read paths (`src/lib/dailyCheckRefreshRules.ts`).                                                                                                                                                                      |

So four names compete for the same act of "log what I saw today": "Quick Log" (twice),
"Daily Grow Check", "Fast Check", and three "Walk" modes.

## 3. Earlier decisions this would reverse (test-pinned)

These were deliberate. They are not defects:

- **Field Edition owns first paint.** `QuickLog.tsx:2298-2301`: "Visit modes must own the grower
  Quick Log surface ahead of the legacy 'All activity types' menu." Pinned by:
  - `src/test/quick-log-guided-grow-walk-grower-path.test.tsx:103`, using `compareDocumentPosition`
  - `src/test/app-shell-header-fab-field-edition-first.test.tsx:145`
- **`/daily-check` is titled "Quick Log".** Pinned by `src/test/daily-check-quick-log-header.test.tsx:15`.

Changing either means renegotiating those pins in the same commit as the behaviour change, as a
declared renegotiation.

## 4. Safety fences (hold in every option)

- **F1:** one write path. Every save still goes through `quicklog_save_manual`, as
  `docs/specs/one-tent-loop-quicklog-single-write-path.md` requires. `applyQuickLogV2Refresh`
  and the single `verdant:entry-created` dispatch are unchanged.
- **F2:** target selection stays explicit or comes from the route. No remembered target, and no
  auto-selection of the only plant (test-pinned bans).
- **F3:** visit modes stay presentation only and are never added to a save payload.
- **F4:** the Daily Grow Check counting rule is unchanged. A plant Quick Log note or a current-tent
  manual snapshot counts. Saving still never implies the plant is healthy.
- **F5:** no new persistence, schema or RPC.

## 5. Requirements

- **R1:** per D1, each concept has one name everywhere it shows:
  - the capture sheet is "Quick Log"
  - the guided `/daily-check` flow gets one name of its own
  - the derived status stays "Daily Grow Check"
- **R2:** per D2, in the global Quick Log sheet the target, the action (Water/Feed/Note), the
  value and Save sit together. Guided walk modes stay one control away. Fast Check behaviour is
  unchanged when no mode is chosen.
- **R3:** per D3, the six-step guided check is reachable from Quick Log as "guided walk". The
  four visit modes stop being a separate menu.
- **R4:** each change renegotiates its pins (§3) in the same commit, with a stated reason.

## 6. Founder decisions

- **D1, naming.** Today `/daily-check` and the global sheet are both called "Quick Log".
  - (a) Rename the `/daily-check` page to "Daily Grow Check". The status already uses that name,
    and the page's own copy, "Choose today's check", fits it.
  - (b) Rename it "Guided check".
  - (c) Keep both called "Quick Log".
  - Recommendation: **(a)**.
- **D2, Field Edition placement in the Quick Log sheet.**
  - (a) Keep the four modes on top, as today.
  - (b) Move them below Save into a closed "Guided walk" disclosure, with Fast Check as the
    implicit default.
  - (c) Show a single mode chip ("Fast Check ▾") next to the sheet title, and open the four modes
    from it.
  - Recommendation: **(c)**. Target, action, value and Save stay together, mode choice stays one
    tap away, and the change is visible but small. This reverses the earlier first-paint decision
    (§3), so it needs your yes.
- **D3, how many capture concepts.**
  - (a) Two. Quick Log for capture. Daily Grow Check (the `/daily-check` page) as the guided walk,
    absorbing the Routine, Deep Evidence and Alert walk modes as its variants.
  - (b) Keep the four modes and the page, renamed per D1.
  - Recommendation: **(a)**, which matches the audit's "one primary capture flow with optional
    guides".

## 7. Acceptance tests

1. Global Quick Log at 390 × 844: target, action, value and Save all sit within the first viewport
   for Water. (R2)
2. Save from the sheet still calls `quicklog_save_manual` once and dispatches `verdant:entry-created`
   once, only after a confirmed save. (F1)
3. No visit-mode field appears in the save payload. (F3)
4. Opening Quick Log with no route target selects no tent or plant. (F2)
5. A Quick Log note on a plant still marks it checked today on Dashboard. (F4)
6. Per D1, no surface shows "Quick Log" as the title of `/daily-check`. (R1)
7. Per D3, the guided walk is reachable from Quick Log in one tap. (R3)

## 8. Out of scope

- The unified Timeline stream (finding 5).
- The Sensors page split (finding 7). It is still blocked by the open EcoWitt PRs.
- Any change to what counts as a Daily Grow Check.
- Any write-path change.

## 9. File plan (after D1 to D3)

1. D1 naming: `src/pages/DailyCheck.tsx`, the header copy and the pin in
   `daily-check-quick-log-header.test.tsx`. This is the smallest slice.
2. D2 placement: `QuickLogV2Sheet.tsx`, `GuidedGrowWalkPanel.tsx`, and the pins in
   `quick-log-guided-grow-walk-grower-path.test.tsx` and `app-shell-header-fab-field-edition-first.test.tsx`.
3. D3 consolidation: `growWalkContracts.ts` and `DailyCheck.tsx` (walk variants), plus navigation
   from Quick Log.

Each slice is its own PR.
