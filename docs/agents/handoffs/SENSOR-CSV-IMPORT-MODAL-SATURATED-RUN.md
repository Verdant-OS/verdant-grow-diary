# SENSOR-CSV-IMPORT-MODAL-SATURATED-RUN

```text
TASK SENSOR-CSV-IMPORT-MODAL-SATURATED-RUN  priority: P3  status: OPEN
goal: Show the saturated-run warning (12 or more consecutive identical 0% or 100% humidity or soil moisture readings) in the in-app tent CSV import modal, before confirm.
why: Issue #3071. #3059 added the warning only to /sensors/csv-preview. The real import path, EnvironmentCsvImportModal ("Import historical data" on /sensors), did not call SaturatedReadingRunRules, so a stuck probe could go into tent history with no warning.
branch: posthog-self-driving/fixsensors-show-saturated-run-warning-b7e557
base: verdant-grow-diary
checkout: git fetch origin posthog-self-driving/fixsensors-show-saturated-run-warning-b7e557 verdant-grow-diary && git switch posthog-self-driving/fixsensors-show-saturated-run-warning-b7e557
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3076 (draft; closes #3071)
head_sha: 505fe0d91d009ddc1a65be1da60214ae51d3f977 (last code commit, 2026-11-24); later commits on this branch change only this file
state: pushed draft
current_step: draft PR open; required CI runs on the PR
next_action: read the PR Checks tab; if 35/35 required checks are green, request one independent exact-head review under docs/agents/OWNERSHIP.md section 4.3
post_merge_check: after the merge is live (/version.json reports the merge SHA), on https://verdantgrowdiary.com with the disposable fixture account, /sensors Import historical data with a synthetic file of 14 consecutive humidity 100 rows shows "Saturated reading run · humidity_pct · 14 consecutive readings at 100%" before confirm, and confirm stays enabled; cancel without a write. NOT_MEASURED until then.
active_writer: PostHog Desktop Claude session that opened this branch
decisions: New pure helper src/lib/environmentCsvSaturatedRunRules.ts maps parsed rows (humidity_pct, soil_moisture_pct, captured_at, rowNumber) to SaturatedReadingSample and reuses findRuns and describe, so both entry points share one detector and one threshold. Lines use the existing CSV_PREVIEW_WARNING_COPY saturated_reading_run title and whyItMatters copy. Warning only: canConfirmImport, rowsToPersist and the confirm payload are unchanged. Runs are found over parsed validRows; a blank cell is null and ends a run.
tried_and_rejected: Running detectFlags from csvSensorPreviewRules on the raw file was rejected; the modal already has parsed rows, and a second parse would duplicate header detection.
commands: bunx vitest run src/test/environment-csv-saturated-run-warning.test.tsx --reporter=dot; bunx vitest run $(grep -rln "EnvironmentCsvImportModal\b\|EnvironmentCsvImportLauncher" src/test) --reporter=dot; bun run typecheck
files_touched: src/lib/environmentCsvSaturatedRunRules.ts src/components/EnvironmentCsvImportModal.tsx src/test/environment-csv-saturated-run-warning.test.tsx docs/agents/handoffs/SENSOR-CSV-IMPORT-MODAL-SATURATED-RUN.md
files_remaining: none
blockers: none in the branch
open_questions: none
gotchas: Rows the parser skips (invalid cells, unresolved time) are not in validRows, so they do not end a run in the modal; the preview page works on raw cells. Humidity cells between 0 and 1 are scaled to percent by the parser, so a cell of 1 is 100.
links: https://github.com/Verdant-OS/verdant-grow-diary/issues/3071 https://github.com/Verdant-OS/verdant-grow-diary/pull/3059
artifacts: PR Checks tab
reviewer_seat: none requested yet
reviewer_sha: none
session_state: PostHog Desktop cloud task; no routines, no paused workflows; no PR comment posted (GitHub comments need founder approval), so resume-here facts are in this file and the PR body
claimed_by: Claude (PostHog Desktop), 2026-11-24
owner: Claude (PostHog Desktop)
last_updated: 2026-11-24 03:35 CT, by Claude
```
