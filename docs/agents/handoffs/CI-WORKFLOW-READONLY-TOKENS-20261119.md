# CI-WORKFLOW-READONLY-TOKENS-20261119

```text
TASK CI-WORKFLOW-READONLY-TOKENS-20261119  priority: P2  status: OPEN
goal: Every workflow that set no token permissions now sets `permissions: contents: read` at the top level, so a compromised step or dependency in those jobs cannot write to the repo, PRs or issues even if the repository default token is read-write.
why: Finding B2 of the read-only security review (2026-11-19). Matthew said "execute" on the findings in the review thread, 2026-11-19 08:55 UTC.
branch: claude/project-thread-nh4iin
base: verdant-grow-diary at 679e8f51b17a2ee52e3eed204bff5401be082b63
pr: #3026 https://github.com/Verdant-OS/verdant-grow-diary/pull/3026
head_sha: 91d6f7e470f3fbe8a8f3dea263dac9cdf7c9003a is the last commit with code or test changes. Commits after it touch only this handoff. The PR page shows the live head, and reviews and checks bind to that exact SHA.
state: draft, waiting on 35/35 required checks and an independent exact-head review
next_action: (1) 35/35 required checks at the PR head; (2) independent exact-head review by a session that did not write this; (3) Matthew's per-item yes at that SHA.
post_merge_check: a step that needed write would fail with 403 "Resource not accessible by integration". 24 of the 29 run on pull_request or schedule, so this PR's own CI run plus their next scheduled run covers them. datadog-synthetics.yml and gamification-staging-smoke.yml run on the merge push to the deploy branch; check those two runs. e2e-fixture-garden-rotation.yml, pheno-journey-smoke.yml and vitest-batched-full-suite.yml are workflow_dispatch only: dispatch each once from verdant-grow-diary after merge (Matthew's call, since a dispatch starts work) or record them NOT_MEASURED until their next manual run. The committed fence is src/test/workflow-token-permissions.test.ts.
decisions: (1) Only the 29 workflows with no `permissions:` key anywhere were changed; workflows that already declare permissions were left alone. (2) Each changed workflow was scanned for steps that need a write token (git push, gh pr/issue/api, github-script, upload-sarif, create-pull-request, release, pages, id-token); none found. Actions used: checkout, cache, setup-node, setup-bun, setup-deno, supabase/setup-cli, upload-artifact, DataDog synthetics; none needs a write token. (3) Same shape as the existing convention pinned by src/test/security-regression-workflow-trigger.test.ts:46.
behavior_change: CI only. No app, schema, RLS, edge, auth or lockfile change.
not_in_scope: moving the database admin key into a protected Environment and rotating it (finding B1: GitHub settings, Matthew's); rls-selftest and cultivar Q&A fixes (findings D1, E1: Edge functions, held until Matthew names them).
tests: new src/test/workflow-token-permissions.test.ts pins the invariant: every job in every workflow runs with a scoped token (top-level or job-level `permissions:`), apart from 3 known jobs that may only shrink (ci.yml#test, irrigation-pgtap-rls-gate.yml#harness-typecheck and #pgtap-irrigation), and the 29 changed workflows are exactly {contents: read}. Run under bun test in a scratch copy (supplemental; CI vitest is the gate): 32 pass; with the 29 workflows restored to the base version, 30 fail, 2 pass (RED proven). node scripts/check-contract-test-resolution.mjs OK. Also: python yaml parse of all 29 files asserts top-level permissions == {contents: read} and no job-level permissions; node scripts/assert-vitest-batched-workflow-safety.mjs PASS (23 invariants); node scripts/test-vitest-workflow-safety.mjs 6 passed; node scripts/assert-ecowitt-only-sensor-direction.mjs PASS. Vitest files that read these workflows were checked statically for permission pins (none).
blockers: local vitest BLOCKED: bun install --frozen-lockfile got ProxyConnectFailed (403). CI is the gate.
files_touched: 29 files under .github/workflows/ (+3 lines each); src/test/workflow-token-permissions.test.ts (new); this handoff.
files_remaining: none for this slice
reviewer_seat: one eligible independent reviewer per OWNERSHIP.md section 4.3
reviewer_sha: none yet
session_state: no routines, no paused workflows. Pending human decisions: merge yes; B1 secret move and rotation; whether to build D1 and E1.
claimed_by: Claude thread session for the security review task, 2026-11-19 09:00 UTC
owner: Claude thread session for the security review task
last_updated: 2026-11-19 09:20 UTC
```
