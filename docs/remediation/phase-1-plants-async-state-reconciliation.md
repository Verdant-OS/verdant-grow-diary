# Phase 1 Plants async-state reconciliation

## Delivery identity

- Base: `origin/verdant-grow-diary` at `b902157a9231b9679201331ae603e4b678fd4830`
- Branch: `codex/verdant-trust-core-plants-async`
- Scope: Plants page asynchronous state ownership only
- Phase 1 constraints preserved: no migration, RLS, billing, device-control, automation, or entitlement-lane change

The approved Trust Core design requires data-backed pages to establish loading and error outcomes before rendering an empty state. The external T1–T21 charter and Claude companion map are still absent from the repository, so this slice records evidence against the approved Phase 1 async-state and stale-selection outcomes without inventing a T identifier.

## Findings reconciliation

| Finding                                                           | Before                                                                          | After                                                                                                                                    | Evidence                                                                             | Status     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------- |
| Primary Plants query collapsed pending and failure into `[]`      | “No plants yet” could render before absence was established                     | Archived-inclusive primary query now resolves through Loading, Error, Limited, or Usable before the presenter may render Empty           | `plants-page-async-state-rules.test.ts`, `plants-page-async-state-contract.test.tsx` | Fixed      |
| Primary retry could not be scoped                                 | Page exposed no retry and silently implied absence                              | Primary failure renders calm copy and retries only the archived-inclusive plant query                                                    | Contract test asserts all other refetch functions remain untouched                   | Fixed      |
| Placeholder data could cross grow scope                           | Prior-scope plants or tents could inform current-scope cards, chips, and badges | Placeholder data is never consumed as current data; current-scope loading hides prior cards                                              | Cross-scope primary and supplemental placeholder tests                               | Fixed      |
| Tent selection survived grow changes                              | An old tent id could filter the new grow to a false empty grid                  | Selection is reconciled against proven current-scope tent ids before render and reset after navigation                                   | Tent-selection grow-switch regression test                                           | Fixed      |
| Supplemental failures removed context without explanation         | Valid cards remained but tent/check details could disappear silently            | Confirmed cards remain; unavailable, loading, and cached-refresh-failed enrichments receive distinct honest labels and one-query retries | Limited-state presenter and pure-rule tests                                          | Fixed      |
| Create Plant could mount before requested grow validation settled | A grow-scoped URL could expose a mutation without a confirmed default target    | Requested grow loading/error/invalid states block creation; invalid scope never selects another grow silently                            | Scope loading/error/invalid presenter tests                                          | Fixed      |
| Dashboard false zero/empty during hydration                       | Core tent/plant query states are still discarded                                | Not touched to avoid overlap with the sensor-truth branch                                                                                | Async audit evidence                                                                 | Still open |
| Sensors first-tent false onboarding                               | Tent and reading states are still collapsed                                     | Not touched to avoid overlap with the sensor-truth branch                                                                                | Async audit evidence                                                                 | Still open |
| Tents, Daily Check, and Timeline error-as-empty behavior          | Failed queries can still imply confirmed absence                                | Reserved for later non-overlapping vertical slices                                                                                       | Async audit evidence                                                                 | Still open |
| Advanced navigation remains outside More -> Labs                  | Current desktop/mobile hierarchy still promotes Advanced                        | Reserved for the navigation hierarchy slice                                                                                              | Approved design section 9                                                            | Still open |

No finding was silently dropped or marked superseded in this slice.

## Validation evidence

- RED baseline: 1 file, 6 tests; 5 failed and 1 passed before production changes.
- Focused async contract: 2 files, 24 tests passed.
- Related Plants regression set: 12 files, 165 tests passed.
- Static safety: 8 files, 180 tests passed.
- Type-check: passed.
- Changed-file ESLint: passed with 0 errors and 0 warnings.
- New-file Prettier check: passed. The deploy version of `Plants.tsx` is not Prettier-clean; touched blocks were formatted while unrelated baseline formatting was preserved to avoid broad churn.
- Production build: passed; 4,244 modules transformed.
- Source client-secret boundary: passed.
- Sensor safety scan: passed.
- Lockfile policy: passed.
- Dependency security policy: passed.
- Full Vitest suite: not run for this slice; no full-suite claim is made.

`bun run test:security-static` remains red only because the scanner includes generated `dist/` bundles containing baseline safety vocabulary:

- `EcowittIngestAudit-*.js`: `service_role`
- `EcowittLocalForwardingStatusWidget-*.js`: `BRIDGE_TOKEN_ENV`
- `Timeline-*.js`: `service_role`

The source-only boundary passes, this slice changes none of those source surfaces, and no scanner suppression or allow-list change was added.

## Review and delivery gate

- Independent specification review: passed after placeholder, tent-selection, cached-refresh, and scope-gating findings were corrected.
- Independent code-quality review: passed after scope gating, accessible retry names, and formatting were corrected.
- Claude review: pending; required before merge.
- User review: pending; required before merge.

## Tooling side effect contained

The production build's Lovable MCP bundler rewrote `supabase/functions/mcp/index.ts` into a local absolute-path entry. The file was clean before validation, the generated change was restored from the branch base after each build, and it is absent from this diff.

## Rollback

This slice is isolated to one pure state module, the Plants presenter, tests, and this reconciliation record. Reverting the slice restores the prior rendering behavior without any data or schema rollback.
