# STRUCTURED-READINGS-REVIEW-FIXES

```text
TASK STRUCTURED-READINGS-REVIEW-FIXES  priority: P2  status: CLOSED
closed: merged. #2863 merged into verdant-grow-diary on 2026-11-04 as fb3ea19f678d3869f51f124859e4ed0b5361eb39 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Ship the #2820 grower-bug slices together with the two review fixes (pin the soil-temperature entry unit once typing starts; keep structured readings and the soil unit in Note drafts). This PR replaces #2820.
why: The independent review failed #2820 at 1c0f0ecb with two P2s (soil temperature reinterpreted on unit change; structured readings dropped from Note drafts). A push to #2820's branch was refused, so Matthew chose on 2026-11-04 to land the work as this PR and close #2820.
branch: claude/structured-readings-review-fixes
base: verdant-grow-diary
checkout: git fetch origin claude/structured-readings-review-fixes && git switch claude/structured-readings-review-fixes
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2863
head_sha: read the current head on GitHub
state: review findings at f5399254 (three readback defects) fixed on this branch; needs fresh 35/35 and an independent exact-head PASS at the new head
current_step: readback fixes pushed; awaiting required CI and an independent review of the full diff at the new head
next_action: fresh independent exact-head review (the f5399254 findings are addressed; verify with src/test/quick-log-structured-readings-readback.test.tsx); Merge Steward queues on 35/35 + APPROVE + Matthew's per-item yes (locked test still needs his own-words yes)
post_merge_check: on production, type a soil temperature, switch the display unit, save; the saved reading keeps the unit it was typed in.
active_writer: Claude session_017UoYKyNbAomBtM3Ja7L89e (Matthew reassigned the branch from session_017UoYKyhNGum4qmfYdoNRLr in his own words, 2026-11-04 ~17:10 UTC, orchestrator chat)
decisions: the unit pins on the first non-blank edit and clears when the field is emptied; drafts store structured input and soilTempEntryUnit as optional fields, so old drafts still parse. Readback fix lives in readback, not the save path, so rows already saved with a structured-only manual_sensor_snapshot come back too: attach() now treats a manual_sensor_snapshot with no air key as incomplete and merges the sibling's air readings into it, carrying the structured keys onto the canonical sensor_snapshot the card reads first. The Timeline view model picks soil_temp_c / soil_ec_ms_cm / ppfd as chips (soil temp in the viewer's unit) and withholds an implausible value with an error, matching the CO₂ rule. The correction dialog shows a read-only note for structured readings (spec §3.5).
tried_and_rejected: pushing the fix to the frozen #2820 branch (denied; it belongs to that PR's frozen head).
commands: bunx vitest run src/test/quick-log-structured-readings-review-fixes.test.tsx src/test/quick-log-structured-readings-readback.test.tsx --reporter=dot; bun run typecheck; node scripts/scorer-lock.mjs --report --strict
files_touched: src/lib/quickLogObservationDraftRules.ts; src/components/QuickLogV2Sheet.tsx; src/test/quick-log-structured-readings-review-fixes.test.tsx; src/lib/timelineQuickLogEnvironmentSnapshotReadback.ts; src/lib/timelineSensorSnapshotViewModel.ts; src/lib/quickLogStructuredReadingRules.ts; src/components/QuickLogEntryIntegrityControls.tsx; src/test/quick-log-structured-readings-readback.test.tsx; docs/agents/handoffs/STRUCTURED-READINGS-REVIEW-FIXES.md
files_remaining: none
blockers: none
open_questions: none
gotchas: Quick Log saves only through quicklog_save_manual; this change touches draft state only.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2820 (closed, superseded)
artifacts: none
reviewer_seat: any non-contributing review session
reviewer_sha: none at the new head (the advisory findings at f5399254 were relayed by Matthew in chat, not posted; they are addressed)
session_state: no production access; merge seat held by this session
claimed_by: Claude session_017UoYKyNbAomBtM3Ja7L89e, 2026-11-04 (reassigned by Matthew; prior holder session_017UoYKyhNGum4qmfYdoNRLr released)
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-04 17:30 UTC, by Claude session_017UoYKyNbAomBtM3Ja7L89e)
```
