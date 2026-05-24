# Daily Grow Check Operating Loop

This document captures the contract for the Daily Grow Check feature so future
changes do not accidentally break entry-source routing, QuickLog prefill,
post-submit confirmation, logged-at display, or refresh behavior.

Scope: UI, routing, and data-freshness only. No persistence, no streak tables,
no sensor ingestion changes, no automation, no device control.

## What counts as a Daily Grow Check

A plant is considered "checked today" when either:

- A plant **QuickLog** entry exists for the plant on the current day, or
- A **current-tent manual sensor snapshot** exists for the plant's tent on the
  current day.

No other source counts. There is no separate streak table and no fake local
checked state.

Both paths are exposed on `/daily-check` as first-class options in the
**Choose today's check** section: "Add plant note" opens the existing
QuickLog dialog, "Add sensor snapshot" jumps to the existing manual
sensor reading card and is disabled (with a safe message) when the
selected plant has no tent assignment.

## Happy path (from Dashboard)

1. Dashboard renders the **Today's Grow Checks** panel listing active plants
   and which are still unchecked today.
2. The "Start today's check" CTA for an unchecked plant opens
   `/daily-check?plantId=<id>&from=dashboard`.
3. Daily Check page validates `plantId` against plants in scope.
4. **QuickLog prefill** selects the plant from the route param.
5. Grower submits QuickLog and the write succeeds.
6. QuickLog dispatches the `verdant:entry-created` window event with
   `detail.createdAt` set to the server-acknowledged timestamp.
7. Daily Check success card appears (only after the event is observed).
8. Success card shows **Logged at &lt;time&gt;** derived from
   `detail.createdAt`.
9. Primary CTA returns the grower to the Dashboard (`/`).
10. Dashboard panel refreshes immediately via **React Query invalidation** of
    `diary_entries` and `sensor_readings`.
11. Plant Detail's **Daily Grow Check Consistency** card reflects today's
    check on next view.

## Plant Detail path

1. Plant Detail's consistency CTA opens
   `/daily-check?plantId=<id>&from=plant-detail`.
2. After successful submit, the success primary CTA returns the grower to
   `/plants/<id>`. The Dashboard remains available as a secondary action.

## Fallback and edge paths

- **Missing `plantId`**: Daily Check renders without prefill; QuickLog plant
  picker stays empty and the grower selects manually.
- **Invalid `plantId`** (malformed): treated as missing; no prefill.
- **Out-of-scope `plantId`** (archived, merged, inactive, or not owned by the
  current grower's visible scope): treated as missing; no prefill.
- **Unknown or missing `from`**: defaults to dashboard-style return (primary
  CTA back to `/`). No error surface.
- **Failed QuickLog submit**: no `verdant:entry-created` event is dispatched,
  no success card is shown, and no Dashboard refresh is triggered.
- **Invalid, missing, or future `createdAt`**: success card still appears on
  the event but the "Logged at" line is omitted rather than showing a bogus
  time.
- **Manual current-tent sensor snapshot**: counts as a check for that plant
  for the day, exactly like a QuickLog. The manual sensor reading hook
  dispatches `verdant:sensor-reading-created` with `detail.createdAt` and
  `detail.tentId` on a successful insert; the Daily Check success card,
  Dashboard panel, and Plant Detail consistency card all listen for both
  `verdant:entry-created` and `verdant:sensor-reading-created`.
- **Plant without tent on manual snapshot**: the "Add sensor snapshot"
  option is disabled and a safe "Sensor snapshots need a tent assignment."
  message renders. No tent is silently selected.

## What must not happen

- No fake local-only "checked today" state that survives without backing data.
- No new streak persistence table.
- No "perfect", "completed", or "guaranteed healthy" copy.
- No automation, scheduled jobs, or device control wired from this loop.
- No writes to `action_queue` from the Daily Grow Check loop.
- No changes to sensor ingestion behavior.
- No `service_role` usage in client code.

## Files

- `src/pages/DailyCheck.tsx` — route, prefill, success card, logged-at, CTAs.
- `src/components/QuickLog.tsx` — dispatches `verdant:entry-created` with
  `detail.createdAt` on successful write.
- `src/components/DashboardDailyGrowCheckPanel.tsx` — Today's Grow Checks
  panel, listens for the event and invalidates React Query caches.
- `src/components/PlantDailyGrowCheckConsistencyCard.tsx` — Plant Detail
  consistency view, listens for the event and invalidates caches.
- `src/lib/dailyCheckPostSubmitRules.ts` — source-aware CTA rules.
- `src/lib/dailyCheckPlantSelectionRules.ts` — plant validation for route
  handoff.
- `src/lib/dailyCheckRefreshRules.ts` — shared React Query invalidation keys.
- `src/lib/dailyGrowCheckGuidanceRules.ts` — empty / inconsistent state copy.
- `src/lib/dashboardDailyGrowCheckPanelRules.ts` — panel selection logic.
