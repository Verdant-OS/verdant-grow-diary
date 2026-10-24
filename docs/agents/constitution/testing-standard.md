# Testing standard

Normative detail for `AGENTS.md` §10.

Every logic change includes targeted tests for the happy path, edge boundaries, null and invalid inputs, deterministic repeatability, the specific regression, and safety fences where relevant.

For security, billing, and RLS, static scans are not enough. Add a runtime harness when possible and prove client roles cannot mutate protected tables.

## Contract tests assert resolved values

A contract test over a config or module imports it and asserts on the resolved value. A regex over the file's source cannot tell a live setting from one that is commented out, narrowed, or duplicated.

Illustrative case: a fence that matched `actionTimeout` in `playwright.config.ts` stayed green after the setting was commented out. `scripts/check-contract-test-resolution.mjs` enforces the rule for tests that guard `playwright.config.ts` and `vitest.config.ts`. `src/test/playwright-config-retry-policy.test.ts` is the reference: import the config and assert on the object.

Where resolving is impossible, the test declares `@source-scan-justified: <reason>`. An empty reason is rejected. State the blocker you hit. The current exception is `vitest-config-react-plugin-contract`: importing `vitest.config` under jsdom trips an encoder invariant, and a node environment breaks the shared setup file's `window.scrollTo`.

Source scans remain right for proving a string or forbidden construct is absent (secret scans, generated-artifact shape). The rule is about effective configuration, not about banning file reads.

## Do not commit over a mutating review

A self-review that reverts production files, runs the test, and restores them must not be committed mid-window. Before any commit that follows that kind of review, `git status` must show only the intended changes. A commit during the experiment ships the revert.

Report targeted tests, full suite, type-check, runtime harness, skipped, introduced failures, and pre-existing failures. Do not claim full validation that was not run.

## Commands

Use the repo's package manager and scripts. Verify the script exists on the branch you are on. Illustrative commands that have existed on the deploy branch:

```bash
bun run typecheck
bun run typecheck:tsgo
bunx vitest run --reporter=dot
bun run scripts/run-billing-rls-harness.ts
bun run scripts/run-ai-credits-rls-harness.ts
```

If a command is unavailable, say so and use the closest existing command. A differently named typecheck script on another branch is not evidence this branch has it.

## Implementation response

Summary, requirements and assumptions, audit findings, file-level plan, implementation notes, tests added, validation commands, validation results, safety verdict, deferred items, risk and rollback notes.

Audit-only work does not add code unless the task asks. Tests-only work does not change app, schema, or policy code unless the task permits it.
