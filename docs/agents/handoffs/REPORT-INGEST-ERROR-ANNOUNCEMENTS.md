# REPORT-INGEST-ERROR-ANNOUNCEMENTS

```text
TASK REPORT-INGEST-ERROR-ANNOUNCEMENTS  priority: other  status: CLOSED
goal: Error messages on the post-grow report, cultivar QA panel and sensor ingest tools announce themselves to screen readers, announcing the failure sentence rather than a whole error page.
why: Grower UX audit 2026-11-03 finding 12 (screen reader), fifth batch after #2845, #2850, #2852 and #2855: 4 error blocks had no announcement.
branch: claude/error-announcements-batch5
base: verdant-grow-diary
checkout: none needed; the work is merged. To inspect it: git fetch origin verdant-grow-diary && git show f95bfeb84e3854f4877601350d40435fb9d197da
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2856
head_sha: 08a99bbb79197683f2aac56db1f7099d37907b0c (final reviewed head)
state: merged as f95bfeb84e3854f4877601350d40435fb9d197da
current_step: closed
next_action: none; page-level render tests for the report and inspector errors (Codex ask on #2856) are a separate follow-up task
post_merge_check: on the live build, with a screen reader, open a post-grow report that fails to load; "This grow report could not be loaded." is read out without the heading or the Retry button.
active_writer: none (closed)
decisions: EmptyState gains an optional descriptionRole prop (default undefined, so its 28 other callers render exactly as before); the post-grow report error passes descriptionRole="alert". Ingest inspector: role="alert" on the failure sentence, not the block with its retry button. Cultivar QA error: role="alert". Webhook normalizer payload errors: role="alert" (changed from "status" on 2026-11-04 after Codex P2: a polite region that mounts with its text is often not read out; a rendered test now pins it). The guard accepts an announced element around or inside the error block. BrowserConnectPanel was already inside a role="status" live region; no change. DiaryRangeReportPage's whole-page error waits for #2852 (same file, already routed).
tried_and_rejected: role="alert" on BrowserConnectPanel's error: redundant inside its existing status region, would double-announce; reverted.
commands: bunx vitest run src/test/report-and-ingest-errors-announced.test.ts
files_touched: src/components/EmptyState.tsx; src/pages/PostGrowLearningReport.tsx; src/components/CultivarQaPanel.tsx; src/pages/IngestInspector.tsx; src/pages/SensorsIngestNormalizer.tsx; src/test/report-and-ingest-errors-announced.test.ts; docs/agents/handoffs/REPORT-INGEST-ERROR-ANNOUNCEMENTS.md
files_remaining: none
blockers: none
open_questions: once the earlier batches merge, the five guard tests can share one helper.
gotchas: none
links: audit finding 12 (private upload, not committed)
artifacts: none
reviewer_seat: independent reviewer session_017UoYKyDyFmmRqwAGfNHt1d (Reviewer A route)
reviewer_sha: 08a99bbb79197683f2aac56db1f7099d37907b0c
session_state: none; no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-04 17:50 CT, by Claude (closed after merge)
```
