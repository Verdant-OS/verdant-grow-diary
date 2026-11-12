# MQ-CODEQL-SENTINEL

```text
TASK MQ-CODEQL-SENTINEL  priority: P1  status: OPEN
goal: Make four GitHub checks report on merge_group builds so they can be required again on verdant-grow-diary.
why: The merge queue stalled because Governance files agree on Sentinel-Version, Analyze (actions), Analyze (python), and the CodeQL rollup never run on merge_group commits.
branch: cursor/merge-group-codeql-sentinel-52b1
base: verdant-grow-diary
checkout: git fetch origin cursor/merge-group-codeql-sentinel-52b1 verdant-grow-diary && git switch cursor/merge-group-codeql-sentinel-52b1
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2960
head_sha: tip of origin/cursor/merge-group-codeql-sentinel-52b1 after the rebase onto verdant-grow-diary that dropped the duplicate sentinel edit. Reviewed SHA a45192784e036b8c001b7b3d3e3777e4333c26c4 is not this head.
state: implemented
current_step: rebased onto verdant-grow-diary after #2958. Unique remaining file is codeql.yml. Pull-request CodeQL uploads completed on a45192784 (run 43195400562). merge_group execution is NOT_MEASURED.
next_action: After an authorized merge, confirm the four contexts appear on a real merge_group commit before they are re-required. Do not re-require them before that confirmation.
post_merge_check: On the first merge_group commit after this lands, confirm these contexts exist: Governance files agree on Sentinel-Version; Analyze (actions); Analyze (python); CodeQL. A missing context reopens this task with the same owner.
active_writer: cursor cloud agent on cursor/merge-group-codeql-sentinel-52b1
decisions: #2958 already merged the unfiltered merge_group trigger and SENTINEL_BASE_SHA change on sentinel-version-parity.yml, plus src/test/sentinel-version-parity-merge-group.test.ts. This branch keeps that file and that test as they are on verdant-grow-diary. The remaining change is .github/workflows/codeql.yml (advanced setup) with pull_request and push on verdant-grow-diary, merge_group, and a weekly Monday 06:00 UTC schedule. Matrix languages actions, python, and javascript-typescript with build-mode none so job names are Analyze (actions), Analyze (python), and Analyze (javascript-typescript). Pin checkout to the repo's existing SHA and codeql-action init/analyze to 9418214df1f2c4b8128c770156c409013b07d6b9 (v3.39.3). Do not edit tests, lockfiles, rulesets, or repo settings.
tried_and_rejected: Editing policy tests or allowlists was rejected. The new workflow follows the existing concurrency, ready_for_review, and SHA-pin rules instead.
commands: bunx vitest run src/test/ci-pr-concurrency.test.ts src/test/workflow-branch-filter-liveness.test.ts src/test/github-actions-reference-policy.test.ts --reporter=dot
  Result 2026-11-12: 3 files, 61 passed, 0 failed. js-yaml parsed both workflows. actionlint was not installed (NOT_MEASURED). Pre-commit docs-safety PASS and one vitest file 67 passed (hook output).
files_touched: .github/workflows/codeql.yml, docs/agents/handoffs/MQ-CODEQL-SENTINEL.md
files_remaining: none in this slice
blockers: none for upload on the later pull-request head. First head 65f5bd5694475999ca59fdc2892dd49d143ada4e run https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/43190352700 failed with "CodeQL analyses from advanced configurations cannot be processed when the default setup is enabled". Later head a45192784e036b8c001b7b3d3e3777e4333c26c4 run https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/43195400562 reported Analysis upload status is complete for actions, python, and javascript-typescript. Reviewer C read GET /repos/Verdant-OS/verdant-grow-diary/code-scanning/default-setup as state not-configured at review time (2026-11-12). This session did not change that setting. Copilot quota failure (run 43194784003) is outside this slice.
open_questions: none on the rollup name. A check run named CodeQL from GitHub Advanced Security (app 57789) succeeded on a45192784e036b8c001b7b3d3e3777e4333c26c4.
gotchas: merge_group runs cannot be proven until the queue runs the workflow. Do not enqueue or merge from this task. Do not re-require the four contexts until a real merge_group commit shows them. Reviewer C at a45192784 is not a verdict on the rebased head.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2960 Reviewer C COMMENT https://github.com/Verdant-OS/verdant-grow-diary/pull/2960#pullrequestreview-5874706964 at a45192784e036b8c001b7b3d3e3777e4333c26c4 (FAIL, 0 P1 / 2 P2 / 1 P3). CodeQL success run https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/43195400562
artifacts: this file
reviewer_seat: Durban Poison, Reviewer C
reviewer_sha: a45192784e036b8c001b7b3d3e3777e4333c26c4 (superseded by the rebase; not a PASS)
session_state: cloud agent implementation; no production writes
claimed_by: Grok (Cursor cloud), 2026-11-12
owner: Grok (Cursor cloud) until transferred
last_updated: 2026-11-12, by Grok
```
