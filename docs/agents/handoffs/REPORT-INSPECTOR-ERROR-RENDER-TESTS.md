# REPORT-INSPECTOR-ERROR-RENDER-TESTS

```text
TASK REPORT-INSPECTOR-ERROR-RENDER-TESTS  priority: other  status: OPEN
goal: Page-level rendered tests pin the two error announcements #2856 added: the post-grow report and the ingest inspector each put only the failure sentence in a role="alert" element, with the heading and Retry button outside it.
why: Codex asked on #2856 for rendered proof; the merged guard test reads source only. Matthew asked for these tests on 2026-11-04.
branch: claude/report-inspector-error-render-tests
base: verdant-grow-diary
checkout: git fetch origin claude/report-inspector-error-render-tests verdant-grow-diary && git switch claude/report-inspector-error-render-tests
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub
state: tests only, no app code changes; RED proven for each page by setting aside its role attribute.
current_step: draft PR open.
next_action: an independent exact-head review (not Claude session_017UoYKwwZkbqmWvtCRMw1DZ), then 35/35 and Matthew's per-item yes at that head.
post_merge_check: none beyond CI; tests only.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: One new file, src/test/report-inspector-error-render.test.tsx. The report test mocks usePostGrowLearningReportData (status "unavailable", error null so the page's fallback sentence renders), usePlantMemoryEpisodes, useMyEntitlements and the premium-export server gate, following src/test/post-grow-report-read-retry.test.tsx. The inspector test mocks useIngestInspectorReadings with an error result, so no QueryClientProvider or Supabase client is needed. src/test/report-and-ingest-errors-announced.test.ts is scorer-locked and untouched.
tried_and_rejected: none
commands: bunx vitest run src/test/report-inspector-error-render.test.tsx src/test/report-and-ingest-errors-announced.test.ts --reporter=dot
files_touched: src/test/report-inspector-error-render.test.tsx; docs/agents/handoffs/REPORT-INSPECTOR-ERROR-RENDER-TESTS.md
files_remaining: none
blockers: none
open_questions: none
gotchas: getByRole("alert") requires exactly one alert on the page; a second alert added to either error branch fails these tests by design.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2856
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-04 18:05 CT, by Claude
```
