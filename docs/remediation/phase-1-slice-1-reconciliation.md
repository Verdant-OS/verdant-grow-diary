# Phase 1 Slice 1 Reconciliation: Quick Log Target Integrity

## Promotion status

**Implementation status:** the reviewed T1 chain is ported onto the current deploy source of truth, deploy overlap is reconciled, and deterministic validation is green.

**Merge status:** ready for specification re-review, but not ready to merge. Authenticated Chrome execution against the dedicated disposable fixture, fixture verification, and independent Claude review remain pending. No threshold change, workflow broadening, scanner suppression, or safety exception was added.

## Scope and current ground truth

- Charter outcome: **T1 — Quick Log target integrity**.
- Current deploy base: `a1421adb3dedd59282f736c846b5bccb3392ad76` (`origin/verdant-grow-diary`).
- Reviewed implementation head: `4bdbd1263`.
- Reviewed documentation head: `c9b8fea5f`.
- Current port branch: `codex/verdant-trust-core-target-integrity-current`.
- Current validated code/test head before this reconciliation update: `994392757`.
- Deployment source of truth: `verdant-grow-diary`, not undeployed `main`.
- `/dashboard` remains an authenticated Dashboard alias rendered inside `AppShell`; it is not a redirect and preserves optional `growId` scope.
- `/logs` redirects to `/timeline` while preserving the incoming raw query and hash.
- Existing inactive-plant ownership is reused through `isInactiveQuickLogPlant`; no parallel archived/merged predicate was introduced.
- `cure` and `curing` normalize to `drying`.
- Canonical sensor-source vocabulary is unchanged.

This slice changes no schema, RLS policy, Edge Function, billing or entitlement rule, Founder provenance/backfill, sensor enum, device-control surface, Action Queue behavior, or persistence seam.

## Deploy-overlap audit

Deploy PR #343 added a Plant Detail One-Tent Loop callback that opened the local `PlantQuickLog` sheet. That sheet writes directly to `diary_entries`, so it does not satisfy the reviewed T1 contract that one frozen canonical target flow through `quicklog_save_manual`.

The port therefore resolves only that overlapping launcher in favor of the reviewed canonical `PlantQuickLogPrefill` event. The CTA dispatches one complete grow/tent/plant tuple, performs no navigation or write itself, and leaves the legacy sheet closed. Other deploy-base `PlantQuickLog` launchers and their behavior remain intact. A deploy-drift regression test proves the exact event payload and the absence of navigation/local-sheet activation.

## T1 outcome reconciliation

T1 requires every enumerated route-scoped entry point to open the exact grow/tent/plant target and requires zero save paths where the displayed target can differ from the RPC target.

| Entry point / invariant                                                                                                                      | Current result                                                            | Rerun evidence                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Plant Detail `plant-detail-quick-action-quicklog` opens its exact routed plant                                                               | Pass in deterministic contract; authenticated Chrome execution pending    | `quicklog-route-contract-static.test.ts`, `quicklog-target-contract.test.tsx`                                                              |
| Plant Detail One-Tent Loop `Add quick log` dispatches exactly `{ plantId, plantName, growId, tentId, tentName, eventType, suggestSnapshot }` | Pass                                                                      | `plant-detail-one-tent-loop-quick-log-handoff.test.tsx`, `one-tent-loop-navigation-rules.test.ts`, `one-tent-loop-next-step-card.test.tsx` |
| Existing complete `PlantQuickLogPrefill` dispatchers retain the exact tuple                                                                  | Pass                                                                      | `quicklog-target-contract.test.tsx`, `quicklog-prefill-safety.test.tsx`                                                                    |
| The target card and `quicklog_save_manual.p_target_id` use one target captured before the first await                                        | Pass in deterministic contract; authenticated request observation pending | `quicklog-target-contract.test.tsx`                                                                                                        |
| Parent and all-activities child saves share one synchronous guard, mutually exclude, and preserve the child target through confirmation      | Pass                                                                      | `quicklog-shared-in-flight-coordination.test.tsx`                                                                                          |
| Missing, loading, errored, unknown, inactive, merged, unassigned, or contradictory named targets hold with calm guidance and zero writes     | Pass                                                                      | `quick-log-target-integrity-rules.test.ts`, `quicklog-target-contract.test.tsx`, `quicklog-prefill-safety.test.tsx`                        |
| Global launchers invent no remembered or sole plant                                                                                          | Pass                                                                      | `quicklog-plant-default.test.tsx`, `quickLogPlantDefault.test.ts`, `quicklog-prefill-safety.test.tsx`                                      |
| Successful saves may remember the written target, but no read path infers a future target                                                    | Pass                                                                      | `quicklog-target-contract.test.tsx`, `quicklog-starter-handoff-consume.test.tsx`                                                           |
| Plant Detail named Quick Log, Upload Photo, and Harvest require a complete plant/grow/tent prefill                                           | Pass                                                                      | `plant-detail-quick-actions.test.tsx`, `plant-detail-quicklog-handoff.test.ts`                                                             |
| `cure` and `curing` remain compatible with the `drying` domain value and Drying / Curing label                                               | Pass                                                                      | `quick-log-stage-default-wiring.test.tsx`, stage rule tests                                                                                |
| Smoke target transition stays in the routed grow and matches the literal bare name or exact rendered `name · strain`, never a prefix         | Pass in deterministic/static contract; authenticated execution pending    | `quicklog-target-contract.test.tsx`, `quicklog-e2e-fixture-safety.test.ts`, `quicklog-smoke.spec.ts`                                       |
| Tent + Plant remain required while Grow and the second plant remain optional                                                                 | Pass                                                                      | `quicklog-e2e-bootstrap-safety.test.ts`, `quicklog-e2e-ci-surface.test.ts`, fixture checklist                                              |
| `/logs` preserves raw query/hash and `/dashboard` preserves authenticated alias behavior                                                     | Pass                                                                      | route-alias, manifest, Dashboard scope, and Logs filter tests                                                                              |

Deterministic result: **3/3 enumerated route-scoped entry-point classes pass, and 0 tested save paths can submit a plant ID different from the displayed resolved target.** Promotion-level evidence remains incomplete until the authenticated disposable-fixture Chrome smoke executes successfully.

## Implementation notes

1. `quickLogTargetIntegrityRules.ts` owns pure, typed, null-safe prefill, editor-hold, and write resolution.
2. A named invalid prefill overrides any unrelated selected target until the grower explicitly chooses a valid target; a new valid prefill replaces the hold exactly.
3. Global and grow-only launchers start in manual-selection mode. Last-target history is recorded only after a successful save and is never read to auto-select; a sole plant is never inferred.
4. `QuickLog.tsx` captures one immutable canonical target, grow, event, and stage before the first await and freezes target/stage controls while saving. The parent and all-activities child share one synchronous ref guard plus presenter state, so neither save can start while the other is pending, close and target selectors stay locked, and the child's captured target drives its request and confirmation until release on success or failure.
5. Named-prefill plant/tent queries fail closed while loading or errored. Loading never claims not-found, errors expose a calm retry, and retry invokes only the failed query.
6. Plant Detail named Quick Log, Upload Photo, and Harvest reuse `buildPlantQuickLogPrefill` and dispatch nothing when plant, grow, or tent context is incomplete.
7. The smoke's second target uses `E2E_GROW_1_SECOND_PLANT_NAME`, selects with an escaped anchored matcher that accepts the literal bare name or exact rendered `name · strain` and rejects prefix collisions, and asserts that its grow remains the routed grow. No Grow fixture name became required.
8. Workflow summary copy keeps Tent + Plant required and Grow optional. Workflow triggers and permissions are unchanged.
9. `quicklog_save_manual` remains the only Quick Log persistence seam in this slice. No Action Queue or device-control write was added.
10. Deploy-base tests that assumed sole-plant or mismatched-target fallback now assert the reviewed fail-closed contract. Static workflow readers normalize CRLF/LF before checking literal YAML lines; production behavior is unchanged.

## Current port commit sequence

- `9c0a9114c` — Trust Core redesign specification
- `bcc481cae` — T1 implementation plan
- `c2b671314` — pure target-integrity rules
- `a0ea99075` — Quick Log canonical display/write target
- `f84aa6eb3` — exact One-Tent Loop Quick Log handoff and deploy-overlap resolution
- `38ac582f1` — scope-preserving `/logs` route alias
- `cda428cd9` — authenticated route-target gate
- `7374802fe` — legacy Quick Log target-fixture alignment
- `d385f6009` — legacy save and alias-contract alignment
- `6f90af320` — exact refresh-target contract alignment
- `f4d79b72e` — initial reconciliation packet replay
- `2097d5b0f` — target-integrity port evidence refresh
- `adee331a0` — blocked-target integrity repair
- `6f16f56c5` — canonical target display repair
- `809a85966` — in-flight target, query-state, handoff, and exact-name repair
- `b846a8684` — reviewed reconciliation repair
- `1be4163ea` — current deploy-drift test alignment
- `994392757` — shared parent/child save guard and rendered-name fixture repair

The 16 reviewed commits were replayed in order. `1be4163ea` is the deploy-compatibility test commit; `994392757` is the post-review runtime/test repair for the two current-head findings.

## Validation rerun on this port

| Gate                            | Current result                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Strict TDD RED                  | **Expected fail — 3 files, 35 passed and 8 failed; each failure mapped to a missing requested guard/name behavior**       |
| Focused repair GREEN            | **Pass — 3 files, 43/43 tests, 0 failures**                                                                               |
| Final focused regression batch  | **Pass — 4 files, 63/63 tests, 0 failures**                                                                               |
| Requested T1 targeted slice     | **Pass — 16 files, 204/204 tests, 0 failures**                                                                            |
| All changed Vitest files        | **Pass — 37 files, 454/454 tests, 0 failures**                                                                            |
| Adjacent all-activities batch   | **Pass — 2 files, 29/29 tests, 0 failures**                                                                               |
| Deploy-drift handoff regression | **Pass — 1 file, 1/1 test**                                                                                               |
| Compatibility UI batch          | **Pass — 5 files, 42/42 tests**                                                                                           |
| Smoke static/fixture matrix     | **Pass — 3 files, 88/88 tests**                                                                                           |
| Post-format compatibility batch | **Pass — 8 files, 107/107 tests**                                                                                         |
| One-Tent Loop smoke             | **Pass — 24 files, 393/393 tests**                                                                                        |
| Scanner assertion matrix        | **Pass — 20 files, 326/326 tests**                                                                                        |
| Scanner CI timing wrapper       | **Pass — 20 files, 326/326 tests; no row above 5000 ms and no report emitted**                                            |
| Type-check                      | **Pass — 0 diagnostics** (`bun run typecheck`)                                                                            |
| Scoped lint                     | **Pass — all 52 changed TypeScript/TSX files, 0 errors and 1 pre-existing Fast Refresh warning**                          |
| Working/staged diff check       | **Pass** (`git diff --check`, `git diff --cached --check`)                                                                |
| Playwright discovery            | **Pass — exactly 3 tests listed across setup, authenticated, and mocked projects; no browser execution**                  |
| Fixture checklist               | **Pass — Tent + Plant required; Grow and second plant optional; values not printed**                                      |
| Docs safety                     | **Pass — automated-phenotyping, release, and sensor checks**                                                              |
| Full repository suite           | **Not run**                                                                                                               |
| Fixture verification            | **Not run; pending against the dedicated disposable fixture**                                                             |
| Authenticated Chrome smoke      | **Not run; pending against the dedicated disposable fixture**                                                             |
| Independent Claude review       | **Not available in this environment; pending**                                                                            |
| Runtime DB/RLS harness          | Not applicable to this no-schema/no-RLS/no-server-mutation slice                                                          |
| `test:security-db-local`        | **No action** — documented opt-in infrastructure lane, unrelated to this diff, and non-gating under the baseline standard |

The first scanner timing invocation passed all 326 assertions but emitted one timing row at 5216 ms against the unchanged 5000 ms threshold. A clean rerun passed all 326 assertions with no slow row and removed the stale report. The threshold and scanner implementation were not changed.

The original port's first all-changed matrix exposed deploy-base tests that still encoded the superseded sole-plant/mismatch fallback and Windows CRLF-sensitive static readers. Those test harnesses were aligned without changing production behavior. This repair's first all-changed matrix then found one stale static `busy` assertion; the fence now explicitly proves `saveLocked = busy || childSaveBusy`, and the final all-changed result is 454/454. Known non-failing output includes React Router v7 future-flag notices, Radix Dialog description warnings, existing React `act(...)` and multiple-GoTrueClient test warnings, and the pre-existing mixed-export Fast Refresh lint warning.

The `994392757` commit hook passed its formatting, lint-fix, type-check, docs-safety, and 22-test checks. After the commit was created, cleanup printed a non-fatal permission warning for unrelated worktree metadata under the separate OneDrive checkout; the hook exited 0 and this worktree remained clean.

## Current pending gates

1. Run fixture verification against the dedicated disposable fixture without weakening Tent + Plant requirements or making Grow mandatory.
2. Run the authenticated Quick Log Chrome smoke and confirm the displayed target equals the observed `quicklog_save_manual.p_target_id`.
3. Complete independent specification/Claude re-review and reconcile every finding or obtain explicit user acceptance.
4. Reconcile the goal charter and P0/P1 companion map when supplied as repository files with a commit SHA.

## Safety verdict

- A resolved target is immutable for the duration of a save and is reused after the await boundary.
- Parent and all-activities child saves mutually exclude synchronously, hold the captured child target through request/confirmation, and release the shared lock on both success and failure.
- Named loading/error/invalid prefills remain unresolved and cannot fall through to another plant.
- All three Plant Detail named handoffs fail closed unless the full grow/tent/plant tuple exists.
- Fixture names containing regular-expression metacharacters are escaped and anchored; the matcher accepts only the bare name or its exact rendered strain suffix and rejects prefix collisions.
- No unknown or contradictory target is shown as ready.
- No schema, RLS, service-role, bridge-token, device-control, relay, Action Queue, Edge Function, billing, entitlement, or Founder backfill seam was added.
- No fake live or sensor state was introduced.
- `cure` / `curing` compatibility and canonical sensor-source vocabulary remain unchanged.
- Current deploy routing and auth/capability gates are preserved, including authenticated `/dashboard` behavior.
- No scanner suppression, threshold change, or workflow-policy broadening was added.
- Workflow permissions and triggers are unchanged; Grow remains optional while Tent + Plant remain required.
- No automatic Action Queue write, AI mutation, diary write outside explicit Quick Log save, or device-control seam was added.

**Safety verdict: safe for draft re-review; not yet safe to merge because authenticated Chrome/fixture proof and independent specification review remain incomplete.**

## Deferred outcomes and work

- T2–T21 remain outside this T1 slice.
- Sensor truth expansion, stage gating beyond compatibility preservation, entitlement capability repair, async semantic cleanup, and mobile overflow remain later Trust Core slices.
- Sentry setup is separate and is not included here.
- The authenticated smoke must run only against the dedicated disposable fixture account.

## Risk and rollback

Primary behavioral risk: legacy plants or tents with missing or contradictory ownership can no longer save through Quick Log until assignment is repaired. This is intentional fail-closed behavior, but support copy and migration work may be needed in a later slice.

Rollback uses `git revert` on the smallest relevant commit. Do not reset shared history. No data rollback is required because this slice has no migration or row backfill.

## Promotion checklist

- [x] Reviewed 16-commit T1 chain replayed in order onto current deploy base `a1421adb3`.
- [x] Deterministic T1 target/display/RPC contract green on the current port.
- [x] Current-port type-check, scoped lint, changed tests, scanner assertions, and scanner timing gate green.
- [x] No schema/RLS/entitlement/device/secret/queue expansion.
- [x] No scanner suppression or threshold change.
- [x] Authenticated `/dashboard` alias and scope-preserving `/logs` redirect preserved.
- [x] Named blocked prefills hold with zero writes until explicit grower action or a new valid prefill.
- [x] Global launchers require manual plant selection; remembered and sole-plant read fallbacks are removed.
- [x] Plant Detail named Quick Log, Upload Photo, and Harvest require complete plant/grow/tent context.
- [x] Smoke second-target fixture is same-grow and matched literally; Grow fixture naming remains optional.
- [x] Parent/child Quick Log saves share one synchronous guard and preserve the captured target through confirmation.
- [x] Non-writing disposable fixture checklist output confirmed.
- [ ] Disposable fixture verification green.
- [ ] Authenticated Chrome smoke green.
- [ ] Independent specification/Claude re-review attached and reconciled.
- [ ] Goal charter and P0/P1 map reconciled by supplied commit SHA.
