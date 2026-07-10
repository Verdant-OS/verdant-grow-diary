# Pheno Tracker Pro Release Receipt

**Release status:** GO
**Production URL:** https://verdantgrowdiary.com
**Release/build identifier:** bundle `assets/index-DFkEvjho.js` · Lovable deployment `088eccbc-9e61-4874-ac85-b24929dd81cc` · Lovable is_published=true, preview at deploy-branch commit `139f2845`
**Published at:** 2026-07-10, ~16:45 UTC (bundle flip observed 15 s after Publish)
**Operator:** matt (executed via Claude Code; Publish through the Lovable MCP `deploy_project`)

> Do not change **HOLD** to **GO** until deployment confirmation, the schema
> spot-check, and all required smoke checkpoints below are recorded as PASS.

## 1. Deployment confirmation

| Check | Evidence | Result |
| --- | --- | --- |
| Production URL loads successfully | Headless Chromium load of `/` post-publish; title "Sign in to Verdant Grow Diary", 428 chars body text | ☑ PASS |
| Expected release/build identifier is visible | Observed bundle `/assets/index-DFkEvjho.js` (flip from `index-BC_4tzV6.js` +15 s after Publish). **Identity, not just serving:** deployed chunks contain release-unique code — compiled `returnTo→"/pricing"` gate in the entry, "Not comparison-ready" + "Add the missing evidence before comparing" in `phenoComparisonActionState`, `evidence_goals`/`setup_completed_at` reads in `phenoHuntCandidatesService`; PhenoHuntNew/Workspace/Compare chunks present. Lovable records is_published=true, preview anchored at deploy commit `139f2845` | ☑ PASS |
| No white screen or startup error | Body renders (auth screen for anonymous, as designed) | ☑ PASS |
| No unexpected console errors | Zero console errors, zero page errors on load; repeated on 5-page authed sweep (see §3) | ☑ PASS |

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
| `pheno_hunts` onboarding columns | `evidence_goals`, `notes`, `setup_completed_at` | All 3 returned (`{evidence_goals, setup_completed_at, notes}`) | ☑ PASS |
| Entitlement predicate | One `has_pheno_tracker_entitlement` function | 1 row (plpgsql, SECURITY DEFINER, anti-oracle guard, unions both billing tables) | ☑ PASS |
| Pro-required write policies | RESTRICTIVE INSERT/UPDATE/DELETE coverage on all 13 `pheno_*` write tables | 39 policies across 13 distinct tables (13 × insert/update/delete) | ☑ PASS |
| Owner SELECT/read behavior | Existing owner/read policies unchanged | Owner + operator policies on `pheno_hunts` identical pre/post (verified against pre-release snapshot); only RESTRICTIVE `*_pro_required_*` additions | ☑ PASS |

## 3. Automated live smoke

Executed via the official runner `scripts/e2e/run-pheno-live-release-smoke.mjs` with `E2E_PHENO_LIVE_SMOKE_CONFIRM=RUN_LIVE_PHENO_SMOKE`, dedicated disposable role accounts, and two production fixture hunts (missing-evidence, comparison-ready), seeded server-side and deleted to verified-zero residue afterward (orphan-billing check clean). Runner stages: deployment PASS · preflight PASS · sessions PASS · playwright PASS.

**Automated smoke result:** ☑ PASS
**Summary artifact reviewed:** ☑ Yes — `artifacts/release-readiness/pheno-tracker-live-smoke/live-smoke-summary.md` (redacted; Final: PASS)
**Tests:** 9 passed / 0 failed / 0 skipped / 0 flaky (official runner, 2026-07-10T17:43Z); prior direct spec run same day: 10/10

Additional authed sweep (Pro session) over `/`, `/pheno-hunts/new`,
workspace, compare, and `/pricing`: **zero console errors, zero 401/403
responses**.

## 4. Full 12-checkpoint smoke matrix

| # | Checkpoint | Expected result | Evidence | Result |
| ---: | --- | --- | --- | --- |
| 1 | Free user opens `/pheno-hunts/new` | Upgrade gate shown; creation form absent | Spec A (live): gate visible, `pheno-hunt-create-form` count 0 | ☑ PASS |
| 2 | Upgrade return path | Safe `returnTo=/pheno-hunts/new`; unsafe return paths rejected | Spec A: CTA href carries `returnTo=%2Fpheno-hunts%2Fnew`; Spec B: `evil.example` never navigated, safe value inert anonymously | ☑ PASS |
| 3 | Pro access and onboarding | Pro reaches guided hunt onboarding without auth/paywall loop | Spec C (live): `/pheno-hunts/new` loads, no `/auth` bounce; full stepper create previously proven live (2026-07-10 paid-journey run, 5/5) | ☑ PASS |
| 4 | Founder access | Founder Lifetime receives the same paid feature access | Spec C2 (live): no auth wall, no forbidden copy | ☑ PASS |
| 5 | Canceled/expired behavior | Paid writes blocked; no create form or write bypass | Spec C3 (live): gate shown, create form absent; DB-level RESTRICTIVE policies verified in §2 | ☑ PASS |
| 6 | Hunt setup persistence | Grow/tent, candidates, notes, and evidence goals persist | Seeded hunts render with persisted goals/candidates/notes in live workspace (Specs D+E/G); guided-stepper persistence proven in the 2026-07-10 live paid-journey and 19/19 local lane | ☑ PASS |
| 7 | Workspace status split | Setup complete and Comparison readiness remain separate | Spec D+E: setup-complete hunt shows Compare **disabled** (Setup complete ≠ Comparison-ready) | ☑ PASS |
| 8 | Incomplete comparison gate | Compare candidates disabled with exact missing/pending reason | Spec D+E (live): disabled button + helper text | ☑ PASS |
| 9 | Missing-evidence navigation | Links stay in workspace, reach correct anchors, and do not enable Compare | Spec D+E (live): inert/in-workspace anchors, Compare stays disabled | ☑ PASS |
| 10 | Direct incomplete `/compare` | Warning shown; no ranking, winner, verdict, or keeper conclusion UI | Spec F (live): "Not comparison-ready" rendered; forbidden-copy scan clean; **zero** comparison-execution network requests | ☑ PASS |
| 11 | Comparison-ready flow | Compare enabled and read-only comparison renders for hydrated fixture | Spec G (live): Compare enabled; `/compare` renders without not-ready warning; fixture hydration pre-verified through production adapter code | ☑ PASS |
| 12 | Core Verdant regression | Dashboard/Quick Log/timeline still load without regression | Spec I (live): dashboard resolves; quicklog smoke passed against this production stack earlier on 2026-07-10 (20 pass / 1 intentional skip); §3 sweep clean | ☑ PASS |

## 5. Manual billing confirmation, if required

| Check | Evidence | Result |
| --- | --- | --- |
| Paddle checkout opens for dedicated test purchase | Free role at `/pricing?returnTo=%2Fpheno-hunts%2Fnew`: CTA click opened the live Paddle overlay (`buy.paddle.com` frame loaded); no card entered, no charge | ☑ PASS |
| Success URL preserves sanitized `returnTo` | `returnTo` preserved through /pricing URL (observed live); Spec B live: unsafe value never navigated; `usePaddleCheckout` forwards sanitized value into successUrl (suite-pinned) | ☑ PASS |
| Entitlement confirms before gated redirect | CheckoutSuccess polls resolved entitlement before redirect (covered by checkout-success suites; live Spec B confirms no anonymous auto-redirect) | ☑ PASS |
| Test transaction/account cleanup completed | No transaction made; all disposable smoke accounts deleted to verified-zero residue | ☑ PASS |

Note: production had **zero** live Lovable subscriptions at validation time;
`ai_credit_spend` union fix (applied 2026-07-10) means the first real buyer
receives the advertised monthly Pro credits.

## 6. Known limitations / deferred work

- `diary_entries`, `grow_events`, and `harvests` RLS `WITH CHECK` FK-ownership
  findings remain **deferred** to a follow-up slice (agreed pre-GO; unrelated
  to Pheno surfaces).
- GitHub Actions is billing-locked at release time (jobs die with zero steps;
  payment shows settled — GitHub Support ticket is the standing next step).
  Three open **test-lane** PRs (#213 gate returnTo query preservation,
  #214 paid-journey smoke, #216 local lane fixes) auto-merge when it clears;
  none affect the shipped product build.
- Orphaned `/upgrade` page still shows a contradictory annual price and no
  Pheno mention; all product CTAs now bypass it to `/pricing`.
- No error tracking (Sentry) in production yet — highest-priority follow-up.

## 7. Rollback readiness

| Rollback check | Result |
| --- | --- |
| Prior Lovable version identified | ☑ Ready — previous bundle `index-BC_4tzV6.js` in Lovable version history |
| App rollback path documented | Lovable history → restore prior version → Publish |
| Additive migrations confirmed backward-compatible | ☑ Yes — all Pheno migrations additive (columns nullable/defaulted, function CREATE OR REPLACE, policies additive RESTRICTIVE); no down-migration needed |
| Pheno entry points can be disabled without deleting user data | ☑ Yes — route-level gate; hunts/candidates are plant tags, never destructive |
| Owner read access remains available if paid writes are disabled | ☑ Yes — SELECT policies untouched; read-only degradation is the designed lapsed-plan behavior |

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
- ☑ **GO** — every required check above is recorded as PASS

**Decision timestamp:** 2026-07-10 17:50 UTC (re-affirmed after strict verification ledger: identity markers, official runner PASS, artifact review, live Paddle overlay check)
**Decision owner:** matt (GO issued in session; receipt executed by Claude Code)
**Notes:** Validation ran three independent layers before GO: unit/integration
(71 pheno files, 660+ tests), full local lane (orchestrator PASS, 19/19), and
live production role-matrix smoke (10/10 + clean console/network sweep).
Disposable fixtures wiped to zero residue. Rollback path unexercised — not needed.
