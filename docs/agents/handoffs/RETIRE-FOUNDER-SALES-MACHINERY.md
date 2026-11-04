### RETIRE-FOUNDER-SALES-MACHINERY

```text
TASK RETIRE-FOUNDER-SALES-MACHINERY  priority: P2  status: CLOSED
goal: PR A of two. Remove the code that existed only to sell Founder Lifetime: the public founder-slots-remaining edge function, the useFounderSlotsRemaining hook, the dead founder_lifetime slot block in get-paddle-price, and the tests and config that only cover them. No migration; PR B carries the SQL.
why: #2028 (merged 0200d255) stopped selling Founder Lifetime. Matthew decided 2026-10-27 (session_01U9xQZcQhgrfTPEcjzgvjkb): existing holders keep access forever, the Founders Wall stays, a refund still revokes access, and a late pre-cutoff purchase event still grants.
branch: claude/retire-founder-sales-machinery
base: verdant-grow-diary
checkout: None; closed (merged). Historical: git fetch origin claude/retire-founder-sales-machinery verdant-grow-diary && git switch claude/retire-founder-sales-machinery && git merge origin/verdant-grow-diary
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2570 (merged)
head_sha: 824379f1e4f901daf53afc40c9a3db91f4313476 (final PR head; base merge over 795e3765 after #2567 merged). Base last merged into the head: 26113a1b68b928d6cc46d0662c011d424f15267b (second parent of 824379f1). Target-branch tip at merge: d590b2c105435cb2b22d1f265a4dea48948ccd3a (first parent of merge commit bbc77ae2; #2562 landed between)
state: CLOSED (merged). At final head 824379f1: 35/35 required checks green, mergeable clean, independent PASS review 5679386107 (P1 0 / P2 0 / P3 1), Codex no major issues at ab329b80 (same net diff; 795e3765 and 824379f1 are base merges only); Matthew queued it 2026-10-28 07:51 UTC
current_step: None; closed
next_action: None; closed. Outside this task: Matthew undeploys the live founder-slots-remaining function (production action); then PR B (migration) is drafted and held for Matthew's migration receipt; docs/audit follow-up retires docs/founder-slots-remaining-response.md, its schema and the endpoint URL in scripts/audit-subscriber-growth-live-parity.mjs (the review P3)
post_merge_check: Pending Matthew: delete the deployed founder-slots-remaining function; GET .../functions/v1/founder-slots-remaining then returns 404. Production delivery of bbc77ae2 is NOT_MEASURED until live /version.json reports it
active_writer: none; branch claude/retire-founder-sales-machinery retired after merge
decisions: keep allocate_lovable_founder_lifetime and revoke_lovable_founder_lifetime_by_transaction (late grants and refund revocation stay); keep the founders table, founders_wall_public, the immutables trigger and founder_number; SQL drops and cap/slot body edits go to PR B (migration, Matthew's receipt). Matthew approved the scorer-lock unlocks listed in the PR body (2026-10-27, extended 2026-10-28 to the deleted function's Deno tests, package.json, domain-reach and credit-pack-eligibility's anchor).
tried_and_rejected: one combined PR with the migration; rejected so the code slice is not held behind the migration receipt
commands: bunx vitest run <touched tests> --reporter=dot; bun run typecheck; node scripts/verify-edge-shared-in-sync.mjs
files_touched: see the PR diff (37 files: 36 code, config and test files plus this log; deletions dominate)
files_remaining: none
blockers: none
open_questions: none
gotchas: vi.mock of a deleted module path fails at import, so drop every useFounderSlotsRemaining mock with the hook; existing tests are scorer-locked, so edit only the unlocked list
links: https://github.com/Verdant-OS/verdant-grow-diary/pull/2028
artifacts: PR body
reviewer_seat: eligible independent session under OWNERSHIP.md section 4.3 (billing and Edge scope); all contributors excluded
reviewer_sha: 824379f1e4f901daf53afc40c9a3db91f4313476 (PASS, review 5679386107, 2026-10-28 07:50 UTC)
session_state: none
claimed_by: Claude, 2026-10-28 00:00 UTC (closed 2026-10-28 08:00 UTC)
owner: Claude
last_updated: 2026-10-28 08:00 UTC, by Claude
closure: #2570 merged as bbc77ae23164847772de6b53ecf18d7735932342 at 2026-10-28 07:58:27 UTC from final head 824379f1e4f901daf53afc40c9a3db91f4313476 via the merge queue (GitHub API: merged true, merged_by cheekhimself); worktree and local branch removed
```
