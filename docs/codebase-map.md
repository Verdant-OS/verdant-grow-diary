# Verdant Codebase Map

Exhaustive inventories that back the orientation section in [`/CLAUDE.md`](../CLAUDE.md).
They live here rather than in `CLAUDE.md` so they do not load into every agent session.

**Measured 2026-08-21 at base tip `f25f9ed` (#1020)**, by direct inspection of the
working tree. Everything below is `established fact` about repository structure. Nothing
here is a claim about production, deployment, indexing, or which migrations are applied —
those axes belong to [`docs/agents/CURRENT_STATE.md`](agents/CURRENT_STATE.md) and keep
their `BLOCKED` / `NOT_MEASURED` labels there.

This file is **not** one of the twelve versioned governance files. It carries no
`Sentinel-Version` and editing it does not trigger the parity gate.

---

## 1. Route inventory

Routes are file-based under `src/routes/`, compiled into the generated
`src/routeTree.gen.ts`. Three nesting layers:

```text
src/routes/__root.tsx                  document, SEO/JSON-LD, provider stack
├── 53 public routes                   src/routes/*.tsx
├── _app.tsx                           authenticated layout → <AppShell><Outlet/></AppShell>
│   ├── 52 authenticated routes        src/routes/_app/*.tsx
│   └── _operator.tsx                  → <RequireOperatorRole/>
│       └── 38 operator routes         src/routes/_app/_operator/*.tsx
└── $.tsx                              catch-all / NotFound
```

Route files are uniformly thin: `createFileRoute(path)({ component })` plus a one-line
component rendering a `src/pages/*` default export. Public static routes also call
`head: () => staticRouteHead("/path")` from `src/lib/build/staticRouteHead.ts`.

**Policy source of truth is `src/lib/appRouteManifest.ts`** — pure data listing every path
with `access: public | auth | operator | internal | redirect` and an optional
`requiredFeature`. A test cross-checks the manifest against the mounted tree.

### Public routes (`src/routes/*.tsx`)

| Group                    | Files                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entry / auth             | `index.tsx` (apex, session-aware via `RootEntry`), `auth.tsx`, `reset-password.tsx`, `welcome.tsx`                                                                                                                                                                                         |
| Marketing                | `pricing.tsx`, `founder.tsx`, `contact.tsx`, `feedback.tsx`, `hardware-integrations.tsx`, `how-ai-doctor-works.tsx`                                                                                                                                                                        |
| Commerce                 | `checkout.success.tsx`, `checkout.cancel.tsx`                                                                                                                                                                                                                                              |
| Content / SEO            | `guides.index.tsx`, `guides.$slug.tsx`, `guides.grow-stage-care-guide.tsx`, `cultivars.index.tsx`, `cultivars.$slug.tsx`, `glossary.tsx`, `customer.guide.oreoz-vs-gelonade-comparison.tsx`, `docs.mcp-api.tsx`                                                                            |
| Credential-free tools    | `quick-log.tsx`, `tools.vpd-calculator.tsx`, `tools.blueprint-targets.tsx`, `pheno-comparison.tsx`, `pheno-expression-showcase.tsx`, `pheno-hunts.$id.compare.tsx`, `pheno-hunts.$id.showcase.tsx`, `ai-doctor-readiness-check.tsx`, `sensors.csv-preview.tsx`, `partners.csv-preview.tsx` |
| Beta / internal previews | `breeder-beta.tsx`, `creator-beta.tsx`, `internal.demo-proof-walkthrough.tsx`, `internal.pheno-hunt-demo.tsx`, `internal.contextual-pheno-comparison-demo.tsx`                                                                                                                             |
| Legal                    | `terms.tsx`, `privacy.tsx`, `refund.tsx`, `unsubscribe.tsx`                                                                                                                                                                                                                                |
| OAuth                    | `[.]lovable.oauth.consent.tsx`                                                                                                                                                                                                                                                             |

### Root-level redirect aliases (13)

These render redirect components and are `access: "redirect"` in `appRouteManifest.ts`. They
are **not** pages — the surface lives at the target, so editing or testing them as pages is
wasted work. Listed separately from the page groups above for that reason.

| Alias               | Redirects to                                                              |
| ------------------- | ------------------------------------------------------------------------- |
| `/login`            | `/auth`                                                                   |
| `/signup`           | `/auth`                                                                   |
| `/register`         | `/auth`                                                                   |
| `/features`         | `/welcome`                                                                |
| `/demo`             | `/welcome`                                                                |
| `/upgrade`          | `/pricing` with allowlisted plan, acquisition, return intent              |
| `/billing/:plan`    | `/pricing?plan=<canonical>` (legacy entry; `/pricing` owns live checkout) |
| `/strains`          | `/cultivars`                                                              |
| `/strains/:slug`    | `/cultivars/:slug`                                                        |
| `/terms-of-service` | `/terms`                                                                  |
| `/privacy-policy`   | `/privacy`                                                                |
| `/refunds`          | `/refund`                                                                 |
| `/refund-policy`    | `/refund`                                                                 |

Together with the five `_app` aliases below, `appRouteManifest.ts` classifies **18** paths as
`access: "redirect"`.

Several legal/marketing duplicates exist as routes **and** as redirect entries in
`vercel.json` (`/strains → /cultivars`, `/features → /welcome`, `/terms-of-service → /terms`,
`/privacy-policy → /privacy`, `/refunds` and `/refund-policy → /refund`, `/demo → /welcome`).
**Those redirects do not fire in production.** Lovable is the production publisher and does
not apply Vercel host configuration — all **eight** redirect entries in that file return HTTP 200 with no
`Location` header, so the destination is reached by client rendering, not by a host redirect
(`docs/seo/lighting-launch-verification.md`, §Non-blocking host mismatch — that document says
"six", counting only the aliases its own slice added; the file holds eight, and Lovable ignores
all of them). The eight are `/strains`, `/strains/:slug`, `/features`, `/demo`, `/refunds`,
`/refund-policy`, `/terms-of-service`, `/privacy-policy`. `vercel.json` is stale pre-SSR
configuration that `CURRENT_STATE_ARCHIVE.md` lists for retirement.

### Authenticated routes (`src/routes/_app/*.tsx`)

| Domain                | Routes                                                                                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core loop             | `dashboard`, `grows`, `grows_.$growId`, `grows_.$growId_.learning`, `tents`, `tents_.$id`, `plants`, `plants_.$id`, `timeline`, `daily-check`                                                                                      |
| Sensors / environment | `sensors`, `health`, `start-room`                                                                                                                                                                                                  |
| AI                    | `doctor`, `doctor_.sessions`, `doctor_.sessions_.$sessionId`                                                                                                                                                                       |
| Alerts & actions      | `alerts`, `alerts_.$alertId`, `actions`, `actions_.$actionId`                                                                                                                                                                      |
| Genetics / breeding   | `genetics`, `genetics.index`, `genetics.accessions.$id`, `genetics.batches.$id`, `genetics.health.$kind.$id`, `genetics.trace.$kind.$id`, `breeding`, `breeding_.new`, `breeding_.$programId`, `breeding_.log.new`, `grow-lineage` |
| Pheno hunts           | `pheno-hunts`, `pheno-hunts_.new`, `pheno-hunts_.$id.keepers`, `pheno-hunts_.$id.workspace`, `diary.pheno-expression-comparison`                                                                                                   |
| Reports & diary       | `reports`, `reports_.diary-range`, `reports_.post-grow.$growId`, `diary.environment-summary`, `diary.strains.$slug`                                                                                                                |
| Account               | `settings`, `settings_.analytics`, `settings_.agent-integrations`, `account.preferences`, `onboarding`, `invite`                                                                                                                   |

**Five `_app` routes are aliases, not pages.** They are real components rendering
`<RouteAliasRedirect>`, not config redirects, and `appRouteManifest.ts` classifies all five
as `access: "redirect"`. They are listed here rather than in the domain tables above,
because editing or testing them as if they were pages is wasted work — the surface lives at
the target:

| Alias route             | Redirects to |
| ----------------------- | ------------ |
| `_app/ai-doctor.tsx`    | `/doctor`    |
| `_app/action-queue.tsx` | `/actions`   |
| `_app/tasks.tsx`        | `/actions`   |
| `_app/logs.tsx`         | `/timeline`  |
| `_app/grow-room.tsx`    | `/`          |

### Operator routes (`src/routes/_app/_operator/*.tsx`, 38)

`admin.leads`, `leads`, `demo.one-tent-live-proof`, `diagnostics`, `diagnostics_.quicklog`,
`diagnostics-lighting-measurement`, `diagnostics-seo-artifacts`, `ingest-inspector`,
`internal.ai-doctor-confidence-audit`, `internal.ai-doctor-phase1-preview`,
`internal.one-tent-loop-proof`, `internal.sensor-truth-audit`, `one-tent-loop-proof`,
`operator.ai-doctor-phase1`, `operator.billing-entitlement-resolution`,
`operator.billing-subscription-updates`, `operator.credits-audit`, `operator.demo-preview`,
`operator.ecowitt`, `operator.ecowitt-bridge-debug`, `operator.ecowitt-bridge-status`,
`operator.ecowitt-live-bringup`, `operator.ecowitt-tent-preview`, `operator.edge-alerts`,
`operator.edge-metrics`, `operator.mode`, `operator.one-tent-live-proof`,
`operator.one-tent-loop-smoke-test`, `operator.one-tent-proof-record`,
`operator.paddle-processing-audit`, `operator.post-grow-reflection-dry-run`,
`operator.release-readiness`, `operator.schema-audit`, `operator.subscriber-growth`,
`operator.support-inbox`, `pi-ingest-status`, `sensors.ecowitt-audit`,
`sensors.ingest-normalizer`.

Gated by `RequireOperatorRole`, which resolves the server-side `has_role('operator')` RPC.
Route gating remains presentation-level; RLS is the authorization boundary.

---

## 2. One-Tent Loop module index

The canonical step list is **in code**, at `src/lib/oneTentLoopProofRules.ts`:

```ts
export const LOOP_STEP_IDS = [
  "grow",
  "tent",
  "plant",
  "quick-log",
  "timeline",
  "sensor-snapshot",
  "ai-doctor",
  "alert",
  "action-queue",
  "follow-up",
] as const;
```

Ten steps — note `follow-up`, which the informal "nine-step loop" phrasing omits. Step
statuses are `passed | needs_review | missing | blocked | stale | invalid | demo_only`.

| Step            | Route                                                 | Page                                                                                                      | Key `src/lib` modules                                                                                                                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grow            | `/grows`, `/grows/:growId`                            | `Grows.tsx`, `GrowDetail.tsx`                                                                             | `growRepo.ts`, `growAdapters.ts`, `growStatus.ts`, `growScopeAsyncStateRules.ts`; `src/store/grows.tsx`; hooks `useScopedGrow.ts`, `useGrowDetailData.ts`                                                                                                                                                                                   |
| Tent            | `/tents`, `/tents/:id`                                | `Tents.tsx`, `TentDetail.tsx`                                                                             | `tentManagementRules.ts`, `tentPlantRosterViewModel.ts`, `tentPlantTabsViewModel.ts`, `tentSensorChartRules.ts`, `tentHealthChip.ts`                                                                                                                                                                                                        |
| Plant           | `/plants`, `/plants/:id`                              | `Plants.tsx`, `PlantDetail.tsx`                                                                           | ~58 `plant*` modules — `plantDetailQuickActions.ts`, `plantDetailWhatsMissing.ts`, `plantMemoryEpisode{Rules,Service,ViewModel}.ts`, `plantDetailAiDoctorReadiness.ts`                                                                                                                                                                      |
| Quick Log       | modal in `AppShell`; public starter at `/quick-log`   | `QuickLog.tsx`, `QuickLogV2Sheet.tsx`, `QuickLogStarter.tsx`                                              | ~56 `quickLog*` root modules + `src/lib/quick-log/` (`createQuickLogEvent.ts`, `fetchLatestSensorSnapshot.ts`, `quickLogSensorSnapshotAcquisitionRules.ts`); hooks `useQuickLogV2Save.ts`, `useQuickLogActivitySave.ts`; `src/constants/quickLogEventTypes.ts`                                                                              |
| Timeline        | `/timeline?growId=`                                   | `Timeline.tsx`                                                                                            | 24 `timeline*` modules — `timelineMergeRules.ts`, `timelineEntryClassification.ts`, `timelineFilterViewModel.ts`, `timelineSensorSnapshotViewModel.ts`, `timelineDayGroupingViewModel.ts`; hook `useQuickLogGroupedTimeline.ts`                                                                                                             |
| Sensor Snapshot | `/sensors`                                            | `Sensors.tsx`                                                                                             | `sensorSnapshot.ts` (`SensorSnapshot`, `SnapshotSource`, `EMPTY_SNAPSHOT`, `STALE_THRESHOLD_MS`), `sensorSnapshotStatusContract.ts`, `sensor/sensorSnapshotFreshnessRules.ts`, `sensors/` (`calculateVPD.ts`, `normalizeSensorReading.ts`, `sensorSnapshotReadModel.ts`); hooks `useLatestSensorSnapshot.ts`, `useEcowittLatestSnapshot.ts` |
| AI Doctor       | `/doctor`, `/doctor/sessions`, `/doctor/sessions/:id` | `AiDoctorStart.tsx`, `AiDoctorSessionsIndex.tsx`, `AiDoctorSessionDetail.tsx`, `AiDoctorContextCheck.tsx` | ~84 `aiDoctor*` modules — `aiDoctorEngine.ts`, `aiDoctorContextCompiler.ts`, `aiDoctorPromptAssembly.ts`, `aiDoctorReviewResultContract.ts`, `aiDoctorSessionPersistence.ts`; hook `useAiDoctorLiveReview.ts` → edge fn `ai-doctor-review`                                                                                                  |
| Alert           | `/alerts`, `/alerts/:alertId`                         | `Alerts.tsx`, `AlertDetail.tsx`                                                                           | `environmentAlerts.ts` (`buildEnvironmentAlerts`, `AlertSeverity`), `alerts.ts`, `alertStatusTransitionRules.ts`, `alertWhyContext.ts`, `alertFreshnessContext.ts`, `environmentAlertPersistence.ts`; hooks `useAlertsList.ts`, `usePersistEnvironmentAlerts.ts`                                                                            |
| Action Queue    | `/actions`, `/actions/:actionId`                      | `ActionQueue.tsx`, `ActionDetail.tsx`                                                                     | 27 `actionQueue*` modules — `actionQueueTransitions.ts` (`ActionStatus`, `buildActionQueueTransitionRpcArgs`, `canApprove`, `canSimulate`, `TERMINAL_STATUSES`), `actionQueueCreateService.ts`, `alertToActionQueueRules.ts`, `actionQueueProvenanceRules.ts`                                                                               |
| Follow-up       | inline on action detail                               | `ActionFollowUpEvidence*.tsx`                                                                             | `actionFollowUpEvidence{Rules,Service,ViewModel}.ts`, `actionOutcomeAnalysisEngine.ts`, `actionResponseMemoryRules.ts`                                                                                                                                                                                                                      |

**Loop wiring and proof modules:** `oneTentLoopNavigationRules.ts` (per-step next CTA and
deep link), `oneTentLoopGapResolver.ts`, `oneTentLoopHandoffIds.ts`,
`oneTentLoopProofViewModel.ts`, `oneTentLiveProofViewModel.ts`. Proof pages:
`OneTentLoopProof.tsx`, `OneTentLiveProof.tsx`, `OneTentLoopLiveProof.tsx`,
`OneTentProofRecord.tsx`. E2E: `e2e/one-tent-loop-golden-path-ui.spec.ts`,
`e2e/one-tent-loop-proof-never-healthy.spec.ts`.

Safety invariant stated in `oneTentLoopProofRules.ts`: never classify missing, stale,
invalid, unknown or demo telemetry as healthy; Action Queue rows stay approval-required, and
any executable-device marker flips a row to `blocked`.

---

## 3. Edge functions (`supabase/functions/`, 34 + `_shared`)

| Domain                                    | Functions                                                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI                                        | `ai-coach`, `ai-doctor-review`, `ai-cultivar-qa`, `create-breeding-suggestions`                                                                                                                                |
| Entitlement checks (server-authoritative) | `premium-export-entitlement`, `live-sensor-entitlement`, `environment-summary-report-entitlement` — exactly these three                                                                                        |
| Payments                                  | `paddle-webhook`, `payments-webhook`, `paddle-portal-session`, `get-paddle-price`, `checkout-status`, `operator-credits-audit`, `founder-slots-remaining` (public slot counter — **never** grants entitlement) |
| Sensors / ingest                          | `ecowitt-ingest`, `ecowitt-real-ingest`, `pi-ingest-readings`, `sensor-ingest-webhook`, `mint-bridge-token`, `revoke-bridge-token`, `operator-ggs-real-payload-commit`                                         |
| Email                                     | `send-transactional-email`, `preview-transactional-email`, `process-email-queue`, `handle-email-suppression`, `handle-email-unsubscribe`, `auth-email-hook`                                                    |
| Ops / metrics                             | `edge-metrics-latest`, `edge-metrics-alert-check`, `rls-selftest`                                                                                                                                              |
| Account / growth                          | `delete-account`, `redeem-referral`, `save-founder-prefs`                                                                                                                                                      |
| Integrations                              | `mcp` (generated bundle — never hand-edit)                                                                                                                                                                     |

Called from the app with `supabase.functions.invoke(...)`, roughly 17 call sites, mostly in
hooks. Client-side entitlement reads are presentation-only; the `*-entitlement` functions are
the authoritative check, consumed via `usePremiumExportServerGate.ts`,
`useLiveSensorServerGate.ts`, `useEnvironmentSummaryReportServerGate.ts`.

**Edge functions may not import from `src/lib`.** Shared code is mirrored into
`supabase/functions/_shared`; `scripts/verify-edge-shared-in-sync.mjs` and
`scripts/check-no-src-lib-imports.mjs` run in `prebuild`, and
`Preflight — edge shared-lib mirror in sync` is a required CI check.

---

## 4. Entitlements API surface (`src/lib/entitlements/`)

Barrel `index.ts`, documented contract: **pure logic only — importers from this barrel must
remain free of React, Supabase and fetch.** The React read hook lives outside, at
`src/hooks/useMyEntitlements.ts`.

| File                      | Surface                                                                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                | `PlanId` = `free \| pro_monthly \| pro_annual \| craft_monthly \| craft_annual \| founder_lifetime`; `SubscriptionStatus`; `BillingProvider`; `BillingSubscriptionRow`; `Capabilities`; `ResolvedEntitlement`                       |
| `capabilities.ts`         | `FREE_CAPABILITIES` (frozen)                                                                                                                                                                                                        |
| `planCatalog.ts`          | `PLAN_CATALOG`, `KNOWN_PLAN_IDS`, `isKnownPlanId(value): value is PlanId`                                                                                                                                                           |
| `capabilityAccess.ts`     | `BooleanCapabilityKey`; `canUseCapability(entitlement, capability): boolean`                                                                                                                                                        |
| `resolveEntitlements.ts`  | `resolveEntitlements(row, now, opts?): ResolvedEntitlement`                                                                                                                                                                         |
| `unionEntitlements.ts`    | `pickStrongestBilling`, `resolveUnionEntitlements`, `pickEntitlingLovableRow`, `lovableRowEntitles`, `SUBSCRIPTION_ROW_SCAN_LIMIT = 20`                                                                                             |
| `lovablePaddleAdapter.ts` | `mapLovableSubscriptionRow`, `LovableSubscriptionRow`, `LovableBillingEnvironment`, `MapLovableOptions`                                                                                                                             |
| `freeTierGates.ts`        | `evaluateGrowCreationGate`, `evaluateVerifiedGrowCreationGate`, `evaluateTentCreationGate`, `evaluateVerifiedTentCreationGate`, `sensorHistoryWindowStartIso`, plus pinned copy constants and `FREE_TIER_UPGRADE_PATH = "/pricing"` |

`Capabilities` fields: `maxActiveGrows`, `aiCreditsPerGrow`, `aiMonthlyCredits`,
`liveSensors`, `advancedExports`, `multiTent`, `sensorHistoryDays`, `prioritySupport`,
`blueprint`.

Test-enforced invariants: `pro_monthly ≡ pro_annual`; `craft_monthly ≡ craft_annual`;
**`founder_lifetime.aiMonthlyCredits` is hard-pinned at 100 — never null, Infinity or
unlimited**; `blueprint` is Craft-exclusive plus Founder.

A separate, smaller flag layer is `src/lib/featureEntitlements.ts`
(`FeatureKey = "pheno_tracker" | "advanced_timeline_filters"`, `canUseFeature`,
`canReadExistingFeatureData`, `canWriteFeatureData`) — this is what `appRouteManifest`'s
`requiredFeature` refers to.

Never gate on `profiles.tier` (XP/gamification only) and never hardcode `plan === "pro"` in
JSX; use the capability helpers.

---

## 5. CI workflows (`.github/workflows/`, 86)

### The required set

Thirty-five contexts are required by ruleset 20421416 on `refs/heads/verdant-grow-diary`,
pinned in `config/required-status-checks.json`. **All 35 come from `ci.yml`:**

- `Full test suite (shard 1/32)` … `(shard 32/32)` — the `full-suite` matrix job
- `Lint, typecheck, test, build` — job `test`
- `Preflight — edge shared-lib mirror in sync` — job `edge-shared-sync-preflight`
- `test:legal-seo` — job `legal-seo`

`mustBeGreen` but **not** in the ruleset: `test:security-regression`. The config records
that it failed on the head of PR #769 and merged anyway — a documented enforcement hole.

### Governance and integrity gates

| Workflow                                                           | Purpose                                                                                            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `sentinel-version-parity`                                          | PARITY / MIRROR / BUMP across the twelve governance files                                          |
| `published-migration-integrity`                                    | SHA-256 diff of `supabase/migrations/**` against the base branch; edits to shipped migrations fail |
| `contract-test-resolution`                                         | Contract tests must assert resolved values, not source text                                        |
| `required-check-audit`                                             | Audits the pinned ruleset mirror against live check results                                        |
| `docs-safety`, `release-workbook-safety`, `stabilization-pr-scope` | Docs and scope guards                                                                              |
| `supabase-migrations-sync-check`, `edge-shared-sync`               | Repo ↔ backend sync                                                                                |

### Schema and money gates

`required-core-migrations`, `required-money-migrations`, `money-migration-drift-alert`,
`prefix-diff-sarif`, `ai-credit-service-contract-effect`, `verify-candidate-number-migration-status`,
`strain-reference-library-v1-gate`.

### Migration replay (PG15) and appliers

Replay gates: `action-queue-transition-forward-repair-pg15`,
`quicklog-corrections-retractions-pg15`, `quicklog-manual-delegate-forward-repair-pg15`,
`signup-acquisition-forward-repair-pg15`.

Seven `workflow_dispatch`-only appliers: `apply-pinned-production-migrations`,
`apply-action-queue-transition-forward-repair`, `apply-quicklog-corrections-retractions`,
`apply-quicklog-manual-delegate-forward-repair`, `apply-signup-acquisition-forward-repair`,
`apply-candidate-number-maintenance-migrations`, `apply-pinned-breeding-reconciliation`.

### Security

`security-db-local` (opt-in lane, spins a local Supabase and replays migrations into an
immutable workspace, then runs the individual RLS lanes), `security-regression`,
`dependency-security-ci`, `mcp-local-rls-integration`, `irrigation-pgtap-rls-gate`,
`irrigation-evidence-gate`, `sandbox-credit-packs-smoke`.

### Test runners

`ci`, `vitest-full-suite-pr-gate` (16-way batch matrix on every PR),
`vitest-batched-full-suite`, `vitest-controlled-full-suite`, `lint`, `typecheck`,
`typecheck-build-push`.

### Browser / E2E

`quicklog-smoke`, `quicklog-gate`, `auth-loading-smoke`, `google-analytics-e2e`,
`one-tent-loop-proof-never-healthy`, `one-tent-loop-smoke-test`,
`demo-proof-walkthrough-readonly`, `dispatch-history-e2e`, `symptom-check-branch-e2e`,
`genetics-traceability-smoke`, `irrigation-overflow-smoke`, `agent-integrations-smoke`,
`gamification-staging-smoke`, `pi-ingest-smoke`, `e2e-fixture-garden-rotation`,
the `ai-doctor-*` trio, the `pheno-*` set, `contextual-pheno-comparison-v0`.

### SEO / performance

`jsonld-rich-results`, `seo-parity-and-head-fidelity`, `sitemap-robots-parity`,
`seo-monitoring`, `lighthouse-ci`, `core-link-form-census`.

### Sensors / hardware

`ecowitt-bridge-cli-suite`, `ecowitt-config-validate-contract`, `ecowitt-only-safety-scan`,
`ecowitt-testbench-forwarding-tests`, `ecowitt-testbench-safety`, `ecowitt-windows-tooling`,
`sensor-ingest-webhook-edge-tests`.

### Scheduled probes and release

`migration-drift-probe` (daily; exits 2 — never 0 — when it cannot reach the database, and
opens a tracking issue on drift), `datadog-synthetics`, `auto-tag-release`,
`release-receipt-ci`, `merge-queue-snapshot`, `deployment-preview`,
`paddle-craft-catalog-preflight`, `paddle-preflight-renderer-tests`,
`cursor-sdk-local-orchestration`.

---

## 6. Script index (`scripts/`, 236 entries)

`package.json` carries **320** scripts. By prefix: `test:*` 147 · `e2e:*` 26 · `check:*` 22 ·
unprefixed 15 · `sb:*` 13 · `dev:*` 12 · `docs:*` 11 · `verify:*` 10 · `release:*` 9 ·
`prefix-diff:*` 6 · `release-receipt:*` 5 · `money-migrations:*` 4, then ~20 small prefixes.

### Governance and integrity

```bash
node scripts/check-sentinel-version-parity.mjs [base-ref]   # SENTINEL_BASE_SHA also accepted
node scripts/sync-sentinel-mirror.mjs --set-version=YYYY-MM-DD.N   # the fixer
node scripts/sync-sentinel-mirror.mjs --check                      # drift report, no writes
bun run test:sentinel-governance                                   # the checker's own tests
node scripts/verify-published-migration-integrity.mjs --baseline="origin/<base>" [--json]
bun run verify:contract-test-resolution
node scripts/assert-docs-safety.mjs
```

### Release provenance

```bash
node scripts/resolve-release-provenance.mjs --hash=<64-hex> [--scan=N] [--ref=origin/verdant-grow-diary]
```

Read-only, no network. Maps a `treeHash` from `/version.json` back to commits. Runbook:
[`docs/release-provenance-runbook.md`](release-provenance-runbook.md).

### Security / RLS harnesses

Aliased: `test:security-db-local` (umbrella, chains 13 sub-lanes),
`test:staff-role-rls-harness`, `test:restricted-role`, `test:ai-doctor-sessions-rls`,
`test:genetics-propagation-rls`, `test:irrigation-evidence-rls`,
`test:sensor-readings-source-rls`, `test:vpd-calibration-provenance-rls`,
`test:subscriber-interest-db-security`, `test:public-support-forms-db-security`,
`test:db:quicklog-rpc-runtime`, `test:mcp:rls:local`.

**No package alias — invoke directly:**

```bash
bun run scripts/run-ai-credits-rls-harness.ts
bun run scripts/run-ai-credit-pack-portability-harness.ts
bun run scripts/run-ai-credit-grow-scope-integrity-harness.ts
```

`--confirm-local-security-lane` is a recurring safety opt-in on harnesses that touch a
live-ish database. The restricted-role harness refuses a non-loopback `SUPABASE_DB_URL` and
has no remote opt-in flag by design.

### Other frequently used

`run-vitest-batches.mjs`, `vitest-controlled/cli.mjs {run,resume,rerun-failed}`,
`check-bun-lockfile-policy.mjs`, `check-dependency-security.mjs`, `stamp-version.mjs`,
`sync-edge-shared.mjs`, `audit-required-checks.mjs`, `probe-migration-drift.mjs`,
`assert-required-{core,money}-migrations{,-applied}.mjs`,
`check-edge-function-domain-reach.mjs`.

---

## 7. Supabase layout

```text
supabase/
├── config.toml
├── seed.sql
├── migrations/           272 .sql
├── functions/            34 edge functions + _shared/
├── contract-migrations/  2 (applied outside the normal chain)
└── tests/                9 pgTAP-style .sql
```

**Migration filenames are always `<14-digit UTC timestamp>_<slug>.sql`**, in exactly two slug
flavours:

- **157 Lovable auto-exports** — UUID slug, e.g. `20260721182752_4fc51714-bc29-…sql`
- **115 hand-authored** — snake_case description, e.g.
  `20260815054529_restrict_pgmq_email_wrappers_to_service_role.sql`

Both conventions coexist in the production ledger, and Lovable records its migrations under a
version a couple of seconds _later_ than the filename timestamp, carrying the filename stem in
the `name` column. Any ledger reconciliation must match by name-or-version, never by a
tolerance window — the repo contains migrations one second apart
(`20260806230020_…` / `20260806230021_…`), so a window reports an unapplied migration as
applied. See `docs/agents/CURRENT_STATE.md` for the current state of that measurement.

**Replay compatibility:** `config/local-supabase-replay-compatibility.json` declares, per
file, either a `compatibility_noops` entry (a later export duplicating an earlier change) or a
`compatibility_patches` entry. The preparer verifies each `source_sha256` and rewrites only a
copy inside a disposable workdir, so the committed migration is never modified and the
integrity gate stays green. Check this file **before** proposing any migration correction.
Exercised by `bun run test:local-supabase-replay`.

`Makefile` wraps the Supabase CLI (`make help`, `link`, `pull`, `push`, `diff`, `types`,
`reset`, `verify`), mirrored by the `sb:*` npm scripts.

---

## 8. Environment and secrets

| File               | Keys                                                                                                                                                                                                   | Nature                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `.env` (committed) | `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY` | Public client config; the publishable keys are JWT-shaped anon keys, public by design. No service-role key is present |
| `.env.development` | `VITE_PAYMENTS_CLIENT_TOKEN`                                                                                                                                                                           | Paddle sandbox client token                                                                                           |
| `.env.production`  | `VITE_PAYMENTS_CLIENT_TOKEN`                                                                                                                                                                           | Live client-side Paddle token — browser-side by design, but do not echo it                                            |
| `.env.example`     | 9 placeholders                                                                                                                                                                                         | Advertises five `VITE_PADDLE_*` names that are **not** present in the real env files                                  |

Server-side secrets (`SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `E2E_TEST_EMAIL`,
`E2E_TEST_PASSWORD`) never live in these files — they come from GitHub environment secrets or
the operator's shell, and must never enter an agent session.
`scripts/assert-client-secret-boundary.mjs` (`bun run check:client-secret-boundary-ci`) scans
for client-side leakage.

---

## 9. Observations worth knowing

Recorded as `established fact` about the tree, not as defects anyone has been assigned:

- **`src/pages/Coach.tsx` (≈782 lines) has no route referencing it.** It calls the `ai-coach`
  edge function and appears orphaned after the TanStack migration. Do not assume it is live;
  do not delete it as part of unrelated work.
- **`docs/architecture.md` is partly pre-migration** — it describes react-router-style route
  mounting and "the AI Coach" as the AI layer. Its product-layer, RLS-ownership and Action
  Queue sections remain accurate and useful.
- **Two `*Rules.ts` modules import Supabase**, breaking the purity contract:
  `sensorIngestNormalizationRules.ts`, `sensorWebhookIngestRules.ts`.
- **38 of 492 components and 33 of 139 pages import `@/integrations/supabase/client`
  directly** rather than going through a hook.
- **`src/lib/*Advisor.ts` has zero files**, though the architecture table once named it as a
  layer. The nearest names are `manualSensorSnapshotAdvisorRules.ts` and
  `genetics/breedingActionAdvisor.ts`.
- **Seven hooks keep kebab-case legacy names** (`use-plants.ts`, `use-tents.ts`,
  `use-toast.ts`, `use-mobile.tsx`, `use-diary-entries.ts`, `use-sensor-readings.ts`,
  `use-ai-doctor-sessions.ts`) against a `useThing.ts` convention everywhere else.
- **`package.json` still carries the scaffold name** `vite_react_shadcn_ts` at version `0.0.0`,
  and declares no `packageManager` or `engines` field, though Bun is canonical.

---

## Related documents

- [`/CLAUDE.md`](../CLAUDE.md) — the orientation this file backs
- [`/AGENTS.md`](../AGENTS.md) — safety, architecture and status-vocabulary rules
- [`/README.md`](../README.md) — setup, env vars, deployment, validation
- [`docs/architecture.md`](architecture.md) — product layers and data ownership
- [`docs/agents/CURRENT_STATE.md`](agents/CURRENT_STATE.md) — the changing shift report
- [`docs/agents/single-builder-workflow.md`](agents/single-builder-workflow.md) — slice loop and PR contract
- [`docs/agents/merge-queue.md`](agents/merge-queue.md) — merge path and required checks
- [`.claude/skills/run-verdant-grow-diary/SKILL.md`](../.claude/skills/run-verdant-grow-diary/SKILL.md) — running the app
