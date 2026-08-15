# One-Tent Loop Operating Order — Slice 0 baseline

Measured 2026-08-15 on `verdant-grow-diary` tip `f2a03998f` before product
edits. Do not treat older audit-doc counts as current.

| Check | Status | Evidence |
| --- | --- | --- |
| `bun run test:one-tent-loop-smoke` | `PASS` | 24 files, **428 / 428** tests. Log: `/opt/cursor/artifacts/slice0_one_tent_loop_smoke.log` |
| Golden path + safety regression | `PASS` | `src/test/one-tent-loop-golden-path.test.ts` + `src/test/one-tent-loop-safety-regression.test.ts` — 2 files, **13 / 13**. Log: `/opt/cursor/artifacts/slice0_golden_path.log` |
| `bun run test:one-tent-loop-proof-never-healthy` | `PASS` | 3 files, **122 / 122**. Log: `/opt/cursor/artifacts/slice0_never_healthy.log` |
| `bun run e2e:one-tent:preflight` | `BLOCKED` | exit 2, `missing_session_json`. Receipt: `ONE_TENT_PREFLIGHT_JSON={"schema_version":"1","proof":"one-tent-loop-authenticated-ui","status":"blocked","reason":"missing_session_json"}`. Log: `/opt/cursor/artifacts/slice0_preflight.log` |

Owner gates still `BLOCKED` from this agent session:

1. Lovable-apply `20260813030000_signup_acquisition_forward_repair.sql` — not applied. Attributed signups still hard-fail. See `docs/signup-attribution-outage-operator-runbook.md`.
2. Managed e2e session (`E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` or `e2e/.auth/session-storage.json`) — not injected. Authenticated `e2e:one-tent:ui` must stay an honest `blocked` receipt.

Colliding open PRs parked (not merged or closed by this slice): #828, #817, #696.
