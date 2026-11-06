# CSV-LIMIT-THRESHOLD-EXCLUSION

```text
TASK CSV-LIMIT-THRESHOLD-EXCLUSION  priority: P1  status: OPEN
goal: Environment CSV import never saves a limit, alarm, alert, threshold or trigger column as a sensor reading, for any soil or air metric, whatever the column order. Aggregate readings (min, max, avg) stay importable.
why: Sensor truth. At #2908's head 87cc94041ed27648a7a62efe1a7f0bbdc181c2af (and at deploy tip 01f30d11ad3337c3788e18fc46aae33a871e7677 before this change) humidity_high_limit=70 before humidity=50 saved 70; humidity_alarm_high, humidity_threshold, Humidity Low Limit, temp_high_limit_c (beats temperature_f), co2_alert, vpd_trigger, soil_temp_alarm_c and soil_moisture_low_limit did the same. #2908 deliberately left these out; Matthew's comment on #2908 named this the separate follow-up.
branch: claude/csv-limit-threshold-exclusion
base: verdant-grow-diary @ 01f30d11ad3337c3788e18fc46aae33a871e7677
checkout: git fetch origin claude/csv-limit-threshold-exclusion verdant-grow-diary && git switch claude/csv-limit-threshold-exclusion
pr: see the draft PR linked from this branch
head_sha: see the branch tip / PR head; verify before resuming
state: pushed draft; independent exact-head review requested
current_step: draft PR open; required CI and independent review pending
next_action: an eligible independent reviewer (not session_017UoYKvcBMuMR8Aor8Egv, the author; not session_017UoYKwtXgN34MaeSUiEsYz or session_017UoYKypTBCTMSkumzPzSJa) reviews the exact PR head per OWNERSHIP.md §4.3
post_merge_check: once live /version.json reports the merge SHA, import a synthetic CSV with humidity_high_limit before humidity into a verified disposable fixture tent on https://verdantgrowdiary.com; confirm the stored humidity is the observation and the preview lists the limit as not imported. NOT_MEASURED until then.
active_writer: Claude session_017UoYKvcBMuMR8Aor8Egv
decisions:
  - One added pattern in isTargetHeader (src/lib/csvParser.ts): /limit|alarm|alert|threshold|trigger/ as a substring. It reuses #2908's set-aside path, so these columns land in unsupportedColumns in file order and the existing "Not imported" note names them. No copy change.
  - min/max/avg are NOT excluded (acceptance 3). No evidence or decision to treat them as configuration. Note: with humidity_max placed before humidity, first-match still saves the max; that ordering behavior is unchanged and out of scope.
  - Substring match fails safe: a real reading header containing one of the words would be set aside (not imported), never misread.
tried_and_rejected: word-boundary matching (would miss humidity_alarm_high-style joins); adding min/max (acceptance 3); editing #2908's test files (new cases go in a new file; no existing test edited).
spellings_tested: limit/alarm columns set aside — temperature_alarm_high_c, temp_high_limit_c, humidity_high_limit, Humidity Low Limit, humidity_alarm_high, humidity_threshold, RH Alert (%), vpd_trigger, VPD Max Limit (kPa), co2_alert, CO2 Alarm Threshold, ppfd_low_alert, PAR Trigger, soil_temp_alarm_c, soil_moisture_low_limit, soil_ec_high_limit, Soil EC Threshold. Still imported — humidity_max, humidity_min, humidity_avg, Max Humidity, Average Humidity, co2_avg, VPD Max (kPa), PPFD Avg, Temp Max (C), Soil Temp Min (C), Humidity (%), RH Sensor 2, Indoor Humidity(%), CO2 Level, VPD (kPa), PPFD Sensor, PAR (umol), Soil Moisture (%), Soil EC (mS/cm). Not set aside — Dew Point, Light Intensity, Leaf Temp Delta.
commands: TZ=UTC bunx vitest run src/test/csv-parser-limit-threshold-exclusion.test.ts --reporter=dot; for z in UTC America/Los_Angeles; do TZ=$z bunx vitest run src/test/*csv* --reporter=dot; done; NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck
files_touched: src/lib/csvParser.ts; src/test/csv-parser-limit-threshold-exclusion.test.ts (new); this file
files_remaining: none
blockers: none in code
open_questions: (0) Already-saved rows: limit values imported before this lands stay stored as readings; finding them needs a production read (NOT_MEASURED, not attempted). (1) First-match ordering for aggregate columns (max before the plain reading) is unchanged; needs Matthew's decision if it should change.
gotchas: tsc needs NODE_OPTIONS=--max-old-space-size=8192. node_modules installed with bun install --frozen-lockfile (succeeded; no lockfile change).
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2908 (merged as 01f30d11; target/setpoint exclusion); docs/agents/handoffs/CSV-TARGET-SETPOINT-EXCLUSION.md
reviewer_seat: requested (see the PR's [ROUTE] comment)
reviewer_sha: none yet
session_state: no production access used. Check-in trig_01Ai7H8CduzUBJJf566fXZEC fired and is done.
claimed_by: Claude session_017UoYKvcBMuMR8Aor8Egv, 2026-11-06 02:20 UTC
owner: Claude
last_updated: 2026-11-06 02:35 UTC, by Claude
```
