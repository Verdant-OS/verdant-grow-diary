### HONO-NODE-SERVER-GHSA-RMXM

```text
TASK HONO-NODE-SERVER-GHSA-RMXM  priority: P2  status: CLOSED
goal: Clear GHSA-rmxm-3fg6-px4f (moderate, @hono/node-server >=1.19.10 <2.1.3), which blocks check:deps on every PR and on the deploy tip bbc77ae23. Raise the exact override and BUN_LOCK_SECURITY_FLOORS from 2.0.10 to 2.1.3 and regenerate bun.lock with CI's bun 1.3.14.
why: a dependency audit red across PRs is top-priority work (CURRENT_STATE Start here). Matthew approved the scorer unlock, a separate PR and porting into #2602/#2603 (Claude session_017UoYKzCisV3nBJG6Dhco3K, 2026-10-29).
branch: claude/hono-node-server-2-1-3
base: verdant-grow-diary
checkout: None; closed (merged). Historical branch: claude/hono-node-server-2-1-3
pr: draft PR from claude/hono-node-server-2-1-3 (link in the PR list)
head_sha: 7c09de3413c556389da7677341d340da6c660b4a (final PR head)
state: CLOSED (merged). #2605 merged by cheekhimself at 2026-10-29 17:24:03 UTC from final head 7c09de34 as dcf39fdb605de7ea89884e5a884978857f99b18a
current_step: none; closed
next_action: None; closed. post_merge_check PASS: Dependency & Security CI run 40920963434 succeeded on deploy tip dcf39fdb (the two prior tips 479cadb3 and 9b60f907 failed it on this advisory)
post_merge_check: Dependency & Security CI check:deps passes on the deploy branch tip after merge
active_writer: Claude (session_017UoYKzCisV3nBJG6Dhco3K)
decisions: 2.1.3 is the first fixed release in major 2 (advisory range <2.1.3); follow the ip-address 10.7.4 precedent (6f937d3): override + floor + bun.lock only
tried_and_rejected: a dependency-security exception; the advisory has a fixed release, so a bump is the right fix
commands: node scripts/check-dependency-security.mjs; node scripts/check-bun-lockfile-policy.mjs; bunx vitest run src/test/check-bun-lockfile-policy.test.ts src/test/check-dependency-security.test.ts src/test/dependency-security-phase-a-contract.test.ts src/test/modelcontextprotocol-sdk-advisory-security-floor.test.ts src/test/hono-node-server-advisory-security-floor.test.ts --reporter=dot
files_touched: package.json, bun.lock, scripts/check-bun-lockfile-policy.mjs, src/test/hono-node-server-advisory-security-floor.test.ts (new, 87999663c), src/test/check-bun-lockfile-policy.test.ts and src/test/dependency-security-phase-a-contract.test.ts (02f83c7e1, Cursor Agent), docs/agents/HANDOFF_LOG.md
files_remaining: none
blockers: none
open_questions: none
gotchas: regenerate bun.lock with bun 1.3.14 (CI pin), not a newer local bun; package.json and check-bun-lockfile-policy.mjs are scorer-locked
links: https://github.com/advisories/GHSA-rmxm-3fg6-px4f
artifacts: PR body
reviewer_seat: eligible independent session under OWNERSHIP.md section 4.3 (dependency/lockfile scope); this Claude session excluded
reviewer_sha: 7c09de3413c556389da7677341d340da6c660b4a, PASS by session_017UoYKuwk7Z3wSC7syg3jnF (earlier verdicts at 4d9defc1c and 02f83c7e1 superseded)
closure: merged as dcf39fdb605de7ea89884e5a884978857f99b18a; ports in #2602 and #2603 are no-ops after their base merges
session_state: none
claimed_by: Claude, 2026-10-29 00:24 UTC
owner: Claude
last_updated: 2026-10-29 17:50 UTC, by Claude (closed in the #2602 base merge)
```
