# CodeRabbit review controls task receipt

Snapshot: 2026-10-21 17:56 UTC. This scoped receipt keeps the task resumable
without editing shared governance or ownership files.

```text
TASK CODERABBIT-20261021-REVIEW-CONTROLS  priority: P2  status: OPEN
goal: Enable draft reviews, prohibit author approval, restrict pre-merge overrides.
branch: codex/coderabbit-20261021-review-controls
base: verdant-grow-diary at 05f5138d08c943921df0ce224af8d9c0837c09d9
head_sha: Exact head is pinned in PR #2309's description; require VERIFIED_SHA from that packet.
checkout: : "${VERIFIED_SHA:?Set the full exact head from PR #2309 description}" && test "$(gh pr view 2309 --repo Verdant-OS/verdant-grow-diary --json headRefOid --jq .headRefOid)" = "$VERIFIED_SHA" && git fetch origin codex/coderabbit-20261021-review-controls && test "$(git rev-parse FETCH_HEAD)" = "$VERIFIED_SHA" && git switch --detach "$VERIFIED_SHA"
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2309 (draft)
state: Configuration prepared; service resolution at the final exact head pending.
next_action: Read resolved configuration at the final head; keep draft.
files: .coderabbit.yaml; docs/coderabbit-review-controls-draft-20261021.md
blockers: Effective configuration and independent acceptance not yet measured.
artifacts: PR description and the authorized CodeRabbit configuration response.
reviewer_seat: Critical Mass, Blue Dream or Durban Poison; author cannot give acceptance PASS.
claimed_by: Codex, explicit task assignment, 2026-10-21 17:49 UTC
last_updated: 2026-10-21 17:56 UTC
```

The owner approved exactly `reviews.auto_review.drafts: true`,
`reviews.allow_author_approval: false`, and
`reviews.pre_merge_checks.override_requested_reviewers_only: true`, plus one
configuration-information request. Every unrelated configuration value is preserved.

Collision observation at 17:47:48 UTC covered 111 open PRs. PR #1879 has an
inherited `.coderabbit.yaml` change removing `!package-lock.json`; its file blob
`ca01ade85a7273dbd22ede34193fc83fbe76ce81` already equals this task's deploy base.
It changes none of the approved keys. Its branch and ownership remain untouched.

The complete candidate validates with zero errors against the
[official schema](https://coderabbit.ai/integrations/schema.v2.json), fetched
2026-10-21 17:45:54 UTC, SHA-256
`ebd53b7c9603a044833dc850fca22b0d7edf43e2fbe88a08ba138ad8e45501c2`.
Parsed candidate equality permits exactly the three requested differences.
Schema validity does not establish effective service settings or review PASS.
Workspace or organization global overrides can outrank repository YAML.

No merge, deploy, readiness transition, check override, dashboard login,
workflow change, or permissions expansion is authorized by this task.
Rollback is a normal revert of this configuration change after separate review.
