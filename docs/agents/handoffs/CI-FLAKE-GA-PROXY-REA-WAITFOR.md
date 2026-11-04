# CI-FLAKE-GA-PROXY-REA-WAITFOR

```text
TASK CI-FLAKE-GA-PROXY-REA-WAITFOR  priority: P2  status: CLOSED
goal: Stop two CI flakes that fail required checks on unrelated PRs: the GA collection proxy "socket hang up" (Full test suite shard 25/32) and the REA cli.test.mjs waitFor empty-read race ("Lint, typecheck, test, build").
why: On 2026-11-04 shard 25 failed on #2832 (twice), #2852 and #2831's merge-queue run; the REA race failed #2855 and #2818. Each failure blocks or ejects a reviewed, otherwise-green PR.
branch: claude/ci-flake-ga-proxy-rea-waitfor
base: verdant-grow-diary
checkout: none needed; the work is merged. To inspect it: git fetch origin verdant-grow-diary && git show 54a480f5bcaef18ca8e820aa98d8eaf409c82f6b
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2865
head_sha: 08df6ad7940f0d671fa3f1eb3487758453413703 (final reviewed head)
state: merged 2026-11-04 20:14 UTC as 54a480f5bcaef18ca8e820aa98d8eaf409c82f6b
current_step: closed
next_action: none
post_merge_check: Full test suite (shard 25/32) and "Lint, typecheck, test, build" stay green across PRs. #2832's shard 25 passed at 4ffbe0c on its first run after this merged.
active_writer: none (closed)
decisions:
  - GA proxy: answer a refused request with Connection: close and let Node close the socket after the response flushes, instead of calling req.destroy(). Node 22's global agent keeps sockets alive, so destroying one raced the client's next request onto a dead socket.
  - REA: waitFor polls until the file is non-empty, because the fixtures write with writeFile (truncate, then write) and a read could see "".
  - #2843 made the same GA-proxy fix and was closed as superseded on Matthew's decision (2026-11-04, about 18:47 UTC, "option 2").
tried_and_rejected: extending the existing proxyRequest helper with a connection field broke an existing toEqual assertion; a separate keepAliveRequest helper was used instead.
commands:
  - bunx vitest run src/test/google-analytics-collection-host-proxy.test.ts
  - node --test scripts/rea/tests/*.test.mjs
  - node scripts/scorer-lock.mjs --report --base <merge-base>
files_touched: e2e/utils/googleAnalyticsCollectionHost.ts, scripts/rea/tests/cli.test.mjs, src/test/google-analytics-collection-host-proxy.test.ts, docs/agents/handoffs/CI-FLAKE-GA-PROXY-REA-WAITFOR.md
files_remaining: none
blockers: none
open_questions: none
gotchas: all three changed code and test files are scorer-locked; any change to them needs the renegotiation declared in the PR body and the founder's own-words yes.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2865, https://github.com/Verdant-OS/verdant-grow-diary/pull/2843
artifacts: the #2865 checks at 08df6ad7940f0d671fa3f1eb3487758453413703
reviewer_seat: independent reviewers session_017UoYKykRaQvbn2A43Aj35s and session_017UoYKyDyFmmRqwAGfNHt1d, Seat A session_017UoYKvGLJjb6dUuFXUspEH, Reviewer C session_017UoYKywiErQ3bEQMo9dYGe
reviewer_sha: 08df6ad7940f0d671fa3f1eb3487758453413703
session_state: none; founder yes "yes for #2865 at 08df6ad" (2026-11-04, about 18:16 UTC)
claimed_by:
owner: Claude session_017UoYKwwZkbqmWvtCRMw1DZ
last_updated: 2026-11-04 17:45 CT, by Claude (closed after merge)
```
