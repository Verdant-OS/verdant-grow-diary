# GROW-ROOM-ERROR-ANNOUNCEMENTS

```text
TASK GROW-ROOM-ERROR-ANNOUNCEMENTS  priority: other  status: CLOSED
closed: merged. #2852 merged into verdant-grow-diary on 2026-11-04 as 8005737d8800b2de496aee8c56f58aae5b0a09ec (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Error messages on the grow-room and report surfaces (soil moisture calibration, dryback and watering history strips, tent irrigation history, Plant Merge, diary-range and environment report date ranges) announce themselves to screen readers.
why: Grower UX audit 2026-11-03 finding 12 (screen reader), third batch after Verdant-OS/verdant-grow-diary#2845 (entry forms) and #2850 (spine pages): 8 error elements here had no role or aria-live.
branch: claude/error-announcements-batch3
base: verdant-grow-diary
checkout: git fetch origin claude/error-announcements-batch3 verdant-grow-diary && git switch claude/error-announcements-batch3
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (this block's commit is the first)
state: fix and guard test committed.
current_step: draft PR open.
next_action: founder names reviewer and gate; route an independent exact-head review (not Claude session_017UoYKwwZkbqmWvtCRMw1DZ).
post_merge_check: on the live build, with a screen reader, enter a non-numeric dry raw point in soil moisture calibration; the error is read out and the field announces it as its description.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: refused input (soil calibration fields, Plant Merge target, report date ranges) gets role="alert"; failed loads (dryback, watering cadence, older irrigation history) get role="status". The soil fields are tied to their errors with static ids, matching their static input ids. Excluded: EnvironmentCsvImportModal (open PR #2744 touches it); ActionFollowUpEvidenceSection (its inner p already has role="alert", a wrapper role would double-announce); whole-page report error states in DiaryRangeReportPage and PostGrowLearningReport (a live region around a whole page would read the page out; needs a focus/heading approach, not a live region).
tried_and_rejected: none
commands: bunx vitest run src/test/grow-room-errors-announced.test.ts
files_touched: src/components/SoilMoistureCalibrationCaptureCard.tsx; src/components/DrybackMonitoringStrip.tsx; src/components/WateringCadenceHistoryStrip.tsx; src/components/irrigation/TentIrrigationHistoryPanel.tsx; src/components/PlantMergeDialog.tsx; src/pages/DiaryRangeReportPage.tsx; src/pages/EnvironmentSummaryReportPage.tsx; src/test/grow-room-errors-announced.test.ts; docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: none
open_questions: once #2845 and #2850 merge, the three guard tests can share one helper.
gotchas: the guard skips Button tags and the named whole-page state diary-range-report-error.
links: audit finding 12 (private upload, not committed)
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-03 22:20 CT, by Claude)
```
