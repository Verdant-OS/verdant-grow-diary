# QUICKLOG-EARLY-NOTE-PREFIX-DROP-20261128

```text
TASK QUICKLOG-EARLY-NOTE-PREFIX-DROP-20261128  priority: P2  status: OPEN
goal: When the early-stage "What changed?" box is the only note text in a plant-page Quick Log save, save it exactly as typed, with no "Early note: " label.
why: QA walk FA-20261128-M1 saw "Early note: " in front of the grower's words on the plant page, Timeline and tent page after #3113 let "What changed?" save on its own. Cheek picked "Drop Early note" (2026-11-28 10:25 UTC, main chat).
branch: claude/project-thread-1m7mgm
base: verdant-grow-diary (started at e9522bfe, prod at the time)
pr: see the PR that names this file
head_sha: see the PR's live head
state: pushed draft
current_step: code and new tests pushed; two pinned tests (scorer-locked src/test files) still expect the old label
next_action: on Cheek's unlock, run node scripts/scorer-lock.mjs --unlock src/test/quick-log-early-note-save.test.tsx src/test/quick-log-early-note-error-clear.test.tsx --reason "Cheek: Drop Early note"; change the two p_note pins from "Early note: popped soil" to "popped soil"; push; wait for 35/35
post_merge_check: on https://verdantgrowdiary.com once /version.json reports the merged SHA, with the disposable test account and a seedling-stage fixture plant: type a [smoke <timestamp>] note only in "What changed?", Save log; Timeline shows the text with no "Early note:" label. With a milestone also picked, the label is still there.
active_writer: this Claude thread session (main-chat task u832f96342690346ccce85bdf8fc2b877)
decisions: new pure helper buildQuickLogEarlyStageNoteText in src/lib/quickLogEarlyNoteTextRules.ts; QuickLog.tsx calls it with the rest of the note (appendLegacyDetailsToNote(noteWithHardware, details)). buildEarlyStageNoteSuffix in earlyStageQuickLogRules.ts is unchanged, so the edge _shared mirror and its manifest are untouched (not gated). Label kept when a milestone, vigor, Short note, readings or details are also present. Old saved notes are not rewritten.
tried_and_rejected: changing buildEarlyStageNoteSuffix itself (needs the _shared mirror commit, which is gated and out of scope).
commands: bunx vitest run src/test/quick-log-early-note-prefix.test.ts src/test/quick-log-early-note-save.test.tsx src/test/quick-log-early-note-error-clear.test.tsx src/test/early-stage-quick-log-rules.test.ts --reporter=dot && bun run typecheck
files_touched: src/lib/quickLogEarlyNoteTextRules.ts, src/components/QuickLog.tsx, src/test/quick-log-early-note-prefix.test.ts, this file
files_remaining: src/test/quick-log-early-note-save.test.tsx:131, src/test/quick-log-early-note-error-clear.test.tsx:112 (pin updates, waiting on unlock)
blockers: local bun install BLOCKED (Lovable registry 403 through the session proxy); CI is the test evidence.
open_questions: none
gotchas: plant page cut-off is a separate preview limit (plantRecentActivityRecap.ts SUMMARY_MAX 80 plus one-line truncate on phones); not changed here. early-stage-quick-log-rules.test.ts:118 tests milestone+vigor+notes and stays as is.
reviewer_seat: Seat A (not this session, not VReviewer, not matt816cheek-bit)
reviewer_sha: none yet
session_state: no routines or paused workflows
claimed_by: Claude thread session, 2026-11-28 10:40 UTC, on Cheek's pick
owner: Claude thread session
last_updated: 2026-11-28, by Claude
```
