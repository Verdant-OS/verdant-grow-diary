# AI-DOCTOR-SESSIONS-ERROR-ANNOUNCEMENTS

```text
TASK AI-DOCTOR-SESSIONS-ERROR-ANNOUNCEMENTS  priority: other  status: CLOSED
closed: merged. #2855 merged into verdant-grow-diary on 2026-11-04 as 8ac41be75922e2e894eed551361a9d03ec34ad87 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Error messages on the AI Doctor sessions pages announce themselves to screen readers: the detail page copy-review and copy-link failures, and the index page saved-view save and import errors.
why: Grower UX audit 2026-11-03 finding 12 (screen reader), fourth batch after #2845, #2850 and #2852. On the detail page the copy buttons carry a fixed aria-label and no live region, so "Copy failed" was never heard; the saved-view errors had no role.
branch: claude/error-announcements-ai-doctor
base: verdant-grow-diary
checkout: git fetch origin claude/error-announcements-ai-doctor verdant-grow-diary && git switch claude/error-announcements-ai-doctor
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (this block's commit is the first)
state: fix and guard test committed.
current_step: draft PR open.
next_action: founder names reviewer and gate; route an independent exact-head review (not Claude session_017UoYKwwZkbqmWvtCRMw1DZ).
post_merge_check: on the live build, with a screen reader, deny clipboard permission and press Copy link on an AI Doctor session; "Copy failed" is read out.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: detail page copy buttons get aria-live="polite", matching the index page's existing copy-link and export buttons; the saved-view save and import errors get role="alert". The guard counts an error as announced when it or an ancestor JSX element carries role alert/status or aria-live, so the index page buttons (already live) are not touched. Onboarding sign-out error is out of scope because open PR #2851 touches Onboarding.tsx.
tried_and_rejected: none
commands: bunx vitest run src/test/ai-doctor-sessions-errors-announced.test.ts
files_touched: src/pages/AiDoctorSessionDetail.tsx; src/pages/AiDoctorSessionsIndex.tsx; src/test/ai-doctor-sessions-errors-announced.test.ts; docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: none
open_questions: once the earlier batches merge, the four guard tests can share one helper with the ancestor check.
gotchas: the detail buttons keep their fixed aria-label; the live region announces the swapped text, the name stays "Copy review summary" / "Copy link to this session".
links: audit finding 12 (private upload, not committed)
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-03 22:35 CT, by Claude)
```
