# ERROR-ANNOUNCEMENTS

```text
TASK ERROR-ANNOUNCEMENTS  priority: other  status: OPEN
goal: Every error element in the One-Tent Loop entry forms (Quick Log, Create Tent, Create Plant, Grows, the Sensors manual reading card) announces itself to screen readers, and the field errors are tied to their inputs.
why: Grower UX audit 2026-11-03 finding 12 (screen reader): four error messages had no role="alert"/status or aria-live, so a screen-reader user never heard that a value or a load was refused.
branch: claude/error-announcements
base: verdant-grow-diary
checkout: git fetch origin claude/error-announcements verdant-grow-diary && git switch claude/error-announcements
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (this block's commit is the first)
state: fix and guard test committed.
current_step: draft PR open.
next_action: route an independent exact-head review (not Claude session_017UoYKwwZkbqmWvtCRMw1DZ).
post_merge_check: on the live build, with a screen reader, enter a tent size outside the allowed range in Create Tent; the error is read out and the size field announces it as its description.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: field errors (tent size, Quick Log temperature correction) get role="alert" plus id/aria-describedby, following QuickLogWateringForm. The manual reading error list gets role="alert". The grouped timeline load error gets role="status" (a passive load failure, not a refused action). Guard scope is the loop entry forms only; 91 unannounced error elements elsewhere in the repo are left for later slices.
tried_and_rejected: none
commands: bunx vitest run src/test/core-loop-errors-announced.test.ts
files_touched: src/components/CreateTentDialog.tsx; src/components/QuickLogEntryIntegrityControls.tsx; src/components/ManualSensorReadingCard.tsx; src/components/QuickLogGroupedTimelineSection.tsx; src/test/core-loop-errors-announced.test.ts; docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: none
open_questions: none
gotchas: the guard treats any data-testid ending in "error"/"errors" as an error element and skips Button tags (retry buttons).
links: audit finding 12 (private upload, not committed)
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-03 21:45 CT, by Claude
```
