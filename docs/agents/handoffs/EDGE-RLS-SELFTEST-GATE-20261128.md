# EDGE-RLS-SELFTEST-GATE-20261128

```text
TASK EDGE-RLS-SELFTEST-GATE-20261128  priority: P2  status: OPEN
goal: The rls-selftest harness does nothing unless the project sets RLS_SELFTEST_ENABLED=true, and it compares its header with the shared timing-safe helper. A deploy that puts it on production can no longer create auth users or write rows for anyone who holds or guesses RLS_TEST_SECRET, unless someone deliberately switches it on.
why: Finding D1 of the 2026-11-19 read-only security review. Matthew said "Build both" (rls-selftest and Cultivar Q&A fixes) on 2026-11-28 06:18 UTC.
branch: claude/rls-selftest-kill-switch
base: verdant-grow-diary at a47ca7ed20d72023b5cb45d6d2a5eb86b7908604
pr: draft, number recorded on the pull request
state: built and tested locally; pushed as a draft PR.
decisions: (1) Kept the harness in supabase/functions and added a default-off switch instead of moving it out of the folder: removing the folder from the repo would not delete an already-deployed function, while the switch takes effect on the next deploy wherever it lands. (2) Not enabled answers 404 not_found, so a project that never opted in looks as if the harness is absent. (3) Header compared with timingSafeEqual from _shared/lib/lib/timingSafeCompareRules.ts; empty or missing values on either side never match. (4) verify_jwt stays false in supabase/config.toml: the harness's only documented caller (index.test.ts) sends the header, not a user JWT.
behavior_change: rls-selftest now returns 404 unless RLS_SELFTEST_ENABLED is exactly "true". Anyone who runs supabase/functions/rls-selftest/index.test.ts against a project must set that variable there first. That test file is a locked scorer, so this change leaves it untouched and records the requirement here and in the PR body. No schema, RLS, auth or other function changes.
files_touched: supabase/functions/_shared/rlsSelftestGate.ts (new); supabase/functions/rls-selftest/index.ts (gate call); src/test/rls-selftest-gate.test.ts (new); this handoff.
tests: src/test/rls-selftest-gate.test.ts, 20 cases. Local run under bun test (vitest import swapped to bun:test, supplemental): 20 pass. With rls-selftest/index.ts restored to the base: 18 pass, 2 fail (the two wiring cases). Also: verify-edge-shared-in-sync OK, check-no-src-lib-imports OK, check-contract-test-resolution OK, prettier OK.
blockers: local vitest, eslint and a clean tsc are BLOCKED: node_modules lacks pathe and node types, and bun install --frozen-lockfile gets 403. CI is the gate. Matthew OK'd pushing this branch on 2026-11-28 06:27 UTC ("Push both").
post_merge_check: whether rls-selftest is deployed on production is NOT CHECKED. After deploy, a POST to it on production should answer 404 unless RLS_SELFTEST_ENABLED is set there. Only Matthew can see production function secrets.
reviewer_seat: Edge function change, gated: Reviewer A or C per OWNERSHIP.md section 4.3, excluding this author session and Matthew.
reviewer_sha: none yet
session_state: no routines, no paused workflows. Pending human decisions: merge yes at an exact head.
claimed_by: Claude thread session for the security review task, 2026-11-28 06:30 UTC
owner: Claude thread session for the security review task
last_updated: 2026-11-28 06:58 UTC
```
