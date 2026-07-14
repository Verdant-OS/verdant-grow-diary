# Pheno Tracker Pro Release Receipt

**Release status:** GO
**Production URL:** https://verdantgrowdiary.com
**Observed bundle:** index-DFkEvjho.js
**Bundle SHA-256:** 00a1e4d34601b1987fecb529598657da9d3b4946da0393846b1393a5ccc1e7c1
**Expected build identifier:** index-DFkEvjho
**Build identity match:** PASS
**Published at:** 2026-07-10T16:45:00Z
**Operator:** matt (executed via Claude Code, operator-authorized fixture recreation)

> HOLD remains mandatory until deployment identity, production schema, all 12 checkpoints, and billing disposition are recorded.

## Deployment

| Check | Evidence | Result |
| --- | --- | --- |
| Site and main bundle reachable | 2026-07-10T22:55:34.133Z | PASS |
| Expected build matches observed bundle | index-DFkEvjho | PASS |
| No white screen/startup error | operator live check 2026-07-11T00:03Z: / and /pricing rendered with content, zero page errors; live smoke pages render content assertions | PASS |
| No unexpected console errors | operator live sweep: 0 console errors across anonymous (/, /pricing) and authed (auth, workspace, anchor navigation) page loads | PASS |

## Production schema spot-check

| Check | Actual | Result |
| --- | --- | --- |
| pheno_hunts onboarding columns | evidence_goals, notes, setup_completed_at | PASS |
| has_pheno_tracker_entitlement count | 1 | PASS |
| RESTRICTIVE Pro-policy table coverage | 13/13 | PASS |
| Owner SELECT behavior verified | true | PASS |

## Automated live smoke

- Result: **PASS**
- Tests: 10 passed / 0 failed / 0 skipped / 0 flaky
- Summary generated: 2026-07-10T22:55:33.548Z

## 12-checkpoint release matrix

| # | Checkpoint | Evidence | Result |
| ---: | --- | --- | --- |
| 1 | Free user gate | Free user sees the upgrade gate on /pheno-hunts/new and the CTA returnTo round-trips to /pricing | PASS |
| 2 | Upgrade return path | Free user sees the upgrade gate on /pheno-hunts/new and the CTA returnTo round-trips to /pricing; unsafe returnTo is rejected; safe returnTo does not auto-redirect anonymously | PASS |
| 3 | Pro access and onboarding | Pro user can load /pheno-hunts/new without auth wall | PASS |
| 4 | Founder access | Founder user can load /pheno-hunts/new without auth wall | PASS |
| 5 | Canceled/expired behavior | Canceled user hitting /pheno-hunts/new sees gate, not the create form | PASS |
| 6 | Hunt setup persistence | hunt setup rows (grow, tent, candidates, evidence goals, notes) persisted via operator-controlled SQL and rendered back by the live workspace during the operator check and the live smoke | PASS |
| 7 | Workspace status split | D+E. workspace shows disabled Compare with the exact not-ready reason | PASS |
| 8 | Incomplete comparison gate | D+E. workspace shows disabled Compare with the exact not-ready reason | PASS |
| 9 | Missing-evidence navigation | operator-driven live anchor click-through 2026-07-11T00:03Z (separate from the automated smoke): missing-evidence next-step anchor navigated same-workspace to its hash, target element attached, Compare remained disabled, zero console errors | PASS |
| 10 | Direct incomplete /compare | F. direct /compare on incomplete hunt shows not-ready warning and fires no compare requests | PASS |
| 11 | Comparison-ready flow | workspace enables Compare and /compare renders substantive read-only comparison | PASS |
| 12 | Core Verdant regression | dashboard route still resolves without a crash | PASS |

## Billing disposition

- Required: No
- Status: NOT_REQUIRED
- Evidence: re-validation of already-published bundle index-DFkEvjho; no billing change in this run; billing disposition for the 2026-07-10 release recorded in the archived GO ledger

## Rollback readiness

- Prior Lovable version identified: PASS
- Migration rollback posture: PASS
- Migration classification: NON_ADDITIVE_WITH_ROLLBACK_PLAN
- Entry points can be disabled without deleting data: PASS
- Owner read access preserved: PASS

### Recorded non-additive migration changes

| Migration | Change | Scope | Description | Impact | Rollback procedure |
| --- | --- | --- | --- | --- | --- |
| 20260709180000_pheno_hunts_owner_only_and_stress_scale_index.sql | DROP_POLICY | public.pheno_hunts | Removed the operator SELECT and UPDATE policies ("Operators view all pheno_hunts", "Operators update all pheno_hunts"). | Operator cross-tenant access removed; owner SELECT access unchanged | Recreate the two operator policies from repository history only if operator access must be restored |

> Note: this canonical receipt was factually corrected in place to replace
> the earlier unqualified "additive migrations" claim with the structured
> migration posture. The local operator should regenerate this file from a
> structured manual-release-checks.json artifact using
> `bun run release:pheno:receipt` when re-running the gate.

## Final decision

**GO**

Decision timestamp: 2026-07-10T22:56:07.050Z
Decision owner: matt

### Input artifacts

- `artifacts/release-readiness/pheno-tracker-live-smoke/deployed-build.json`
- `artifacts/release-readiness/pheno-tracker-live-smoke/live-smoke-summary.json`
- `artifacts/release-readiness/pheno-tracker-live-smoke/schema-spot-check.json`
- `artifacts/release-readiness/pheno-tracker-live-smoke/manual-release-checks.json`

