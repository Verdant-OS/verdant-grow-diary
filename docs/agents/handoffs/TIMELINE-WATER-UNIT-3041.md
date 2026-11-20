# TIMELINE-WATER-UNIT-3041

```text
TASK TIMELINE-WATER-UNIT-3041  priority: P3-as-other  status: OPEN
goal: Timeline shows a stored watering amount in the grower's Quick Log Water unit (1500 ml stored reads "1.5 L" when the unit is L). Display only.
why: issue #3041 / VER-498. Since #3036 Quick Log shows water in the chosen unit; Timeline still showed ml ("Watering · 1500 ml"). The water-units spec deferred readback (docs/specs/quick-log-water-volume-units.md §9); #3041 asks for it.
branch: posthog-self-driving/fixtimeline-show-watering-volume-in-the-bdff48 (name fixed by the PostHog run that opened it)
base: verdant-grow-diary (started at 73695a5ba09d774b56cbf1852911c92e73ccea8c)
checkout: git fetch origin posthog-self-driving/fixtimeline-show-watering-volume-in-the-bdff48 verdant-grow-diary && git switch posthog-self-driving/fixtimeline-show-watering-volume-in-the-bdff48 && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: see the draft PR from the branch above
head_sha: recorded on the PR; this file is written before the first push
state: pushed draft
current_step: CI on the draft PR
next_action: confirm 35/35 required checks at the PR head; then request an eligible independent exact-head review
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, with the disposable test account and its fixture plant: log a [smoke <timestamp>] Water of 1.5 L, confirm Timeline Recent Quick Logs reads "Watering · 1.5 L" and the card reads "Water Volume 1.5 L"; NOT_MEASURED until then
active_writer: PostHog Desktop self-driving Claude session (this run)
decisions: (1) the visible string comes from quickLogEventIdentityRules.buildSummarySuffix via QuickLogHistoryPanels, and from the card detail line in timelineDiaryEntryDetailPresentationRules; growDiaryTimelineRules.buildSubtitle is not rendered anywhere, so it is unchanged. (2) unit source is the existing per-device loadWaterVolumeEntryUnit (default L); rows do not store their entry unit. (3) waterUnit is an optional option that defaults to ml, so every other caller (plant recent activity, PDF export, calendar, reports) is unchanged. (4) feeding volumes stay ml (the Feed form enters ml). (5) saveWaterVolumeEntryUnit now dispatches a same-tab change event so a mounted Timeline follows a unit change.
tried_and_rejected: changing buildSubtitle only (the report's suggestion) — it would not change what the grower sees.
commands: bunx vitest run src/test/timeline-watering-volume-unit.test.tsx; bun run typecheck; bunx eslint <touched files>
files_touched: src/lib/quickLogWaterVolumeUnitRules.ts, src/lib/waterVolumeEntryUnitPreference.ts, src/hooks/useWaterVolumeEntryUnit.ts, src/lib/quickLogEventIdentityRules.ts, src/lib/quickLogHistoryRules.ts, src/lib/timelineDiaryEntryDetailPresentationRules.ts, src/components/QuickLogHistoryPanels.tsx, src/components/TimelineEvidenceDetailPreview.tsx, src/pages/Timeline.tsx, src/test/timeline-watering-volume-unit.test.tsx
files_remaining: none planned
blockers: none. Locally, 26 tests in 7 Quick Log storage-recovery suites fail identically on the base commit (machine-local storage behavior); CI gates.
open_questions: should Plant Detail recent activity, calendar, range report and PDF export also follow the unit? Left as ml (spec §9 scope).
gotchas: src/test/setup.ts pins the unit to ml for every test; a test of the L default must remove the key first. No schema, RLS, edge, auth, billing or production change.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3041; related #2168, #3036
artifacts: PR checks on the draft PR
reviewer_seat: eligible independent reviewer per the roster, not this session
reviewer_sha: none yet
session_state: PostHog Desktop self-driving run; no routines or paused workflows
claimed_by: PostHog Desktop self-driving Claude session, 2026-11-20
```
