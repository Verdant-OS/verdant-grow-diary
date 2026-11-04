### AUTH-LOADING-SMOKE-TIMEOUT-25

```text
TASK AUTH-LOADING-SMOKE-TIMEOUT-25  priority: P2  status: OPEN
goal: Raise the auth-loading-smoke job timeout from 15 to 25 minutes and keep the YAML comment accurate.
why: Runs 40523498143 (#2545) and 40469789527 (#2526) spent about 10 minutes on Chromium --with-deps apt install, then the test step was cancelled about 4.5 minutes in by the 15-minute cap. Worst case is about 16.5 minutes, so 25 minutes leaves headroom.
branch: cursor/auth-loading-smoke-timeout-618c
base: verdant-grow-diary
checkout: git fetch origin cursor/auth-loading-smoke-timeout-618c verdant-grow-diary && git switch cursor/auth-loading-smoke-timeout-618c && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA"
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2553
head_sha: read origin/cursor/auth-loading-smoke-timeout-618c after the merge of origin/verdant-grow-diary f39231c948942ce50a583f023a8b3481aca3ed94; comment-fix parent is 0c2bdbdfe2fb3ffdc953fc0cfa0ac9dd43ffc12a
state: base merged; ready state left as found (isDraft false before this merge)
current_step: Merged origin/verdant-grow-diary f39231c94. Only docs/agents/HANDOFF_LOG.md conflicted. Both the AUTH-LOADING-SMOKE-TIMEOUT-25 block and the incoming Open blocks are kept. Timeout stays 25. Sour Diesel review 5670229495 at 40591809 does not cover this head.
next_action: Do not change draft or ready state. Do not enqueue, merge, or deploy. Obtain a fresh independent exact-head review at the merge head.
post_merge_check: The next Auth loading smoke (mocked) run on verdant-grow-diary finishes without a 15-minute cancellation. NOT_MEASURED until merged.
active_writer: Grok session on cursor/auth-loading-smoke-timeout-618c
decisions: Timeout stays 25. Comment states the test step was cancelled about 4.5 minutes in. Founder approval is recorded as approved by the founder in chat 2026-10-27 in the PR body, not in the workflow file.
tried_and_rejected: The first comment said the tests then passed in about 4.5 minutes. Sour Diesel P2: in those two runs the test step was cancelled by the 15-minute cap.
commands: bunx vitest run src/test/auth-loading-ci-safety.test.ts --reporter=dot
files_touched: .github/workflows/auth-loading-smoke.yml; docs/agents/HANDOFF_LOG.md (this block only)
files_remaining: none
blockers: exact-head review at the new head is NOT_MEASURED
open_questions: none
gotchas: Do not force-push. Do not change bun.lock. Do not change timeout-minutes. The scorer lock treats the workflow as an existing check; a branch-scoped unlock is local and gitignored.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2553 ; review https://github.com/Verdant-OS/verdant-grow-diary/pull/2553#pullrequestreview-5670229495
artifacts: none
reviewer_seat: Sour Diesel reviewed 40591809fcc13992f96f07eade03881604ff75a3; that verdict does not cover the new head
reviewer_sha: 40591809fcc13992f96f07eade03881604ff75a3 (superseded)
session_state: PR #2553 was not draft (isDraft false) before this base merge. Do not convert it to draft and do not toggle ready. No enqueue or deploy.
claimed_by: Grok, 2026-10-27
owner: Grok
last_updated: 2026-10-27 14:10 CT, by Grok
```
