# Pheno Tracker Pro Release Receipt

**Release status:** HOLD  
**Production URL:** https://verdantgrowdiary.com  
**Release/build identifier:** _record after Publish_  
**Published at:** _record after Publish_  
**Operator:** _record operator_  

> Do not change **HOLD** to **GO** until deployment confirmation, the schema
> spot-check, and all required smoke checkpoints below are recorded as PASS.

## 1. Deployment confirmation

| Check | Evidence | Result |
| --- | --- | --- |
| Production URL loads successfully | Timestamp / screenshot / run URL | ☐ PASS ☐ FAIL |
| Expected release/build identifier is visible | Build hash or Lovable release identifier | ☐ PASS ☐ FAIL |
| No white screen or startup error | Browser observation | ☐ PASS ☐ FAIL |
| No unexpected console errors | DevTools console | ☐ PASS ☐ FAIL |

## 2. Production schema spot-check

Run in the production Supabase SQL editor:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'pheno_hunts'
  and column_name in ('evidence_goals', 'notes', 'setup_completed_at')
order by column_name;

select proname
from pg_proc
where proname = 'has_pheno_tracker_entitlement';

select tablename, policyname, permissive, cmd
from pg_policies
where schemaname = 'public'
  and tablename like 'pheno_%'
  and policyname ilike '%pro%'
order by tablename, policyname;
```

| Schema check | Expected | Actual/evidence | Result |
| --- | --- | --- | --- |
| `pheno_hunts` onboarding columns | `evidence_goals`, `notes`, `setup_completed_at` | _record rows_ | ☐ PASS ☐ FAIL |
| Entitlement predicate | One `has_pheno_tracker_entitlement` function | _record row_ | ☐ PASS ☐ FAIL |
| Pro-required write policies | RESTRICTIVE INSERT/UPDATE/DELETE coverage on all 13 `pheno_*` write tables | _record count/list_ | ☐ PASS ☐ FAIL |
| Owner SELECT/read behavior | Existing owner/read policies unchanged | _record verification_ | ☐ PASS ☐ FAIL |

## 3. Automated live smoke

The runner uses dedicated Free / Pro / Founder / Canceled accounts and existing
production-safe fixture hunts. It never seeds production.

Required environment variables:

```text
E2E_PHENO_LIVE_SMOKE_CONFIRM=RUN_LIVE_PHENO_SMOKE
E2E_PHENO_FREE_EMAIL
E2E_PHENO_FREE_PASSWORD
E2E_PHENO_PRO_EMAIL
E2E_PHENO_PRO_PASSWORD
E2E_PHENO_FOUNDER_EMAIL
E2E_PHENO_FOUNDER_PASSWORD
E2E_PHENO_CANCELED_EMAIL
E2E_PHENO_CANCELED_PASSWORD
E2E_PHENO_HUNT_ID_MISSING_EVIDENCE
E2E_PHENO_HUNT_ID_COMPARISON_READY
```

Run:

```bash
node scripts/e2e/run-pheno-live-release-smoke.mjs
```

Generated redacted artifacts:

```text
artifacts/release-readiness/pheno-tracker-live-smoke/live-smoke-summary.md
artifacts/release-readiness/pheno-tracker-live-smoke/live-smoke-summary.json
artifacts/release-readiness/pheno-tracker-live-smoke/playwright-report.json
```

**Automated smoke result:** ☐ PASS ☐ FAIL  
**Summary artifact reviewed:** ☐ Yes ☐ No  
**Tests:** _record passed / failed / skipped / flaky_  

> The automated runner validates the deployed app and role/fixture journeys. It
> does not perform a real cross-origin Paddle charge. Record any required manual
> billing transaction separately.

## 4. Full 12-checkpoint smoke matrix

| # | Checkpoint | Expected result | Evidence | Result |
| ---: | --- | --- | --- | --- |
| 1 | Free user opens `/pheno-hunts/new` | Upgrade gate shown; creation form absent | _record_ | ☐ PASS ☐ FAIL |
| 2 | Upgrade return path | Safe `returnTo=/pheno-hunts/new`; unsafe return paths rejected | _record_ | ☐ PASS ☐ FAIL |
| 3 | Pro access and onboarding | Pro reaches guided hunt onboarding without auth/paywall loop | _record_ | ☐ PASS ☐ FAIL |
| 4 | Founder access | Founder Lifetime receives the same paid feature access | _record_ | ☐ PASS ☐ FAIL |
| 5 | Canceled/expired behavior | Paid writes blocked; no create form or write bypass | _record_ | ☐ PASS ☐ FAIL |
| 6 | Hunt setup persistence | Grow/tent, candidates, notes, and evidence goals persist | _record_ | ☐ PASS ☐ FAIL |
| 7 | Workspace status split | Setup complete and Comparison readiness remain separate | _record_ | ☐ PASS ☐ FAIL |
| 8 | Incomplete comparison gate | Compare candidates disabled with exact missing/pending reason | _record_ | ☐ PASS ☐ FAIL |
| 9 | Missing-evidence navigation | Links stay in workspace, reach correct anchors, and do not enable Compare | _record_ | ☐ PASS ☐ FAIL |
| 10 | Direct incomplete `/compare` | Warning shown; no ranking, winner, verdict, or keeper conclusion UI | _record_ | ☐ PASS ☐ FAIL |
| 11 | Comparison-ready flow | Compare enabled and read-only comparison renders for hydrated fixture | _record_ | ☐ PASS ☐ FAIL |
| 12 | Core Verdant regression | Dashboard/Quick Log/timeline still load without regression | _record_ | ☐ PASS ☐ FAIL |

## 5. Manual billing confirmation, if required

| Check | Evidence | Result |
| --- | --- | --- |
| Paddle checkout opens for dedicated test purchase | _record_ | ☐ PASS ☐ NOT REQUIRED ☐ FAIL |
| Success URL preserves sanitized `returnTo` | _record_ | ☐ PASS ☐ NOT REQUIRED ☐ FAIL |
| Entitlement confirms before gated redirect | _record_ | ☐ PASS ☐ NOT REQUIRED ☐ FAIL |
| Test transaction/account cleanup completed | _record_ | ☐ PASS ☐ NOT REQUIRED ☐ FAIL |

## 6. Known limitations / deferred work

- _Record only release-relevant limitations._
- The unrelated `diary_entries`, `grow_events`, and `harvests` ownership findings
  remain deferred until after this release reaches GO.

## 7. Rollback readiness

| Rollback check | Result |
| --- | --- |
| Prior Lovable version identified | ☐ Ready ☐ Missing |
| App rollback path documented | Lovable history → restore prior version → Publish |
| Additive migrations confirmed backward-compatible | ☐ Yes ☐ No |
| Pheno entry points can be disabled without deleting user data | ☐ Yes ☐ No |
| Owner read access remains available if paid writes are disabled | ☐ Yes ☐ No |

## 8. Final decision

### GO criteria

All of the following must be true:

- Deployment confirmation: PASS
- Production schema spot-check: PASS
- Automated live smoke: PASS with **zero skipped required scenarios**
- Full 12-checkpoint matrix: PASS
- No entitlement, RLS, checkout, console, or core Verdant regression

### Decision

- ☐ **HOLD** — one or more required checks are missing, blocked, or failed
- ☐ **GO** — every required check above is recorded as PASS

**Decision timestamp:** _record_  
**Decision owner:** _record_  
**Notes:** _record_  
