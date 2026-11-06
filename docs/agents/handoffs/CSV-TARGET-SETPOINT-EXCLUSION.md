# CSV-TARGET-SETPOINT-EXCLUSION

```text
TASK CSV-TARGET-SETPOINT-EXCLUSION  priority: P1  status: OPEN
goal: Environment CSV import never saves a target, setpoint or goal column as a sensor reading, for soil or air metrics, whatever the column order.
why: Matthew, 2026-11-05: hold #2902 for a sensor-truth defect. At 7ec28e9bad414eb2500094b83b12d42ba2252074 a CSV with soil_temp_target_c=30 before soil_temp_c=20 saved 30 °C and listed the real 20 °C as "not imported". Moisture and EC targets did the same. #2902 merged as 1ba766fbb6fa864e93341c13937dc978649c1db6 (2026-11-05 23:34 UTC) before the hold could be applied, so this is a follow-up fix PR, not a repair of #2902. Verified while reproducing: air humidity, VPD and CO₂ had the same defect (only air temperature excluded targets); Matthew chose to include air in this fix.
branch: claude/csv-target-setpoint-exclusion
base: verdant-grow-diary @ 1ba766fbb6fa864e93341c13937dc978649c1db6
checkout: git fetch origin claude/csv-target-setpoint-exclusion verdant-grow-diary && git switch claude/csv-target-setpoint-exclusion
pr: see the PR linked from this branch (draft)
head_sha: see the branch tip / PR head; verify before resuming
state: round 2 pushed after independent review REQUEST_CHANGES at 360ab4dd11ae457031cc2c4c9bb67a6adab96d2b (review 5794086235, session_017UoYKxhRUChV9czUzAnUtU); needs a fresh exact-head review of the widened matcher
current_step: PR #2908 marked ready (Matthew's per-item yes for 360ab4dd); round 2 fixes the review's P2 and the cheap P3 (tgt/desired/ideal)
next_action: watch required CI at the PR head; route an eligible independent reviewer (not this session, not session_017UoYKypTBCTMSkumzPzSJa, which authored #2902) per OWNERSHIP.md §4.3
post_merge_check: once live /version.json reports the merge SHA, import a synthetic CSV with soil_temp_target_c before soil_temp_c into a verified disposable fixture tent on https://verdantgrowdiary.com; confirm the stored soil_temp_c is the observation and the preview lists the target as not imported. NOT_MEASURED until then.
active_writer: Claude session_017UoYKwtXgN34MaeSUiEsYz
decisions:
  - New isTargetHeader() in src/lib/csvParser.ts matches target | set.?point | goal | standalone "sp". detectColumns sets these headers aside before soil and air matching, so first-match-wins can never pick a target. The existing air-temperature exclusion (/setpoint|target/) is left in place; it is now redundant but harmless.
  - Round 2 (review P2): isTargetHeader also matches set[\s_.-]?p(oin)?t (SetPt, Set Pt, set_pt), dotted S.P., standalone set/setting, tgt, desired and ideal. Standalone sp/set before a digit ("SP1") is set aside on purpose: ambiguous, and not importing beats saving a setpoint (review P3, accepted and pinned).
  - Target columns are listed in unsupportedColumns (file order) so the preview's existing "Not imported" note names them. No copy change.
  - The soil-only message now keys off unsupported soil columns only, so an air target-only file is not told it "has soil readings only".
tried_and_rejected: excluding targets only inside classifySoilHeaders (leaves air humidity/VPD/CO₂ broken); adding min/max, limit, alarm or threshold to the exclusion (they may be real aggregate readings or alarm config; outside the target/setpoint/goal spec; review P3 agrees it is a separately scoped follow-up); unlocking the round-1 test file (scorer-lock) to append cases: new cases went in a new file instead, so no existing check was edited.
commands: bunx vitest run src/test/csv-parser-target-setpoint-exclusion.test.ts --reporter=dot; all src/test/*csv* files under TZ=UTC and TZ=America/Los_Angeles; NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck
files_touched: src/lib/csvParser.ts; src/test/csv-parser-target-setpoint-exclusion.test.ts (new, round 1); src/test/csv-parser-setpoint-spellings.test.ts (new, round 2); this file
files_remaining: none
blockers: none in code
open_questions: (0) follow-up slice: limit/alarm/threshold columns (humidity_high_limit, humidity_alarm_high, humidity_threshold) still import as readings when placed first (review P3). (1) the "Not imported" note says "Verdant doesn't recognize these columns yet", which is loose for a deliberately ignored target column; copy change left for a separate slice. Also CSV_SOIL_ONLY_MESSAGE still says soil columns aren't imported, though #2902 imports soil temp/moisture/EC (review P3, pre-existing; copy slice). (2) Whether 1ba766fb is live on production: NOT_MEASURED in this session.
gotchas: tsc needs NODE_OPTIONS=--max-old-space-size=8192. node_modules installed with bun install --frozen-lockfile (succeeded here).
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2902 (merged; introduced soil mapping); docs/agents/handoffs/CSV-IMPORT-TIME-INTEGRITY.md
reviewer_seat: Claude review session session_017UoYKxhRUChV9czUzAnUtU (ROUTE https://github.com/Verdant-OS/verdant-grow-diary/pull/2908#issuecomment-6673129207); verdict REQUEST_CHANGES at 360ab4dd (filed as COMMENT because GitHub blocks REQUEST_CHANGES from the PR's own account)
reviewer_sha: 360ab4dd11ae457031cc2c4c9bb67a6adab96d2b (REQUEST_CHANGES; superseded by round 2 head)
session_state: no production access used; GitHub writes: PR #2908, one [ROUTE] comment, ready-for-review (Matthew's yes); safety-net check-in trig_013m2QJgFUhRXpH6yLwBcEab
claimed_by: Claude session_017UoYKwtXgN34MaeSUiEsYz, 2026-11-05 23:45 UTC
owner: Claude
last_updated: 2026-11-06 00:40 UTC, by Claude
```
