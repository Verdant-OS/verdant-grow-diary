# ERROR-ANNOUNCEMENTS

```text
TASK ERROR-ANNOUNCEMENTS  priority: other  status: CLOSED
closed: merged. #2845 merged into verdant-grow-diary on 2026-11-04 as 68871377bd1969b71d8894d4fe1b9bf2197f9503; #2852 merged into verdant-grow-diary on 2026-11-04 as 8005737d8800b2de496aee8c56f58aae5b0a09ec; #2855 merged into verdant-grow-diary on 2026-11-04 as 8ac41be75922e2e894eed551361a9d03ec34ad87; #2856 merged into verdant-grow-diary on 2026-11-04 as f95bfeb84e3854f4877601350d40435fb9d197da (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
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
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-03 21:45 CT, by Claude)
```
