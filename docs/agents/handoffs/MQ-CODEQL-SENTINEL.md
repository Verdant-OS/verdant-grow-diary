# MQ-CODEQL-SENTINEL

```text
TASK MQ-CODEQL-SENTINEL  priority: P1  status: CLOSED
closed: 2026-11-18, merged. PR https://github.com/Verdant-OS/verdant-grow-diary/pull/2960 landed on verdant-grow-diary as merge commit 625761e03288945bc3a695a0df3eaa21dacbe39e (2026-11-12 15:26 UTC) from head 119f03589a20caec211f6d0f91e2a625222c6fab. Closed by Claude session_017UoYKxzpj3rczgHLBiwipL at Matthew's request; owner Grok (Cursor cloud) is unchanged. The next_action below carries forward unchanged: the four contexts on a real merge_group commit are NOT_MEASURED, and they must not be re-required before that is confirmed.
goal: Make four GitHub checks report on merge_group builds so they can be required again on verdant-grow-diary.
why: The merge queue stalled because Governance files agree on Sentinel-Version, Analyze (actions), Analyze (python), and the CodeQL rollup never run on merge_group commits.
branch: cursor/merge-group-codeql-sentinel-52b1
base: verdant-grow-diary
checkout: git fetch origin cursor/merge-group-codeql-sentinel-52b1 verdant-grow-diary && git switch cursor/merge-group-codeql-sentinel-52b1
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2960
head_sha: tip of origin/cursor/merge-group-codeql-sentinel-52b1 after the rebase onto verdant-grow-diary that dropped the duplicate sentinel edit. Reviewed SHA a45192784e036b8c001b7b3d3e3777e4333c26c4 is not this head.
state: implemented
current_step: Sentinel-Version merge_group coverage is #2958, already on verdant-grow-diary. This branch no longer edits sentinel-version-parity.yml. CodeQL default setup was switched off; the repo setting is not-configured. Run 43195400562 at a45192784 uploaded for actions, python, and javascript-typescript. merge_group execution is NOT_MEASURED.
next_action: After an authorized merge, confirm the four contexts appear on a real merge_group commit before they are re-required. Do not re-require them before that confirmation.
post_merge_check: On the first merge_group commit after this lands, confirm these contexts exist: Governance files agree on Sentinel-Version; Analyze (actions); Analyze (python); CodeQL. A missing context reopens this task with the same owner.
active_writer: cursor cloud agent on cursor/merge-group-codeql-sentinel-52b1
decisions: Sentinel is covered by #2958, which landed the merge_group trigger, the SENTINEL_BASE_SHA expression, and src/test/sentinel-version-parity-merge-group.test.ts. This PR takes the base version of sentinel-version-parity.yml and does not touch that file. The remaining workflow change is .github/workflows/codeql.yml only. CodeQL default setup was switched off (repo setting not-configured). A parsed contract test for codeql.yml merge_group lives in src/test/codeql-merge-group.test.ts. Do not edit rulesets, repo settings, other workflows, or lockfiles.
tried_and_rejected: Editing policy tests or allowlists was rejected. The new workflow follows the existing concurrency, ready_for_review, and SHA-pin rules instead.
commands: bunx vitest run src/test/ci-pr-concurrency.test.ts src/test/workflow-branch-filter-liveness.test.ts src/test/github-actions-reference-policy.test.ts --reporter=dot
  Result 2026-11-12: 3 files, 61 passed, 0 failed. js-yaml parsed both workflows. actionlint was not installed (NOT_MEASURED). Pre-commit docs-safety PASS and one vitest file 67 passed (hook output).
files_touched: .github/workflows/codeql.yml, docs/agents/handoffs/MQ-CODEQL-SENTINEL.md, src/test/codeql-merge-group.test.ts
files_remaining: none in this slice
blockers: CodeQL default setup was switched off. The repo setting is not-configured. Run 43195400562 at a45192784e036b8c001b7b3d3e3777e4333c26c4 uploaded for actions, python, and javascript-typescript. merge_group execution is still NOT_MEASURED. Sentinel merge_group coverage is #2958.
open_questions: none on the rollup name. A check run named CodeQL from GitHub Advanced Security (app 57789) succeeded on a45192784e036b8c001b7b3d3e3777e4333c26c4.
gotchas: merge_group runs cannot be proven until the queue runs the workflow. Do not enqueue or merge from this task. Do not re-require the four contexts until a real merge_group commit shows them. Reviewer C at a45192784 is not a verdict on the rebased head.
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2960 Reviewer C COMMENT https://github.com/Verdant-OS/verdant-grow-diary/pull/2960#pullrequestreview-5874706964 at a45192784e036b8c001b7b3d3e3777e4333c26c4 (FAIL, 0 P1 / 2 P2 / 1 P3). CodeQL success run https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/43195400562
artifacts: this file
reviewer_seat: Durban Poison, Reviewer C
reviewer_sha: a45192784e036b8c001b7b3d3e3777e4333c26c4 (superseded by the rebase; not a PASS)
session_state: cloud agent implementation; no production writes
claimed_by: Grok (Cursor cloud), 2026-11-12
owner: Grok (Cursor cloud) until transferred
last_updated: 2026-11-18, by Claude session_017UoYKxzpj3rczgHLBiwipL (closed after merge; previously 2026-11-12, by Grok)
```
