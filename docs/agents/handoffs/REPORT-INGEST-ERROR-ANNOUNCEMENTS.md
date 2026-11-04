# REPORT-INGEST-ERROR-ANNOUNCEMENTS

```text
TASK REPORT-INGEST-ERROR-ANNOUNCEMENTS  priority: other  status: OPEN
goal: Error messages on the post-grow report, cultivar QA panel and sensor ingest tools announce themselves to screen readers, announcing the failure sentence rather than a whole error page.
why: Grower UX audit 2026-11-03 finding 12 (screen reader), fifth batch after #2845, #2850, #2852 and #2855: 4 error blocks had no announcement.
branch: claude/error-announcements-batch5
base: verdant-grow-diary
checkout: git fetch origin claude/error-announcements-batch5 verdant-grow-diary && git switch claude/error-announcements-batch5
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (this block's commit is the first)
state: ready for review; Codex P2 fix pushed (role="alert" on normalizer payload errors).
current_step: draft PR open.
next_action: founder names reviewer and gate; route an independent exact-head review (not Claude session_017UoYKwwZkbqmWvtCRMw1DZ).
post_merge_check: on the live build, with a screen reader, open a post-grow report that fails to load; "This grow report could not be loaded." is read out without the heading or the Retry button.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: EmptyState gains an optional descriptionRole prop (default undefined, so its 28 other callers render exactly as before); the post-grow report error passes descriptionRole="alert". Ingest inspector: role="alert" on the failure sentence, not the block with its retry button. Cultivar QA error: role="alert". Webhook normalizer payload errors: role="alert" (changed from "status" on 2026-11-04 after Codex P2: a polite region that mounts with its text is often not read out; a rendered test now pins it). The guard accepts an announced element around or inside the error block. BrowserConnectPanel was already inside a role="status" live region; no change. DiaryRangeReportPage's whole-page error waits for #2852 (same file, already routed).
tried_and_rejected: role="alert" on BrowserConnectPanel's error: redundant inside its existing status region, would double-announce; reverted.
commands: bunx vitest run src/test/report-and-ingest-errors-announced.test.ts
files_touched: src/components/EmptyState.tsx; src/pages/PostGrowLearningReport.tsx; src/components/CultivarQaPanel.tsx; src/pages/IngestInspector.tsx; src/pages/SensorsIngestNormalizer.tsx; src/test/report-and-ingest-errors-announced.test.ts; docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: none
open_questions: once the earlier batches merge, the five guard tests can share one helper.
gotchas: none
links: audit finding 12 (private upload, not committed)
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-04 16:00 CT, by Claude
```
