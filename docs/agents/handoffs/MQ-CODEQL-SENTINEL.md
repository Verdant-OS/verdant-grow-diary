# MQ-CODEQL-SENTINEL

```text
TASK MQ-CODEQL-SENTINEL  priority: P1  status: OPEN
goal: Make four GitHub checks report on merge_group builds so they can be required again on verdant-grow-diary.
why: The merge queue stalled because Governance files agree on Sentinel-Version, Analyze (actions), Analyze (python), and the CodeQL rollup never run on merge_group commits.
branch: cursor/merge-group-codeql-sentinel-52b1
base: verdant-grow-diary
checkout: git fetch origin cursor/merge-group-codeql-sentinel-52b1 verdant-grow-diary && git switch cursor/merge-group-codeql-sentinel-52b1
pr: see the pull request opened from this branch
head_sha: workflow commit 82bf263a3b27a70062afd9c244e5152e20c4b3ff; if a later handoff-only commit is the branch tip, use git rev-parse HEAD on origin/cursor/merge-group-codeql-sentinel-52b1
state: implemented
current_step: workflow and handoff written; merge_group execution is NOT_MEASURED
next_action: After an authorized merge, confirm the four contexts appear on a real merge_group commit, then a repo admin re-requires them. Do not re-require them before that confirmation.
post_merge_check: On the first merge_group commit after this lands, confirm these contexts exist: Governance files agree on Sentinel-Version; Analyze (actions); Analyze (python); CodeQL. A missing context reopens this task with the same owner.
active_writer: cursor cloud agent on cursor/merge-group-codeql-sentinel-52b1
decisions: Add merge_group types [checks_requested] with no path filter to sentinel-version-parity.yml and keep the existing path-filtered pull_request and push triggers. Pass merge_group.base_sha into SENTINEL_BASE_SHA so the existing checker has a base on queue commits. Add .github/workflows/codeql.yml (advanced setup) with pull_request and push on verdant-grow-diary, merge_group, and a weekly Monday 06:00 UTC schedule. Matrix languages actions, python, and javascript-typescript with build-mode none so job names are Analyze (actions), Analyze (python), and Analyze (javascript-typescript). Pin checkout to the repo's existing SHA and codeql-action init/analyze to 9418214df1f2c4b8128c770156c409013b07d6b9 (v3.39.3). Do not edit tests, lockfiles, rulesets, or repo settings.
tried_and_rejected: Editing policy tests or allowlists was rejected. The new workflow follows the existing concurrency, ready_for_review, and SHA-pin rules instead.
commands: bunx vitest run src/test/ci-pr-concurrency.test.ts src/test/workflow-branch-filter-liveness.test.ts src/test/github-actions-reference-policy.test.ts --reporter=dot
  Result 2026-11-12: 3 files, 61 passed, 0 failed. js-yaml parsed both workflows. actionlint was not installed (NOT_MEASURED). Pre-commit docs-safety PASS and one vitest file 67 passed (hook output).
files_touched: .github/workflows/sentinel-version-parity.yml, .github/workflows/codeql.yml, docs/agents/handoffs/MQ-CODEQL-SENTINEL.md
files_remaining: none in this slice
blockers: A repo admin must disable CodeQL default setup (dynamic/github-code-scanning/codeql) before this workflow can upload. That setting is outside the pull request. Until then, analyze uploads can fail because default setup and advanced setup cannot both upload.
open_questions: Whether the CodeQL rollup context name stays exactly CodeQL after default setup is disabled.
gotchas: merge_group runs cannot be proven until the queue runs the workflow. Do not enqueue or merge from this task. Do not re-require the four contexts until a real merge_group commit shows them.
links: NOT_MEASURED until the pull request exists
artifacts: this file
reviewer_seat:
reviewer_sha:
session_state: cloud agent implementation; no production writes
claimed_by: Grok (Cursor cloud), 2026-11-12
owner: Grok (Cursor cloud) until transferred
last_updated: 2026-11-12, by Grok
```
