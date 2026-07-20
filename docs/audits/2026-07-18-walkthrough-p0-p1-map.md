# Verdant Grow Diary — P0/P1 Remediation Map (companion to the remediation goal)

**Companion to:** [2026-07-18-walkthrough-remediation-goal.md](./2026-07-18-walkthrough-remediation-goal.md) (the T1–T21 goal charter)
**Prepared by:** Claude Code (verification owner)
**Source of findings:** Codex 2026-07-18 live walkthrough

## Verification provenance (read this first)

- **Verified against:** deploy branch tip `dba6a2306` (**#371**, "feat(operator): add trusted watering cycle context"), the current live-deploy trunk at verification time. Code inspected in a detached full checkout of that commit.
- **Audit baseline:** the walkthrough ran against an **older deployed build** (~`9ccc6f09c`, **#296**, 2026-07-18 ~02:20–02:46). **332 commits** landed on the deploy branch between the audit build and this verification.
- **Method:** seven independent read-only code-verification agents, one per finding cluster, each instructed to (a) confirm the defect against current source, (b) `git log 9ccc6f09c..HEAD` to find any commit that already fixed it, and (c) give current `file:line` evidence. No live database, edge function, or account was touched.
- **Key consequence of the 332-commit drift:** several walkthrough findings are **already fixed** in code, and several others are **deploy-lag artifacts** — the source tree is already correct and the walkthrough saw a stale bundle. Both are called out explicitly so Codex does not re-fix closed work.

Verdict legend: **FIXED** (closed by a post-audit commit) · **OPEN** (defect present in current source) · **PARTIAL** (mitigated but a residual remains) · **DEPLOY-LAG** (source correct; walkthrough saw an older bundle — needs a live re-check after redeploy) · **DATA/OPS** (not a code defect).

---

## 1. Reconciliation scorecard

| # | Finding | Sev | Verdict | Maps to |
|---|---|---|---|---|
| 1 | Quick Log deep-link opens wrong plant/stage (`ql-deeplink`) | P0 | **PARTIAL** | T1 |
| 2 | Manual sensor entry saves to wrong tent (`manual-tent-mismatch`) | P0 | **FIXED** (#347, #370) | T2 |
| 3 | Blank manual form → "Usable current reading" (`blank-usable`) | P0 | **OPEN** | T3 |
| 4 | Stale/empty telemetry labeled "Live" (`stale-live-label`) | P0 | **DEPLOY-LAG** (+1 design residual) | T4 |
| 5 | Seedlings receive Harvest Watch/window/action (`seedling-harvest`) | P0 | **OPEN** | T5 |
| 6 | Founder Lifetime paywalled from Pro (`founder-paywall`) | P1 | **DATA/OPS** (code sound) | T9/T10 |
| 7 | `/dashboard?growId` → 404 (`dash-growid-404`) | P1 | **FIXED** (#309) | T6 |
| 8 | `/logs?growId` → `/timeline` drops scope (`logs-redirect-scope`) | P1 | **OPEN** | T7 |
| 9 | Plant Detail "Add quick log" no-op (`ql-addlink-noop`) | P1 | **FIXED** (#343) | T6 |
| 10 | Public guides link to placeholder Customer Mode (`customer-mode-public`) | P1 | **PARTIAL** (noindex only) | T6 |
| 11 | Pheno demo hunt "Could not load candidates" (`pheno-demo`) | P1 | **FIXED** (#332) | T6 |
| 12 | "Outside VPD target" when VPD unavailable (`vpd-nodata`) | P1 | **PARTIAL** (static heading) | T3 |
| 13 | EcoWitt "View audit" dead-ends non-operators (`ecowitt-audit-restricted`) | P1 | **FIXED** (#309) | T6 |
| 14 | VPD calc °F→°C doesn't convert value (`vpd-unit-conv`) | P1 | **OPEN** | T8 |
| 15 | Dashboard/Plant Detail 375px horizontal overflow (`mobile-overflow`) | P1 | **PARTIAL** (Dashboard fixed, Plant Detail unaudited) | T11 |
| 16 | Plant Detail >17,000px, duplicated sections (`plant-detail-height` / `harvest-dup`) | P1 | **OPEN** | T12 |
| — | Daily Check "Add Manual Snapshot" no-op (`dailycheck-snapshot-link`) | P1 | **DEPLOY-LAG** (not in current code) | T6 |

**Tally (P0/P1):** 5 FIXED · 5 OPEN · 4 PARTIAL · 3 DEPLOY-LAG/DATA-OPS. Plus P2s: `dailycheck-selector` OPEN (T1), `ql-mobile-grid` OPEN (T1/T5), `extreme-suspicious` present-in-code/DEPLOY-LAG (T3).

**Headline:** of the walkthrough's 5 P0 blockers, **1 is fully fixed** (manual-tent-mismatch), **1 is a deploy-lag artifact** (stale-"Live" — source already enforces three-factor trust), **1 is partially closed** (Quick Log deep-link), and **2 remain fully open** (blank-usable, seedling-harvest). The "hold promotion" verdict still stands, but the genuinely-open code surface is now focused.

---

## 2. Genuinely-open remediation queue (what Codex should actually build)

Ordered by severity then blast radius. Each item is a code defect confirmed present at `dba6a2306`.

### P0 — trust

**R1 · Blank manual snapshot classifies as "usable" → `blank-usable` (T3)**
- Root cause: `src/lib/manualSensorSnapshotQualityRules.ts` (byte-identical since audit — `git log 9ccc6f09c..HEAD` empty) has **no minimum-content rule**. The evaluator cascade (lines ~235–266) checks invalid/missing-timestamp/csv/demo/stale, then falls through `else → quality="usable"`, `summary="Usable current reading"`. The card always feeds `source:"manual"` + `captured_at:now` (`src/components/ManualSensorReadingCard.tsx:189-201` builds `snap` from `validation.metrics` only), so an **empty** metric set hits the else branch and even returns `canSupportAiDoctorCurrentContext=true` (lines ~274-275) — the exact state the AI Doctor eligibility gate consumes. Same card simultaneously renders "No metrics entered yet" (~line 845).
- Fix scope: add an empty-metrics guard (0 present metrics → `missing`/`needs_review`, never `usable`; `canSupport*=false`) in the rules file, **or** gate the card's quality section on `validation.metrics.length > 0`. No test asserts the blank case today — add one at the rules level and a badge render test.
- ⚠️ The literal `"Usable current reading"` is pinned in multiple static tests; `rg` `src/test` and `e2e` before touching copy, and prefer the guard over a copy change.

**R2 · Seedlings receive full harvest tooling → `seedling-harvest` (T5)**
- Root cause: the Harvest Watch card has **zero stage gating**. It mounts unconditionally at `src/pages/PlantDetail.tsx:478` and again inside `src/components/PlantDetailWhatsMissing.tsx:92`; the view-model uses `plant.stage` only for a display label. The window is always emitted — `src/lib/harvestWatchRules.ts:234-240` returns a broad `startDay:56,endDay:77` fallback ("8–11 week window") for any plant. Trichome/pistil/bud checklist always renders. The Quick Log harvest/cure action is explicitly **not** stage-gated (`src/lib/quickLogActionSwitchResetRules.ts:23-24`).
- Fix scope: gate **both** mount sites and the Quick Log harvest action on a normalized flowering/late-flower stage with a known flower-start date (flower-without-start → "missing context", not a countdown). Put the rule in one pure module; add seedling→hidden pin tests.
- ⚠️ **Landmine (`stage-vocab`):** plant-level stages use `"cure"` while grow canonical `STAGES` (`src/lib/grow.ts:10-17`) uses `"drying"`; aliasing exists **only** at the Quick Log seam (`src/lib/quickLogStageDefaultRules.ts:37-40` `STAGE_ALIASES = {cure:"drying", curing:"drying"}`). Any stage gate you add **must** route `plant.stage` through `normalizeQuickLogStage` (or an equivalent `cure→drying` alias) or a curing plant will mis-gate. This mismatch is not the *cause* of the current bug (the bug is the total absence of a gate) but it is the trap the fix will spring.

**R3 · Quick Log deep-link residual auto-open → `ql-deeplink` (T1)**
- State: the canonical deep-link surfaces are already hardened — `src/lib/dailyCheckPlantSelectionRules.ts:72-124` resolves `?plantId=` to valid/unknown/out-of-scope with a rejection banner (never auto-picks another plant), and `src/components/QuickLog.tsx:1410-1425` shows a "Logging to X, not Y" mismatch banner.
- Residual root cause: a **different** auto-open path added *after* the audit in #328 (`40657d8a7`). `src/components/AppShell.tsx:98-111` consumes `?open=quick-log` and opens the legacy QuickLog with `setPrefill(null)`; `src/lib/startScreenPreferences.ts:58-65` `consumeQuickLogStartIntent` strips only `open` and never reads `plantId`. So `/dashboard?open=quick-log&plantId=X` opens Quick Log ignoring the plantId and shows the last-active grow/stage.
- Fix scope: in `AppShell.tsx` read `plantId`/`growId`/`tentId` from the consumed search and pass them as a `QuickLogPrefill`; have `startScreenPreferences.ts` return the parsed context, not just stripped search. Add a test beside `src/test/app-shell-quick-log-consolidation.test.ts`.
- Note: no app-generated link currently emits `open=quick-log` **with** a plantId, so today's exposure is a hand-crafted URL / multi-grow default surprise — but it is the mechanism the walkthrough most likely hit (its narrower canonical cousin was already safe).

### P1 — broken destinations & layout

**R4 · `/logs?growId` drops grow scope → `logs-redirect-scope` (T7)**
- Root cause: `src/App.tsx:338` `<Route path="/logs" element={<Navigate to="/timeline" replace />} />` is a static redirect; React Router does not carry `?growId` into the literal `to`. Callers still build `/logs?growId=…` via `src/lib/routes.ts:18` `logsPath` (e.g. `src/pages/GrowDetail.tsx:198,270`). Timeline **does** consume the param (`src/pages/Timeline.tsx:270,303`), so the scope is lost only in the hop.
- Fix scope: replace with a search-preserving redirect component (mirror `LegacyStrainSlugRedirect` at `App.tsx:182`), **or** migrate callers to `timelinePath` (`GrowDetail.tsx:198,270`, `DashboardSensorHealthSummary.tsx:141`, `GrowBreadcrumbs.tsx:120`, `PlantDetailPhotoStrip.tsx:103`). Add a param-preservation assertion to `src/test/auth-route-redirects.test.ts`.

**R5 · VPD calculator unit toggle doesn't convert → `vpd-unit-conv` (T8)**
- Root cause: `src/pages/PublicVpdCalculator.tsx:288-299` — the temperature-unit `<select>` onChange calls only `setTemperatureUnit()` + `invalidateVisibleResult()`; it never converts the entered `temperature`/`leafTemperature` string. The input bounds flip (`max={temperatureUnit === "C" ? 60 : 140}`, line 279), so 78 °F stays "78" while max becomes 60 and 78 is then read as 78 °C.
- Fix scope: on unit change, convert both values via an F↔C helper (add to `src/lib/vpdRules.ts`), or clear with explicit confirmation. Add a render test (78 °F → ~25.6 °C on toggle).

**R6 · Public guides still link to placeholder Customer Mode → `customer-mode-public` (T6)**
- State: the route was noindexed post-audit (`src/pages/CustomerModeGuide.tsx:37 noindex:true`, from Lovable snapshot `bd9e1f08e`) — SEO leak closed. But the misleading in-app destination remains: `src/pages/GuidePage.tsx:260` and `src/pages/GuidesIndex.tsx:159` still link to `/customer/guide`, which renders the visible disclaimer `src/lib/customerModeGuideViewModel.ts:91` ("Customer-facing placeholder content — share-token publishing backend not yet available.").
- Fix scope: remove/gate the CTA in `GuidePage.tsx:260` and `GuidesIndex.tsx:159` until publishing is real, or ship the backend.

**R7 · Plant Detail single-scroll + duplicate Harvest Watch → `plant-detail-height` / `harvest-dup` (T12)**
- Root cause: `src/pages/PlantDetail.tsx:355` renders one long `<div>` with **no tabs** (`Tabs`/`TabsContent` count = 0) and ~24 top-level mounts including ~13 AI-doctor/readiness/harvest/timeline panels (4 "readiness" + 3 "context" near-duplicates). The section-nav (`PlantDetailSectionNav`) is cosmetic jump-links only and doesn't cut rendered height. Confirmed duplicate: **Harvest Watch mounts twice** (`PlantDetailWhatsMissing.tsx:92` + `PlantDetail.tsx:478`); **Harvest Evidence Report mounts once** (the audit over-counted the Report).
- Fix scope: introduce a four-tab shell (Overview/Timeline/Environment/AI Review) or lazy-mount/collapse the readiness cluster; remove one Harvest Watch mount; add a rendered-height budget test and a "exactly one harvest-watch-card testid" pin. (Do R2's stage gate and this dedupe together — same file.)

**R8 · Plant Detail mobile overflow unverified → `mobile-overflow` (T11)**
- State: the shared `PageHeader` overflow driver is fixed (`PageHeader.tsx:22` actions now `flex-wrap sm:shrink-0`, was `shrink-0`) and Dashboard is bracketed by 320/390px regression specs (#311 `601ea6d7a`, `e2e/dashboard-mobile-overflow.spec.ts`). **Plant Detail was never viewport-audited** — its child panels (`PlantTentEnvironmentPanel`, timeline/sensor sections) are unverified at 375px.
- Fix scope: add a Plant Detail 375px overflow e2e (mirror the Dashboard spec) and audit child panels for missing `min-w-0`/`overflow-x`.

### P2 — worth folding into the above

- **`dailycheck-selector` (T1, OPEN):** `src/pages/DailyCheck.tsx` renders `QuickLogAllActivitiesSection` at the top with copy "Choose a plant above." while the actual plant/tent `<Select>`s are **below** it in Step 1 (lines 745-794); "Add plant note" (616-635) has no disabled guard. Reorder so a selector precedes the choose card, or fix the directional copy, and gate the note button on a selected plant. (File unchanged since audit.)
- **`ql-mobile-grid` (T1/T5, OPEN):** `src/components/QuickLogActivityPicker.tsx:35-41` renders all 10 activities in a fixed `grid-cols-2` mobile grid with truncated labels and **no stage filter** (`src/constants/quickLogActivityTypes.ts` — harvest `enabled:true` for all); folds into R2's stage-awareness work. Add stage-applicability metadata + progressive disclosure.

---

## 3. Deploy-lag & data/ops items (do NOT re-code without a live check)

These are **not** open code defects. The source tree is already correct; the walkthrough saw an older deployed bundle, or the cause is data/ops. Action = verify live, then redeploy or fix config — not a source PR.

- **`stale-live-label` (P0 → DEPLOY-LAG, T4):** three-factor trust is enforced in source and predates the audit. A reading is "Live" only when source is the canonical literal `live` **and** freshness ≤ 15-min window (future-skew rejected) **and** required metrics are plausible (`src/lib/growDataSourceLabelRules.ts:273-305`, `src/lib/latestSensorSnapshotRules.ts:504-515` emits `fresh_live`, `src/lib/sensorSnapshotTrustBadgeRules.ts:144-151` returns `invalid` for bare `source==="live"` without a resolver verdict, `src/lib/dashboardSensorHealthViewModel.ts:144-147` "stale/invalid override even if source===live"). The mislabels are bundle drift → **re-check after the current deploy**.
  - **One by-design residual to raise with product:** a single fresh-live 0% soil reading still shows "Live" + "Uncalibrated" because calibration and source are orthogonal badges (`src/lib/soilMoistureReadingViewModel.ts:83`); a *single* 0% is not flagged (stuck needs 3+). Decide whether that pairing should suppress "Live".
  - **One code smell worth a targeted look if any Live anomaly is later confirmed live:** `src/lib/latestSensorSnapshotRules.ts:249` re-labels a redacted `ecowitt_windows_testbench` row's source to `"live"` after the diagnostic-row fence — a deliberate physical-gateway exception, but the one place a non-`live` raw source is promoted to the canonical literal.
- **`extreme-suspicious` (P2 → present in code, T3):** repeated 0/100 RH/moisture **do** get a suspicious state — `src/lib/sensorMetricStateRules.ts:145-164` flags 3+ consecutive exact 0/100 as `invalid`; the operator live-proof gate `src/lib/liveSourceTruthGateRules.ts:128-136` uses `forbid_exact:[0,100]`. If the deployed app didn't show it, that's drift. Confirm the "stuck"/"Invalid" chip renders on the deployed Sensor page.
- **`vpd-nodata` (P1 → PARTIAL, T3):** no reading-level code path emits an "outside target" verdict for no-data — `src/lib/vpdTargetRules.ts:56-59` returns `unavailable` for null VPD; `src/lib/environmentStabilityRules.ts:259-267` returns `status:"unavailable"` + "No usable VPD readings…". The only residual is a **static card heading** `"Outside VPD target"` (`src/components/EnvironmentStabilityCard.tsx:69`) that reads as a claim. Small fix: make the heading neutral or hide/suffix it when `status ∈ {unavailable, stage_unknown}` — and update the pin test `src/test/environment-stability-summary-safety.test.ts:60` that currently locks the literal, in tandem.
- **`founder-paywall` (P1 → DATA/OPS, T9/T10):** the entitlement code is sound and shared. Client (`src/hooks/useMyEntitlements.ts:71-107`) and server (`supabase/functions/_shared/unionEntitlementLookup.ts:136-179`) both read `public.subscriptions` and call the same pure `resolveUnionEntitlements` → `resolveEntitlements`; `founder_lifetime` maps to Pro caps + 100 AI credits (`src/lib/entitlements/planCatalog.ts:18-44`). Capability resolution fails **open to Free** for a null row; the server report gate fails **closed** (403 `upgrade_required`). "Plan cannot be verified" is a **distinct ops fail-state** — it only renders when the edge function returns a non-403 error (`src/pages/EnvironmentSummaryReportPage.tsx:286-288`, i.e. `config_missing`/not-deployed/network). A founder is paywalled only when `public.subscriptions` lacks an adapter-passing, environment-matching, `active`/`current_period_end IS NULL`/`lifetime_`-prefixed row — a **data-state condition on the frozen 2026-07-16 backfill**, plus the outstanding `PAYMENTS_ENVIRONMENT=live` ops TODO. Founder **identity** likely comes from the separate `founders` table (`src/hooks/useMyFounderRow.ts:33-37`), independent of the entitlement lane, which is why the badge can say Founder while caps resolve Free.
  - **Verify live (out of code scope):** (1) the account's `public.subscriptions` row — env, `price_id`, `status`, `current_period_end`, `paddle_subscription_id` prefix; (2) whether the 2026-07-16 backfill migration was applied to prod; (3) that both entitlement edge functions are deployed and `PAYMENTS_ENVIRONMENT`/keys resolve.
  - 🔒 **FROZEN:** any code "fix" here would touch the entitlement lane / provenance semantics — the 2026-07-16 provenance-free `environment='live'` founder backfill and the canonical-lane narrowing — which are frozen pending Matt's explicit sign-off (goal charter §2.6). Do not re-shape the backfilled row, re-widen the lane, or alter `PAYMENTS_ENVIRONMENT` handling as a "fix" without that decision.
- **`dailycheck-snapshot-link` (P1 → DEPLOY-LAG, T6):** not reproducible in current code — Daily Check's "Add sensor snapshot" is an inline step reveal (`src/pages/DailyCheck.tsx:636-655 → setStep("manual")`), not a self-link; post-submit navigation never targets `/daily-check`. Walkthrough likely hit an older build. Confirm live.

---

## 4. Already fixed since the audit (close these out — do not re-open)

| Finding | Fixed by | Evidence |
|---|---|---|
| `manual-tent-mismatch` (P0) | #347 `35c05f8e7`, #370 `fb08380a5` | One canonical `activeTentId` (`Sensors.tsx:247`); card re-syncs via effect (`ManualSensorReadingCard.tsx:169-173`); "Saving to:" reads synced state; fail-closed render gate. Regression-guarded by `src/test/manual-sensor-active-tent-handoff.test.tsx`. **T2 PASS.** |
| `dash-growid-404` (P1) | #309 `c57d474a7` | `App.tsx:325` mounts `/dashboard` alias so `?growId` deep-links resolve with the query intact. |
| `ql-addlink-noop` (P1) | #343 `55cece5a6` | `src/lib/oneTentLoopNavigationRules.ts:153-157` returns a local `open-quick-log` action (not a self-link); `PlantDetail.tsx:426-428` opens the plant-scoped dialog. |
| `pheno-demo` (P1) | #332 `1441b5371` | Demo is now a fixture (`src/lib/demo/phenoHuntDemoFixture.ts`); "Walk this hunt" → `/pheno-hunts/:id/showcase` with graceful fallback; the "Could not load candidates" string now only fires for a real hunt's failed RLS-scoped read. |
| `ecowitt-audit-restricted` (P1) | #309 `c57d474a7` | Tent Detail "View audit" affordance removed; EcoWitt Audit nav is operator-only (`AppSidebar.tsx:132` in `operatorGroups`); route inside `<RequireOperatorRole>` (`App.tsx:508`). |

---

## 5. Cautions carried into implementation (cross-cutting)

1. **`cure` vs `drying` stage alias** — every plant-stage→grow-stage comparison must alias `cure→drying` (only the Quick Log seam does today). Blocks R2.
2. **Entitlement lane freeze** — §2.6 of the goal charter; no lane/provenance/`PAYMENTS_ENVIRONMENT` changes without Matt.
3. **Static-scanner & pinned-literal traps** — `"Usable current reading"`, `"Outside VPD target"` (`environment-stability-summary-safety.test.ts:60`), and other copy are pinned in `src/test`/`e2e`; `rg` before any copy edit and prefer logic guards. Action-queue-safety scanner bans control vocab near `pi_bridge`.
4. **Deploy-vs-source lag is systemic** — this walkthrough shows the deployed Lovable bundle can lag PR source by a large margin. Trust findings (sensor labels, extreme flags) that verify correct in source **must** be re-checked on the live app after the next deploy, not re-coded.
5. **Do R2 + R7 together** — both edit `src/pages/PlantDetail.tsx` / the harvest-watch mounts; splitting them invites a merge race on a hot file.

---

*Verified against `dba6a2306` (#371). Because the deploy trunk moves fast, treat every `file:line` here as an "as-of-#371" pointer — re-anchor before editing. This map is the Phase-1 companion to the T1–T21 goal charter and doubles as the first T20 phase-boundary reconciliation (audit claims vs current source).*
