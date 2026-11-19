# CI-ADMIN-KEY-ENVIRONMENT-20261119

```text
TASK CI-ADMIN-KEY-ENVIRONMENT-20261119  priority: P1  status: OPEN
goal: No pull-request workflow can read the Supabase database admin key (SUPABASE_SERVICE_ROLE_KEY). The only job that still needs it reads it from a protected GitHub Environment, so the repository-level secret can be deleted and the key rotated.
why: Security review finding B1 (2026-11-18, read-only review): the key is a plain repository secret, and ci.yml's PR-triggered `test` job names it, so any pushed branch can edit a workflow on its own PR and read it. Matthew asked "Draft the CI key fix" on 2026-11-19 08:02 UTC.
branch: claude/project-thread-bju4hh
base: verdant-grow-diary at 25f8bf6d1c05574488a8d2c48c65aba81f1d0b4d
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/3025 (taken out of draft 2026-11-19 08:58 UTC by the matt816cheek-bit account)
head_sha: the commit that adds this line; its parent is de1ce0174c19c04039ac4a48d4ac8f375b1735d9 (forward-merge of verdant-grow-diary at 679e8f51b17a2ee52e3eed204bff5401be082b63, bringing in #3020). Verify with `git ls-remote origin claude/project-thread-bju4hh`.
state: pushed; READY FOR REVIEW posted at 3d87797a and moved to the newer heads; review requested from Reviewer D (fallback C) via the Coordinator seat
next_action: (1) 35/35 required checks at the PR head; (2) one independent exact-head review by a session that did not write this, under OWNERSHIP.md section 4.3; (3) Matthew's manual GitHub settings steps in the PR body, in order: create the supabase-admin environment WITH protection rules (required reviewer: Matthew; deployment branches limited to main and verdant-grow-diary, no pattern matching feature branches; prevent self-review only if another approver exists), confirm those rules show on the environment page, and only then add the environment secret, delete the repo secret, and rotate the key. A new environment has no protection rules by default, so a secret added before the rules is readable by a dispatch from any branch (Codex finding r4626475396); (4) Matthew's per-item yes naming the PR and SHA.
post_merge_check: on the deploy branch after merge, `grep -n "secrets.SUPABASE_SERVICE_ROLE_KEY" .github/workflows/*.yml` lists only gamification-staging-smoke.yml, and the required ci.yml checks stay green on the next PR. Repository-secret deletion and key rotation are Matthew's settings actions: NOT_MEASURED until he reports them.
decisions:
  - ci.yml: removed the "QuickLog RPC runtime harnesses (conditional)" step from the `test` job instead of moving it. Corrected 2026-11-19 09:10 UTC after Codex finding r4626475413 (P1): the orchestrator does NOT refuse hosted URLs. It runs save-event, save-manual, then dual-timestamp, and only dual-timestamp refuses a non-loopback host; the first two create users and write rows with the admin key. That is a further reason the step must not hold a hosted key. Its `if` reads env values set only in the step's own env block, so it never ran (inference, matching workflow-branch-filter-liveness.test.ts on the same pattern). Run the harnesses only against a local disposable Supabase. Adding a loopback guard to the orchestrator itself is offered to Matthew, not done here: run-* scripts are scorer-locked judges (scripts/lib/scorerLockRules.mjs).
  - Guard test also fails if any workflow names the key outside its jobs (workflow-level env is inherited by every job), after Codex finding r4626475422 (P2).
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
