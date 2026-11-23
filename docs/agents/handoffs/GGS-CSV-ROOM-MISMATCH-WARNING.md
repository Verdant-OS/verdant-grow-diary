```text
TASK GGS-CSV-ROOM-MISMATCH-WARNING  priority: other  status: OPEN
goal: Warn in the CSV import review when a Spider Farmer file roomId differs from room ids already stored on that tent.
why: The dedupe key is tent+source+metric+time, so importing room 2 into a tent that holds room 1 looks like thousands of duplicates with no room warning.
branch: cursor/ggs-csv-room-mismatch-warning-b9fa
base: verdant-grow-diary
checkout: git fetch origin cursor/ggs-csv-room-mismatch-warning-b9fa verdant-grow-diary && git switch cursor/ggs-csv-room-mismatch-warning-b9fa
pr: set after the draft is opened
head_sha: set after push
state: local until push
current_step: implementation and targeted tests
next_action: confirm hosted CI at the pushed head; leave the PR draft
post_merge_check: CSV import review shows the room mismatch warning only when stored raw_payload room ids differ from the file
active_writer: Grok cloud agent
decisions: Prior room is read from sensor_readings.raw_payload.raw_row.roomId and raw_payload.room_id. No migration. Warning does not block confirm and does not change the dedupe key. Lookup failure shows no warning.
tried_and_rejected: A new room column would need a migration, which this task forbids when stored provenance already has the room id.
commands: NODE_OPTIONS=--max-old-space-size=8192 bunx tsc -p tsconfig.json --noEmit; bunx vitest run src/test/ggs-csv-room-mismatch-warning.test.tsx src/test/environment-csv-import-ui.test.tsx src/test/csv-source-label-ui-regression-v1.test.tsx --reporter=dot
files_touched: src/lib/ggsCsvRoomMismatchRules.ts src/lib/ggsCsvPriorRoomLookup.ts src/components/EnvironmentCsvImportModal.tsx src/components/EnvironmentCsvImportLauncher.tsx fixtures/sensor-csv/spider_farmer_ggs_room_1_synthetic.csv fixtures/sensor-csv/spider_farmer_ggs_room_2_synthetic.csv fixtures/sensor-csv/environment_no_room_id_synthetic.csv src/test/ggs-csv-room-mismatch-warning.test.tsx
files_remaining: none
blockers: none
open_questions: none
gotchas: Files with no roomId skip the lookup. The PostgREST filter rejects room ids outside [A-Za-z0-9_-]{1,64} and then shows no warning.
links:
artifacts:
reviewer_seat:
reviewer_sha:
session_state:
claimed_by: Grok 2026-11-23
owner: Grok
last_updated: 2026-11-23 12:45 CT, by Grok
```
