# NOTEBOOK-FRICTION-BATCH-1-TRUSTWORTHY-NUMBERS

```text
TASK NOTEBOOK-FRICTION-BATCH-1-TRUSTWORTHY-NUMBERS  priority: P2  status: OPEN
goal: Stage, count and state on the plant, grow and /plants pages each come from one source, so a Flower plant is not judged or labelled by seedling numbers (friction items 1 and 2 of the 2026-11-19 field-notebook walk).
why: Walk on the live build 0d9e9c0 found a Flower plant with open alerts quoting seedling ranges, a "Good" grow beside open alerts and "No recent check-in", and /plants saying 3 plants over 2 cards. Wrong targets can push a wrong cultivation decision.
branch: claude/project-thread-jeosyv
base: verdant-grow-diary at 0d9e9c081973ea3e4ff86f5cd8822d5cfab3f1be
checkout: git fetch origin claude/project-thread-jeosyv verdant-grow-diary && git switch claude/project-thread-jeosyv
pr: the draft PR opened from this branch
head_sha: read the PR's current full head; a commit cannot name itself.
state: Implemented. Pure rules plus thin wiring. Four new test files; 63 pure tests pass locally (scratch vitest 4.1.12, node env). Mounted .tsx tests, full tsc, lint and build NOT_MEASURED locally (bun install --frozen-lockfile BLOCKED by registry 403); required CI provides them.
current_step: Ready for review (Cheek, 2026-11-19: "Mark both ready"). Codex bot P1 on the first ready head (aa94427) fixed: Dashboard persistence now uses the same snapshot-tent stage scope as the Alerts page.
next_action: Read required CI at the new PR head; fix any failure from this code. Then route one eligible independent reviewer through the Coordinator. No merge, auto-merge or deploy without Matthew's yes naming the PR and full head SHA.
post_merge_check: After an approved release, read-only on production as the disposable fixture account: plant BREAK-4pm-2 shows the stale-stage note under seedling-range alerts; the Grow page status is not "Good" while open alerts exist; the /plants summary count equals the visible cards.
active_writer: Claude thread session (Cheek asked on 2026-11-19 03:08 UTC: "write build specs for batches 1 and 2 then build").
decisions: (1) Tent-scoped alert stage: when the snapshot names a grow tent, only that tent, its plants and the grow's tentless plants vote; precedence unchanged. (2) Stale-stage alerts are labelled, never auto-resolved (no new writes). The stage is read back from the app's own reason format because alerts has no stage column. (3) Grow status: an open critical alert gives Needs Review, any open alert gives Watch, and the freshness window is NO_RECENT_LOG_STALE_AFTER_HOURS (72 h) instead of 7 days. (4) The /plants summary counts plantsForList; growArchived counts as inactive. (6) Codex P1 on #3021 (aa94427): Dashboard.tsx resolved its persisted stage over the whole tent selection, so one tent-attributed reading could open opposite-direction alerts on Dashboard and Alerts. Dashboard now runs resolveSnapshotStageScope over its selected tents (new resolveSelectedTentStagePlants keeps tent ids); a reading spanning tents keeps the selection scope. Pre-existing difference kept: the Alerts page counts grow plants with no tent, the Dashboard does not.
tried_and_rejected: Auto-resolving stale-stage alerts (a write the grower did not ask for). Adding alerts.evaluated_stage (schema change; needs Matthew).
commands: vitest run src/test/alert-snapshot-stage-scope.test.ts src/test/alert-stage-staleness.test.ts src/test/grow-status-open-alerts.test.ts src/test/plants-page-summary-matches-grid.test.ts src/test/grow-status-helpers.test.ts src/test/plantsPageFilterRules.test.ts
files_touched: src/lib/alertSnapshotStageScopeRules.ts (new); src/lib/alertStageStalenessRules.ts (new); src/lib/alertPlantStageScopeRules.ts; src/lib/growStatus.ts; src/lib/plantsPageFilterRules.ts; src/components/AlertsAutoPersistForGrow.tsx; src/components/PlantAssignedTentAlertsPanel.tsx; src/hooks/useGrowDetailData.ts; src/pages/PlantDetail.tsx; src/pages/Plants.tsx; four new tests in src/test/; this file.; src/pages/Dashboard.tsx; src/test/alerts-stage-resolution-wiring.test.tsx (pin renegotiated)
files_remaining: Deferred from the batch 1 spec: Timeline header stage from the resolver; one day counter; "You rated: Healthy" wording; Timeline reading-count mismatch (root cause not traced).
blockers: Local full suite, tsc, lint and build BLOCKED (no node_modules; registry 403). Independent review not requested yet.
open_questions: Whether to add alerts.evaluated_stage later (schema; Matthew).
gotchas: The RED proof set aside the growStatus.ts and plantsPageFilterRules.ts edits (5 failures) and removed the two new rule modules (2 suites fail). Prettier 3.7.3 rewrapped an unrelated RecentState type in useGrowDetailData.ts; reverted to keep pins.
links: Spec in the project's verdant-ui-notes/batch-1-trustworthy-numbers-spec.md (outside the repo).
artifacts: none
reviewer_seat: an available independent non-contributing Claude or Grok session, or Codex; this Claude thread session is excluded.
reviewer_sha: NOT_MEASURED
session_state: No subagents, routines or production actions. No review request sent.
claimed_by: Claude thread session, 2026-11-19 03:20 UTC
owner: Claude thread session
last_updated: 2026-11-19 03:30 UTC, by Claude thread session
```
