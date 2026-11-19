# CI-WORKFLOW-READONLY-TOKENS-20261119

```text
TASK CI-WORKFLOW-READONLY-TOKENS-20261119  priority: P2  status: OPEN
goal: Every workflow that set no token permissions now sets `permissions: contents: read` at the top level, so a compromised step or dependency in those jobs cannot write to the repo, PRs or issues even if the repository default token is read-write.
why: Finding B2 of the read-only security review (2026-11-19). Matthew said "execute" on the findings in the review thread, 2026-11-19 08:55 UTC.
branch: claude/project-thread-nh4iin
base: verdant-grow-diary at 679e8f51
pr: draft, opened with this commit
state: draft, waiting on 35/35 required checks and an independent exact-head review
next_action: (1) 35/35 required checks at the PR head; (2) independent exact-head review by a session that did not write this; (3) Matthew's per-item yes at that SHA.
post_merge_check: the next scheduled or PR run of each changed workflow succeeds; a step that needed write would fail with 403 "Resource not accessible by integration".
decisions: (1) Only the 29 workflows with no `permissions:` key anywhere were changed; workflows that already declare permissions were left alone. (2) Each changed workflow was scanned for steps that need a write token (git push, gh pr/issue/api, github-script, upload-sarif, create-pull-request, release, pages, id-token); none found. Actions used: checkout, cache, setup-node, setup-bun, setup-deno, supabase/setup-cli, upload-artifact, DataDog synthetics; none needs a write token. (3) Same shape as the existing convention pinned by src/test/security-regression-workflow-trigger.test.ts:46.
behavior_change: CI only. No app, schema, RLS, edge, auth or lockfile change.
not_in_scope: moving the database admin key into a protected Environment and rotating it (finding B1: GitHub settings, Matthew's); rls-selftest and cultivar Q&A fixes (findings D1, E1: Edge functions, held until Matthew names them).
tests: python yaml parse of all 29 files asserts top-level permissions == {contents: read} and no job-level permissions; node scripts/assert-vitest-batched-workflow-safety.mjs PASS (23 invariants); node scripts/test-vitest-workflow-safety.mjs 6 passed; node scripts/assert-ecowitt-only-sensor-direction.mjs PASS. Vitest files that read these workflows were checked statically for permission pins (none).
blockers: local vitest BLOCKED: bun install --frozen-lockfile got ProxyConnectFailed (403). CI is the gate.
files_touched: 29 files under .github/workflows/ (+3 lines each); this handoff.
files_remaining: none for this slice
reviewer_seat: one eligible independent reviewer per OWNERSHIP.md section 4.3
reviewer_sha: none yet
session_state: no routines, no paused workflows. Pending human decisions: merge yes; B1 secret move and rotation; whether to build D1 and E1.
claimed_by: Claude thread session for the security review task, 2026-11-19 09:00 UTC
owner: Claude thread session for the security review task
last_updated: 2026-11-19 09:00 UTC
```
