# SPINE-ERROR-ANNOUNCEMENTS

```text
TASK SPINE-ERROR-ANNOUNCEMENTS  priority: other  status: CLOSED
closed: merged. #2850 merged into verdant-grow-diary on 2026-11-04 as 5f2a2e03c39fbe88b8350d4f2421401be8e46c83 (final SHA; GitHub API, read 2026-11-06). Closed in bulk by Claude session_017UoYKyU27JPpmSh3Cbj7EK on 2026-11-06 at Matthew's request (source claim: his answer in that session). This close does not resolve the post_merge_check, open_questions or blockers below; they are carried forward in docs/agents/handoffs/CLAUDE-HANDOFF-BULK-CLOSE-20261106.md.
goal: Error messages on the loop spine pages (Tents, Plants, plant detail photo strip, AI Doctor check-in panel and add-to-Action-Queue button) announce themselves to screen readers.
why: Grower UX audit 2026-11-03 finding 12 (screen reader), continuing ERROR-ANNOUNCEMENTS (Verdant-OS/verdant-grow-diary#2845, which covers the entry forms): 8 error elements here had no role or aria-live.
branch: claude/spine-error-announcements
base: verdant-grow-diary
checkout: git fetch origin claude/spine-error-announcements verdant-grow-diary && git switch claude/spine-error-announcements
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (this block's commit is the first)
state: fix and guard test committed.
current_step: draft PR open.
next_action: founder names reviewer and gate; route an independent exact-head review (not Claude session_017UoYKwwZkbqmWvtCRMw1DZ).
post_merge_check: on the live build, with a screen reader, make an AI Doctor manual check-in save fail (offline); the failure is read out.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: refused grower actions (AI Doctor manual save, add to Action Queue) get role="alert"; passive load or copy failures get role="status"; the Tents/Plants partial-read notices are list items, so they get aria-live="polite" to keep the listitem role. Timeline.tsx is out of scope because three open PRs touch it. ManualSnapshotTimelineCard is out of scope because its errors are stored validation shown per card, and announcing them would read every invalid card on Timeline load.
tried_and_rejected: none
commands: bunx vitest run src/test/spine-errors-announced.test.ts
files_touched: src/pages/Tents.tsx; src/pages/Plants.tsx; src/components/PlantDetailPhotoStrip.tsx; src/components/AiDoctorCheckInPreviewPanel.tsx; src/components/AiDoctorSessionActionQueueButton.tsx; src/test/spine-errors-announced.test.ts; docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: none
open_questions: once #2845 merges, the two guard tests can share one helper.
gotchas: the guard skips Button tags (retry buttons).
links: audit finding 12 (private upload, not committed)
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-06, by Claude session_017UoYKyU27JPpmSh3Cbj7EK (bulk close; previous 2026-11-03 22:05 CT, by Claude)
```
