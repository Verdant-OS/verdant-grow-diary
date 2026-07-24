# Phase 1 Slice 1 Reconciliation: Quick Log Target Integrity

## Summary

The complete reviewed T1 Quick Log target-integrity topic, #352 reconciliation, and final-review repairs now form a 27-commit topic rebased onto the current verified deploy source of truth, `0f99b1d6380fe5a6fae9236ee9901a80220db0b9` (#365). The final deploy move from `ceb99a672` intersects the complete topic only in `src/App.tsx` and `src/test/route-manifest-sync.test.ts`; it has no path intersection with the final-review runtime, test, or documentation files.

- T1 keeps the canonical grow/tent/plant target, fail-closed query states, immutable in-flight save context, shared synchronous parent/child save lock, exact nested plant target, and accessible `Saving…` state.
- #352 keeps canonical Better/Same/Worse response semantics, observation chips, response replacement, and downstream response/follow-up rules.
- Current deploy keeps OAuth post-auth restoration, the public MCP API route, the authenticated validated Timeline-to-Sensors tent intent, and #365's public browser-local CSV preview acquisition routes.

All targeted functional and safety assertions are green. The unchanged scanner timing wrapper failed because two scanner rows exceeded 5000 ms; no threshold, suppression, or scanner implementation changed. The branch remains unpushed and is not merge-ready until that timing signal and the authenticated disposable-fixture proof are resolved.

## Requirements and assumptions

- Charter outcome: **T1 — Quick Log target integrity**.
- Deployment source of truth: `verdant-grow-diary`, not undeployed `main`.
- Current verified deploy base: `0f99b1d6380fe5a6fae9236ee9901a80220db0b9`.
- Current branch: `codex/verdant-trust-core-target-integrity-current`.
- Current validated code/test head before this evidence update: `726611c9e4459599ee9b9cd325aeda9e02a67c74`.
- The complete 24-commit topic was replayed in order from `2c2b2f1414a72a34258d14add1f24f42e1324142..e903d133d50a9926aafef857a969302721efa82d`.
- `origin/verdant-grow-diary` was fetched before this documentation update, advanced from `ceb99a672` to `0f99b1d63`, and the complete 27-commit topic rebased cleanly with no conflicts.
- No push, merge, schema migration, backfill, row mutation, RLS change, identity model, explicit Unassigned product behavior, room model, or reserved interface was authorized.
- Existing legacy/unassigned Quick Log targets remain fail-closed. Assignment and migration UX are deferred product work.
- This port does not change a user-facing calendar/day, phase, age, schedule-source, or sensor-truth label and adds no direct clock read. Authoritative schedule ownership and conflict presentation therefore remain outside this slice.
- `test:security-db-local` remains a documented opt-in infrastructure lane, unrelated to this diff and non-gating under the baseline standard.

## Audit findings

### Rebase integrity

- All 27 topic commits are present in order on `0f99b1d63`.
- The final rebase replayed 27/27 commits without a conflict.
- `git range-diff` maps 22 commits exactly, marks two commits as expected context-aware integrations, and reports no unmatched commit.
- No rebase conflict marker remains in any changed TypeScript, TSX, Markdown, or workflow file.
- The two contextual integrations are the One-Tent rule/test combination and the `App.tsx` import context described below. The sole content conflict was the One-Tent rules import block.

### Current deploy intersection decisions

The deploy history from `2c2b2f141..ceb99a672` was audited for every intersecting path before replay:

1. `src/App.tsx`: deploy commits `634b3cf36`, `93b459690`, and `48c96a988` add `OAuthPostAuthRedirect`, mount it under `AuthProvider`, lazy-load `McpApiReference`, and expose `/docs/mcp-api`. All remain intact. T1 adds only `RouteAliasRedirect` and changes `/logs` to preserve its raw query/hash while redirecting to `/timeline`.
2. `src/lib/oneTentLoopNavigationRules.ts`: deploy commit `61573649f` changes Timeline → Sensors to use `buildSensorsTentRouteHref(tentId)`, which accepts only a valid UUID intent for later authenticated tent validation. T1 changes Plant → Quick Log to require a complete exact grow/tent/plant prefill. The conflict resolution retains both imports and both independent switch branches.
3. `src/test/one-tent-loop-navigation-rules.test.ts`: the final test file retains #358's valid-UUID Sensors intent and malformed-value fallback assertions alongside T1's exact Quick Log intent and missing-assignment fail-closed assertions.

No deploy route, MCP, OAuth, operator, sensor-intent, or #352 response behavior was selected away wholesale.

### #365 deploy intersection

The final refetch found #365 (`0f99b1d63`) after the prior validation base. Its public `/partners/csv-preview` and `/sensors/csv-preview` lazy routes, manifest entries, acquisition behavior, and signed-out route-protection coverage remain intact. T1's delta on the two intersecting files remains narrow: `App.tsx` uses `RouteAliasRedirect` for query/hash-preserving `/logs` canonicalization, while `route-manifest-sync.test.ts` adds explicit `/dashboard` and `/logs` access assertions. OAuth restoration and authenticated `/dashboard` behavior remain mounted. The affected #365/T1 matrix passed 126/126 assertions after the rebase.

### #352 overlap

#352 changes ten files. Its only path intersection with T1 production code is `src/components/QuickLog.tsx`. The rule modules and #352 tests are otherwise textually disjoint.

The resolved Quick Log integration retains:

1. #352 imports and uses `RESPONSE_CHECK_STATUSES`, `applyResponseCheck`, `appendQuickLogObservation`, and `readResponseCheckStatus`.
2. Observation chips remain separate from the Better/Same/Worse response group.
3. A response replaces a contradictory prior response while preserving observation text.
4. T1's complete target/query/in-flight block remains authoritative; `selectedResponseStatus` is derived from `note` after that block and cannot weaken target resolution.
5. The existing `quicklog_save_manual` path persists the canonical response note only after a complete plant/tent/grow target resolves.

The new #352 RPC test originally supplied a plant without a matching tent or explicit target. T1 correctly blocked that invalid fixture. The test now mocks `tent-1`, supplies the exact `plant-1` / `tent-1` / `grow-1` prefill, and asserts both the canonical note and `p_target_type: "plant"`, `p_target_id: "plant-1"`. No sole-plant fallback or resolver weakening was introduced.

## File-level implementation

T1 continues to enforce these boundaries:

1. `quickLogTargetIntegrityRules.ts` owns pure, typed, null-safe prefill, editor-hold, and write resolution.
2. Named pending, errored, unknown, inactive, merged, unassigned, or contradictory targets cannot fall through to an unrelated plant.
3. The displayed target and `quicklog_save_manual.p_target_id` use one target captured before the first await.
4. Parent and all-activities child saves share the existing `saveInFlightRef`/`saveLocked` synchronous guard. Either owner freezes all main and child draft controls, blocks same-tick custom/Radix mutations before rerender, and preserves the captured target and payload through success or failure.
5. Global and grow-only launchers do not infer a remembered or sole plant. A successful write may record history, but no read path uses it to select a future target.
6. Plant Detail Quick Log, Upload Photo, Harvest, and One-Tent Loop handoffs require the complete existing grow/tent/plant tuple and perform no write by themselves.
7. `/logs` preserves raw query/hash while redirecting to `/timeline`; authenticated `/dashboard` behavior remains unchanged.
8. The standalone smoke validates the configured fixture immediately after `page.goto(PLANT_URL)` and before re-consent or any write-producing action, then selects an exact nested configured plant name, rejects prefix and literal delimiter collisions, and remains scoped to the routed grow.
9. Tent + Plant remain required fixture inputs. Grow name and a second plant remain optional.

This reconciliation changes no schema, RLS, Edge Function, billing, entitlement, sensor vocabulary, telemetry label, Action Queue behavior, device-control surface, workflow trigger, workflow permission, or scanner threshold/suppression.

## Current commit sequence

- `8f866e108` — Trust Core redesign specification
- `cbe31dce4` — T1 implementation plan
- `cfc8b889b` — pure target-integrity rules
- `bfb7b4ea6` — canonical Quick Log display/write target
- `0f14d61f9` — exact One-Tent Loop Quick Log handoff plus #358 Sensors-intent compatibility
- `f7c87bd4c` — scope-preserving route alias plus current App context
- `73dc7d5a9` — authenticated route-target gate
- `f679176ea` — target-fixture alignment
- `fd2d371b3` — save and alias-contract alignment
- `326b54864` — refresh-target contract alignment
- `457a809ba` — initial reconciliation packet
- `331a928d3` — initial port evidence refresh
- `670f5a3fb` — blocked-target integrity repair
- `30e81619f` — canonical target display repair
- `7777a964a` — in-flight target/query-state repair
- `efccc0650` — Quick Log integrity reconciliation
- `99ffcb3f1` — deploy-drift test alignment
- `a6060bb9c` — current-port evidence
- `de2f36257` — shared parent/child save coordination
- `16a90d79f` — quality-repair reconciliation
- `2a1b09391` — immutable child draft and accessible save repair
- `634519210` — final replayed T1 evidence
- `7a8ae8582` — #352 canonical-response target fixture integration
- `662918bbb` — #352 response reconciliation
- `b0556c8f4` — current-deploy reconciliation
- `01e223a70` — shared main-draft freeze and standalone smoke safety
- `726611c9e` — direct-smoke and canonical Harvest documentation alignment

## Tests added

No new test file was added. `quicklog-shared-in-flight-coordination.test.tsx` now drives a deferred RPC through every visible main-draft mutation category and proves native disabled semantics, synchronous custom-handler fences, frozen payloads, unchanged drafts, and success/failure release. `quicklog-e2e-fixture-safety.test.ts` now proves the standalone smoke invokes the shared fixture validator immediately after navigation and before any write-producing action. The strict RED run failed the seven new contracts as expected (33 passed / 7 failed) before production edits.

## Validation results

| Gate                         | Current result                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final-review RED             | **Expected fail — 2 files, 33 passed / 7 failed**; only the new main-draft lock and standalone-smoke contracts failed before implementation                |
| Focused T1/runtime safety    | **Pass — 4 files, 78/78 tests**; target rules, canonical target presenter, shared writer lock, and fixture safety                                          |
| #352 canonical response      | **Pass — 1 file, 16/16 tests**; observation and Better/Same/Worse behavior plus canonical RPC payload                                                      |
| #365/T1 affected overlap     | **Pass — 13 files, 126/126 tests**; CSV acquisition, OAuth, App/manifest, `/dashboard`, and query-preserving `/logs`                                       |
| Prior authoritative T1 slice | **Pass — 16 files, 204/204 tests** before the #365 deploy move; every intersecting/changed surface was rerun in the two focused post-rebase matrices above |
| One-Tent Loop smoke          | **Pass — 24 files, 394/394 tests**                                                                                                                         |
| Static safety                | **Pass — 8 files, 180/180 tests**                                                                                                                          |
| Scanner assertion matrix     | **Pass — 20 files, 330/330 tests**                                                                                                                         |
| Scanner CI timing wrapper    | **Fail — 2 rows exceeded the unchanged 5000 ms threshold; report emitted; no threshold or suppression change**                                             |
| Type-check                   | **Pass — 0 diagnostics** (`bun run typecheck`)                                                                                                             |
| Scoped lint                  | **Pass in commit hook** for the changed TypeScript/TSX files                                                                                               |
| Playwright discovery         | **Pass — 181 tests listed for Quick Log and auth-route protection across setup, authenticated, and mocked projects; no browser execution**                 |
| Fixture checklist            | **Pass — Tent + Plant required; Grow and second plant optional; no secret values printed**                                                                 |
| Docs safety                  | **Pass — automated-phenotyping, release, and sensor checks**                                                                                               |
| Diff/scope checks            | **Pass — 63 files relative to `0f99b1d63`, clean index/worktree before this evidence edit, no conflict markers, and topic diff clean**                     |
| Full repository suite        | **Not run — intentionally excluded by the approved scoped post-rebase validation instruction**                                                             |
| Fixture verification         | **Not run — requires the dedicated disposable fixture**                                                                                                    |
| Authenticated write smoke    | **Not run — requires the dedicated disposable fixture**                                                                                                    |
| Runtime DB/RLS harness       | **Not applicable — no schema, RLS, or server mutation**                                                                                                    |
| `test:security-db-local`     | **No action — documented opt-in infrastructure lane, unrelated to this diff, and non-gating under the baseline standard**                                  |

Scanner timing rows were 7183 ms for `sensor-intelligence-safety.test.ts` and 7881 ms for `vpd-stage-normalization-ownership.test.ts`. All 330 assertions still passed. The timing wrapper ran exactly once, was not rerun, and `test-results/scanner-guardrail-slow-tests.jsonl` was left as its emitted diagnostic artifact. Known non-failing output remains limited to Radix Dialog description warnings, React Router future-flag notices, multiple-GoTrueClient test warnings, and the unrelated non-fatal `sensor-rls-wt` metadata cleanup permission warning after Git operations.

## Safety verdict

- #352's response UI and follow-up semantics are preserved without bypassing T1 target integrity.
- Deploy OAuth restoration, the public MCP route, operator/auth boundaries, and authenticated Sensors tent-intent validation are preserved.
- A resolved target remains immutable for the duration of save and is reused after await boundaries.
- Parent and child saves remain mutually exclusive under one synchronous guard, and every main-draft mutation surface is frozen while either writer owns it.
- Direct `e2e:quicklog-smoke` invocation now performs the same read-only fixture validation before re-consent and writes; Tent + Plant are required and Grow remains optional.
- Harvest comments now match its enabled canonical `quicklog_save_event` persistence behavior without changing product semantics.
- Bad, missing, or contradictory target ownership remains fail-closed with zero writes.
- Existing legacy Unassigned behavior is unchanged; no new assignment product surface was added.
- No schedule/calendar ownership, phase label, age label, sensor-truth label, or clock behavior was changed.
- No fake live state, automation, Action Queue write, AI mutation, device command, schema change, backfill, or secret-bearing output was introduced.

**Safety verdict: safe for final re-review; not yet safe to merge because the scanner timing gate and authenticated disposable-fixture proof remain incomplete.**

## Deferred items

1. Run fixture verification against the dedicated disposable account.
2. Run the authenticated Quick Log smoke and observe that the displayed plant equals `quicklog_save_manual.p_target_id`.
3. Investigate the emitted scanner timing report without changing thresholds or suppressing tests.
4. Treat explicit Unassigned assignment, migration/backfill, authoritative schedule ownership, schedule-source conflict UI, and other non-T1 product work as separate future slices.

## Risk and rollback

Primary behavioral risk remains intentional: legacy plants or tents with missing or contradictory ownership cannot save through Quick Log until assignment is repaired. This slice does not add a migration or alternate write path.

Rollback uses `git revert` on the smallest relevant commit. Do not reset shared history. No data rollback is required because there is no schema migration or row backfill.
