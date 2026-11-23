```text
TASK SENSOR-CSV-SATURATED-RUN  priority: other  status: OPEN
goal: Flag consecutive identical 0 or 100 soil_moisture_pct and humidity_pct runs in the sensor CSV import review.
why: The preview only flagged a column when every numeric value was 0 or 100, so mixed Spider Farmer GGS exports with 130 and 207 consecutive 100s imported with no suspect flag.
branch: cursor/sensor-csv-saturated-runs-c696
base: verdant-grow-diary
checkout: git fetch origin cursor/sensor-csv-saturated-runs-c696 verdant-grow-diary && git switch cursor/sensor-csv-saturated-runs-c696
pr: see the pull request opened from this branch
head_sha: recorded after the push
state: implemented
current_step: draft PR
next_action: wait for required CI at the pushed head; do not mark ready
post_merge_check: Full test suite shards plus Lint, typecheck, test, build stay green on verdant-grow-diary after merge
active_writer: Grok session that opened cursor/sensor-csv-saturated-runs-c696
decisions: Minimum run length is 12 consecutive identical readings, one hour at the 5-minute GGS cadence. The existing whole-column 0/100 flag stays, including files shorter than 12. A saturated run is severity warn and is not applied as a row hard or soft flag, so normal rows in the same column are not excluded.
tried_and_rejected: Raising the whole-column minimum above 2 would fail the existing two-row soil fixture. Reusing humidity_stuck at error severity would hard-block every humidity row in the review plan.
commands: bunx vitest run src/test/saturated-reading-run-rules.test.ts src/test/csv-sensor-preview-rules.test.ts src/test/sensor-import-source-apps.test.ts src/test/csv-preview-report-polish.test.tsx --reporter=dot
files_touched: src/lib/saturatedReadingRunRules.ts src/lib/csvSensorPreviewRules.ts src/lib/csvSensorPreviewWarningCopy.ts src/lib/sensorImportSourceApps.ts src/components/CsvSensorPreviewPanel.tsx src/components/CsvPreviewReviewGate.tsx src/test/saturated-reading-run-rules.test.ts
files_remaining: none
blockers: none
open_questions: none
gotchas: soil_moisture_pct matches the preview mapper only after underscores become spaces. The source-app soil scan previously stopped at 25 values and did not match underscored headers.
links: draft pull request on this branch
artifacts: /opt/cursor/artifacts/saturated-run-preview.log
reviewer_seat:
reviewer_sha:
session_state: Cursor cloud agent on cursor/sensor-csv-saturated-runs-c696
claimed_by: Grok, 2026-11-23
owner: Grok
last_updated: 2026-11-23 11:47 CT, by Grok
```
