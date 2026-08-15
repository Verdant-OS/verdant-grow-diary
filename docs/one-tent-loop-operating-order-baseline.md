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

## Post-change validation (2026-08-15, this branch)

Measured after Slices 2–4 landed. Do not treat Slice 0 counts as the current smoke size.

| Check | Status | Evidence |
| --- | --- | --- |
| `bun run typecheck` | `PASS` | `tsc --noEmit` |
| Targeted vitest (13 files) | `PASS` | **168 / 168** |
| `bun run test:one-tent-loop-smoke` | `PASS` | 32 files, **512 / 512** (was 24 / 428 at Slice 0; added Grow→AI Doctor suites) |
| `bun run test:one-tent-loop-proof-never-healthy` | `PASS` | 3 files, **122 / 122** |
| `src/test/v0-operating-loop-contract.test.ts` | `PASS` | 1 file, **26 / 26** |
| Full suite | `NOT_MEASURED` | Not run |
| `bun run e2e:one-tent:preflight` | `BLOCKED` | exit 2, `missing_session_json`. Log: `/opt/cursor/artifacts/slice5_preflight.log` |
| `bun run e2e:one-tent:ui` | `BLOCKED` | Honest receipt, no walk. Playwright: 1 passed (blocked-receipt test), 1 skipped (authenticated walk). `fabricated_login_used: false`. Log: `/opt/cursor/artifacts/slice5_e2e_ui.log` |

Slice 5 did **not** fabricate a login, seed fixtures, or call a paid model. `E2E_BASE_URL=http://127.0.0.1:8080` was set so Playwright skipped spawning Vite; this VM's `bun run dev` fails with `ERR_REQUIRE_CYCLE_MODULE` from `@lovable.dev/vite-tanstack-config`. That is an environment limit, not a One-Tent Loop product seam. The blocked-receipt test does not navigate.

Known honest limits left untouched:

- Auto-diary on list-level Mark Complete remains unsupported; Action Detail already writes follow-up.
- `sensor_rows_delete_blocked_by_rls` — no teardown DELETE policy added.
- Env-check → alert persistence gap documented in `docs/specs/one-tent-loop-quicklog-single-write-path.md`; alerts not silently rewritten.
