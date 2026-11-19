# CI-ADMIN-KEY-ENVIRONMENT-20261119

```text
TASK CI-ADMIN-KEY-ENVIRONMENT-20261119  priority: P1  status: OPEN
goal: No pull-request workflow can read the Supabase database admin key (SUPABASE_SERVICE_ROLE_KEY). The only job that still needs it reads it from a protected GitHub Environment, so the repository-level secret can be deleted and the key rotated.
why: Security review finding B1 (2026-11-18, read-only review): the key is a plain repository secret, and ci.yml's PR-triggered `test` job names it, so any pushed branch can edit a workflow on its own PR and read it. Matthew asked "Draft the CI key fix" on 2026-11-19 08:02 UTC.
branch: claude/project-thread-bju4hh
base: verdant-grow-diary at 25f8bf6d1c05574488a8d2c48c65aba81f1d0b4d
pr: draft, opened after the first push; the head SHA is recorded on the pull request
state: pushed draft; no review requested
next_action: (1) 35/35 required checks at the PR head (ci.yml jobs skip on drafts; dispatch ci.yml on the branch or mark ready only on Matthew's word); (2) one independent exact-head review by a session that did not write this, under OWNERSHIP.md section 4.3; (3) Matthew's manual GitHub settings steps in the PR body (create the supabase-admin environment, add the environment secret, delete the repo secret, rotate the key); (4) Matthew's per-item yes naming the PR and SHA.
post_merge_check: on the deploy branch after merge, `grep -n "secrets.SUPABASE_SERVICE_ROLE_KEY" .github/workflows/*.yml` lists only gamification-staging-smoke.yml, and the required ci.yml checks stay green on the next PR. Repository-secret deletion and key rotation are Matthew's settings actions: NOT_MEASURED until he reports them.
decisions:
  - ci.yml: removed the "QuickLog RPC runtime harnesses (conditional)" step from the `test` job instead of moving it. The harness refuses every non-loopback API host (pinned by src/test/quicklog-rpc-harness-static-safety.test.ts "refuses every non-loopback API host"), so a hosted key can never be used by it; its `if` also reads env values set only in the step's own env block (inference, not run). Run it against a local disposable Supabase.
  - ci.yml `test` job: added permissions contents: read and pull-requests: read (checkout, cache, artifacts, and the gh api pulls lookup for the Knowledge Library base).
  - gamification-staging-smoke.yml: job bound to a new environment `supabase-admin` with permissions contents: read. It triggers on workflow_dispatch and push to main only, never on pull requests. Its award_nugs step has the same never-true `if` (workflow-branch-filter-liveness.test.ts records "broken env-scope gate and have never executed"); behaviour is unchanged apart from the approval wait.
  - New environment `supabase-admin` rather than reusing verdant-production-solo-founder, so the production writer environment's secrets are not widened to a smoke job.
  - 2026-11-19 08:20 UTC: shard 1/32 at b9a6231b went red on test-execution-manifest.test.ts ("committed but NOTHING runs them": the three QuickLog RPC harness scripts the removed step named). Fix: declare them as NEEDS_LIVE_DATABASE exemptions with the checkable reason (loopback-only; the step never ran) and raise that class's pinned count 21 -> 24. The lane floor test passed at b9a6231b, so the executed count stays above its floor.
  - Guard test src/test/ci-database-admin-key-environment-boundary.test.ts loads every workflow as YAML and asserts any job naming the key is bound to supabase-admin, ci.yml names it nowhere, and the touched jobs have least-privilege permissions.
tests: vitest BLOCKED locally: `bun install --frozen-lockfile` fails with ProxyConnectFailed (403) on registry tarballs in this container, so no node_modules. A Python mirror of the guard logic (PyYAML) returns FAIL on the base workflows (7 failures) and PASS on the change; both workflows parse with yaml.safe_load. CI is the real gate.
commands: grep -n "secrets.SUPABASE_SERVICE_ROLE_KEY" .github/workflows/*.yml ; python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" ; bunx vitest run src/test/ci-database-admin-key-environment-boundary.test.ts src/test/quicklog-rpc-harness-static-safety.test.ts src/test/workflow-branch-filter-liveness.test.ts src/test/production-environment-retirement.test.ts --reporter=dot
files_touched: .github/workflows/ci.yml; .github/workflows/gamification-staging-smoke.yml; src/test/ci-database-admin-key-environment-boundary.test.ts; src/test/test-execution-manifest.test.ts; this file
files_remaining: none for this slice
not_in_scope: SUPABASE_DB_URL and SUPABASE_ANON_KEY repository secrets (DB_URL is admin-grade too; follow-up); the 29 workflows with no permissions block (finding B2); the #1250 hold files (untouched); any GitHub or Supabase settings change.
gotchas: once the environment exists with required reviewers, every push to main that triggers gamification-staging-smoke waits for approval. Deleting the repo secret before the environment secret exists makes that smoke skip, not fail.
blockers: none for the code; the settings steps are Matthew's.
exclusions_for_review: this Claude thread session and the earlier session on the same thread (both authors)
reviewer_seat: none requested yet
reviewer_sha: none
session_state: no routines, no paused workflows; no secrets read or set; no settings read or changed.
claimed_by: Claude thread session for the CI admin-key task, 2026-11-19 08:30 UTC (Matthew's request)
owner: Claude thread session for the CI admin-key task
last_updated: 2026-11-19 08:30 UTC, by Claude thread session for the CI admin-key task
```
