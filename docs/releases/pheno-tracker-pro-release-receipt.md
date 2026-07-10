# Pheno Tracker Pro Release Receipt

**Release status:** HOLD
**Production URL:** https://verdantgrowdiary.com
**Observed bundle:** PENDING
**Bundle SHA-256:** PENDING
**Expected build identifier:** PENDING
**Build identity match:** PENDING
**Published at:** PENDING
**Operator:** PENDING

> HOLD remains mandatory until deployment identity, production schema, all 12 checkpoints, and billing disposition are recorded.

## Deployment

| Check | Evidence | Result |
| --- | --- | --- |
| Site and main bundle reachable | 2026-07-10T17:43:01.831Z | PENDING |
| Expected build matches observed bundle | PENDING | PENDING |
| No white screen/startup error | manual browser check required | PENDING |
| No unexpected console errors | manual DevTools check required | PENDING |

## Production schema spot-check

| Check | Actual | Result |
| --- | --- | --- |
| pheno_hunts onboarding columns | PENDING | PENDING |
| has_pheno_tracker_entitlement count | PENDING | PENDING |
| RESTRICTIVE Pro-policy table coverage | PENDING/13 | PENDING |
| Owner SELECT behavior verified | PENDING | PENDING |

## Automated live smoke

- Result: **PASS**
- Tests: 9 passed / 0 failed / 0 skipped / 0 flaky
- Summary generated: 2026-07-10T17:43:01.831Z

## 12-checkpoint release matrix

| # | Checkpoint | Evidence | Result |
| ---: | --- | --- | --- |
| 1 | Free user gate | not recorded | PENDING |
| 2 | Upgrade return path | not recorded | PENDING |
| 3 | Pro access and onboarding | not recorded | PENDING |
| 4 | Founder access | not recorded | PENDING |
| 5 | Canceled/expired behavior | not recorded | PENDING |
| 6 | Hunt setup persistence | not recorded | PENDING |
| 7 | Workspace status split | not recorded | PENDING |
| 8 | Incomplete comparison gate | not recorded | PENDING |
| 9 | Missing-evidence navigation | not recorded | PENDING |
| 10 | Direct incomplete /compare | not recorded | PENDING |
| 11 | Comparison-ready flow | not recorded | PENDING |
| 12 | Core Verdant regression | not recorded | PENDING |

## Billing disposition

- Required: Yes / not waived
- Status: PENDING
- Evidence: PENDING

## Rollback readiness

- Prior Lovable version identified: PENDING
- Additive migrations confirmed backward-compatible: PENDING
- Entry points can be disabled without deleting data: PENDING
- Owner read access preserved: PENDING

## Final decision

**HOLD**

Decision timestamp: 2026-07-10T18:05:42.993Z
Decision owner: PENDING

### Input artifacts

- `artifacts/release-readiness/pheno-tracker-live-smoke/deployed-build.json`
- `artifacts/release-readiness/pheno-tracker-live-smoke/live-smoke-summary.json`
- `artifacts/release-readiness/pheno-tracker-live-smoke/schema-spot-check.json`
- `artifacts/release-readiness/pheno-tracker-live-smoke/manual-release-checks.json`

