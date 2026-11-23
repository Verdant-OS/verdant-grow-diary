# DASHBOARD-PLANT-LATEST-READING-20261123

```text
TASK DASHBOARD-PLANT-LATEST-READING-20261123  priority: P2  status: OPEN
goal: the Dashboard tent card and the plant page "Current Environment" card name the same latest reading for one tent.
why: core-loop walkthrough on prod (2026-11-20, Fixture Tent A): the plant page showed 75.0 F captured 14 days earlier, the Dashboard tent card showed 77.0 F captured Oct 31 as the tent's latest. Code trace: the plant page (PlantTentEnvironmentPanel) merges the tent's sensor rows with Quick Log manual environment readings, newest observation first (mergePlantTentReadingsWithManualEvents); the Dashboard tent card (Dashboard.tsx latestPerTent -> buildTentSnapshotView) read sensor rows alone, so a newer Quick Log reading never reached it. That the 75 F value is a Quick Log manual reading is inference from the code paths; production rows were not read.
branch: claude/project-thread-8zmrgw
base: verdant-grow-diary (started at ab8826ac72220b9da1fcf3ef57b0740812e9561f)
checkout: git fetch origin claude/project-thread-8zmrgw verdant-grow-diary && git switch claude/project-thread-8zmrgw
pr: see the draft PR from claude/project-thread-8zmrgw (number recorded on update)
head_sha: recorded on the PR; this file is written before the first push
state: pushed draft
current_step: CI on the draft PR, then an independent exact-head review
next_action: read the 35 required checks at the PR head; fix any red check in files_touched only; then route one review to an eligible Reviewer A, D or C seat that did not author or repair this PR.
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, signed in as the disposable fixture account, read only: Fixture Tent A's Dashboard tent card and its plant page Current Environment card show the same temperature, source and capture time. No writes.
active_writer: Claude thread session (cmsg_01P7pGxx3V5wxVuLXvJUxaGsTAW8dwDELDERFjzgci8Uxg)
decisions: (1) one merge rule for both surfaces: new pure src/lib/dashboardTentSnapshotRowsRules.ts (evidence filter on sensor rows, this tent's Quick Log temperature/RH rows via tonightRowsFromQuickLogManualReadings, newest observation first with input order as tie-breaker, then the plant page's mergePlantTentReadingsWithManualEvents). (2) only the tent card's snapshot input changes; charts, stability and the canonical VPD input keep sensor rows (the Tents list strip keeps canonical VPD on Tonight's raw rows per Codex P1 on #2437). (3) mergePlantTentReadingsWithManualEvents's type constraint widened to a structural ManualMergeReadingRow; runtime unchanged. (4) staleness stays with buildTentSnapshotView: a 14-day-old manual reading renders Stale, never healthy.
tried_and_rejected: per-metric merge via resolveDisplayedTentClimateSnapshot (Tent Detail's rule) would have kept the Dashboard on a different rule from the plant page; rewriting buildTentSnapshotView was out of proportion for this slice.
commands: bunx vitest run src/test/dashboard-tent-latest-reading-matches-plant-page.test.ts src/test/dashboard-environment-sensor-truth-states.test.tsx src/test/dashboard-sensor-provenance-fence.test.ts --reporter=dot
files_touched: src/lib/dashboardTentSnapshotRowsRules.ts (new); src/lib/plantManualEnvironmentEventRules.ts (type only); src/pages/Dashboard.tsx; src/test/dashboard-tent-latest-reading-matches-plant-page.test.ts (new); src/test/dashboard-environment-sensor-truth-states.test.tsx (pin renegotiated: tentRows -> snapRows, scorer unlock declared); this file
files_remaining: none planned
blockers: local vitest/typecheck/lint BLOCKED in this container (bun install --frozen-lockfile gets 403 from the pinned registry). The new test and the 8 pure related test files ran under bun's runner with a vitest shim (90 pass); CI is the evidence for the rest.
open_questions: remaining divergences left as they are: the plant page reads Quick Log entries for this plant or tent-wide, the tent card all of the tent's; the plant page does not apply the Dashboard evidence filter to sensor rows; the /tents list strip shows sensor rows first and Quick Log cards only when no sensor row exists; Tent Detail lets a manual value win per metric only when strictly newer.
gotchas: PR #3021 also edits Dashboard.tsx (alert stage scope, lines ~290-350); no line overlap with latestPerTent. Stay off the Timeline header path (separate task). No schema, RLS, edge, auth, billing or production changes.
links: walkthrough notes (Nov 20) in the project task notes; PR #3021 (separate workstream).
artifacts: PR checks on the draft PR
reviewer_seat: eligible independent reviewer (Reviewer A, D or C), not this session
reviewer_sha: none yet
session_state: Claude thread session for task ueefa0ea7bcb46abc9076b59f93389442
claimed_by: Claude thread session, 2026-11-23 01:55 UTC
owner: Claude thread session
last_updated: 2026-11-23 02:20 UTC, by Claude
```
