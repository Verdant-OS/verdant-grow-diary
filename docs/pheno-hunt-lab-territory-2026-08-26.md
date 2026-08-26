# Pheno Hunt + LAB territory — audit, dispositions, and completion record (2026-08-26)

**Slice:** `claude/verdant-pheno-hunt-lab-vq6pd9` — owner-assigned major task: audit,
consolidate, and finish the Pheno Hunt and LAB system end to end in one PR.
**Owner:** Claude. **Independent reviewer:** seat to be named by Cheek on the PR
(per `AGENTS.md`; precedent #1092).

Evidence labels follow `AGENTS.md`. Repository facts were measured on this branch
at its base, deploy tip `5e75a3a` (#1129); the audit itself ran 2026-08-25/26.

---

## 1. Source-of-truth decision

`established fact` — searched the entire repository (docs, scripts, workflows,
spikes, fixtures included) for `pheno-garden-keeper` / `garden-keeper`: **zero
occurrences**. `NO_DATA` — the session's repository listing shows no repo
matching pheno/garden/keeper. `established fact` — `CURRENT_STATE.md` records
`claude/breeder-mode-genetics` (2026-08-14) as **superseded and deleted**: the
deploy branch already carries every `src/lib/genetics/*` module it added.

**Decision: the canonical Verdant repository (`verdant-grow-diary` deploy
branch) is the sole production source of truth.** There is no second
implementation to reconcile; nothing was migrated from a prototype. The one
production-behavior authority that binds this territory is
`docs/pheno-keeper-contract.md` (test-enforced), and this slice operates inside
it.

**Hosted-schema reality (`established fact` from `src/integrations/supabase/types.ts`,
regenerated 2026-08-21):** several merged migrations are NOT applied to the
hosted project — `pheno_hunts.parent_hunt_id`, the `pheno_crosses` full-taxonomy
columns (`channel`/`generation`/`recurrent_parent_id`), `pheno_male_evaluations`,
`pheno_pollen_viability_tests`, `breeding_events` + `breeding_log_save_event`,
and the strain reference library. Whether any has been applied since is
`NOT_MEASURED` from the repo. This slice therefore (a) makes client code
tolerate both schema states (deploy-window fallbacks), and (b) builds **no new
UI on unapplied schema**.

## 2. What this slice fixed (headline defects, all verified before fixing)

| #   | Defect (pre-slice)                                                                                                                                                                                                                                                                                               | Fix                                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pheno_hunts` v2 INSERT policy lost v1's grow/tent ownership check (cross-tenant `grow_id`/`tent_id` storable); UPDATE had no WITH CHECK                                                                                                                                                                         | Additive migration `20260825233000` restores both + adds the missing Pro-entitlement RESTRICTIVE policies for the two post-sweep tables (guarded by `to_regclass`)                                                                                                                                   |
| 2   | Trait-key contract break: showcase read `nose/resin/yield/breeding`, which no write path produces — live composites computed from zeros; missing traits coerced to 0 on the one surface that ORDERS candidates                                                                                                   | Canonical vocabulary bridge in `traitsToLoudAxes` (nose_loudness direct; 1–5 quality axes project to 0–10); missing stays `null` end-to-end: unscored candidates list last, unranked, labeled; partial composites renormalize over scored axes; fight-night unknown edges                            |
| 3   | Lab provenance: editor defaulted new rows to `coa`; only the `:coa` row was ever read; saves nulled `total_cannabinoids`/terp pct (data destruction); an all-empty row satisfied the lab evidence goal forever; `tested_at`/`note` dead to the client; compare-path lab/smoke/score reads returned `{}` on error | Source never defaults to coa; best-available row (coa > estimate > unspecified) shown with its OWN source; full-row saves with 0–100 validation; empty saves refused + Clear/delete path; `tested_at`+`note` wired; loaders fail closed (`PhenoEvidenceReadError`); CSV gains honest `lab_*` columns |
| 4   | Live comparison rendered permanently-empty Quick Log/timeline/sensor sections and grey "Photo (demo)" boxes for real photos; the diary readiness goal was unsatisfiable by real diary entries                                                                                                                    | Canonical enrichment: bounded `diary_entries` reads + the provenance-fenced Quick Log tent snapshot mapped onto the comparison inputs (linked, never copied); real `<img>` photos with dates                                                                                                         |
| 5   | Receipt→timeline merge required `details.plant_id`, which `quicklog_save_manual` STRIPS — every production receipt silently skipped (the old test asserted the legacy shape)                                                                                                                                     | Merge derives the candidate from the row's authoritative `plant_id` column; production-shaped regression test                                                                                                                                                                                        |
| 6   | `recordCross` wrote taxonomy columns absent from the hosted schema — recording ANY cross failed in production, and the crosses read silently emptied                                                                                                                                                             | Deploy-window fallback (same pattern as `candidate_number`): legacy 3-type insert/select when the taxonomy columns 42703; explicitly grower-entered taxonomy is never silently dropped (honest error instead)                                                                                        |

Plus: synchronous in-flight guards on every pheno mutation hook (double-click
minted duplicate append-only decision/sex/clone/reversal/cross/stress rows);
decision audit log appended only after the flat write succeeds; save failures
render instead of looking unsaved; keepers/clones/crosses reads fail closed;
herm-cull Action Queue suggestion idempotent across reloads
(`source_decision_id` reuse — still approval-required); lapsed-Pro read-only
wired at the view routes; resumable user-scoped hunt-setup draft; honest load
errors in the setup wizard; user-scoped documentation storage key (was
device-scoped — cross-account leak on shared devices); stability runs gain
grower-entered environment tags with a gated descriptive environment
comparison; baseline-delete confirm; imported-run provenance badge;
pre-harvest cautions on post-cure entry; orphan-route links; dead-code
removal; breeding polish (GA3 option, template titles, blank-boilerplate
omission, create-failure compensation).

## 3. Feature matrix — every discovered feature and its final disposition

Dispositions: **SHIPPED-FIXED** (finished/repaired in this PR), **ALREADY-COMPLETE**
(audited, no defect worth changing), **REMOVED** (dead code deleted),
**CONSOLIDATED**, **DOCUMENTED-DEFERRED** (cannot be safely completed in this
branch; reason recorded — these are the PR's "Remaining limitations").

### Pheno Hunt core

| Feature                                                                | Location                                                   | Disposition                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hunt lifecycle (create/update/delete, guided setup)                    | `phenoHuntService`, `PhenoHuntNew`                         | SHIPPED-FIXED (error states, resumable draft, back link; TOCTOU one-hunt-per-grow check DOCUMENTED-DEFERRED — needs a DB unique constraint, i.e. schema, on an already-populated table)               |
| Onboarding stepper + checklist                                         | `phenoHuntOnboardingViewModel`                             | SHIPPED-FIXED (per-candidate coverage honesty)                                                                                                                                                        |
| Candidate tagging, numbering, identity ordering                        | services + DB triggers                                     | ALREADY-COMPLETE                                                                                                                                                                                      |
| Candidate evidence readiness engine                                    | `phenoCandidateReadiness`                                  | SHIPPED-FIXED (diary goal now satisfiable from real entries; empty-lab-row gate; pre-harvest helper)                                                                                                  |
| Evidence receipts (Quick Log handoff)                                  | capture rules + packets + receipts                         | ALREADY-COMPLETE; timeline merge SHIPPED-FIXED                                                                                                                                                        |
| Candidate comparison (evidence-first, cohort, comparability fences)    | `phenoComparisonViewModel` + `PhenoComparisonView`         | SHIPPED-FIXED (canonical evidence enrichment, real photos, fail-closed loads)                                                                                                                         |
| Trait scoring (overall + staged rounds)                                | scores/rounds services, workspace                          | SHIPPED-FIXED (post-cure round caution; key bridge)                                                                                                                                                   |
| Weighted shortlist / contenders board / fight night / radar            | contenders + fight VMs, showcase                           | SHIPPED-FIXED (missing≠0, partial composites, unscored visible, weight-sum guard)                                                                                                                     |
| Weighted scorecard preset (James Loud 30/25/15/15/15)                  | `phenoIdIngestMapping.LOUD_WEIGHTS`, PhenoID add-on        | ALREADY-COMPLETE — lives ONLY inside the authorized PhenoID carve-out (`docs/pheno-keeper-contract.md`); core stays generic. Untouched                                                                |
| Smoke test (post-cure) + flavor gating                                 | `phenoSmokeTestService`, workspace, `phenoHuntViewAdapter` | SHIPPED-FIXED (entry caution; flavor/potency were already excluded from every composite — verified, kept)                                                                                             |
| Keeper decision + append-only log + follow-up suggestions              | decision model/services, Action Queue service              | SHIPPED-FIXED (ordered writes, in-flight guard, idempotent herm suggestion; grower-only decision verified everywhere)                                                                                 |
| Keepers, clones, reversals, crosses, pedigree, clone insurance         | `phenoKeepersService`, keepers page                        | SHIPPED-FIXED (taxonomy fallback, fail-closed reads, reversal confirm, error surfacing, a11y)                                                                                                         |
| Hunt CSV export                                                        | `phenoHuntCsvExport`                                       | SHIPPED-FIXED (honest lab_* columns appended; existing columns unchanged)                                                                                                                             |
| Stability run ledger + cross-keeper dashboard (#293)                   | `phenoStabilityRunRules`, ledger, index dashboard          | SHIPPED-FIXED (environment tags, gated comparison, baseline confirm, imported badge, roll-up failure signal)                                                                                          |
| Cross-generation objective progress                                    | `phenoGenerationProgressService`                           | DOCUMENTED-DEFERRED — its only write path (`setParentHunt`) targets `pheno_hunts.parent_hunt_id`, absent from the hosted schema; building linking UI would fail at runtime. Read side stays defensive |
| Male evaluation + pollen viability                                     | `phenoMaleEvaluationRules`, two tables                     | DOCUMENTED-DEFERRED — tables not in the hosted schema; entitlement policies pre-added (guarded) by `20260825233000`; UI waits for the operator apply                                                  |
| Sex-reveal AI prompt instruction                                       | `phenoHuntSexRevealRules`                                  | DOCUMENTED-DEFERRED — AI Doctor prompt-assembly wiring is an AI-surface change outside this slice; module stays pure+tested                                                                           |
| Product sampling (session-only) + documentation sections (device-only) | context + components                                       | SHIPPED-FIXED (documentation key now user-scoped); durable account persistence DOCUMENTED-DEFERRED (schema decision)                                                                                  |
| Selection rules comparability grader                                   | `phenoSelectionRules`                                      | REMOVED (570-line orphan; superseded by comparison rules + readiness)                                                                                                                                 |
| Pheno demo surfaces (public + internal, fixtures)                      | demo pages/fixtures                                        | ALREADY-COMPLETE (labeled); contextual demo fixture CONSOLIDATED into `src/lib/demo/` (was imported from `src/test/`)                                                                                 |
| Contextual pheno comparison v0                                         | internal demo                                              | ALREADY-COMPLETE as a labeled internal demo. The LIVE comparison stack is `phenoComparison*` — single implementation                                                                                  |

### LAB / laboratory results

| Feature                                                                         | Location                                                    | Disposition                                                                                                                                                             |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pheno_lab_results` client (read/write/delete, provenance, validation)          | `phenoLabResultsService`, workspace Lab panel, compare, CSV | SHIPPED-FIXED (see headline #3)                                                                                                                                         |
| Below-detection / not-tested semantics; lab name/sample id/COA document columns | schema                                                      | DOCUMENTED-DEFERRED — needs additive schema the hosted project would not have until an operator apply; the `note` field carries lab/sample identity textually meanwhile |
| DB range CHECKs on pct columns                                                  | schema                                                      | DOCUMENTED-DEFERRED (same apply-path reasoning); client validates 0–100 on every write path                                                                             |
| Pathogen screening results                                                      | genetics traceability                                       | ALREADY-COMPLETE — deliberately separate from `pheno_lab_results` (its migration says so); NOT merged                                                                   |

### Breeding + genetics

| Feature                                                                             | Location                                        | Disposition                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured breeding events (6 types) + typed RPC seam + missing-RPC fallback        | genetics lib + BreedingLogNew                   | ALREADY-COMPLETE (fallback verified)                                                                                                                                                                                                                                         |
| Breeding Action Advisor → approval-required Action Queue                            | `breedingActionAdvisor` + `breedingActionQueue` | ALREADY-COMPLETE — suggestions only, no direct writes, verified. `source: "manual"` approximation + unqueryable due dates DOCUMENTED-DEFERRED (needs an action_queue vocabulary/column change — a fenced surface)                                                            |
| Breeding programs (SOP checklist)                                                   | `breedingProgramApi`, pages                     | SHIPPED-FIXED (titles, create compensation, GA3, blank-note omission)                                                                                                                                                                                                        |
| Breeding SOP engine (`breedingSopEngine`/`breedingSopSteps`)                        | constants/lib                                   | DOCUMENTED-DEFERRED — second SOP system with a missing-scores-depress-composite defect and no shipped consumer; flagged as a collision per AGENTS.md single-implementation rule rather than repaired in place. Owner call: delete or converge with `breedingProgramTemplate` |
| Breeding-cycle statistics + missing-event reporting                                 | `calculateBreedingCycleStats` + adapter         | DOCUMENTED-DEFERRED — zero consumers, and its honest rebuild should read `grow_events` breeding subtypes, which depend on the unapplied `20260728163100` reconciliation                                                                                                      |
| Post-cross summaries; Genetic Drift Simulator                                       | —                                               | DOCUMENTED-DEFERRED — `missing evidence`: neither exists anywhere in the repo (code, docs, or specs). Named in the task as "where present"; they are not present, and inventing speculative analytics is deprioritized by the task's own §14                                 |
| Seed-batch creation from `cross_harvest`                                            | —                                               | DOCUMENTED-DEFERRED — the cross→seed-lot→accession link needs schema (no table connects them)                                                                                                                                                                                |
| Genetics Library + traceability (accessions, batches, screening, quarantine, trace) | genetics lib/pages                              | ALREADY-COMPLETE; TraceabilityView back link SHIPPED-FIXED                                                                                                                                                                                                                   |
| XLSX import UI (route removed long ago)                                             | 2 components                                    | REMOVED (route guards stay; shared xlsx LIB modules stay — the live sensor-history import uses them)                                                                                                                                                                         |
| PhenoID add-on layer (ingest, extras, fights)                                       | quarantined tables + mapping                    | ALREADY-COMPLETE — placeholder SKUs pending product sign-off (contract's open item 3); untouched by design                                                                                                                                                                   |

### Routes, navigation, gating

| Feature                                                                      | Disposition                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Labs nav group (Pheno Hunt / Breeding / Lineage Repair / Genetics / …)       | ALREADY-COMPLETE (test-pinned)                                                                                                                                                                                                                                                                             |
| Pro gating (route + presenter + write + RESTRICTIVE RLS)                     | ALREADY-COMPLETE; lapsed-Pro read-only wiring SHIPPED-FIXED                                                                                                                                                                                                                                                |
| Orphan routes (`/diary/pheno-expression-comparison`, `/diary/strains/:slug`) | SHIPPED-FIXED (inbound links from the hunts index + expression diary)                                                                                                                                                                                                                                      |
| Breeding free vs pheno Pro entitlement asymmetry                             | DOCUMENTED-DEFERRED — an owner monetization decision, flagged, not changed                                                                                                                                                                                                                                 |
| `showInNav` metadata inconsistency in `appRouteManifest`                     | DOCUMENTED-DEFERRED (metadata-only; the real nav is test-pinned elsewhere)                                                                                                                                                                                                                                 |
| GxE / AMMI / GGE analytics                                                   | DOCUMENTED-DEFERRED **by design**: ≤12 subjective runs with no replication structure or environment covariates cannot support AMMI/GGE; the shipped, gated descriptive environment comparison (+ insufficient-data states) is the defensible maximum. Decorative implementations are a stop-ship condition |

## 4. Stale documentation corrected in this slice

- `docs/pheno-keeper-contract.md` — open items 1–2 (stage warning, auto/photo
  distinction) marked implemented; item 3 (PhenoID SKUs) still true.
- `docs/roadmap-ai-breeding-model.md` — "traits demo-only, unpersisted" and
  "crossing workflow orphaned" claims marked superseded.
- `docs/advanced-phenotype-hunter-workbook-v1.1-breeding-expansion.md` — the
  "docs-only / not approved for V0 implementation" banner annotated: several
  workbook features have since shipped.
- `docs/contextual-pheno-comparison-v0-audit.md` — marked historical (the
  trait scoring system it lists as future work has shipped).

## 5. Verification

See the PR body for the exact commands and counts (focused suites, typecheck,
lint, build, mocked e2e, and the migration-safety static tests). RED-before-fix
evidence is recorded per commit for the headline regressions (trait bridge
10/10, lab honesty 9/9, receipt merge 1/1 — each failing against the pre-fix
tree, passing after).
