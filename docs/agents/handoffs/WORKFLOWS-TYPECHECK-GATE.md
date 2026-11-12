# WORKFLOWS-TYPECHECK-GATE

```text
TASK WORKFLOWS-TYPECHECK-GATE  priority: P3  status: OPEN
goal: Every workflow that typechecks the whole app does it through the `typecheck` package script, so there is one gate and one place to set its options.
why: Repository audit 2026-11-11 at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8. Two workflows ran `bunx tsc -p tsconfig.json --noEmit` themselves: demo-proof-walkthrough-readonly.yml (step "TypeScript check") and ecowitt-windows-tooling.yml (step "TypeScript app typecheck"). They bypass the package script, so the explicit heap ceiling #2938 adds to that script would not reach them, and any later change to the gate would silently skip them. Matthew asked for this fix directly ("fix the two workflows calling bare tsc next", 2026-11-12).
branch: claude/workflows-typecheck-gate
base: verdant-grow-diary at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8
checkout: git fetch origin claude/workflows-typecheck-gate verdant-grow-diary && git switch claude/workflows-typecheck-gate
pr: not opened yet when this block was written; read it from the branch
head_sha: read the current head from the PR
state: implemented, local checks green
current_step: committed locally; push target awaiting the owner's choice
next_action: push and open a draft PR once the owner confirms the branch; then mark ready on request and route one independent exact-head review
post_merge_check: none on production (CI-only change). After merge, the next run of each of the two workflows should show the step executing `bun run typecheck` and passing. NOT_MEASURED until those workflows run.
active_writer: Claude session_017UoYKvCNSMryxiQZyBbit8
lane_note: docs/agents/OWNERSHIP.md lists CI infrastructure (workflows) under Codex's default lane. This slice was assigned to Claude by Matthew's explicit instruction, which controls under AGENTS.md section 0.1. No other workflow was touched.
decisions: (1) Call `bun run typecheck` in both steps; do not set NODE_OPTIONS per workflow, so the script stays the single source. (2) Independent of #2938: on this base the script is still `tsc -p tsconfig.json --noEmit`, so behavior is identical today; the heap ceiling reaches these workflows when #2938 merges. (3) The four workflows that run a narrow, file-scoped `tsc` on Playwright harness files, and typecheck:irrigation-harnesses, are different compiles and are left alone.
behavior_change: none today. Same compiler, same tsconfig, same flags.
scorer_lock: two tracked scorers modified, unlock declared before each edit: .github/workflows/demo-proof-walkthrough-readonly.yml and .github/workflows/ecowitt-windows-tooling.yml. In each, one step's command changed from `bunx tsc -p tsconfig.json --noEmit` to `bun run typecheck`. No check was removed or weakened.
tests: src/test/workflows-typecheck-gate.test.ts (new) parses every workflow with js-yaml and asserts on resolved step `run` strings. RED before the change: 3 failed, 1 passed, naming exactly the two steps. After: 4 passed.
tried_and_rejected: adding NODE_OPTIONS to each workflow step (duplicates the setting #2938 centralizes).
commands: bunx vitest run src/test/workflows-typecheck-gate.test.ts src/test/ecowitt-windows-fast-path.test.ts --reporter=dot ; node scripts/scorer-lock.mjs --report --strict
files_touched: .github/workflows/demo-proof-walkthrough-readonly.yml; .github/workflows/ecowitt-windows-tooling.yml; src/test/workflows-typecheck-gate.test.ts (new); this file
files_remaining: none for this slice
blockers: none
open_questions: ecowitt-windows-tooling.yml runs on a Windows runner; `bun run typecheck` there was not exercised locally (NOT_MEASURED). docs/bridge-trust-phase-a-freshness-checklist.md line 231 still shows the direct tsc command as a manual step; docs were not edited.
gotchas: `bun run typecheck` (tsc) needs NODE_OPTIONS=--max-old-space-size=8192 in the authoring container until #2938 lands.
links: #2938 (the heap ceiling on the typecheck script)
artifacts: the test file above
reviewer_seat: none routed yet
reviewer_sha: none
session_state: no routines, no paused workflows; pending human decisions: push target, mark ready, review routing and the per-item merge yes
claimed_by: Claude session_017UoYKvCNSMryxiQZyBbit8, 2026-11-12 03:00 UTC
owner: Claude session_017UoYKvCNSMryxiQZyBbit8
last_updated: 2026-11-11 21:00 CT, by Claude session_017UoYKvCNSMryxiQZyBbit8
```
