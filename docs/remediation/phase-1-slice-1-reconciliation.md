# Phase 1 Slice 1 Reconciliation: Quick Log Target Integrity

## Promotion status

**Implementation status:** specification-review findings repaired and ready for re-review on the current deploy-trunk port.

**Merge status:** not ready. Specification re-review, authenticated Chrome execution against the dedicated disposable fixture, fixture verification/smoke, and the scanner timing gate remain pending. No exception, threshold change, workflow broadening, or scanner suppression has been added for those gates.

## Scope and current ground truth

- Charter outcome: **T1 — Quick Log target integrity**.
- Deploy-trunk base: `ed3790cb8e6534d161968b6769a7fafe24aaefd1` (`origin/verdant-grow-diary`).
- Specification-repair base: `fcb3c7b2837db0b6e86ad437070569234e10409f`.
- Branch: `codex/verdant-trust-core-target-integrity`.
- Deployment source of truth: `verdant-grow-diary`, not undeployed `main`.
- `/dashboard` intentionally remains an authenticated Dashboard alias rendered inside `AppShell`; it is not a redirect and its optional `growId` scope is preserved.
- `/logs` is the only route behavior changed by this port: it redirects to `/timeline` while preserving the incoming raw query and hash.
- Existing inactive-plant ownership is reused through `isInactiveQuickLogPlant`; no parallel archived/merged predicate was introduced.
- `cure` and `curing` still normalize to `drying`.
- Canonical sensor-source vocabulary is unchanged.
- Entitlement lane direction, provenance, and Founder backfill are unchanged.

This slice deliberately changes no schema, RLS policy, Edge Function, billing or entitlement rule, Founder provenance/backfill, sensor enum, device-control surface, Action Queue behavior, or persistence seam.

## T1 outcome reconciliation

T1 requires every enumerated route-scoped entry point to open the exact grow/tent/plant target and requires zero save paths where the displayed target can differ from the RPC target.

| Entry point / invariant                                                                                                | Current result                                                            | Rerun evidence                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Plant Detail `plant-detail-quick-action-quicklog` opens its exact routed plant                                         | Pass in deterministic contract; authenticated Chrome execution pending    | `quicklog-route-contract-static.test.ts`, `quicklog-target-contract.test.tsx`                                                 |
| Plant Detail One-Tent Loop `Add quick log` opens its exact grow/tent/plant                                             | Pass                                                                      | `one-tent-loop-navigation-rules.test.ts`, `one-tent-loop-next-step-card.test.tsx`, `plant-detail-one-tent-loop-card.test.tsx` |
| Existing complete `PlantQuickLogPrefill` dispatchers retain the exact tuple                                            | Pass                                                                      | `quicklog-target-contract.test.tsx`, `quicklog-prefill-safety.test.tsx`                                                       |
| The target card and `quicklog_save_manual.p_target_id` use one captured target, including across an in-flight await    | Pass in deterministic contract; authenticated request observation pending | `quicklog-target-contract.test.tsx`                                                                                           |
| Missing, unknown, inactive, merged, unassigned, or contradictory targets hold with exact calm guidance and zero writes | Pass                                                                      | `quick-log-target-integrity-rules.test.ts`, `quicklog-target-contract.test.tsx`, `quicklog-prefill-safety.test.tsx`           |
| Global launchers without route context invent no remembered or sole plant                                              | Pass                                                                      | `quicklog-plant-default.test.tsx`, `quickLogPlantDefault.test.ts`, `quicklog-prefill-safety.test.tsx`                         |
| Plant Detail named Quick Log, Upload Photo, and Harvest require a complete plant/grow/tent prefill                     | Pass                                                                      | `plant-detail-quick-actions.test.tsx`, `plant-detail-quicklog-handoff.test.ts`                                                |
| Smoke target transition stays inside the routed plant's grow and matches the exact accessible name                     | Pass in deterministic/static contract; authenticated execution pending    | `quicklog-e2e-fixture-safety.test.ts`, `quicklog-smoke.spec.ts`                                                               |
| `/logs` preserves raw query/hash while redirecting to `/timeline`                                                      | Pass                                                                      | `route-alias-preservation.test.tsx`, route-manifest tests                                                                     |
| `/dashboard` remains an authenticated Dashboard alias                                                                  | Pass                                                                      | `app-route-manifest.test.ts`, `route-manifest-sync.test.ts`, `dashboard-grow-scope.test.ts`                                   |

Deterministic result: **3/3 enumerated route-scoped entry-point classes pass, and 0 tested save paths can submit a plant ID different from the displayed resolved target.** Promotion-level evidence remains incomplete until the authenticated disposable-fixture Chrome smoke executes successfully.

## Implementation notes

1. `quickLogTargetIntegrityRules.ts` owns pure, typed, null-safe prefill, editor-hold, and write resolution.
2. A named invalid prefill overrides any unrelated selected target until the grower explicitly chooses a valid target; a new valid prefill replaces the hold exactly.
3. Global and grow-only launchers start in manual-selection mode. Last-target history may still be recorded after a successful save, but it is never read to auto-select a plant, and a sole plant is never inferred.
4. `QuickLog.tsx` captures one immutable canonical target, grow, event, and stage before the first await and freezes target and stage controls while the save is in flight. The captured context drives the target card, sensor context, RPC payload, stage writeback, receipt, last-target memory, and refresh.
5. Named-prefill plant/tent queries fail closed while loading or errored. Loading copy never claims not-found, query errors expose a calm retry, and retry invokes only the failed query.
6. Plant Detail named Quick Log, Upload Photo, and Harvest reuse `buildPlantQuickLogPrefill` and remain disabled when plant, grow, or tent context is incomplete; disabled clicks dispatch no event.
7. The smoke's second target uses `E2E_GROW_1_SECOND_PLANT_NAME` (safe default `E2E Test Plant 2`), selects by exact accessible name without regex interpretation, and asserts that its grow remains the routed plant's grow. No Grow fixture name became required.
8. Workflow summary copy now puts Tent + Plant in the required section and Grow in the optional section. Workflow triggers and permissions are unchanged.
9. The One-Tent Loop plant step dispatches exactly one existing Quick Log prefill event and performs no navigation or write itself.
10. The `/logs` alias uses a presenter-only redirect backed by a pure raw search/hash preservation rule.
11. The authenticated smoke installs its request observer before navigation and retains only `p_target_id`; it does not retain request bodies, headers, credentials, or raw grower content.
12. `quicklog_save_manual` remains the only Quick Log persistence seam. No Action Queue or device-control write was added.

## Replayed commit sequence

- `e8bb1f1cd` — Trust Core redesign specification
- `e40b83b97` — T1 implementation plan
- `602e28c9d` — pure target-integrity rules
- `aaf3c2cdd` — Quick Log canonical display/write target
- `4ece7e162` — exact One-Tent Loop Quick Log handoff
- `834c929b6` — scope-preserving `/logs` route alias
- `16e5e2b23` — authenticated route-target gate
- `530a4e7b2` — legacy Quick Log target-fixture alignment
- `0f08a90d5` — legacy save and alias-contract alignment
- `ef4200bd1` — exact refresh-target contract alignment
- `e1e41b99d` — initial reconciliation packet replay
- `fcb3c7b28` — target-integrity port evidence refresh
- `d5de062cc` — blocked-target integrity repair
- `1ebba5b26` — canonical target display repair
- `4bdbd1263` — in-flight target, query-state, handoff, and exact-name repair

## Validation rerun on this port

| Gate                                  | Current result                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Requested targeted slice              | **Pass — 16 files, 203/203 tests, 0 failures**                                                                        |
| Repair-focused changed-test batch     | **Pass — 8 files, 151/151 tests, 0 failures**                                                                         |
| All changed test files                | **Pass — 10 files, 215/215 tests, 0 failures**                                                                        |
| Type-check                            | **Pass — 0 diagnostics** (`tsc -p tsconfig.app.json --noEmit`)                                                        |
| Working diff whitespace/error check   | **Pass** (`git diff --check`)                                                                                         |
| Full suite                            | **Not rerun on this port**                                                                                            |
| Separate static-safety matrix         | **Not rerun on this port**                                                                                            |
| Scanner assertion matrix              | **Not rerun on this port**                                                                                            |
| Scanner CI timing wrapper             | **Not rerun; remains a promotion gate**                                                                               |
| Playwright discovery / E2E TypeScript | **Pass — 3 tests listed across setup, authenticated, and mocked projects; no browser execution**                      |
| Fixture checklist                     | **Pass — required Tent + Plant names and optional Grow/second-plant vars printed without values**                     |
| Fixture verification                  | **Not run; remains pending against the dedicated disposable fixture**                                                 |
| Authenticated Chrome smoke            | **Not run; remains pending and must use the dedicated disposable fixture**                                            |
| Runtime DB/RLS harness                | Not applicable to this no-schema/no-RLS/no-server-mutation slice                                                      |
| `test:security-db-local`              | **No action** — documented opt-in infrastructure lane, unrelated to this diff, non-gating under the baseline standard |

The requested targeted slice emitted only known non-failing React Router v7 future-flag notices and Radix Dialog `Description`/`aria-describedby` warnings. No targeted test failed and type-check emitted no warning or diagnostic.

The exact all-changed-test-file batch is currently green at 215/215. No workflow safety parser, threshold, or scope fence was weakened to obtain this result.

The old branch's full-suite totals, scanner timings, Playwright discovery, E2E compilation, fixture-checklist result, and deployment-base classifications are intentionally not carried forward as current evidence because they were not rerun against `ed3790cb8`.

## Current pending gates

1. Run fixture verification against the dedicated disposable fixture without weakening Tent + Plant requirements or making Grow mandatory. The non-writing checklist has passed locally.
2. Run the authenticated Quick Log Chrome smoke and confirm the displayed target equals the observed `quicklog_save_manual.p_target_id`.
3. Run the scanner assertion/timing gates without changing thresholds, allow-lists, ignores, or suppressions.
4. Complete specification re-review and reconcile every finding or obtain explicit user acceptance.
5. Reconcile the goal charter and P0/P1 companion map when supplied as repository files with a commit SHA.

## Safety verdict

- A resolved target is immutable for the duration of a save and is reused after the await boundary.
- Named prefill query loading and errors remain unresolved rather than being misreported as not-found, and retries are limited to failed queries.
- All three Plant Detail named handoffs fail closed unless the full grow/tent/plant tuple exists.
- Fixture names containing regular-expression metacharacters are matched as exact accessible names.
- No unknown or contradictory target is shown as ready.
- No schema, RLS, service-role, bridge-token, device-control, relay, Action Queue, Edge Function, billing, entitlement, or Founder backfill seam was added.
- No fake live or sensor state was introduced.
- `cure` / `curing` stage compatibility and the canonical sensor source vocabulary remain unchanged.
- Current deploy routing and auth/capability gates are preserved, including authenticated `/dashboard` behavior.
- No scanner suppression or workflow-policy broadening was added.
- Workflow permissions and triggers are unchanged; Grow remains optional while Tent + Plant remain required.
- No automatic Action Queue write, AI mutation, diary write outside explicit Quick Log save, or device-control seam was added.

**Safety verdict: safe for draft re-review; not yet safe to merge because authenticated Chrome/fixture proof, scanner timing, and specification re-review are incomplete.**

## Deferred outcomes and work

- T2–T21 remain outside this T1 slice.
- Sensor truth expansion, stage gating beyond compatibility preservation, entitlement capability repair, async semantic cleanup, and mobile overflow remain later Trust Core slices.
- Sentry setup is separate and is not included here.
- The authenticated smoke must run only against the dedicated disposable fixture account.

## Risk and rollback

Primary behavioral risk: legacy plants or tents with missing or contradictory ownership can no longer save through Quick Log until assignment is repaired. This is intentional fail-closed behavior, but support copy and migration work may be needed in a later slice.

Rollback uses `git revert` on the smallest relevant commit. Do not reset shared history. No data rollback is required because no migration or row backfill exists in this slice.

## Promotion checklist

- [x] Deterministic T1 target/display/RPC contract green on the current port.
- [x] Current-port type-check green.
- [x] No schema/RLS/entitlement/device/secret/queue expansion.
- [x] No scanner suppression added.
- [x] Authenticated `/dashboard` alias and scope-preserving `/logs` redirect preserved.
- [x] Named blocked prefills hold with zero writes until explicit grower action or a new valid prefill.
- [x] Global launchers require manual plant selection; remembered and sole-plant fallbacks are removed.
- [x] Plant Detail named Quick Log, Upload Photo, and Harvest require complete plant/grow/tent context.
- [x] Smoke second-target fixture is same-grow and Grow fixture naming remains optional.
- [x] Non-writing disposable fixture checklist output confirmed.
- [ ] Disposable fixture verification green.
- [ ] Authenticated Chrome smoke green.
- [ ] Scanner assertions and CI timing wrapper green on this port.
- [ ] Specification re-review attached and reconciled.
- [ ] Goal charter and P0/P1 map reconciled by supplied commit SHA.
