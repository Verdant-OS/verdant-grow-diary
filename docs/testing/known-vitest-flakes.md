# Known Vitest Flakes

## daily-check-method-context.test.tsx

| Field | Value |
|-------|-------|
| **Test file** | `src/test/daily-check-method-context.test.tsx` |
| **Observed failure** | Test timeout (default 5000 ms) during full parallel sweep. No single assertion name consistently fails; the timeout occurs under heavy parallel jsdom/environment setup load across the suite. |
| **Command that produced the timeout** | `bunx vitest run src/test/daily-check-method-context.test.tsx` (when run concurrently with 198 test files / 2675 tests in a single process) |
| **Isolated re-run command** | `bunx vitest run src/test/daily-check-method-context.test.tsx --reporter=dot` |
| **Observed result (isolated)** | 20 passed / 0 failed |
| **Likely cause** | Heavy parallel jsdom / environment setup load across a large Vitest process. The timeout does not reproduce when the file runs alone. |
| **Status** | Known pre-existing flake. Unrelated to diary fixture, AI Doctor fixture context, or readiness suite changes. |
| **Recommended handling** | Re-run the single file in isolation before treating any timeout in this file as a real regression. Do not skip the test or increase timeouts. |

## Policy

- Do not mark tests skipped without explicit approval.
- Do not increase global timeouts unless standardized in `vitest.config.ts`.
- Do not weaken assertions to silence flakes.
- When in doubt, isolate and re-run.
