# DASHBOARD-PLANT-LATEST-READING-20261123

```text
TASK DASHBOARD-PLANT-LATEST-READING-20261123  priority: P2  status: OPEN
goal: the Dashboard tent card and the plant page "Current Environment" card name the same latest reading for one tent.
why: core-loop walkthrough on prod (2026-11-20, Fixture Tent A): the plant page showed 75.0 F captured 14 days earlier, the Dashboard tent card showed 77.0 F captured Oct 31 as the tent's latest. Code trace: the plant page (PlantTentEnvironmentPanel) merges the tent's sensor rows with Quick Log manual environment readings, newest observation first (mergePlantTentReadingsWithManualEvents); the Dashboard tent card (Dashboard.tsx latestPerTent -> buildTentSnapshotView) read sensor rows alone, so a newer Quick Log reading never reached it. That the 75 F value is a Quick Log manual reading is inference from the code paths; production rows were not read.
branch: claude/project-thread-8zmrgw
base: verdant-grow-diary (started at ab8826ac72220b9da1fcf3ef57b0740812e9561f)
checkout: git fetch origin claude/project-thread-8zmrgw verdant-grow-diary && git switch claude/project-thread-8zmrgw
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3049 (out of draft since 2026-11-23 02:08 UTC on Matthew's own word; merge not covered)
head_sha: paperwork on parent 4a8f3c66f47c818aafd98762891740798177ee27. Code unchanged since 311d07ca64daf6615dbf313def4add4479081cf6. Any later head needs fresh CI and fresh exact-head passes.
state: ready for review (not draft; out of draft since 2026-11-23 02:08 UTC)
current_step: required checks at the PR head (39 pass + 1 skip), then clean exact-head passes from Seat A (Sour Diesel), Seat D (Maui Wowie) and Seat C (Durban Poison), plus Cheek's own-words yes at that SHA in UK Cheese's chat. Owner yes: pending.
next_action: read the required checks at the PR head (39 pass + 1 skip); fix any red check in files_touched only. #3049 is GATED: merge needs clean Seat A (Sour Diesel), Seat D (Maui Wowie) and Seat C (Durban Poison) passes at the exact head, plus Cheek's own-words yes at that SHA in UK Cheese's chat. GitHub approvals, relayed yeses and PR comments do not count. Owner yes: pending.
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, signed in as the disposable fixture account, read only: Fixture Tent A's Dashboard tent card and its plant page Current Environment card show the same temperature, source and capture time. No writes.
active_writer: Claude thread session (cmsg_01P7pGxx3V5wxVuLXvJUxaGsTAW8dwDELDERFjzgci8Uxg)
decisions: (1) one merge rule for both surfaces: new pure src/lib/dashboardTentSnapshotRowsRules.ts (evidence filter on sensor rows, this tent's Quick Log temperature/RH rows via tonightRowsFromQuickLogManualReadings, newest observation first with input order as tie-breaker, then the plant page's mergePlantTentReadingsWithManualEvents). (2) only the tent card's snapshot input changes; charts, stability and the canonical VPD input keep sensor rows (the Tents list strip keeps canonical VPD on Tonight's raw rows per Codex P1 on #2437). (3) mergePlantTentReadingsWithManualEvents's type constraint widened to a structural ManualMergeReadingRow; runtime unchanged. (4) staleness stays with buildTentSnapshotView: a 14-day-old manual reading renders Stale, never healthy.
tried_and_rejected: per-metric merge via resolveDisplayedTentClimateSnapshot (Tent Detail's rule) would have kept the Dashboard on a different rule from the plant page; rewriting buildTentSnapshotView was out of proportion for this slice.
commands: bunx vitest run src/test/dashboard-tent-latest-reading-matches-plant-page.test.ts src/test/dashboard-environment-sensor-truth-states.test.tsx src/test/dashboard-sensor-provenance-fence.test.ts --reporter=dot
files_touched: src/lib/dashboardTentSnapshotRowsRules.ts (new); src/lib/plantManualEnvironmentEventRules.ts (type only); src/pages/Dashboard.tsx; src/test/dashboard-tent-latest-reading-matches-plant-page.test.ts (new); src/test/dashboard-tent-latest-reading-rendered.test.tsx (new, rendered Dashboard wiring, per Codex P2); src/test/dashboard-environment-sensor-truth-states.test.tsx (pin renegotiated: tentRows -> snapRows, unlock pending Cheeko's yes); this file
files_remaining: none planned
blockers: typecheck and lint not run in this paperwork pass. bunx vitest run of dashboard-tent-latest-reading-matches-plant-page.test.ts, dashboard-environment-sensor-truth-states.test.tsx, dashboard-sensor-provenance-fence.test.ts, dashboard-stability-per-tent-scope.test.ts, dashboard-environment-stability-chip.test.ts and dashboard-tent-latest-reading-rendered.test.tsx: 60 passed, 0 failed (2026-11-23, this environment).
open_questions: remaining divergences left as they are: the plant page reads Quick Log entries for this plant or tent-wide, the tent card all of the tent's; the plant page does not apply the Dashboard evidence filter to sensor rows; the /tents list strip shows sensor rows first and Quick Log cards only when no sensor row exists; Tent Detail lets a manual value win per metric only when strictly newer; Dashboard manuals include diary snapshots (Quick Log environment events limited to 200 and diary snapshots limited to 50 in useSensorsQuickLogManualReadings) versus environment events limited to 50 on the plant page (PLANT_MANUAL_ENV_EVENT_LIMIT).
gotchas: PR #3021 also edits Dashboard.tsx (alert stage scope, lines ~290-350); no line overlap with latestPerTent. Stay off the Timeline header path (separate task). No schema, RLS, edge, auth, billing or production changes.
links: walkthrough notes (Nov 20) in the project task notes; PR #3021 (separate workstream).
artifacts: PR checks on https://github.com/Verdant-OS/verdant-grow-diary/pull/3049 (open, not a draft)
reviewer_seat: GATED. Merge needs clean exact-head passes from Seat A (Sour Diesel), Seat D (Maui Wowie) and Seat C (Durban Poison), plus Cheek's own-words yes at that SHA in UK Cheese's chat. GitHub approvals, relayed yeses and PR comments do not count. Owner yes: pending. No seat verdict is recorded on this paperwork commit.
reviewer_sha: none yet
session_state: Claude thread session for task ueefa0ea7bcb46abc9076b59f93389442
claimed_by: Claude thread session, 2026-11-23 01:55 UTC
owner: Claude thread session
last_updated: 2026-11-23 07:10 CT, by Grok: restored the GATED three-seat gate that 4a8f3c66f47c818aafd98762891740798177ee27 replaced. Required checks: 39 pass + 1 skip. Owner yes: pending. Handoff-only change; src/ is unchanged.
```
