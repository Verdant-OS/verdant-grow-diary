```text
TASK GGS-CSV-ROOM-MISMATCH-WARNING  priority: other  status: OPEN
goal: Warn in the CSV import review when a Spider Farmer file roomId differs from room ids already stored on that tent.
why: The dedupe key is tent+source+metric+time, so importing room 2 into a tent that holds room 1 looks like thousands of duplicates with no room warning.
branch: cursor/ggs-csv-room-mismatch-warning-b9fa
base: verdant-grow-diary
checkout: git fetch origin cursor/ggs-csv-room-mismatch-warning-b9fa verdant-grow-diary && git switch cursor/ggs-csv-room-mismatch-warning-b9fa
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3058
head_sha: bfcded7a0a7218e7aba60e217d0df0526224a82c
state: pushed draft. Required full-suite jobs skip while the PR is draft. Marking it ready is the owner's call.
current_step: Seat A P2 paperwork and mixed-room warning fix, one push
next_action: owner decides whether to mark the draft ready so the required suite runs
post_merge_check: CSV import review shows the room mismatch warning when stored raw_payload room ids and the file's room ids are not the same set, and stays silent for the same room, no stored room, or a file with no roomId
active_writer: Grok cloud agent
decisions: Prior room is read from sensor_readings.raw_payload.raw_row.roomId and raw_payload.room_id. No migration. Warning does not block confirm and does not change the dedupe key. Lookup failure shows no warning. A file that contains the tent's stored room plus another room warns, because the sets are not equal. head_sha above is the Seat A reviewed parent, not the paperwork commit.
tried_and_rejected: A new room column would need a migration, which this task forbids when stored provenance already has the room id. Warning only on stored rooms missing from the file hid a file that kept the old room and added a new one.
commands: bunx vitest run src/test/ggs-csv-room-mismatch-warning.test.tsx src/test/environment-csv-import-ui.test.tsx src/test/csv-source-label-ui-regression-v1.test.tsx --reporter=dot
files_touched: src/lib/ggsCsvRoomMismatchRules.ts src/lib/ggsCsvPriorRoomLookup.ts src/components/EnvironmentCsvImportModal.tsx src/components/EnvironmentCsvImportLauncher.tsx fixtures/sensor-csv/spider_farmer_ggs_room_1_synthetic.csv fixtures/sensor-csv/spider_farmer_ggs_room_2_synthetic.csv fixtures/sensor-csv/environment_no_room_id_synthetic.csv src/test/ggs-csv-room-mismatch-warning.test.tsx docs/agents/handoffs/GGS-CSV-ROOM-MISMATCH-WARNING.md
files_remaining: none
blockers: required CI stays skipped until the owner marks the draft ready
open_questions: none
gotchas: Files with no roomId skip the lookup. The PostgREST filter rejects room ids outside [A-Za-z0-9_-]{1,64} and then shows no warning. Each probe reads at most 20 payloads.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/3058
artifacts:
reviewer_seat: Seat A, PASS with P2 at bfcded7a0a7218e7aba60e217d0df0526224a82c
reviewer_sha: bfcded7a0a7218e7aba60e217d0df0526224a82c
session_state: draft; owner has not marked it ready
claimed_by: Grok 2026-11-23
owner: Grok
last_updated: 2026-11-23 23:40 CT, by Grok
```
