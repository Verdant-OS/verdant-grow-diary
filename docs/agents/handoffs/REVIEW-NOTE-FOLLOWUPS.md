# REVIEW-NOTE-FOLLOWUPS

```text
TASK REVIEW-NOTE-FOLLOWUPS  priority: other  status: CLOSED
goal: Close the minor review notes left on three merged PRs: #2865's handoff missing template fields and its keep-alive test not covering the 400 refusal; #2861's handoff heading level; #2856's stale files_touched line. Also mark all three handoffs CLOSED.
why: The reviewers on #2865 and #2856 noted them as P3s and they were not blockers. Matthew asked for them as one small follow-up PR (2026-11-04).
branch: claude/review-note-followups
base: verdant-grow-diary
checkout: none needed; the work is merged. To inspect it: git fetch origin verdant-grow-diary && git show 95fc01801bf968ab3d508c30707f4179b3284ef7
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2877
head_sha: f996a3f40027865a9d35ec1a8ca7bed7db835347 (final head)
state: merged 2026-11-05 as 95fc01801bf968ab3d508c30707f4179b3284ef7
current_step: closed
next_action: none
post_merge_check: none beyond CI; the change is a test case and handoff text.
active_writer: none (closed)
decisions: the 400 case is added inside the existing 25-iteration keep-alive loop, alternating with the 403, so both refusal branches run through the same keep-alive agent (maxSockets 1). Each refusal sends Connection: close, so the agent opens a fresh socket for the next request; the test proves the client never reuses a socket the proxy is closing, not that one socket is reused (Codex P2 on #2877). The target "http://[bad" fails URL parsing, which is the proxy's only 400 path. No existing assertion changed. RED: with only the 400 branch reverted to destroy-without-Connection:close, the test fails (1 failed, 2 passed); restored, 3/3 pass.
tried_and_rejected: setting aside the whole refusal fix for RED: it failed on the 403 assertion first, so it did not prove the new 400 line pins anything.
commands: bunx vitest run src/test/google-analytics-collection-host-proxy.test.ts; node scripts/scorer-lock.mjs --report --base <merge-base>
files_touched: src/test/google-analytics-collection-host-proxy.test.ts; docs/agents/handoffs/CI-FLAKE-GA-PROXY-REA-WAITFOR.md; docs/agents/handoffs/CI-LOCAL-SUPABASE-START-HARDENING.md; docs/agents/handoffs/REPORT-INGEST-ERROR-ANNOUNCEMENTS.md; docs/agents/handoffs/REVIEW-NOTE-FOLLOWUPS.md
files_remaining: none in this PR. Page-level render tests for PostGrowLearningReport and IngestInspector errors (Codex ask on #2856) follow as a separate PR.
blockers: none
open_questions: none
gotchas: the test file is scorer-locked; the unlock was declared with scripts/scorer-lock.mjs --unlock and the renegotiation is named in the commit and PR body.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2865, https://github.com/Verdant-OS/verdant-grow-diary/pull/2861, https://github.com/Verdant-OS/verdant-grow-diary/pull/2856
artifacts: none
reviewer_seat: none: the independent review was waived by Matthew for this exact head (both independent sessions inactive, one transfer used); record https://github.com/Verdant-OS/verdant-grow-diary/pull/2877#issuecomment-6648224333
reviewer_sha: NOT_MEASURED (waived)
session_state: none; founder yes "f996a3f for #2877 and e5fd04b for #2878. yes" (2026-11-05 ~01:26 UTC) and waiver "I waive the independent review for #2877 at f996a3f and #2878 at e5fd04b; merge them" (~02:45 UTC)
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-04 20:55 CT, by Claude (closed after merge)
```
