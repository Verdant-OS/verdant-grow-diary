# REVIEW-NOTE-FOLLOWUPS

```text
TASK REVIEW-NOTE-FOLLOWUPS  priority: other  status: OPEN
goal: Close the minor review notes left on three merged PRs: #2865's handoff missing template fields and its keep-alive test not covering the 400 refusal; #2861's handoff heading level; #2856's stale files_touched line. Also mark all three handoffs CLOSED.
why: The reviewers on #2865 and #2856 noted them as P3s and they were not blockers. Matthew asked for them as one small follow-up PR (2026-11-04).
branch: claude/review-note-followups
base: verdant-grow-diary
checkout: git fetch origin claude/review-note-followups verdant-grow-diary && git switch claude/review-note-followups
pr: opened as a draft after this commit; read the URL from GitHub
head_sha: read the current head on GitHub (this block's commit is the first)
state: committed; draft PR open.
current_step: review requested.
next_action: Reviewer A (independent session, not session_017UoYKwwZkbqmWvtCRMw1DZ) reviews the exact head. The test file is scorer-locked, so merge also needs Matthew's own-words yes naming the SHA, plus 35/35.
post_merge_check: none beyond CI; the change is a test case and handoff text.
active_writer: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
decisions: the 400 case is added inside the existing 25-iteration keep-alive loop, alternating with the 403, so both refusal branches run on the same reused socket. The target "http://[bad" fails URL parsing, which is the proxy's only 400 path. No existing assertion changed. RED: with only the 400 branch reverted to destroy-without-Connection:close, the test fails (1 failed, 2 passed); restored, 3/3 pass.
tried_and_rejected: setting aside the whole refusal fix for RED: it failed on the 403 assertion first, so it did not prove the new 400 line pins anything.
commands: bunx vitest run src/test/google-analytics-collection-host-proxy.test.ts; node scripts/scorer-lock.mjs --report --base <merge-base>
files_touched: src/test/google-analytics-collection-host-proxy.test.ts; docs/agents/handoffs/CI-FLAKE-GA-PROXY-REA-WAITFOR.md; docs/agents/handoffs/CI-LOCAL-SUPABASE-START-HARDENING.md; docs/agents/handoffs/REPORT-INGEST-ERROR-ANNOUNCEMENTS.md; docs/agents/handoffs/REVIEW-NOTE-FOLLOWUPS.md
files_remaining: none in this PR. Page-level render tests for PostGrowLearningReport and IngestInspector errors (Codex ask on #2856) follow as a separate PR.
blockers: none
open_questions: none
gotchas: the test file is scorer-locked; the unlock was declared with scripts/scorer-lock.mjs --unlock and the renegotiation is named in the commit and PR body.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2865, https://github.com/Verdant-OS/verdant-grow-diary/pull/2861, https://github.com/Verdant-OS/verdant-grow-diary/pull/2856
artifacts: none
reviewer_seat: not requested
reviewer_sha: NOT_MEASURED
session_state: no production access
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-04 17:55 CT, by Claude
```
