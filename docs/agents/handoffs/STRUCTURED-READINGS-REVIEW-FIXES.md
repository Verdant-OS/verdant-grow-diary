# STRUCTURED-READINGS-REVIEW-FIXES

```text
TASK STRUCTURED-READINGS-REVIEW-FIXES  priority: P2  status: OPEN
goal: Ship the #2820 grower-bug slices together with the two review fixes (pin the soil-temperature entry unit once typing starts; keep structured readings and the soil unit in Note drafts). This PR replaces #2820.
why: The independent review failed #2820 at 1c0f0ecb with two P2s (soil temperature reinterpreted on unit change; structured readings dropped from Note drafts). A push to #2820's branch was refused, so Matthew chose on 2026-11-04 to land the work as this PR and close #2820.
branch: claude/structured-readings-review-fixes
base: verdant-grow-diary
checkout: git fetch origin claude/structured-readings-review-fixes && git switch claude/structured-readings-review-fixes
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2863
head_sha: read the current head on GitHub
state: retargeted to verdant-grow-diary; base merged; needs 35/35 and an independent exact-head PASS
current_step: awaiting required CI and an independent review of the full diff (all #2820 slices plus the fix)
next_action: independent exact-head review; queue on 35/35 + PASS
post_merge_check: on production, type a soil temperature, switch the display unit, save; the saved reading keeps the unit it was typed in.
active_writer: Claude session_017UoYKyhNGum4qmfYdoNRLr
decisions: the unit pins on the first non-blank edit and clears when the field is emptied; drafts store structured input and soilTempEntryUnit as optional fields, so old drafts still parse.
tried_and_rejected: pushing the fix to the frozen #2820 branch (denied; it belongs to that PR's frozen head).
commands: bunx vitest run src/test/quick-log-structured-readings-review-fixes.test.tsx --reporter=dot
files_touched: src/lib/quickLogObservationDraftRules.ts; src/components/QuickLogV2Sheet.tsx; src/test/quick-log-structured-readings-review-fixes.test.tsx; docs/agents/handoffs/STRUCTURED-READINGS-REVIEW-FIXES.md
files_remaining: none
blockers: none
open_questions: none
gotchas: Quick Log saves only through quicklog_save_manual; this change touches draft state only.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2820 (closed, superseded)
artifacts: none
reviewer_seat: any non-contributing review session
reviewer_sha: none yet
session_state: no production access; merge seat held by this session
claimed_by: Claude session_017UoYKyhNGum4qmfYdoNRLr, 2026-11-04
owner: Claude
last_updated: 2026-11-04 14:50 UTC, by Claude
```
