# Phase 1 Slice 1 Reconciliation: Quick Log Target Integrity

## Promotion status

**Implementation status:** ready for review on the current deploy-trunk port.

**Merge status:** not ready. Claude review, authenticated Chrome execution against the dedicated disposable fixture, fixture verification/smoke, and the scanner timing gate remain pending. No exception, threshold change, workflow broadening, or scanner suppression has been added for those gates.

## Scope and current ground truth

- Charter outcome: **T1 — Quick Log target integrity**.
- Deploy-trunk base: `ed3790cb8e6534d161968b6769a7fafe24aaefd1` (`origin/verdant-grow-diary`).
- Port head inspected before this documentation repair: `e1e41b99d0351476215ad026e0f9648ce24c5a4e`.
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

| Entry point / invariant                                                                               | Current result                                                            | Rerun evidence                                                                                                                |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Plant Detail `plant-detail-quick-action-quicklog` opens its exact routed plant                        | Pass in deterministic contract; authenticated Chrome execution pending    | `quicklog-route-contract-static.test.ts`, `quicklog-target-contract.test.tsx`                                                 |
| Plant Detail One-Tent Loop `Add quick log` opens its exact grow/tent/plant                            | Pass                                                                      | `one-tent-loop-navigation-rules.test.ts`, `one-tent-loop-next-step-card.test.tsx`, `plant-detail-one-tent-loop-card.test.tsx` |
| Existing complete `PlantQuickLogPrefill` dispatchers retain the exact tuple                           | Pass                                                                      | `quicklog-target-contract.test.tsx`, `quicklog-prefill-safety.test.tsx`                                                       |
| The target card and `quicklog_save_manual.p_target_id` use one captured target                        | Pass in deterministic contract; authenticated request observation pending | `quicklog-target-contract.test.tsx`                                                                                           |
| Missing, unknown, inactive, merged, unassigned, or contradictory targets fail closed with zero writes | Pass                                                                      | `quick-log-target-integrity-rules.test.ts`, `quicklog-target-contract.test.tsx`                                               |
| Global launchers without route context invent no plant                                                | Pass                                                                      | `quicklog-prefill-safety.test.tsx`                                                                                            |
| `/logs` preserves raw query/hash while redirecting to `/timeline`                                     | Pass                                                                      | `route-alias-preservation.test.tsx`, route-manifest tests                                                                     |
| `/dashboard` remains an authenticated Dashboard alias                                                 | Pass                                                                      | `app-route-manifest.test.ts`, `route-manifest-sync.test.ts`, `dashboard-grow-scope.test.ts`                                   |

Deterministic result: **3/3 enumerated route-scoped entry-point classes pass, and 0 tested save paths can submit a plant ID different from the displayed resolved target.** Promotion-level evidence remains incomplete until the authenticated disposable-fixture Chrome smoke executes successfully.

## Implementation notes

1. `quickLogTargetIntegrityRules.ts` owns pure, typed, null-safe prefill and write resolution.
2. `QuickLog.tsx` derives one immutable canonical target and uses it for the target card, sensor context, RPC payload, stage writeback, receipt, last-target memory, and refresh.
3. Invalid legacy relationships are not inferred from the active workspace; Save fails closed with calm repair guidance.
4. The One-Tent Loop plant step dispatches exactly one existing Quick Log prefill event and performs no navigation or write itself.
5. The `/logs` alias uses a presenter-only redirect backed by a pure raw search/hash preservation rule.
6. The authenticated smoke installs its request observer before navigation and retains only `p_target_id`; it does not retain request bodies, headers, credentials, or raw grower content.
7. `quicklog_save_manual` remains the only Quick Log persistence seam.

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

## Validation rerun on this port

| Gate                                       | Current result                                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Requested targeted slice                   | **Pass — 16 files, 189/189 tests, 0 failures**                                                                        |
| Type-check                                 | **Pass — 0 diagnostics** (`tsc -p tsconfig.app.json --noEmit`)                                                        |
| Replay diff whitespace/error check         | **Pass** (`git diff --check ed3790cb8..HEAD`)                                                                         |
| Full suite                                 | **Not rerun on this port**                                                                                            |
| Separate static-safety matrix              | **Not rerun on this port**                                                                                            |
| Scanner assertion matrix                   | **Not rerun on this port**                                                                                            |
| Scanner CI timing wrapper                  | **Not rerun; remains a promotion gate**                                                                               |
| Playwright discovery / E2E TypeScript      | **Not rerun on this port**                                                                                            |
| Fixture checklist and fixture verification | **Not rerun; remain pending**                                                                                         |
| Authenticated Chrome smoke                 | **Not run; remains pending and must use the dedicated disposable fixture**                                            |
| Runtime DB/RLS harness                     | Not applicable to this no-schema/no-RLS/no-server-mutation slice                                                      |
| `test:security-db-local`                   | **No action** — documented opt-in infrastructure lane, unrelated to this diff, non-gating under the baseline standard |

The targeted Vitest run emitted only known non-failing React Router v7 future-flag notices and Radix Dialog `Description`/`aria-describedby` warnings. No test failed and type-check emitted no warning or diagnostic.

The old branch's full-suite totals, scanner timings, Playwright discovery, E2E compilation, fixture-checklist result, and deployment-base classifications are intentionally not carried forward as current evidence because they were not rerun against `ed3790cb8`.

## Current pending gates

1. Run fixture checklist and verification against the dedicated disposable fixture without weakening Tent + Plant requirements or making Grow mandatory.
2. Run the authenticated Quick Log Chrome smoke and confirm the displayed target equals the observed `quicklog_save_manual.p_target_id`.
3. Run the scanner assertion/timing gates without changing thresholds, allow-lists, ignores, or suppressions.
4. Complete Claude review and reconcile every finding or obtain explicit user acceptance.
5. Reconcile the goal charter and P0/P1 companion map when supplied as repository files with a commit SHA.

## Safety verdict

- A resolved target is immutable for the duration of a save and is reused after the await boundary.
- No unknown or contradictory target is shown as ready.
- No schema, RLS, service-role, bridge-token, device-control, relay, Action Queue, Edge Function, billing, entitlement, or Founder backfill seam was added.
- No fake live or sensor state was introduced.
- `cure` / `curing` stage compatibility and the canonical sensor source vocabulary remain unchanged.
- Current deploy routing and auth/capability gates are preserved, including authenticated `/dashboard` behavior.
- No scanner suppression or workflow-policy broadening was added.

**Safety verdict: safe for draft review; not yet safe to merge because authenticated Chrome/fixture proof, scanner timing, and Claude review are incomplete.**

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
- [ ] Disposable fixture checklist and verification green.
- [ ] Authenticated Chrome smoke green.
- [ ] Scanner assertions and CI timing wrapper green on this port.
- [ ] Claude review attached and reconciled.
- [ ] Goal charter and P0/P1 map reconciled by supplied commit SHA.
