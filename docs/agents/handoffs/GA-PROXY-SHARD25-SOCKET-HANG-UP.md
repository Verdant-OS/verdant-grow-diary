# GA-PROXY-SHARD25-SOCKET-HANG-UP

```text
TASK GA-PROXY-SHARD25-SOCKET-HANG-UP  priority: P2  status: OPEN
goal: Stop the intermittent "socket hang up" in required check Full test suite (shard 25/32), test src/test/google-analytics-collection-host-proxy.test.ts.
why: Red on unrelated docs PRs (PR 2831 at 01bac39, job 126290700551; PR 2827 at f3cf793, job 126328068392). A required check red across PRs is top priority.
branch: claude/trusting-davinci-58hzpj
base: verdant-grow-diary (merge base cae980f53c938c45dc260f9ced13fb38e5b3e242)
checkout: git fetch origin claude/trusting-davinci-58hzpj verdant-grow-diary && git switch claude/trusting-davinci-58hzpj && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA" && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2843 (ready for review, not draft; marked ready on Matthew's request 2026-11-04 03:36 UTC)
head_sha: c805a90cdd17d045c9e7294b17cec66ed58dab65 was the reviewed head (Reviewer C REQUEST_CHANGES, P2: handoff entry in the retired HANDOFF_LOG.md). The commit that moves this entry to this file follows it; read the current head from the PR. Earlier reviewed heads: dc0786bb0e92255b04aa559a24b6686da8acd169, e0754e855344f4701998acfe1223c413428a50c6, c90c3b03d3300d7bb6fb75fa748fdccd57003d29.
state: review. Required CI was 35/35 at c805a90c; every gate is void at the new head.
current_step: Fix Reviewer C's P2 at c805a90c: this entry moved from docs/agents/HANDOFF_LOG.md to docs/agents/handoffs/GA-PROXY-SHARD25-SOCKET-HANG-UP.md (AGENTS.md §12, #2860), and HANDOFF_LOG.md matches the merge base cae980f5.
next_action: Fresh exact-head reviews from Reviewer C and Seats A and D at the new head, 35/35 CI, then Matthew's merge yes and scorer-lock yes at that SHA; the author session queues (founder assignment).
post_merge_check: Full test suite (shard 25/32) stays green on later PRs; a socket hang up in src/test/google-analytics-collection-host-proxy.test.ts reopens this with the same owner.
active_writer: Claude session_017UoYKzL7sYyUe1K8xMj3uo
decisions: The refusal sends Connection: close and no longer calls req.destroy(). The refused set and allowlist are unchanged, and nothing is forwarded.
tried_and_rejected: retries, longer timeouts, skips (forbidden). CPU load alone did not reproduce it (0/300 pinned to one CPU behind 8 spinners).
cause: The proxy refused with a keep-alive 403 and then destroyed the socket. A keep-alive client may reuse that socket for its next request and get "socket hang up". Node 22.23.4 / 24.22.1 carry a hasPendingRead() guard that usually hides this. The shard job runs the runner image's default Node (version NOT_MEASURED). Under the Bun runtime the unmodified test fails 3/3 with the CI error.
commands: bunx vitest run src/test/google-analytics-collection-host-proxy.test.ts ; bunx --bun vitest run src/test/google-analytics-collection-host-proxy.test.ts ; node scripts/scorer-lock.mjs --report --base cae980f5
files_touched: e2e/utils/googleAnalyticsCollectionHost.ts, src/test/google-analytics-collection-host-proxy.test.ts, docs/agents/handoffs/GA-PROXY-SHARD25-SOCKET-HANG-UP.md
files_remaining: none
blockers: All gates must be redone at the new head. OWNERSHIP.md: the Steward session never queues a PR it base-merged, so if verdant-ultra-bot holds the Steward seat, another seat must queue. Matthew decides.
open_questions: none
gotchas: Unlock records are git-ignored, so a fresh checkout reports both code files as LOCKED modified. Local typecheck needs NODE_OPTIONS=--max-old-space-size=8192.
links: Reviewer C https://github.com/Verdant-OS/verdant-grow-diary/pull/2843#pullrequestreview-5762938474 and #pullrequestreview-5763348990 ; Seat A #pullrequestreview-5763345015 ; Seat D #pullrequestreview-5763347818
artifacts: https://github.com/Verdant-OS/verdant-grow-diary/pull/2843 (PR body: RED/GREEN evidence); blocker report https://github.com/Verdant-OS/verdant-grow-diary/pull/2843#issuecomment-6625351805
reviewer_seat: Seats A, C and D
reviewer_sha: c805a90cdd17d045c9e7294b17cec66ed58dab65 (Reviewer C REQUEST_CHANGES; superseded by the fix commit; needs re-review)
session_state: PR activity subscription and a safety-net check-in in the author session; no paused workflows
claimed_by: Claude session_017UoYKzL7sYyUe1K8xMj3uo, 2026-11-03 22:48 CT
owner: Claude
last_updated: 2026-11-04 10:08 CT, by Claude
```
