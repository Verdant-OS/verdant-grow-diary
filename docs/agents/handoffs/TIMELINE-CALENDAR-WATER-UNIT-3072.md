# TIMELINE-CALENDAR-WATER-UNIT-3072

```text
TASK TIMELINE-CALENDAR-WATER-UNIT-3072  priority: other (P3)  status: OPEN
goal: The diary calendar detailed history row and the "View event details" drawer show a stored watering amount in the grower's Quick Log Water unit (1500 ml stored reads "1.5 L" when the unit is L). Display only.
why: issue #3072, a follow-up to #3044. After #3044 the Timeline chip and history card follow the water unit, but the calendar row and drawer still wrote "<n> ml", so one event showed two units on one screen. L is the default unit for a phone with no saved choice.
branch: posthog-self-driving/fixtimeline-show-water-amount-in-the-b483d9 (name fixed by the PostHog run that opened it)
base: verdant-grow-diary (started at 9c844347c691090eb56ecfa1b6eb63398d03e742)
checkout: git fetch origin posthog-self-driving/fixtimeline-show-water-amount-in-the-b483d9 verdant-grow-diary && git switch posthog-self-driving/fixtimeline-show-water-amount-in-the-b483d9 && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: NOT_MEASURED until the draft PR opens; see the PR for this branch
head_sha: read it from the PR; this file is in the first commit
state: pushed draft
current_step: fix and tests in the first commit
next_action: required CI at the PR head, then an eligible independent exact-head review (not this session)
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, with the disposable test account and its fixture plant: log a [smoke <timestamp>] Water of 1.5 L with the unit at L, then confirm the Timeline chip, the history card, the calendar detailed row and View event details all read 1.5 L; NOT_MEASURED until then
active_writer: PostHog Desktop self-driving Claude session (this run)
decisions: (1) formatDiaryCalendarWateringAmount in diaryCalendarViewModel.ts is the one formatter for both surfaces; it uses the existing formatStoredWaterVolume. (2) DiaryCalendarSection reads the unit with useWaterVolumeEntryUnit, next to its useTemperatureUnitPreference call, as WateringHistoryPanel and QuickLogHistoryPanels do. The report proposed a prop from Timeline; the hook gives the same unit with no change to Timeline.tsx. (3) Both builders take the unit as optional and default to ml, so other callers keep "<n> ml". (4) A row that stores litres (watering_amount_l) converts to ml first (rounded to 0.001 ml), so it follows the same unit; with ml it now reads "1500 ml" where it read "1.5 L". (5) Feeding volumes stay ml (6c4afa52); the calendar feeding builders show no volume, so they are unchanged.
tried_and_rejected: none
commands: bunx vitest run src/test/diary-calendar-water-unit.test.tsx; bunx vitest run src/test/diary-calendar src/test/timeline-watering src/test/timeline-feeding; bun run typecheck; bunx eslint src/lib/diaryCalendarViewModel.ts src/lib/diaryCalendarEventDrawerViewModel.ts src/components/DiaryCalendarSection.tsx src/test/diary-calendar-water-unit.test.tsx
files_touched: src/lib/diaryCalendarViewModel.ts, src/lib/diaryCalendarEventDrawerViewModel.ts, src/components/DiaryCalendarSection.tsx, src/test/diary-calendar-water-unit.test.tsx, docs/agents/handoffs/TIMELINE-CALENDAR-WATER-UNIT-3072.md
files_remaining: none planned
blockers: none
open_questions: Plant Detail recent activity, range report and PDF export still show ml (out of #3072 scope).
gotchas: src/test/setup.ts pins the water unit to ml for every test; a test of the L default must remove the key first. No schema, RLS, auth, edge or storage change; the calendar modules are not in the edge shared-lib mirror.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3072; https://github.com/Verdant-OS/verdant-grow-diary/pull/3044
artifacts: required CI on the PR for this branch
reviewer_seat: eligible independent reviewer per the roster, not this session
reviewer_sha: none yet
session_state: PostHog Desktop self-driving run; no routines or paused workflows
claimed_by: PostHog Desktop self-driving Claude session, 2026-11-24
owner: PostHog Desktop self-driving Claude session
last_updated: 2026-11-24, by PostHog Desktop self-driving Claude session
```
