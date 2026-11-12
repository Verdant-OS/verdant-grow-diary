# WORKFLOWS-TYPECHECK-GATE

```text
TASK WORKFLOWS-TYPECHECK-GATE  priority: P3  status: OPEN
goal: Every workflow that typechecks the whole app does it through the `typecheck` package script, so there is one gate and one place to set its options.
why: Repository audit 2026-11-11 at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8. Two workflows ran `bunx tsc -p tsconfig.json --noEmit` themselves: demo-proof-walkthrough-readonly.yml (step "TypeScript check") and ecowitt-windows-tooling.yml (step "TypeScript app typecheck"). They bypass the package script, so the explicit heap ceiling #2938 adds to that script would not reach them, and any later change to the gate would silently skip them. Matthew asked for this fix directly ("fix the two workflows calling bare tsc next", 2026-11-12).
branch: claude/workflows-typecheck-gate
base: verdant-grow-diary at c03ea6fd46707dde04eac0d0ef3e7c46db8b6bc8
checkout: git fetch origin claude/workflows-typecheck-gate verdant-grow-diary && git switch claude/workflows-typecheck-gate
pr: https://github.com/Verdant-OS/verdant-grow-diary/pull/2947 (ready for review since 2026-11-12 06:53 UTC)
head_sha: read the current head from the PR. History: code at a96d3fcfb5eb7fa50c07bd204e02a54ad04945e6; docs-only commits since (PR link, runner-platform correction at 6e9dd7be510888616e9b15245bcf931f4f8defce, then the workflow-run correction).
state: implemented, ready for review; both changed workflows have run with the change and passed
current_step: review P2 (this handoff and the PR body said the workflows had not run) corrected in the commit after 6e9dd7be
next_action: fresh independent exact-head review at the new head; then the Merge Steward queues it with Matthew's yes at that SHA
post_merge_check: none on production (CI-only change). After merge, the next run of each of the two workflows on the deploy branch should show the step executing `bun run typecheck` and passing. On the PR branch this is already measured (see workflow_runs).
active_writer: Claude session_017UoYKvCNSMryxiQZyBbit8
lane_note: docs/agents/OWNERSHIP.md lists CI infrastructure (workflows) under Codex's default lane. This slice was assigned to Claude by Matthew's explicit instruction, which controls under AGENTS.md section 0.1. No other workflow was touched.
decisions: (1) Call `bun run typecheck` in both steps; do not set NODE_OPTIONS per workflow, so the script stays the single source. (2) Independent of #2938: on this base the script is still `tsc -p tsconfig.json --noEmit`, so behavior is identical today; the heap ceiling reaches these workflows when #2938 merges. (3) The four workflows that run a narrow, file-scoped `tsc` on Playwright harness files, and typecheck:irrigation-harnesses, are different compiles and are left alone.
behavior_change: none today. Same compiler, same tsconfig, same flags.
scorer_lock: two tracked scorers modified, unlock declared before each edit: .github/workflows/demo-proof-walkthrough-readonly.yml and .github/workflows/ecowitt-windows-tooling.yml. In each, one step's command changed from `bunx tsc -p tsconfig.json --noEmit` to `bun run typecheck`. No check was removed or weakened. The unlock is a local, git-ignored declaration that expires: `node scripts/scorer-lock.mjs --report --strict` on a clean checkout of this branch reports both files as LOCKED modified. The declaration of record is the scorer lock section of the PR body.
workflow_runs: PASS on the PR branch, both on ubuntu-latest. Demo Proof Walkthrough: run 43171299197 at ceeca58084420356487d6e9f7ad741316c0b5373 and run 43172097024 (job 131027579769) at 6e9dd7be510888616e9b15245bcf931f4f8defce, step "TypeScript check" success. EcoWitt Windows tooling: run 43171299292 at ceeca580 and run 43172097254 (job 131027580516) at 6e9dd7be, step "TypeScript app typecheck" success. Step conclusions were read for the two 6e9dd7be runs; for the ceeca580 runs only the run conclusion was read. An earlier version of this handoff and the PR body said neither workflow had run; that was wrong from the moment the PR left draft.
tests: src/test/workflows-typecheck-gate.test.ts (new) parses every workflow with js-yaml and asserts on resolved step `run` strings. RED before the change: 3 failed, 1 passed, naming exactly the two steps. After: 4 passed.
tried_and_rejected: adding NODE_OPTIONS to each workflow step (duplicates the setting #2938 centralizes).
commands: bunx vitest run src/test/workflows-typecheck-gate.test.ts src/test/ecowitt-windows-fast-path.test.ts --reporter=dot ; node scripts/scorer-lock.mjs --report --strict
files_touched: .github/workflows/demo-proof-walkthrough-readonly.yml; .github/workflows/ecowitt-windows-tooling.yml; src/test/workflows-typecheck-gate.test.ts (new); this file
files_remaining: none for this slice
blockers: none
open_questions: both workflows run on ubuntu-latest (ecowitt-windows-tooling.yml line 29, demo-proof-walkthrough-readonly.yml line 56); despite its name, the EcoWitt workflow does not use a Windows runner, so a hosted run does not exercise Windows. Both workflows have run with this change and passed (see workflow_runs). `bun run typecheck` on Windows is a separate, unmeasured question that this slice does not depend on. docs/bridge-trust-phase-a-freshness-checklist.md line 231 still shows the direct tsc command as a manual step; docs were not edited.
gotchas: `bun run typecheck` (tsc) needs NODE_OPTIONS=--max-old-space-size=8192 in the authoring container until #2938 lands.
links: #2938 (the heap ceiling on the typecheck script)
artifacts: the test file above
reviewer_seat: none current. At 6e9dd7be510888616e9b15245bcf931f4f8defce Seat A (review 5871135091) and Seat D (review 5871160798) raised one P2: the not-measured claim about the workflow runs. Those verdicts are historical once the head moves.
reviewer_sha: none current (last reviewed head 6e9dd7be510888616e9b15245bcf931f4f8defce, superseded)
session_state: no routines, no paused workflows; pending human decisions: review routing and the per-item merge yes
claimed_by: Claude session_017UoYKvCNSMryxiQZyBbit8, 2026-11-12 03:00 UTC
owner: Claude session_017UoYKvCNSMryxiQZyBbit8
last_updated: 2026-11-12 02:40 CT, by Claude session_017UoYKvCNSMryxiQZyBbit8
```
