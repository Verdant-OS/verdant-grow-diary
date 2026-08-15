# Zero Known Defects board — snapshot 2026-08-13

The **live board** is the GitHub issue set labeled `zero-defect` (severity
labels `severity:P1/P2/P3`). Org project 2 "Zero-Defect Board" was
`NOT_FOUND` from this session's GitHub token; when the project view and
GitHub issues disagree, **GitHub issues win**. This file is a point-in-time
snapshot. Evidence for this refresh:
[full-application-zero-defect-audit-2026-08-13.md](./full-application-zero-defect-audit-2026-08-13.md).

**Ref audited:** `verdant-grow-diary` @ `bf9a6111f643f5c43bb5b0e06af935791ee8e46d`
(#954). Production `https://verdantgrowdiary.com/version.json` served the same
SHA (`commitSource: "git"`, build `2026-08-13T08:56:20.121Z`) at the live fetch.

**Scope of this pass:** full application (routes, public/auth/demo, One-Tent
Loop, sensors, AI Doctor, alerts, Action Queue, entitlements, pheno, MCP,
edge-function public writes, CI, live public SEO). Not a One-Tent-Loop-only
claim.

**Claim this snapshot supports:** no known open **P0**. No known open **P1
inside the first-time-user One-Tent Loop**. The only GitHub-open P1 remains
**#561** (owner/external project binding). It is still **not** a claim that
every P2/P3 is closed, and it is not a claim that unlabelled GitHub bugs are
absent.

The 2026-08-08 snapshot is superseded. Do not copy its OPEN/FIXED rows forward
without checking GitHub.

## Inventory (GitHub, 2026-08-13)

35 issues carry `zero-defect`. **10 open / 25 closed.**

| Severity | Open | Closed |
| -------- | ---- | ------ |
| P0       | none filed | none filed |
| P1       | #561 | #562 #563 #580 #581 #582 #583 #584 #585 |
| P2       | #590 #592 | #564–#569 #586 #587 #588 #589 #591 #596 #603 |
| P3       | #570 #571 #572 #573 #574 #576 #593 | #575 #577 #578 #602 |

## P0 — stop-ship

None known at this HEAD from static review plus live public-surface fetches.

Re-checked this pass (all `PASS` unless noted):

- Demo / walkthrough / operator-demo paths: no `.insert/.update/.delete/.upsert/.rpc/functions.invoke`
- Committed anon JWT `role` is `anon`; no `service_role` / bridge token / webhook secret in client scan (`test:security-static` green)
- Invalid / demo / csv telemetry is not classified healthy on dashboard / trust-badge / bridge-health surfaces
- Action Queue is not auto-created from alert persistence; drafts stay `pending_approval`; no device field on create RPC
- Auth layout: protected tree is under AppShell; public `/quick-log` is localStorage-only
- Quick Log RPC failures surface to the grower (no silent success)

Runtime RLS / authenticated One-Tent e2e: **NOT_MEASURED** here (no grower
session). Security DB Local and One-Tent Loop smoke were `PASS` on the
**push** CI for this SHA.

## P1 — release blockers

| # | Title (short) | Status this pass | Owner type | Test / evidence | Blocker |
| - | ------------- | ---------------- | ---------- | --------------- | ------- |
| [#561](https://github.com/Verdant-OS/verdant-grow-diary/issues/561) | Supabase MCP + PR preview point at sandbox project | **OPEN / BLOCKED** (owner). Code still pins sandbox `bzatgtgjvuojpoxcknaa` vs production `knkwiiywfkbqznbxwqfh` in `scripts/lib/supabaseDatabaseTargetIdentity.mjs`. MCP from this session still cannot see production schema. | Owner (Matt) | n/a (external config) | Re-scope MCP + GitHub Supabase integration |
| [#580](https://github.com/Verdant-OS/verdant-grow-diary/issues/580) | test:security-static red; bundle carried role-name token | **FIXED** (closed). Re-verified: `bun run test:security-static` PASS | Repo | scanner self-test + repo scan | — |
| [#581](https://github.com/Verdant-OS/verdant-grow-diary/issues/581) | Dormant CI | **FIXED** (closed). Liveness guard still present. Four workflows remain intentionally `# dormant:` on `main`. | Repo | `workflow-branch-filter-liveness.test.ts` | — |
| [#582](https://github.com/Verdant-OS/verdant-grow-diary/issues/582) | getSession() rejection hangs apex | **FIXED** (closed). AuthProvider still `applySession(null)` + `setLoading(false)` on reject. Residual: `useRequireAuth` has no `.catch` on `getUser()` reject — **not filed**; see proposed items. | Repo | `auth-provider-initial-session-failure.test.tsx` (3 tests, re-run PASS) | — |
| [#583](https://github.com/Verdant-OS/verdant-grow-diary/issues/583) | Legacy Quick Log env check never writes environment_events | **FIXED** (closed). Sensor params still lifted into RPC. | Repo | `environment-check-entry-type-audit.test.ts` (re-run PASS) | — |
| [#584](https://github.com/Verdant-OS/verdant-grow-diary/issues/584) | "Live" badge contradiction | **FIXED** (closed). Badge still "Receiving data — unverified source". | Repo | `sensors-testbench-panel-static-safety.test.ts` (re-run PASS) | Residual tables live in #592 |
| [#585](https://github.com/Verdant-OS/verdant-grow-diary/issues/585) | Paid keepers page unreachable | **FIXED** (closed). Workspace → keepers link still present. | Repo | `pheno-keepers-nav-reachability.test.ts` (re-run PASS) | — |
| [#562](https://github.com/Verdant-OS/verdant-grow-diary/issues/562) | CI suite didn't run on feature branch | **FIXED** (closed). Push CI for this SHA: Full Vitest, Typecheck, ESLint, Security regression, One-Tent Loop smoke all `success`. | Repo | GitHub Actions on `bf9a6111f` | — |
| [#563](https://github.com/Verdant-OS/verdant-grow-diary/issues/563) | pheno e2e bad `Page` import | CLOSED | Repo | — | — |

## P2 — important cleanup

| # | Title (short) | Status this pass |
| - | ------------- | ---------------- |
| [#564](https://github.com/Verdant-OS/verdant-grow-diary/issues/564)–[#569](https://github.com/Verdant-OS/verdant-grow-diary/issues/569) | Pheno hunt cluster | **CLOSED** (2026-08-08). No regression re-litigation this pass. |
| [#586](https://github.com/Verdant-OS/verdant-grow-diary/issues/586) | Action Queue audit + durable dedupe | **CLOSED** as the expand-step RPC. Residual **still true in code**: client `INSERT` policy remains; `phenoActionQueueService.ts` and `usePostGrowLearningReportData.ts` still `.insert` instead of `action_queue_create`. Production apply of the RPC remains **BLOCKED** (MCP is sandbox). Proposed follow-up, not reopened here. |
| [#587](https://github.com/Verdant-OS/verdant-grow-diary/issues/587) | Timeline UTC vs local day bounds | **CLOSED**. Code uses `timelineDateRangeRules.ts` local bounds. Re-run `timeline-date-range-rules.test.ts` PASS. Prior snapshot incorrectly left this OPEN. |
| [#588](https://github.com/Verdant-OS/verdant-grow-diary/issues/588) | Sign-out / AppShell revalidation | **CLOSED**. AppShell still waits on `hydrated \|\| loading \|\| authStatus === "loading"`. |
| [#589](https://github.com/Verdant-OS/verdant-grow-diary/issues/589) | Demo static-safety overclaim | **CLOSED**. Suites narrowed; `operator-demo-preview-static-safety.test.ts` re-run PASS. |
| [#590](https://github.com/Verdant-OS/verdant-grow-diary/issues/590) | App tsconfig strict mode off | **OPEN on GitHub, FIXED in-repo.** Root `tsconfig.json` has `"strict": true` (implies `strictNullChecks`) since `ce417318e` (2026-08-02). Extra flags `noImplicitAny` / `noUncheckedIndexedAccess` remain off by comment. Issue body is stale; recommend close or retarget. |
| [#591](https://github.com/Verdant-OS/verdant-grow-diary/issues/591) | robots.txt blocks `/sensors/csv-preview` | **CLOSED**. `Allow: /sensors/csv-preview` precedes `Disallow: /sensors` in all three robots groups. |
| [#592](https://github.com/Verdant-OS/verdant-grow-diary/issues/592) | Divergent sensor rule tables | **OPEN / PARTIAL**. Freshness windows live in `src/constants/sensorTiming.ts`. Residual: EC 20/50 two-tier, presentation vs operator bands, multiple `normalizeSource` helpers, `classifySnapshotTruth` timestamp gate. |
| [#596](https://github.com/Verdant-OS/verdant-grow-diary/issues/596) | Env checks never reach alert evaluation | **CLOSED**. `snapshotFromEnvironmentCheck` + `useLatestSensorSnapshot` still wired. Re-run `environment-check-alert-evidence.test.ts` PASS. |
| [#603](https://github.com/Verdant-OS/verdant-grow-diary/issues/603) | Env-check alerts empty evidence trail | **CLOSED** (was missing from the 2026-08-08 snapshot). |

## P3 — polish / future debt

| # | Title (short) | Status this pass |
| - | ------------- | ---------------- |
| [#570](https://github.com/Verdant-OS/verdant-grow-diary/issues/570) | Leftover E2E data on a real grow | **OPEN**. Production data; **BLOCKED** to confirm from this session. |
| [#571](https://github.com/Verdant-OS/verdant-grow-diary/issues/571) | Pheno workspace slow first render | **OPEN**. Timing **NOT_MEASURED** this pass. |
| [#572](https://github.com/Verdant-OS/verdant-grow-diary/issues/572) | Step-6 attestation does not gate create | **OPEN**. `canSave` ignores `setupConfirmed` (`PhenoHuntNew.tsx`). |
| [#573](https://github.com/Verdant-OS/verdant-grow-diary/issues/573) | Hunt create reachable from step 2 | **OPEN**. `canCreate` is field-gated, not step-gated. |
| [#574](https://github.com/Verdant-OS/verdant-grow-diary/issues/574) | 8 of 12 evidence goals preselected | **OPEN**. Defaults still 8 in `phenoEvidenceGoals.ts`. |
| [#575](https://github.com/Verdant-OS/verdant-grow-diary/issues/575) | No save confirmation | **CLOSED** 2026-08-11. |
| [#576](https://github.com/Verdant-OS/verdant-grow-diary/issues/576) | Chart units ignore temp preference | **OPEN**. Hardcoded `°F`; zero non-test production callers. |
| [#577](https://github.com/Verdant-OS/verdant-grow-diary/issues/577) | Mixed testid naming | **CLOSED** 2026-08-11. |
| [#578](https://github.com/Verdant-OS/verdant-grow-diary/issues/578) | Node 26 storage-rejection tests | **CLOSED** 2026-08-11 (#865). Prior snapshot incorrectly left this OPEN. |
| [#593](https://github.com/Verdant-OS/verdant-grow-diary/issues/593) | P3 polish backlog 2026-07-30 | **OPEN**. Most items still present; NotFound now uses `<Link to="/">`. |
| [#602](https://github.com/Verdant-OS/verdant-grow-diary/issues/602) | Diary sensor_snapshot grow-scoped | **CLOSED** (was missing from the 2026-08-08 snapshot). Tent-scope gate still in `diaryEvidenceTentScopeRules.ts`. |

## Full-application findings not yet on GitHub

`gh` from this environment is read-only. These are **proposed** board rows,
not filed issues. Do not treat them as live GitHub items.

| Proposed severity | Finding | Evidence | Notes |
| ----------------- | ------- | -------- | ----- |
| P2 | Two Action Queue writers still bypass `action_queue_create` | `src/lib/phenoActionQueueService.ts` (herm cull); `src/hooks/usePostGrowLearningReportData.ts` (post-grow lesson). Drafts are `pending_approval` / no `target_device`. | Residual of closed #586 expand step. Needs a revoke/migrate slice, not a silent reopen. |
| P2 | `useRequireAuth` has no rejection handler | `src/hooks/useRequireAuth.ts` — `.then` only; tests cover resolve-with-error, not reject. AppShell treats `authStatus === "loading"` as a spinner. | Same *class* as #582; **not reproduced** (supabase-js usually resolves `{error}`). |
| P2 | AI Doctor device-command strip skips 24h / 3-day fields | `aiDoctorSafetyRules.ts`: `DEVICE_COMMAND_PATTERNS` applied to `immediate_action` only; `follow_up_24h` / `recovery_plan_3_day` get feed-language gating only. AQ rewrite still forces advisory + `pending_approval`. | Advice-text gap, not execution. |
| P2 (SEO) | Six indexable public routes are sitemap-excluded by allowlist | Live 2026-08-13: HTTP 200 + `robots: index, follow` on `/glossary`, `/breeder-beta`, `/creator-beta`, `/pheno-comparison`, `/pheno-expression-showcase`, `/docs/mcp-api`. Listed in `scripts/public-route-parity.config.mjs` `STATIC_ONLY_ROUTES`. Sitemap still 56 `<loc>`. | CURRENT_STATE still says four routes; two more now. Eligibility decision still open (blocker 8 family). |
| P2 (infra) | Scheduled / dispatch money probes fail while **push** gates are green | Push on this SHA: Required money-critical migrations `success`. `workflow_dispatch` LIVE job failed exit 6 *before* reading `schema_migrations` (applied state **UNKNOWN**, not "missing"). Scheduled: Sandbox credit-packs, Paddle Craft catalog, AI-credit production contract — all `failure`. | Do not read those reds as proof production credits/catalog are broken. Cluster with #561 / secret-binding. |
| Process | Close or retarget #590 | `tsconfig.json` `"strict": true` is an ancestor of HEAD. | GitHub still OPEN. |

## Live public-surface re-measure (2026-08-13)

| Axis | Status | Evidence |
| ---- | ------ | -------- |
| `/version.json` | `PASS` | HTTP 200; `commit` = `bf9a6111f643f5c43bb5b0e06af935791ee8e46d`; `commitSource: "git"` |
| Public `/` SSR | `PASS` | HTTP 200, 52 701 bytes, `<h1>` present, canonical present, ~1039 body words, no `role="status"` / `Loading…` skeleton. Code: `ROOT_ENTRY_PRE_HYDRATION_SURFACE = "landing"` (#949). CURRENT_STATE row still says `FAIL` (stale; colliding open PR #913 also edits that file — not updated here). |
| Sitemap | `PASS` (count) | Live 56 `<loc>` |
| Indexable-but-unsitemap'd | `FAIL` | Six routes, see above |
| GA4 / GSC authenticated | `NOT_MEASURED` | No credentials this session |

## Reading the board

- Statuses: VERIFIED / FIXED / BLOCKED / DEFERRED / NOT REPRODUCED / NOT APPLICABLE, plus GitHub OPEN / CLOSED.
- Every material claim in the audit is labeled `established fact`, `source claim`, `inference`, or `NOT_MEASURED` / `BLOCKED`.
- Close GitHub issues from the issue UI; this snapshot cannot close them.
