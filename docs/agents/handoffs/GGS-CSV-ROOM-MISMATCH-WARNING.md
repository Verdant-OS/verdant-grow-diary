```text
TASK GGS-CSV-ROOM-MISMATCH-WARNING  priority: other  status: OPEN
goal: Warn in the CSV import review when a Spider Farmer file roomId differs from room ids already stored on that tent.
why: The dedupe key is tent+source+metric+time, so importing room 2 into a tent that holds room 1 looks like thousands of duplicates with no room warning.
branch: cursor/ggs-csv-room-mismatch-warning-b9fa
base: verdant-grow-diary
checkout: git fetch origin cursor/ggs-csv-room-mismatch-warning-b9fa verdant-grow-diary && git switch cursor/ggs-csv-room-mismatch-warning-b9fa
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3058
head_sha: af950d495764179362241dd32a9a73c94914ec66
state: open, not a draft. Required CI runs on this pull request. This session does not change ready state or merge.
current_step: Seat A re-review fixes at af950d495764179362241dd32a9a73c94914ec66
next_action: read the PR Checks tab for required CI on the commit after this paperwork push
post_merge_check: CSV import review shows the room mismatch warning when stored raw_payload room ids and the file's room ids are not the same set, and stays silent for the same room, no stored room, or a file with no roomId
active_writer: Grok cloud agent
decisions: Prior room is read from sensor_readings.raw_payload.raw_row.roomId and raw_payload.room_id. No migration. Warning does not block confirm and does not change the dedupe key. Lookup failure shows no warning. A file that contains the tent's stored room plus another room warns, because the sets are not equal. head_sha above is the Seat A reviewed parent, not the paperwork commit.
tried_and_rejected: A new room column would need a migration, which this task forbids when stored provenance already has the room id. Warning only on stored rooms missing from the file hid a file that kept the old room and added a new one.
commands: bunx vitest run src/test/ggs-csv-room-mismatch-warning.test.tsx src/test/environment-csv-import-ui.test.tsx src/test/csv-source-label-ui-regression-v1.test.tsx --reporter=dot
files_touched: src/lib/ggsCsvRoomMismatchRules.ts src/lib/ggsCsvPriorRoomLookup.ts src/components/EnvironmentCsvImportModal.tsx src/components/EnvironmentCsvImportLauncher.tsx fixtures/sensor-csv/spider_farmer_ggs_room_1_synthetic.csv fixtures/sensor-csv/spider_farmer_ggs_room_2_synthetic.csv fixtures/sensor-csv/environment_no_room_id_synthetic.csv src/test/ggs-csv-room-mismatch-warning.test.tsx docs/agents/handoffs/GGS-CSV-ROOM-MISMATCH-WARNING.md
files_remaining: none
blockers: none in the branch. Required CI status is on the PR Checks tab, not in this file.
open_questions: none
gotchas: Files with no roomId skip the lookup. The PostgREST filter rejects room ids outside [A-Za-z0-9_-]{1,64} and then shows no warning. File rooms are confirmed by equality probes. Extra stored rooms stop after 20 distinct ids.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/3058
artifacts:
reviewer_seat: Seat A, PASS with P2 at af950d495764179362241dd32a9a73c94914ec66
reviewer_sha: af950d495764179362241dd32a9a73c94914ec66
session_state: pull request is open and not a draft; this session does not mark it ready or merge it
claimed_by: Grok 2026-11-23
owner: Grok
last_updated: 2026-11-23 23:50 CT, by Grok
```
