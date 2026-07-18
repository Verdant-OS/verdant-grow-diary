# Verdant Trust Core Slice 1: Target Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satisfy the known T1 charter contract by making every route-scoped Quick Log handoff resolve to the exact grow/tent/plant shown to the grower, making that same resolved target the only target used by `quicklog_save_manual`, and preserving query/hash context across legacy route aliases.

**Architecture:** Add one deterministic target-integrity rules module that returns a discriminated `ready` or `blocked` result from existing grow/tent/plant rows. The legacy Quick Log presenter will consume that single result for visible target state, sensor context, save payload, stage writeback, last-target memory, and post-save receipt. Existing entry points continue to dispatch `verdant:open-quicklog`; the One-Tent Loop plant CTA will dispatch that event instead of self-linking. Route aliases use one presenter component backed by a pure location-preservation helper. No persistence path, schema, RLS policy, entitlement lane, sensor enum, or device behavior changes.

**Tech Stack:** React 18, TypeScript, React Router, TanStack Query, Supabase `quicklog_save_manual`, Vitest, Testing Library, Playwright, Bun, GitHub Actions.

---

## Outcome contract and boundaries

- T1 exit state for this slice: 100% of the route-scoped entry points enumerated below open Quick Log with the route's exact target, and zero tested save paths can submit a target different from the target card.
- Route-scoped entry points in scope:
  1. Plant Detail `plant-detail-quick-action-quicklog`.
  2. Plant Detail One-Tent Loop `Add quick log`.
  3. Existing `PlantQuickLogPrefill` dispatchers that supply plant + grow + tent.
- Global Quick Log launchers without an existing plant route remain manual-selection flows. They must resolve a valid target before Save becomes enabled, but they do not invent route context.
- `quicklog_save_manual` remains the only Quick Log persistence path.
- Legacy rows with missing or contradictory `grow_id` / `tent_id` fail closed with calm assignment guidance. They are never inferred from the active workspace.
- `cure` and `curing` continue to normalize to `drying`; this slice does not change stage vocabulary.
- The six canonical sensor sources remain `live`, `manual`, `csv`, `demo`, `stale`, and `invalid`; this slice does not add a source enum.
- Entitlement lane direction, provenance rules, and Founder backfill are frozen.
- No schema/RLS changes, device control, automatic Action Queue writes, scanner suppressions, or broad workflow rewrite.
- Promotion requires targeted tests, type-check, static safety, scanner guardrails, no migration diff, Claude review, and findings reconciliation.

## Architecture decisions and trade-offs

| Decision | Reason | Trade-off |
| --- | --- | --- |
| Use a discriminated target result | A caller cannot accidentally use partially validated IDs as a save target. | Existing presenter code must branch on `ready` before saving. |
| Resolve prefill against all loaded plants, then scope the picker | Cross-grow route handoffs can be validated before the active grow switch finishes. | Quick Log may briefly show a loading/blocked state while stores re-scope. |
| Require the tent row and its grow relationship for a write | Prevents a plant row and active workspace from silently disagreeing. | Old unassigned rows require repair before logging. |
| Reuse the existing global prefill event | Preserves one editor and one RPC write path. | The One-Tent Loop CTA becomes a button, not a link. |
| Add location-preserving aliases | Existing helpers emit `/logs` and `/dashboard`; aliases are the smallest safe deploy-trunk repair. | Canonical helpers can be migrated in a later scoped slice. |
| Extend the existing authenticated smoke | Keeps the current fixture and artifact workflow intact. | The live contract remains gated on disposable fixture availability. |

## Task 1: Add the pure target-integrity contract

**Files:**

- Create: `src/lib/quickLogTargetIntegrityRules.ts`
- Create: `src/test/quick-log-target-integrity-rules.test.ts`

- [ ] **Step 1: Write the failing pure-rule tests**

Cover:

- exact plant/grow/tent prefill returns `ready`;
- a cross-grow prefill resolves from the full plant list rather than the current scoped list;
- unknown, archived, or merged plants are blocked;
- prefill grow mismatch and tent mismatch are blocked;
- missing plant `grow_id` or `tent_id` is blocked without inference;
- selected plant, active grow, selected tent, and tent grow must all agree before write;
- null/empty inputs are blocked;
- repeated identical inputs return deeply equal results;
- no result contains sensor values, automation flags, or a second persistence selector.

Use a discriminated shape:

```ts
export type QuickLogResolvedTarget = Readonly<{
  plantId: string;
  growId: string;
  tentId: string;
}>;

export type QuickLogTargetResolution =
  | { status: "ready"; target: QuickLogResolvedTarget }
  | { status: "blocked"; reason: QuickLogTargetBlockReason };
```

- [ ] **Step 2: Run the new test and confirm RED**

Run:

```powershell
bunx vitest run src/test/quick-log-target-integrity-rules.test.ts --reporter=dot
```

Expected: FAIL because `quickLogTargetIntegrityRules.ts` does not exist.

- [ ] **Step 3: Implement the smallest deterministic rules module**

Implement two pure exports:

```ts
resolveQuickLogPrefillTarget({ prefill, plants, tents })
resolveQuickLogWriteTarget({ activeGrowId, selectedPlant, selectedTent })
```

Rules:

- trim/validate IDs once;
- reject archived and merged plants;
- never substitute `activeGrowId` for a missing plant `grow_id`;
- never substitute a tent row for a missing plant `tent_id`;
- when prefill supplies `growId` or `tentId`, require exact equality with the stored plant;
- when a tent row is loaded, require `tent.grow_id === plant.grow_id`;
- return a frozen or readonly target object only after all relationships agree;
- expose calm reason mapping separately so JSX does not own business rules.

- [ ] **Step 4: Run the test and confirm GREEN**

```powershell
bunx vitest run src/test/quick-log-target-integrity-rules.test.ts --reporter=dot
```

Expected: all target-integrity rule tests pass.

- [ ] **Step 5: Commit the pure contract**

```powershell
git add src/lib/quickLogTargetIntegrityRules.ts src/test/quick-log-target-integrity-rules.test.ts
git commit -m "feat: add quick log target integrity rules"
```

## Task 2: Make legacy Quick Log display and submit one canonical target

**Files:**

- Modify: `src/components/QuickLog.tsx`
- Modify: `src/test/quicklog-prefill-safety.test.tsx`
- Create: `src/test/quicklog-target-contract.test.tsx`
- Modify: `src/test/legacy-quicklog-unified-save.test.ts`

- [ ] **Step 1: Add failing cross-grow and write-contract component tests**

Use a stateful `useGrows` mock so `setActiveGrowId("g2")` causes a real rerender. Assert:

1. Starting in `g1`, a prefill for `p2/g2/t2` never falls back to the only plant in `g1`.
2. After the grow switch propagates, the target card shows the `p2` names and carries the resolved target attributes.
3. Saving an observation sends one `quicklog_save_manual` call whose `p_target_id` equals the target card's resolved plant ID.
4. The same resolved grow ID is used for optional stage writeback and last-target memory.
5. A plant with missing/mismatched grow or tent shows assignment guidance, disables Save, and sends zero RPC calls.
6. A grower-driven plant change updates the visible canonical target before any subsequent save.

The test must spy on the existing RPC; it must not mock or introduce an alternate writer.

- [ ] **Step 2: Run the focused component tests and confirm RED**

```powershell
bunx vitest run src/test/quicklog-prefill-safety.test.tsx src/test/quicklog-target-contract.test.tsx src/test/legacy-quicklog-unified-save.test.ts --reporter=dot
```

Expected: new assertions fail because Quick Log currently derives display and write fields independently.

- [ ] **Step 3: Wire the pure contract into `QuickLog.tsx`**

Implementation constraints:

- resolve prefill from `plants` + `activeTents`, not `scopedPlants`;
- set the requested grow and plant only after the prefill target is `ready`;
- keep the existing hold that prevents an old-grow default while a cross-grow switch propagates;
- compute one memoized `writeTarget` from `activeGrowId`, `selectedPlant`, and `selectedTent`;
- render `data-target-plant-id`, `data-target-tent-id`, and `data-target-grow-id` on `quick-log-target-card` only when the target is `ready`;
- set `sensorTentId` from `writeTarget.target.tentId` only when ready;
- disable Save when the target is blocked;
- show calm copy such as `Assign this plant to a grow and tent before saving.` for legacy assignment gaps;
- in `runSubmit`, fail before `setBusy(true)` unless `writeTarget.status === "ready"`;
- pass `writeTarget.target.plantId` and `.tentId` into `buildLegacyQuickLogUnifiedPayload`;
- use `writeTarget.target.growId` for stage writeback, last-target memory, post-save refresh, and receipts;
- preserve user-entered note, stage, snapshot choice, idempotency key, and mismatch warning behavior;
- do not move persistence out of `useQuickLogV2Save` or change the RPC signature.

- [ ] **Step 4: Run the focused component tests and confirm GREEN**

```powershell
bunx vitest run src/test/quick-log-target-integrity-rules.test.ts src/test/quicklog-prefill-safety.test.tsx src/test/quicklog-target-contract.test.tsx src/test/legacy-quicklog-unified-save.test.ts --reporter=dot
```

- [ ] **Step 5: Run Quick Log regression tests**

```powershell
bunx vitest run src/test/quick-log-v2-*.test.ts src/test/quicklog-*.test.ts src/test/legacy-quicklog-*.test.ts --reporter=dot
```

Expected: all collected tests pass; report exact files/tests and any pre-existing failures.

- [ ] **Step 6: Commit the presenter integration**

```powershell
git add src/components/QuickLog.tsx src/test/quicklog-prefill-safety.test.tsx src/test/quicklog-target-contract.test.tsx src/test/legacy-quicklog-unified-save.test.ts
git commit -m "fix: enforce quick log target integrity"
```

## Task 3: Repair the Plant One-Tent Loop Quick Log entry point

**Files:**

- Modify: `src/lib/oneTentLoopNavigationRules.ts`
- Modify: `src/components/OneTentLoopNextStepCard.tsx`
- Modify: `src/test/one-tent-loop-navigation-rules.test.ts`
- Modify: `src/test/one-tent-loop-next-step-card.test.tsx`
- Modify: `src/test/plant-detail-one-tent-loop-card.test.tsx`

- [ ] **Step 1: Replace the self-link expectation with failing event-intent tests**

Assert that:

- `current="plant"` with plant/grow/tent returns `intent: "open_quick_log"`, `href: null`, and an exact `PlantQuickLogPrefill`;
- missing any required assignment returns the existing calm disabled state;
- clicking the card dispatches exactly one `PLANT_QUICKLOG_PREFILL_EVENT` on `window` with the exact IDs;
- it performs no fetch, Supabase call, navigation, write, or automatic queue action;
- internal IDs remain absent from visible text.

- [ ] **Step 2: Run the three tests and confirm RED**

```powershell
bunx vitest run src/test/one-tent-loop-navigation-rules.test.ts src/test/one-tent-loop-next-step-card.test.tsx src/test/plant-detail-one-tent-loop-card.test.tsx --reporter=dot
```

- [ ] **Step 3: Implement the event intent**

Extend `OneTentLoopNextStep` with:

```ts
intent: "navigate" | "open_quick_log";
quickLogPrefill: PlantQuickLogPrefill | null;
```

For the plant step, call the existing `buildPlantQuickLogPrefill`. In the presenter, render a normal `Button` for `open_quick_log` and dispatch:

```ts
window.dispatchEvent(
  new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: step.quickLogPrefill }),
);
```

All other steps retain existing link behavior.

- [ ] **Step 4: Run the tests and confirm GREEN**

```powershell
bunx vitest run src/test/one-tent-loop-navigation-rules.test.ts src/test/one-tent-loop-next-step-card.test.tsx src/test/plant-detail-one-tent-loop-card.test.tsx --reporter=dot
```

- [ ] **Step 5: Commit the repaired entry point**

```powershell
git add src/lib/oneTentLoopNavigationRules.ts src/components/OneTentLoopNextStepCard.tsx src/test/one-tent-loop-navigation-rules.test.ts src/test/one-tent-loop-next-step-card.test.tsx src/test/plant-detail-one-tent-loop-card.test.tsx
git commit -m "fix: open exact plant from one tent loop"
```

## Task 4: Preserve scope through deploy-trunk route aliases

**Files:**

- Create: `src/lib/routeAliasRules.ts`
- Create: `src/components/RouteAliasRedirect.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/appRouteManifest.ts`
- Create: `src/test/route-alias-preservation.test.tsx`
- Modify: `src/test/app-route-manifest.test.ts`
- Modify: `src/test/route-manifest-sync.test.ts`

- [ ] **Step 1: Write failing alias tests**

Assert:

- `/logs?growId=g1#entry` redirects to `/timeline?growId=g1#entry`;
- `/dashboard?growId=g1#environment` redirects to `/?growId=g1#environment`;
- blank search/hash stay blank;
- values are preserved verbatim, not decoded/re-encoded;
- the manifest includes `/dashboard` and still classifies both aliases as redirects;
- `App.tsx` and `APP_ROUTES` remain in sync.

- [ ] **Step 2: Run the alias tests and confirm RED**

```powershell
bunx vitest run src/test/route-alias-preservation.test.tsx src/test/app-route-manifest.test.ts src/test/route-manifest-sync.test.ts --reporter=dot
```

- [ ] **Step 3: Add a pure target builder and presenter-only redirect**

Pure helper:

```ts
buildRouteAliasTarget(to, search, hash)
```

Presenter:

```tsx
const location = useLocation();
return <Navigate replace to={buildRouteAliasTarget(to, location.search, location.hash)} />;
```

Mount:

```tsx
<Route path="/dashboard" element={<RouteAliasRedirect to="/" />} />
<Route path="/logs" element={<RouteAliasRedirect to="/timeline" />} />
```

- [ ] **Step 4: Run aliases plus grow-scoped navigation regression tests**

```powershell
bunx vitest run src/test/route-alias-preservation.test.tsx src/test/app-route-manifest.test.ts src/test/route-manifest-sync.test.ts src/lib/routes.test.ts src/test/scoped-grow-navigation-contract.test.tsx src/test/dashboard-grow-scope.test.ts src/test/logs-grow-filter.test.ts --reporter=dot
```

- [ ] **Step 5: Commit the alias repair**

```powershell
git add src/lib/routeAliasRules.ts src/components/RouteAliasRedirect.tsx src/App.tsx src/lib/appRouteManifest.ts src/test/route-alias-preservation.test.tsx src/test/app-route-manifest.test.ts src/test/route-manifest-sync.test.ts
git commit -m "fix: preserve scope through route aliases"
```

## Task 5: Promote T1 into the authenticated Playwright gate

**Files:**

- Modify: `e2e/quicklog-smoke.spec.ts`
- Modify: `.github/workflows/quicklog-smoke.yml`
- Modify: `src/test/quicklog-e2e-fixture-safety.test.ts`
- Create: `src/test/quicklog-route-contract-static.test.ts`

- [ ] **Step 1: Add failing contract-pin tests**

Pin that:

- smoke checklist steps 1–3 cover initial route target, resolved target card, and selected-target transition;
- step 15 compares the intercepted `quicklog_save_manual` `p_target_id` to the target card's displayed resolved plant ID;
- the request observer records only the allow-listed target ID and never writes raw payloads to reports/logs;
- workflow order is checklist print -> optional bootstrap -> fixture verification -> smoke;
- Tent + Plant stay mandatory and Grow stays optional;
- the smoke stays gated on `steps.verify_fixture.outcome == 'success'`.

- [ ] **Step 2: Run the safety tests and confirm RED**

```powershell
bunx vitest run src/test/quicklog-e2e-fixture-safety.test.ts src/test/quicklog-route-contract-static.test.ts --reporter=dot
```

- [ ] **Step 3: Extend the existing smoke without creating a new write path**

Before `page.goto`, register a request listener for the exact RPC pathname ending in `/rpc/quicklog_save_manual`. Store only a validated string `p_target_id` in memory.

After `page.goto(PLANT_URL)` and before any write-producing action:

1. Parse the plant route ID from `PLANT_URL`.
2. Open Plant Detail Quick Log.
3. Assert the target card's `data-target-plant-id` equals that route ID.
4. Assert one non-empty grow/tent/plant target tuple is present.
5. After switching plants, assert the target tuple changes before Save.
6. In step 15, capture the displayed target immediately before clicking Save and `expect.poll` until the intercepted RPC target equals it.

Never include request bodies, credentials, headers, or raw payloads in the smoke report.

- [ ] **Step 4: Add the missing non-writing fixture checklist step**

Insert only this narrow workflow step before bootstrap/verification:

```yaml
- name: Print disposable E2E fixture checklist
  if: steps.e2e_config.outputs.should_run == 'true'
  run: bun run e2e:fixture-checklist
```

Do not alter fixture naming gates, auth, schedule, permissions, secrets, or artifact behavior.

- [ ] **Step 5: Run contract and fixture safety tests GREEN**

```powershell
bunx vitest run src/test/quicklog-e2e-fixture-safety.test.ts src/test/quicklog-route-contract-static.test.ts --reporter=dot
```

- [ ] **Step 6: Run the disposable authenticated gate when configured**

```powershell
bun run e2e:fixture-checklist
bun run e2e:verify-fixture
bun run e2e:quicklog-smoke
```

Expected order: checklist first, fixture verification second, smoke last. If required disposable-fixture environment is unavailable, report Playwright as skipped; never weaken the gate or point it at production data.

- [ ] **Step 7: Commit the browser contract**

```powershell
git add e2e/quicklog-smoke.spec.ts .github/workflows/quicklog-smoke.yml src/test/quicklog-e2e-fixture-safety.test.ts src/test/quicklog-route-contract-static.test.ts
git commit -m "test: gate quick log route target integrity"
```

## Task 6: Validate safety, scope, and deterministic behavior

**Files:**

- Modify only if a real regression is found in the files already listed above.

- [ ] **Step 1: Run the complete targeted slice**

```powershell
bunx vitest run src/test/quick-log-target-integrity-rules.test.ts src/test/quicklog-prefill-safety.test.tsx src/test/quicklog-target-contract.test.tsx src/test/legacy-quicklog-unified-save.test.ts src/test/one-tent-loop-navigation-rules.test.ts src/test/one-tent-loop-next-step-card.test.tsx src/test/plant-detail-one-tent-loop-card.test.tsx src/test/route-alias-preservation.test.tsx src/test/app-route-manifest.test.ts src/test/route-manifest-sync.test.ts src/lib/routes.test.ts src/test/scoped-grow-navigation-contract.test.tsx src/test/dashboard-grow-scope.test.ts src/test/logs-grow-filter.test.ts src/test/quicklog-e2e-fixture-safety.test.ts src/test/quicklog-route-contract-static.test.ts --reporter=dot
```

- [ ] **Step 2: Run type and safety gates**

```powershell
bun run typecheck
bun run test:static-safety
bun run test:scanner-guardrails:ci
```

No suppression, allow-list broadening, scanner input exclusion, or generated-output bypass is acceptable.

- [ ] **Step 3: Run the controlled full suite**

```powershell
bun run verify:full:sharded
```

Report exact pass/fail counts. Classify introduced and pre-existing failures separately with evidence.

- [ ] **Step 4: Prove Phase 1 boundaries**

```powershell
git diff --check origin/verdant-grow-diary...HEAD
git diff --exit-code origin/verdant-grow-diary...HEAD -- supabase/migrations supabase/functions
git diff --name-only origin/verdant-grow-diary...HEAD
git grep -n -E "scanner.*(ignore|suppress)|allow.*scanner" -- . ":(exclude)docs/superpowers/specs/*" ":(exclude)docs/superpowers/plans/*"
```

Expected:

- no whitespace errors;
- no migration or edge-function diff;
- no scanner suppression added;
- changes remain limited to target rules, presenter wiring, route aliases, tests, the narrow smoke step, and docs.

`test:security-db-local` is a documented opt-in infrastructure lane, unrelated to this slice, and non-gating under the baseline standard. Record `No action` unless the user explicitly changes that policy.

- [ ] **Step 5: Inspect the final diff and commit validation-only fixes**

```powershell
git diff --stat origin/verdant-grow-diary...HEAD
git diff origin/verdant-grow-diary...HEAD
```

If validation required a scoped fix, rerun the affected RED/GREEN command and commit it separately:

```powershell
git add <affected-files>
git commit -m "test: close target integrity regression"
```

## Task 7: Claude review and phase reconciliation gate

**Files:**

- Create: `docs/remediation/phase-1-slice-1-reconciliation.md`

- [ ] **Step 1: Write the evidence packet**

Record:

- deploy-trunk base SHA and slice head SHA;
- enumerated Quick Log entry points and pass/fail status;
- targeted test files and exact test counts;
- type-check, static-safety, scanner, full-suite, and Playwright results;
- no-schema/no-RLS/no-device-control proof;
- skipped lanes and reasons;
- remaining charter outcomes outside this slice;
- any differences against Claude's P0/P1 map once the user supplies its commit SHA.

Use this result template:

```text
Targeted tests:
Full suite:
Type-check:
Runtime harness:
Playwright route contract:
Static safety:
Scanner guardrails:
Skipped:
Introduced failures:
Pre-existing failures:
```

- [ ] **Step 2: Commit the reconciliation packet**

```powershell
git add docs/remediation/phase-1-slice-1-reconciliation.md
git commit -m "docs: reconcile target integrity slice"
```

- [ ] **Step 3: Push a Codex branch and open a reviewable PR**

```powershell
git push -u origin codex/verdant-trust-core-deploy
gh pr create --base verdant-grow-diary --head codex/verdant-trust-core-deploy --title "Trust Core: enforce Quick Log target integrity" --body-file docs/remediation/phase-1-slice-1-reconciliation.md
```

- [ ] **Step 4: Require Claude review before merge**

Give Claude the PR URL and ask it to verify the T1 metric, route-contract evidence, fixture ordering, scanner guardrails, and deploy-trunk assumptions. Reconcile every Claude finding in the phase document. Do not merge until:

1. Claude review is attached to the PR;
2. findings are resolved or explicitly accepted by the user;
3. the full promotion-gate checklist is green;
4. no frozen entitlement-lane decision changed;
5. no scanner suppression was added.

## Rollback

Each implementation task is an independent commit. Roll back the smallest failing commit with `git revert <sha>`; do not reset the branch or rewrite shared history. Reverting presenter integration restores the prior selection behavior while preserving the pure rule module. Reverting route aliases restores the prior redirect behavior without touching helper callers. No data migration rollback is required because this slice performs no schema or row backfill.
