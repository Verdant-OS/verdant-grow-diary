# Phase 1 Slice 1 Reconciliation: Quick Log Target Integrity

## Promotion status

**Implementation status:** ready for review.

**Merge status:** not ready. This slice still requires Claude review, a successful disposable-account authenticated smoke, and a green scanner timing gate. No exception, threshold change, or suppression has been added for those missing gates.

## Scope and ground truth

- Charter outcome: **T1 — Quick Log target integrity**.
- Deploy-trunk base: `279fa9735163` (`origin/verdant-grow-diary`, including #303, #305, and #306).
- Implementation head before this reconciliation commit: `59fc0f66a1a3`.
- Branch: `codex/verdant-trust-core-deploy`.
- Deployment source of truth: `verdant-grow-diary`, not undeployed `main`.
- Existing inactive-plant ownership from #303 is reused through `isInactiveQuickLogPlant`; no parallel archived/merged predicate was introduced.
- `cure` and `curing` still normalize to `drying`.
- Canonical sensor-source vocabulary is unchanged.
- Entitlement lane direction, provenance, and Founder backfill are unchanged.

This slice deliberately changes no schema, RLS policy, Edge Function, entitlement rule, sensor enum, device-control surface, or Action Queue write behavior.

## T1 outcome reconciliation

T1 requires every enumerated route-scoped entry point to open the exact grow/tent/plant target and requires zero save paths where the displayed target can differ from the RPC target.

| Entry point / invariant | Result | Evidence |
| --- | --- | --- |
| Plant Detail `plant-detail-quick-action-quicklog` opens its exact routed plant | Pass in deterministic contract; authenticated execution pending fixture | `quicklog-route-contract-static.test.ts`, `quicklog-target-contract.test.tsx`, Playwright steps 1–3 |
| Plant Detail One-Tent Loop `Add quick log` opens its exact grow/tent/plant | Pass | `one-tent-loop-navigation-rules.test.ts`, `one-tent-loop-next-step-card.test.tsx`, `plant-detail-one-tent-loop-card.test.tsx` |
| Existing complete `PlantQuickLogPrefill` dispatchers retain the exact tuple | Pass | `quicklog-target-contract.test.tsx`, `quicklog-prefill-safety.test.tsx`, `quicklog-starter-handoff-consume.test.tsx` |
| The target card and `quicklog_save_manual.p_target_id` use one captured target | Pass | `quicklog-target-contract.test.tsx`; authenticated Playwright step 15 observes only the allow-listed target ID |
| Unknown, inactive, merged, unassigned, or contradictory targets fail closed | Pass | `quick-log-target-integrity-rules.test.ts`, `quicklog-target-contract.test.tsx` |
| Global launchers without route context invent no plant | Pass | existing manual-selection regressions in the changed-test matrix |
| `/logs` and `/dashboard` aliases preserve raw query and hash scope | Pass | `route-alias-preservation.test.tsx`, route-manifest tests |

Deterministic result: **3/3 enumerated route-scoped entry-point classes pass, and 0 tested save paths can submit a plant ID different from the displayed resolved target.** Promotion-level T1 evidence remains incomplete until the authenticated disposable-fixture smoke executes successfully.

## Implementation notes

1. `quickLogTargetIntegrityRules.ts` owns pure, typed, null-safe prefill and write resolution.
2. `QuickLog.tsx` derives one canonical target and uses it for the target card, sensor context, RPC payload, stage writeback, receipt, last-target memory, and refresh.
3. Invalid legacy relationships are not inferred from the active workspace; Save fails closed with calm repair guidance.
4. The One-Tent Loop plant step dispatches exactly one existing Quick Log prefill event and performs no navigation or write itself.
5. Route aliases use a presenter-only redirect backed by a pure raw search/hash preservation rule.
6. The authenticated smoke installs its request observer before navigation and retains only `p_target_id`; it does not retain request bodies, headers, credentials, or raw grower content.

## Commit sequence

- `ed2d5f4e3` — Trust Core redesign specification
- `163e7b6b6` — T1 implementation plan
- `82774573e` — pure target-integrity rules
- `a2f6ccdc3` — Quick Log canonical display/write target
- `e81a05aa8` — exact One-Tent Loop Quick Log handoff
- `6d16893d1` — scope-preserving route aliases
- `1ce40fbdb` — authenticated route-target gate
- `160f19877` — legacy Quick Log target-fixture alignment
- `b35780139` — legacy save and alias-contract alignment
- `59fc0f66a` — exact refresh-target contract alignment

## Validation results

| Gate | Result |
| --- | --- |
| Targeted tests | **Pass — 30 files, 289/289 tests** on final rebased code |
| Type-check | **Pass** — `tsc -p tsconfig.app.json --noEmit` |
| Static safety | **Pass — 8 files, 180/180 tests** |
| Scanner assertions | **Pass — 20 files, 326/326 tests** |
| Scanner CI timing wrapper | **Fail locally — performance threshold only; details below** |
| Playwright discovery | **Pass — 2 tests listed** (`setup`, authenticated Quick Log smoke) |
| E2E TypeScript | **Pass** — direct compile of `e2e/quicklog-smoke.spec.ts` |
| Fixture checklist | **Pass** — Tent + Plant required; Grow optional |
| Authenticated fixture verification | **Not run successfully** — local `e2e/.auth/user.json` is absent |
| Authenticated smoke | **Skipped correctly** — fixture verification could not pass; no live data touched |
| Migration / Edge Function diff | **Pass — no diff** |
| Entitlement diff | **Pass — no diff** |
| Added scanner suppression | **Pass — none** |
| Runtime DB/RLS harness | Not applicable; no schema, RLS, billing, or server mutation changed |
| `test:security-db-local` | **No action** — documented opt-in infrastructure lane, unrelated to this diff, non-gating under the baseline standard |

### Scanner timing caveat

The scanner assertions themselves pass. The separate 5-second CI performance wrapper was run in isolation and failed on a warm local Windows run because these three clean scans exceeded the timing ceiling:

| Scanner | Observed | Threshold |
| --- | ---: | ---: |
| VPD normalization ownership | 6,650 ms | 5,000 ms |
| Sensor intelligence clean-repository scan | 5,050 ms | 5,000 ms |
| EcoWitt-only / no SwitchBot scan | 5,256 ms | 5,000 ms |

No scanner scope, timeout, threshold, allow-list, ignore, or suppression was changed. The final direct assertion run remained green at 326/326; it also recorded the VPD ownership assertion at 5,369 ms, so this performance gate must remain visible for CI/Claude review.

## Full-suite reconciliation

`verify:full:sharded` type-checked successfully and then stopped at shard 1, as designed, when that shard failed. All four shards were then run individually to recover exact evidence. The raw diagnostic run occurred before the final test-fixture repair commits and before the non-overlapping #306 rebase.

| Shard | Passed | Failed | Skipped | Total |
| --- | ---: | ---: | ---: | ---: |
| 1/4 | 7,509 | 19 | 17 | 7,545 |
| 2/4 | 6,693 | 17 | 36 | 6,746 |
| 3/4 | 7,291 | 15 | 0 | 7,306 |
| 4/4 | 7,395 | 11 | 49 | 7,455 |
| **Aggregate raw diagnostic** | **28,888** | **62** | **102** | **29,052** |

Of the 62 raw failures:

- **20 were slice-introduced legacy test-contract failures.** They all expected saves from incomplete tent fixtures or asserted pre-canonical target variables. They were repaired in `160f19877`, `b35780139`, and `59fc0f66a`, then covered by the final **289/289** changed-test matrix.
- **42 were deploy-baseline or shard-only failures** in files untouched by this slice. The branch does not opportunistically modify them.

The full 29,052-test aggregate was not rerun end-to-end after the fixture repairs. Therefore this packet does not claim a green full suite; it claims exact raw totals plus green focused proof for every introduced failure.

### Baseline / unrelated failure inventory

- Shard 1: Windows `grep` absence; auth and VPD self-scanning guards; two timezone-sensitive UI/export assertions; existing evidence-linkage and PPFD assertions — 8 failures.
- Shard 2: existing AI fixture/static guards; plant-detail snapshot/grouping; plant-photo cleanup; three known Quick Log workflow parser assertions; two timezone-sensitive sensor exports; one caller-inventory assertion that passed 20/20 in isolation — 10 failures/flakes.
- Shard 3: Action Queue evidence static scan; 12 Windows-path failures in the Bun lockfile policy unit harness; the known One-Tent Loop workflow comment self-scan; plant-photo static assertion — 15 failures.
- Shard 4: action-outcome static guard; five Supabase migration-safety unit-harness path failures; evidence-linkage static guard; known Quick Log media parser; subscriber cleanup harness — 9 failures.

## Safety verdict

- The only Quick Log persistence seam remains `quicklog_save_manual`.
- A resolved target is immutable for the duration of a save and is reused after the await boundary.
- No unknown or contradictory target is shown as ready.
- No schema, RLS, service-role, bridge-token, device-control, relay, Action Queue, or Edge Function seam was added.
- No fake live or sensor state was introduced.
- `cure` / `curing` stage compatibility remains covered in the green changed-test matrix.
- The entitlement freeze remains intact.

**Safety verdict: safe for draft PR and independent review; not yet safe to merge because the authenticated smoke, scanner timing gate, and Claude review are incomplete.**

## Claude reconciliation

Already reconciled:

- Deploy #303's canonical inactive-plant predicate is reused rather than duplicated.
- Deploy #305's onboarding handoff behavior remains present after rebase.
- Deploy #306 was inspected as non-overlapping, rebased cleanly, and followed by type-check plus the full changed-test/static/scanner matrix.

Still pending:

1. Claude's goal charter and P0/P1 companion map have not arrived as repository files with a commit SHA, so byte-level and finding-by-finding reconciliation cannot yet be performed.
2. Claude must review this PR before merge and verify:
   - the T1 metric and exact target/RPC equality;
   - complete route-entry-point inventory;
   - fixture order: checklist -> optional bootstrap -> verification -> smoke;
   - Tent + Plant mandatory and Grow optional;
   - no new scanner suppression or frozen entitlement change;
   - deploy-trunk assumptions and the baseline-failure classification.
3. Every Claude finding must be resolved here or explicitly accepted by the user.

## Deferred outcomes and work

- T2–T21 remain outside this T1 slice except for the process/suppression evidence captured here.
- Sensor truth, stage gating beyond compatibility preservation, entitlement capability repair, async semantic cleanup, and mobile overflow remain later Trust Core slices.
- Sentry setup is separate. Creating a Sentry project is a persistent external-account change and requires explicit user authorization; no Sentry SDK or account change is included here.
- The authenticated smoke must run only against the dedicated disposable fixture account.

## Risk and rollback

Primary behavioral risk: legacy plants or tents with missing/contradictory ownership can no longer save through Quick Log until assignment is repaired. This is intentional fail-closed behavior, but support copy and migration work may be needed in a later slice.

Rollback uses `git revert` on the smallest relevant commit. Do not reset shared history. No data rollback is required because no migration or row backfill exists in this slice.

## Promotion checklist

- [x] Deterministic T1 target/display/RPC contract green.
- [x] Type-check, changed tests, static safety, and scanner assertions green.
- [x] No schema/RLS/entitlement/device/secret/queue expansion.
- [x] No scanner suppression added.
- [ ] Authenticated disposable-fixture smoke green.
- [ ] Scanner CI timing wrapper green.
- [ ] Claude review attached and reconciled.
- [ ] Goal charter and P0/P1 map reconciled by supplied commit SHA.
