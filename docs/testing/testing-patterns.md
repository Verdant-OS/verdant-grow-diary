# Testing patterns (Verdant-adapted)

A quick reference for writing tests in this repository. It adapts a generic
JavaScript/TypeScript testing-patterns sheet (Jest, React Testing Library, Supertest,
Playwright) to the tools and rules this repo actually uses. The general principles
carry over unchanged; the syntax, file locations and boundaries below are
Verdant-specific.

This page is a reference, not a new rule. Where it touches a rule, the source is
cited: `AGENTS.md` (§Testing Standard, §Architecture Rules), `CLAUDE.md`
(§Testing conventions), and `docs/agents/single-builder-workflow.md` (§4 Validation
ladder) stay authoritative.

## Contents

- [Runner and layout](#runner-and-layout)
- [Arrange-Act-Assert](#arrange-act-assert)
- [Naming](#naming)
- [Assertions](#assertions)
- [Mocking: boundaries only](#mocking-boundaries-only)
- [Time and randomness](#time-and-randomness)
- [Component tests](#component-tests)
- [Contract tests assert resolved values](#contract-tests-assert-resolved-values)
- [Server, RLS and RPC paths](#server-rls-and-rpc-paths)
- [Browser tests (Playwright)](#browser-tests-playwright)
- [Prove it red first](#prove-it-red-first)
- [Anti-patterns](#anti-patterns)
- [Generic sheet → Verdant mapping](#generic-sheet--verdant-mapping)

## Runner and layout

- The runner is **Vitest** (`vitest.config.ts`): `environment: "jsdom"`,
  `globals: true`, one setup file `src/test/setup.ts`. Use `vi.fn` / `vi.mock` /
  `vi.spyOn`, not `jest.*`.
- Tests are **centralised** in `src/test/`, named kebab-case by feature
  (`action-detail-linked-alert.test.tsx`). Co-locate only when the file you are
  editing already has a neighbour test.
- Run one file: `bunx vitest run src/test/<file> --reporter=dot`. The full suite runs
  in CI as 32 shards (`docs/testing/ci-full-suite-shards.md`); do not claim a local
  full-suite pass you did not run.

## Arrange-Act-Assert

Test pure `*Rules.ts` / `*ViewModel.ts` modules directly, with inputs built in the
test. Keep the three phases visible.

```ts
import { describe, expect, it } from "vitest";
import { classifyReading } from "@/lib/exampleReadingRules";

describe("classifyReading", () => {
  it("labels a reading older than the freshness window as stale", () => {
    // Arrange
    const now = new Date("2026-10-01T12:00:00Z");
    const reading = { source: "live", capturedAt: "2026-10-01T09:00:00Z", value: 24.1 };

    // Act
    const result = classifyReading(reading, { now, freshnessMinutes: 30 });

    // Assert
    expect(result.label).toBe("stale");
    expect(result.healthy).toBe(false);
  });
});
```

(`exampleReadingRules` is illustrative; the shape is the point.)

## Naming

`describe` names the unit; `it` states the behaviour and the condition.

```ts
describe("quickLogSaveErrorMessage", () => {
  it("returns the sign-in copy when the RPC rejects for a missing session", () => {});
  it("never presents an unverified reused receipt as saved", () => {});
});
```

## Assertions

- Prefer exact values: `toBe`, `toEqual`, `toStrictEqual`, `toHaveLength`,
  `toHaveBeenCalledWith`.
- **User-facing copy is data.** It lives in `src/constants/*Copy.ts` /
  `*Messages.ts` or `as const` exports. Assert against the exported constant, not a
  re-typed string, so a copy change fails in one deliberate place.
- Safety outcomes get explicit assertions, never truthiness. For example, assert
  `healthy === false` for stale, invalid or unknown telemetry; do not merely
  assert that a label exists (`AGENTS.md` §Sensor Truth Rules).
- Always `await` async assertions (`await expect(p).rejects.toThrow(...)`).
- Do not snapshot whole trees. Many tests here pin exact expressions and occurrence
  counts; renegotiate those pins in the same commit as the behaviour change, and
  never whole-file-format a legacy file (re-wrapped lines break pins far from the
  diff).

## Mocking: boundaries only

| Mock these                                           | Do not mock these          |
| ---------------------------------------------------- | -------------------------- |
| `@/integrations/supabase/client` (RPC, `from`, auth) | `*Rules.ts` business logic |
| `fetch` / edge-function invocation                   | `*ViewModel.ts` shaping    |
| Browser storage, when the module under test owns it  | Validation (`zod` schemas) |
| The clock, only where it cannot be injected          | Constants and copy tables  |

```ts
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));
```

Mock what the code under test imports, at the module path it imports. A mock of
an internal helper usually means the logic belongs in a pure module that can be
tested without one.

## Time and randomness

New logic injects `now: Date` (and any seed) as a parameter
(`AGENTS.md` §Architecture Rules). That makes `vi.useFakeTimers()` unnecessary for
rules modules. Reserve fake timers for components and hooks that genuinely
schedule work.

Some existing `*Rules.ts` modules still call `Date.now()` or `Math.random()`
directly. `CLAUDE.md` §Layering lists them as measured drift. Do not cite them as
precedent, and do not paper over them with global time mocks in a new test.

## Component tests

- Use React Testing Library; find elements by **role and accessible name**
  (`getByRole("button", { name: /save/i })`), then label, then text. Test IDs are a
  last resort.
- Components import routing from the **compat shim** `@/lib/react-router-compat`,
  never `@tanstack/react-router` directly. Vitest aliases the shim to a real
  MemoryRouter (`src/test/helpers/reactRouterCompat.vitest.tsx`), so navigation
  works in tests. Writing TanStack Router hooks in a component is the most common
  way to produce code that renders and then fails in tests.
- Keep components presenter-only. If a test needs complex setup to reach a branch,
  the branch probably belongs in a `*Rules.ts` or `*ViewModel.ts`.

## Contract tests assert resolved values

A test that guards a config or module must **import it and assert on the loaded
value**, not regex its source text. A regex cannot tell a live setting from a
commented-out one (`AGENTS.md` §Contract tests…).

```ts
it("retries 0 times locally when CI is unset", async () => {
  vi.resetModules();
  const { default: cfg } = await import("../../playwright.config");
  expect(cfg.retries).toBe(0);
});
```

The reference implementation is `src/test/playwright-config-retry-policy.test.ts`;
`scripts/check-contract-test-resolution.mjs` enforces the rule. A test that truly
cannot resolve declares `@source-scan-justified: <the blocker you hit>`.

Source scanning is still correct for proving something is **absent**: secrets,
forbidden calls, device-control phrasing. See `docs/testing/static-guards.md` and
`docs/testing/scanner-guardrails.md`.

## Server, RLS and RPC paths

There is no application HTTP server to hit with Supertest. Server behaviour lives in
Supabase RPCs, RLS policies and Deno edge functions.

- Unit-test edge-function logic through the pure modules mirrored into
  `supabase/functions/_shared`. Edge functions never import from `src/lib`.
- Static scans are useful but not enough for money and security paths. Use the
  runtime harnesses (`scripts/run-billing-rls-harness.ts`,
  `scripts/run-ai-credits-rls-harness.ts`) and prove that client roles cannot
  mutate protected tables (`AGENTS.md` §Testing Standard).
- Manual live checks that need two real users follow
  `docs/testing/typed-event-rls-checklist.md`. Never use the service-role key for
  them.

## Browser tests (Playwright)

- Projects (`playwright.config.ts`): `setup`, `chromium-authed`, `chromium-mocked`,
  `webkit-mocked`.
- `chromium-mocked` installs **no** global route mocks. Each spec mocks
  `/auth/v1/**` and `/rest/v1/**` itself. **Always pass a spec filter**; an
  unfiltered run can reach the real hosted Supabase.

  ```bash
  E2E_BASE_URL=http://127.0.0.1:8080 bunx playwright test --project=chromium-mocked e2e/<spec>
  ```

- Do not type real credentials into a spec. Authenticated flows use the seeded
  session from `setup` / `chromium-authed`, with owner-held credentials supplied
  through environment variables in a session the owner controls. Without them,
  those specs report `blocked`; that is expected, not a setup failure.
- The Quick Log smoke and golden-path specs run against a deployed app. They are
  post-deploy signals, never same-commit gates.

## Prove it red first

Every new test must be seen failing before its fix. Show it red against the
unfixed code, then green with the fix, and put the failing count in the PR body
(`CLAUDE.md` §Testing conventions). A test never seen failing is not evidence.

If an automated review reverts files in place to prove a test red, run
`git status` before any commit and confirm the tree holds only the intended
changes (`AGENTS.md` §Never commit while an automated review is mutating the
working tree).

## Anti-patterns

| Anti-pattern                                                 | Why it hurts                              | Instead                                                       |
| ------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------- |
| Testing implementation details                               | Breaks on refactor                        | Test inputs and outputs of the pure module                    |
| Snapshotting whole trees                                     | Nobody reviews snapshot diffs             | Assert specific values and exported copy                      |
| Shared mutable state between tests                           | Order-dependent failures                  | Set up and tear down per test; reset mocks                    |
| Regex over a config file to "verify" a setting               | Passes when the setting is commented out  | Import the config and assert the resolved value               |
| Skipping, disabling or deleting a test to get green          | Hides the defect                          | Fix the test or the code; argue removal in review if obsolete |
| Raising a timeout to silence a slow test                     | Masks contention or a real hang           | See `docs/testing/known-vitest-flakes.md`; isolate first      |
| Global `Date` mocks for a rules module                       | Hides a missing `now` parameter           | Inject `now: Date`                                            |
| Treating demo or unknown sensor data as healthy in a fixture | Normalises the exact bug the rules forbid | Label fixtures with their true source                         |
| Unfiltered `chromium-mocked` runs                            | Can hit real Supabase                     | Always pass a spec path                                       |
| A test never seen failing                                    | Not evidence                              | Prove red first; record the count                             |

## Generic sheet → Verdant mapping

| Generic sheet                    | Here                                                                 |
| -------------------------------- | -------------------------------------------------------------------- |
| Jest (`jest.fn`, `jest.mock`)    | Vitest (`vi.fn`, `vi.mock`)                                          |
| Tests beside source              | Centralised in `src/test/`, kebab-case                               |
| Mock time when needed            | Inject `now: Date`; fake timers only for scheduling UI               |
| Supertest against an app         | Not applicable; RLS/RPC harnesses and `_shared` pure modules         |
| Playwright login with a password | `chromium-mocked` with route mocks, or the owner-held seeded session |
| "Fix or delete the test"         | Fix it; deletion to get green is no better than skipping             |
| Assert strings inline            | Assert against exported copy constants                               |
| (not covered)                    | Contract tests resolve values; prove red first; compat-shim routing  |
