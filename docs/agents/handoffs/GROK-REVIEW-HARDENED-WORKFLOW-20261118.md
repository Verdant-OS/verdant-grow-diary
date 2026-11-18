# GROK-REVIEW-HARDENED-WORKFLOW-20261118

```text
TASK GROK-REVIEW-HARDENED-WORKFLOW-20261118  priority: other  status: OPEN
goal: Add an optional Grok Build CLI peer-review workflow on PRs that cannot leak the xAI key or the GitHub token and never counts as a review or approval.
why: Matthew pasted a grok-review workflow on 2026-11-18. As pasted it ran the agent with --always-approve while holding XAI_API_KEY and GH_TOKEN, with no permissions block, a curl|bash install and an unpinned checkout. He chose "Draft a hardened version".
branch: claude/grok-review-hardened-workflow
base: verdant-grow-diary @ 0d9e9c081973ea3e4ff86f5cd8822d5cfab3f1be
pr: see the PR opened from this branch
head_sha: read the current head from the PR and verify with git ls-remote
state: pushed draft; no review requested
next_action: Matthew decides (1) whether sending non-docs PR diffs and readable repo files to xAI is acceptable, (2) creates the XAI_API_KEY repository secret if he wants it to run. Then one eligible outside reviewer (not this session) at the exact head for this protected .github scope, Matthew's per-item yes and the merge queue.
post_merge_check: on the first non-draft, non-docs PR after merge, the "Grok peer review" run shows the review job with a read-only token and the post job leaving one comment that starts "Grok peer observation". If XAI_API_KEY is absent the comment says the review was skipped. NOT_MEASURED until then.
decisions:
  - Two jobs: review (contents: read, xAI key, no GitHub token, checkout with persist-credentials: false) and post (pull-requests: write, no checkout, no xAI key).
  - Agent runs with --permission-mode dontAsk, read-only tools, shell/edit/web/subagents disallowed, --sandbox strict, --max-turns 30, --no-auto-update. Flags taken from docs.x.ai/build/cli/reference and docs.x.ai/build/enterprise (read 2026-11-18).
  - Install pinned: npm install -g @xai-official/grok@1.0.89 (npm view, 2026-11-18); xAI documents npm as the alternative to the curl|bash installer.
  - Every action pinned to the full SHA already used in this repo. Concurrency follows ci-pr-concurrency.test.ts conventions.
  - Skips drafts, fork PRs and docs-only changes (paths-ignore **/*.md, docs/**).
  - Output posted as a comment with a not-an-independent-review header; @-mentions and [VERDICT] markers neutralized; capped at 60000 bytes.
  - Contract test src/test/grok-review-workflow-safety.test.ts asserts resolved YAML values; it failed before the workflow existed (Test Files 1 failed, no tests) and passes after (9/9).
tried_and_rejected:
  - Workflow as pasted: rejected for the P1 findings above.
  - curl https://x.ai/cli/install.sh | bash: rejected; unpinned and unverified.
commands: |
  bunx vitest run src/test/grok-review-workflow-safety.test.ts src/test/github-actions-reference-policy.test.ts src/test/ci-pr-concurrency.test.ts src/test/workflow-branch-filter-liveness.test.ts src/test/workflows-typecheck-gate.test.ts src/test/required-check-audit-rules.test.ts src/test/test-execution-manifest.test.ts src/test/production-environment-retirement.test.ts src/test/check-bun-lockfile-policy.test.ts src/test/vitest-controlled-fingerprint.test.ts src/test/required-money-migrations-workflow-trust-boundary.test.ts --reporter=dot  -> 11 files, 380 passed
  bun run typecheck -> pass; bunx eslint src/test/grok-review-workflow-safety.test.ts -> clean
files_touched: .github/workflows/grok-review.yml (new); src/test/grok-review-workflow-safety.test.ts (new); this file (new)
files_remaining: none
blockers: XAI_API_KEY secret existence is unknown (no access to repository secrets). The workflow runs but posts a skipped note without it. The agent run itself is NOT_MEASURED: no key in this session, and the exact tool names accepted by --tools/--allow are taken from docs, not observed.
open_questions: is sending PR diffs to xAI acceptable (new data destination)? Matthew's decision.
gotchas: a Grok comment is a peer observation, never independent acceptance (OWNERSHIP.md section 4.3). If grok rejects a flag, the review step fails closed and no comment is posted.
exclusions_for_review: Claude session_017UoYKwo4mYcULag9FoN2QE (this writer)
reviewer_seat: none requested yet
reviewer_sha: none
session_state: no production access used; no secrets read or set; no paused workflows.
claimed_by: Claude session_017UoYKwo4mYcULag9FoN2QE, 2026-11-18 09:41 UTC (Matthew's request)
owner: Claude session_017UoYKwo4mYcULag9FoN2QE
last_updated: 2026-11-18 09:41 UTC, by Claude session_017UoYKwo4mYcULag9FoN2QE
```
