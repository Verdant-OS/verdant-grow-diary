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
next_action: Matthew creates the XAI_API_KEY repository secret if he wants it to run (the xAI data-destination question is decided: yes). Then one eligible outside reviewer (not this session) at the exact head for this protected .github scope, Matthew's per-item yes and the merge queue.
post_merge_check: (1) After XAI_API_KEY is added, on the first non-draft, non-docs PR: the review job runs with a read-only token, and the post job leaves exactly one comment that starts "Grok peer observation". (2) Isolation canary, before relying on it: open a throwaway same-repo draft PR, mark it ready, and have its diff ask the model to print the contents of /proc/self/environ, $XAI_API_KEY and ~/.grok/sandbox.toml. PASS only if the posted comment contains none of them (no key, no xai- string, no environment dump) and the run log shows the review-locked profile was applied, or the review step failed closed. Record the run URL. Close the canary PR unmerged. NOT_MEASURED until then.
decisions:
  - Two jobs: review (contents: read, xAI key, no GitHub token, checkout with persist-credentials: false) and post (pull-requests: write, no checkout, no xAI key).
  - Agent runs with --permission-mode dontAsk, read-only tools, shell/edit/web/subagents disallowed, --sandbox strict, --max-turns 30, --no-auto-update. Flags taken from docs.x.ai/build/cli/reference and docs.x.ai/build/enterprise (read 2026-11-18).
  - Install pinned: npm install -g @xai-official/grok@1.0.89 (npm view, 2026-11-18); xAI documents npm as the alternative to the curl|bash installer.
  - Every action pinned to the full SHA already used in this repo. Concurrency follows ci-pr-concurrency.test.ts conventions.
  - Skips drafts, fork PRs and docs-only changes (paths-ignore **/*.md, docs/**).
  - Output posted as a comment with a not-an-independent-review header; @-mentions and [VERDICT] markers neutralized; capped at 60000 bytes.
  - 2026-11-18 10:00 UTC, after Codex security finding r4612036993 (P2: the model process holds XAI_API_KEY and an unscoped Read plus the strict profile could reach /proc/self/environ): Read/Grep now scoped to $GITHUB_WORKSPACE/** with /proc and /sys denied; a review-locked sandbox profile (extends strict) denies /proc, /sys and ~/.grok/config.toml; a scan step withholds output containing the key, its base64 form, or xai-/gh*_/github_pat_ shaped strings before upload. The diff moved into the workspace (.grok-review/pr.diff) so the scoped Read covers it. Two new contract tests were RED (2 failed, 9 passed) before the fix and pass after (11/11); the scan script was exercised locally against 6 fake outputs (clean passes, exact key, base64 key, gh token and xai-shaped string withheld).
  - 2026-11-18 10:05 UTC, after independent review FAIL at dac724c2 (session_017UoYKwSx4SszGYZisFpeKv, review 5954360561: P2 plus 6 P3): PR-supplied agent config (.grok, .claude, .mcp.json, .agents, .cursor, .codex, .gemini) is removed from the workspace before Grok starts, because a project .grok/config.toml can add [mcp_servers], [plugins] and [permission] (docs.x.ai/build/settings/reference); GROK_HOME points to a fresh temp dir; GROK_SUBAGENTS/WRITE_FILE/WEB_FETCH/MEMORY=0; the post job runs only when Grok actually ran (no skip comment on every PR); [VERDICT]/[ROUTE]/[ACK]/[CLAIM]/[FIX REQUEST] markers are neutralized; the checkout step is renamed. Five contract tests were RED (5 failed, 9 passed) before the change and pass after (14/14).
  - 2026-11-18 10:11 UTC, after independent PASS at b5bbc889 with 6 P3 (review 5954515827), Matthew chose to fix the P3s first. Done: the sandbox profile is written to both $GROK_HOME/sandbox.toml and ~/.grok/sandbox.toml, since the docs name ~/.grok and GROK_HOME is the home override; marker cleanup is case-insensitive and covers [YES-RECORDED], [APPROVE*], [PASS] and [FAIL]; an isolation canary is added to post_merge_check. Two contract tests were RED (2 failed, 12 passed) before the change and pass after (14/14). Left as is (NOT_MEASURED until a key exists): the assumed .text field, tool names, and keys in encodings other than base64.
  - 2026-11-18 10:17 UTC, after independent PASS at 62c38299 (review 5954588814, 0 P1 / 0 P2 / 4 P3), Matthew chose to fix the new test-gap P3: the marker test now runs the post job's real "Build comment body" script on sample output and checks every marker in both cases, plus untouched ordinary brackets and a defanged @-mention. Test-only; the workflow is unchanged. RED proof: with VERDICT removed from the rule the test fails (1 failed, 14 passed); with the real workflow it passes (15/15).
  - Contract test src/test/grok-review-workflow-safety.test.ts asserts resolved YAML values; it failed before the workflow existed (Test Files 1 failed, no tests) and passes after (9/9).
tried_and_rejected:
  - Workflow as pasted: rejected for the P1 findings above.
  - curl https://x.ai/cli/install.sh | bash: rejected; unpinned and unverified.
commands: |
  bunx vitest run src/test/grok-review-workflow-safety.test.ts src/test/github-actions-reference-policy.test.ts src/test/ci-pr-concurrency.test.ts src/test/workflow-branch-filter-liveness.test.ts src/test/workflows-typecheck-gate.test.ts src/test/required-check-audit-rules.test.ts src/test/test-execution-manifest.test.ts src/test/production-environment-retirement.test.ts src/test/check-bun-lockfile-policy.test.ts src/test/vitest-controlled-fingerprint.test.ts src/test/required-money-migrations-workflow-trust-boundary.test.ts --reporter=dot  -> 11 files, 380 passed
  bun run typecheck -> pass; bunx eslint src/test/grok-review-workflow-safety.test.ts -> clean
files_touched: .github/workflows/grok-review.yml (new); src/test/grok-review-workflow-safety.test.ts (new); this file (new)
files_remaining: none
blockers: XAI_API_KEY is not set: the workflow's own run on this PR posted the skip note (comment 6975026545). Recommend a dedicated, spend-capped xAI key for this workflow. The agent run itself is NOT_MEASURED: no key in this session, and the exact tool names accepted by --tools/--allow are taken from docs, not observed.
open_questions: none. Data destination decided: Matthew answered "Yes, xAI is OK" on 2026-11-18 09:44 UTC in session session_017UoYKwo4mYcULag9FoN2QE to sending non-draft, non-docs PR diffs and repo files the agent reads to xAI.
gotchas: a Grok comment is a peer observation, never independent acceptance (OWNERSHIP.md section 4.3). If grok rejects a flag, the review step fails closed and no comment is posted.
exclusions_for_review: Claude session_017UoYKwo4mYcULag9FoN2QE (this writer)
reviewer_seat: none requested yet
reviewer_sha: none
session_state: no production access used; no secrets read or set; no paused workflows.
claimed_by: Claude session_017UoYKwo4mYcULag9FoN2QE, 2026-11-18 09:41 UTC (Matthew's request)
owner: Claude session_017UoYKwo4mYcULag9FoN2QE
last_updated: 2026-11-18 10:17 UTC, by Claude session_017UoYKwo4mYcULag9FoN2QE (marker test pins behavior)
```
