# ACTIONS-BACKLOG-CONCURRENCY

```text
TASK ACTIONS-BACKLOG-CONCURRENCY  priority: P2  status: CLOSED
goal: Cut the hosted-runner queue by cancelling superseded pull_request runs, skipping heavy jobs on draft PRs, and capping ci.yml shard parallelism at 16.
why: Sour Diesel review 5670841287 failed c20c42a76. The irrigation draft guard broke two folded if blocks. A skipped matrix does not post the 32 required shard names. GitHub Team allows 60 concurrent jobs.
branch: cursor/actions-backlog-concurrency-58cd
base: verdant-grow-diary
checkout: git fetch origin cursor/actions-backlog-concurrency-58cd verdant-grow-diary && git switch cursor/actions-backlog-concurrency-58cd && git merge --ff-only "$VERIFIED_SHA" && test "$(git rev-parse HEAD)" = "$VERIFIED_SHA"
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2555 (ready; founder approved ready at 7f88f400. Do not convert to draft or toggle ready.)
head_sha: c82e2c9682d84835e6d7b2816867b798626f4f9d merged f39231c94. This merge of origin/verdant-grow-diary ecfa2b9115355349b17d9249989c1a49dc933e47 is the new head after push. Read the PR head; this commit cannot name its own SHA.
state: CLOSED. Merged as 7f2f974aa51dc1d32a08d7d3a97b5af6d6e3a4ae (#2555) on 2026-10-27T20:43:47Z. Closed 2026-11-04 by Claude session_017UoYKv4arxJYBMGNNh1bvN on Matthew's instruction (Grok no longer active); copied from its HANDOFF_LOG.md block, which stays unedited per docs/agents/handoffs/README.md.
current_step: Irrigation if expressions are folded blocks again. max-parallel is 16. The pin test rejects a bare >- inside any workflow if. The second HANDOFF_LOG conflict kept this block and the incoming AUTH-LOADING-SMOKE-TIMEOUT-25 block. auth-loading-smoke.yml kept the draft guard, pull-request-only cancel, and timeout-minutes 25.
next_action: none; closed. Any post_merge_check below still applies to its recorded owner.
post_merge_check: After a separately authorized merge, confirm a ready PR and a merge_group run still report all 35 required contexts from ci.yml. A draft does not post those 32 shard names. NOT_MEASURED until merged.
active_writer: Grok cloud agent on cursor/actions-backlog-concurrency-58cd
decisions: Do not reduce the 32 shard matrix. Those names are the ruleset required checks. max-parallel is 16 under the Team plan's 60-job pool. A draft skip on the shard matrix does not emit the 32 context names; they stay Expected until ready_for_review or merge_group. Lint/typecheck/test/build does report Skipped on a draft. Irrigation draft guards use if: >- so the fold marker is the YAML syntax, not part of the expression. Leave Preflight and test:legal-seo unconditional. Leave security-regression unconditional. Cancel in progress only when github.event_name == pull_request.
tried_and_rejected: Cutting the shard count was rejected because the ruleset expects Full test suite (shard N/32) for N=1..32. A missing name stays Expected and blocks the merge queue.
commands: bunx vitest run src/test/ci-pr-concurrency.test.ts src/test/deployment-preview-status-classification.test.ts --reporter=dot; node scripts/scorer-lock.mjs --report --strict
files_touched: .github/workflows listed in the PR; src/test/ci-pr-concurrency.test.ts; src/test/deployment-preview-status-classification.test.ts; docs/agents/HANDOFF_LOG.md (this block only)
files_remaining: none planned
blockers: none in the merge. Independent exact-head review of this merge head is NOT_MEASURED.
open_questions: none
gotchas: HOLD #1250 files were not edited. A matrix job skipped by if does not report one check per shard. If ready_for_review never runs, the 32 shard contexts stay Expected and the merge queue stays blocked. Lint/typecheck/test/build Skipped on a draft is not the same as those shard contexts passing. max-parallel 16 also applies on deploy pushes and merge_group.
links: config/required-status-checks.json; deploy CI runs 40461983713, 40468073006, 40458653770
artifacts: scorer unlock is gitignored at .claude/scorer-unlock.json
reviewer_seat: Sour Diesel review 5670841287 at c20c42a76de7bd3271e6f03232d43c9ec7750218 was FAIL 1/1/2. Review 5670970729 at 7f88f400 was 0/0/2 and covered the body only. Neither covers this merge head.
reviewer_sha: NOT_MEASURED for this merge head
session_state: no production action
claimed_by: Grok, 2026-10-27 11:30 CT
owner: Grok
last_updated: 2026-10-27 15:05 CT, by Grok
limits: No repo settings, rulesets, secrets, runner config, force-push, rebase, or bun.lock change. Do not convert #2555 to draft or toggle ready.
```
