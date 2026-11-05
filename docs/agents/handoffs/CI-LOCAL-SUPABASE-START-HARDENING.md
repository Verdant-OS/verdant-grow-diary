# CI-LOCAL-SUPABASE-START-HARDENING

```text
TASK CI-LOCAL-SUPABASE-START-HARDENING  priority: P2  status: CLOSED
goal: Stop test:security-db-local failing for infrastructure reasons: fewer image pulls under registry rate limits, less runner memory pressure, and container evidence when the local gateway returns 502.
why: On 2026-11-04 the mustBeGreen check failed on four PRs whose diffs could not cause it (#2830, #2836, #2827 with gateway 502s mid-suite; #2840's sibling lane failed to start), each with Docker registry "Rate exceeded" during supabase start. Matthew approved the fix in chat ("go").
branch: claude/ci-local-supabase-start-hardening
base: verdant-grow-diary
checkout: none needed; the work is merged. To inspect it: git fetch origin verdant-grow-diary && git show 6ad6d67cf2f5a06525305f0e23b0f19a61033f02
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2861
head_sha: 7c1f88b07e9fcb1139057669864e3ca133161cff (final reviewed head)
state: merged as 6ad6d67cf2f5a06525305f0e23b0f19a61033f02
current_step: closed
next_action: none; files_remaining is follow-up work for a new task
post_merge_check: test:security-db-local stops failing with gateway 502s on PRs that cannot cause them; if one recurs, read artifacts/security-db/containers/ from that run's failure artifact.
active_writer: none (closed)
decisions: Root cause of the 502s is NOT_MEASURED: the failing jobs kept no container logs. supabase start always completed (the CLI retries rate-limited pulls); the 502s came 40-100 s later in three different harnesses. So the change (1) excludes services no harness uses (studio, analytics, vector, imgproxy; names checked against CLI 2.109.1 --help, where logflare's container is "analytics"), reducing pulls and memory, and (2) on failure saves docker ps and logs for kong/rest/auth/db/storage/edge_runtime into the existing failure artifact. No harness, assertion, migration or retry changed.
tried_and_rejected: a readiness wait after start (failures happen well after start, so it would not have caught them); retrying assertions on 502 (would hide real failures).
commands: bunx vitest run $(grep -rl security-db-local src/test); node scripts/scorer-lock.mjs --report --strict
files_touched: .github/workflows/security-db-local.yml; src/test/local-supabase-replay-compatibility.test.ts; docs/agents/handoffs/CI-LOCAL-SUPABASE-START-HARDENING.md
files_remaining: sibling local-Supabase workflows (native-manual-correction-local and others) after this lane proves out
blockers: none
open_questions: none
gotchas: both changed files are scorer-locked (scorer-lock --strict exit 2, LOCKED modified); the lifecycle pin in local-supabase-replay-compatibility.test.ts is renegotiated for the start line only.
links: failing jobs 126371475675, 126419530756, 126419561169, 126371598621
artifacts: none
reviewer_seat: independent reviewer session_017UoYKyDyFmmRqwAGfNHt1d (Reviewer A route), Reviewer C session_017UoYKywiErQ3bEQMo9dYGe, Reviewer D session_017UoYKxYCqNto57mzWkeWz5
reviewer_sha: 7c1f88b07e9fcb1139057669864e3ca133161cff
session_state: none; founder yes "yes to … 7c1f88b0 for #2861" given in the merge-steward session session_017UoYKyhNGum4qmfYdoNRLr
claimed_by: Claude session_017UoYKwwZkbqmWvtCRMw1DZ, 2026-11-04
owner: Claude
last_updated: 2026-11-04 17:50 CT, by Claude (closed after merge)
```
