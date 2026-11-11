# TYPECHECK-GATE-HEAP

```text
TASK TYPECHECK-GATE-HEAP  priority: P2  status: OPEN
goal: `bun run typecheck` and the pre-commit typecheck stop aborting with "JavaScript heap out of memory" and stop depending on the host's default Node heap.
why: Repository audit 2026-11-11 at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8, finding 6; Matthew asked for this slice in the audit session. Measured on that commit: `tsc -p tsconfig.json --noEmit --extendedDiagnostics` reports 8,310 files and Memory used 4,488,022K. In the authoring container (15 GB RAM, Node v22.23.4) the default heap limit is 2,096 MB and the bare command aborted after 46 s, exit 134. A 16 GB GitHub runner defaults to roughly 4 GB, so required CI passes today within a few hundred MB of the limit. The pre-commit hook runs the same compiler through lint-staged, so local commits of .ts files aborted too.
branch: claude/typecheck-heap-gate (local at the time of writing; confirm on the PR)
base: verdant-grow-diary at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8
checkout: git fetch origin claude/typecheck-heap-gate verdant-grow-diary && git switch claude/typecheck-heap-gate
pr: NOT_MEASURED until opened
head_sha: read from the PR; this file is written before the first push
state: implemented, local checks green
current_step: awaiting push and draft PR
next_action: push, open the draft PR, then route one independent exact-head review once required checks are green
post_merge_check: NOT_APPLICABLE to production (no shipped code changes). After merge, the required `Lint, typecheck, test, build` context on the next PR is the check: it must still run typecheck to exit 0. A failure reopens this work with the same owner.
active_writer: Claude session_017UoYKvCNSMryxiQZyBbit8
decisions: (1) Give the compiler an explicit 8192 MB old-space ceiling instead of switching the gate to tsgo: tsgo is the faster second opinion (17 s) but a different compiler, and changing which compiler gates merges is a larger decision than this slice. (2) Invoke `node --max-old-space-size=8192 node_modules/typescript/bin/tsc` rather than prefixing NODE_OPTIONS, so the script also works in Windows shells. (3) The ceiling is a limit, not an allocation; 8192 leaves room over the measured 4.5 GB peak. (4) Same change in the lint-staged step so the pre-commit hook matches the gate. (5) New contract test asserts on the resolved package.json (AGENTS.md section 10), not on source text.
scorer_lock: package.json is a tracked scorer (scripts/lib/scorerLockRules.mjs). Unlock declared 2026-11-11 with reason "typecheck gate fix: give tsc an explicit heap ceiling in scripts.typecheck and the lint-staged step (owner request 2026-11-11)". `node scripts/scorer-lock.mjs --report --strict` -> "UNLOCKED modified package.json; 1 changed scorer(s), 0 still locked". The change strengthens the check (it can now complete); no test, gate or allowlist was loosened.
tried_and_rejected: none.
not_changed: CLAUDE.md lines 124 and 300 and two skill files still describe the script as `tsc -p tsconfig.json --noEmit`. CLAUDE.md is one of the eighteen governance files and needs a Sentinel-Version bump across all eighteen, so its wording is left for a governance PR. `.github/workflows/demo-proof-walkthrough-readonly.yml:93` and `ecowitt-windows-tooling.yml:48` call `bunx tsc -p tsconfig.json --noEmit` directly and keep the host default heap; candidate follow-up.
commands: bun run typecheck ; bunx vitest run src/test/typecheck-gate-heap-contract.test.ts --reporter=dot ; node scripts/scorer-lock.mjs --report --strict
files_touched: package.json; src/test/typecheck-gate-heap-contract.test.ts (new); docs/agents/handoffs/TYPECHECK-GATE-HEAP.md (new)
files_remaining: none for this slice
blockers: none
open_questions: whether to move the two workflows above onto `bun run typecheck`.
gotchas: the scorer unlock lives in the git-ignored .claude/scorer-unlock.json and expires 24 hours after it was declared; run `node scripts/scorer-lock.mjs --lock` at the end of the task.
links: none besides the PR
artifacts: the test file above
reviewer_seat: none routed yet
reviewer_sha: none
session_state: no routines, no paused workflows; pending human decisions: push target, review routing and the per-item merge yes
claimed_by: Claude session_017UoYKvCNSMryxiQZyBbit8, 2026-11-11 21:20 UTC
owner: Claude session_017UoYKvCNSMryxiQZyBbit8
last_updated: 2026-11-11 15:20 CT, by Claude session_017UoYKvCNSMryxiQZyBbit8
```
