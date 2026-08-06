# Release-readiness checklist — 2026-07-30 stabilization slice

Status legend: ✅ verified this sprint · ⚠️ verified with caveat · ⛔ blocked ·
▫️ not re-verified this sprint (no regression suspected). Evidence for every
row: [verdant-stabilization-audit.md](./verdant-stabilization-audit.md) and
the linked issues.

| Gate                                                            | Status | Evidence / caveat                                                                                                                 |
| --------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Install from lockfile                                           | ✅     | `bun install --frozen-lockfile`, 822 packages                                                                                     |
| Typecheck                                                       | ✅     | `tsc -p tsconfig.app.json --noEmit` clean (note: strict mode off — #590)                                                          |
| Lint                                                            | ✅     | `eslint .` clean                                                                                                                  |
| Targeted tests (all touched behavior)                           | ✅     | auth-provider failure suite; environment-check audit suite; rls/schema audit fixtures; V0 contract 26/26                          |
| Full test suite                                                 | ⚠️     | See final validation report; 5 pre-existing Node-26-local storage-rejection failures (#578) are environment-only and pass in CI   |
| Production build + validators                                   | ✅     | `bun run build` incl. JSON-LD/OG/canonical/head-fidelity/image-budget postbuild validators                                        |
| Static safety (secret scan)                                     | ✅     | `test:security-static` green **including dist/** after #580 fix; was red at baseline                                              |
| Static safety (vitest suites)                                   | ✅     | `test:static-safety` 182/182                                                                                                      |
| Security-regression gate wired to real branch                   | ✅     | #581 partial — security-regression.yml now targets the default branch; all 8 steps proven locally                                 |
| Routing: all internal links resolve                             | ✅     | 293 targets vs 134 routes, zero dead links; zero redirect loops                                                                   |
| Routing: deep links / guards                                    | ✅     | Allowlisted signed-out redirect chain verified end-to-end                                                                         |
| Auth: no private-data flash; errors surfaced                    | ✅     | Synchronous identity fence + sanitized errors (audit §3.2)                                                                        |
| Auth: boot failure recovery                                     | ✅     | #582 fixed + regression tests                                                                                                     |
| Demo: labeled, write-disabled, deterministic                    | ✅     | Zero write calls from demo paths; method-level e2e guard on walkthrough; labeling scanners green                                  |
| Data provenance: demo/manual/csv never "live" on truth surfaces | ⚠️     | Grower dashboard/trust surfaces verified; testbench connection badge vocabulary conflict open (#584)                              |
| Invalid/stale telemetry never healthy                           | ✅     | Alert persistence + threshold gates verified; VPD never fabricated; no zero-for-missing                                           |
| AI Doctor: cautious, honest about missing context               | ✅     | Confidence caps verified; scanner runs on real golden-case output                                                                 |
| AI Doctor: no device commands, no auto-approve                  | ✅     | Strip + reject denylists; forced pending_approval rewrite                                                                         |
| Action Queue: approval-required, no execution path              | ✅     | All creation paths default pending_approval; atomic transition RPC; simulate is no-op                                             |
| Action Queue: idempotency durable                               | ⛔     | Client-side only; durable fix needs migration (#586)                                                                              |
| No service-role / secrets in frontend or bundle                 | ✅     | JWT-decoded anon key; scan green incl. dist                                                                                       |
| Mobile / a11y                                                   | ▫️     | Not re-verified this sprint (no browser lane); existing a11y suites green in full run; treat as open verification, not regression |
| Documentation                                                   | ✅     | This checklist + audit + board snapshot; stale doc contradictions registered (#593)                                               |
| Rollback                                                        | ✅     | Slice is 4 independent, individually-revertable commits; no schema/RLS/Edge changes; see PR risk notes                            |

## Publish gate summary

- **Merge**: the slice is safe to merge once CI (11 required checks) is green
  on the PR.
- **Publish**: no P0 known; remaining open P1s are #561 (external owner
  action; does not affect the shipped app's behavior), #584 (operator/grower
  diagnostics labeling coherence), #585 (paid feature undiscoverable — revenue
  bug, not a safety bug). Publishing the app itself is not blocked by this
  slice's scope, but #561 should be resolved before any workflow that trusts
  MCP/preview data against "production".
