## Goal

Extend the existing Pheno Hunt system so each hunt can run against a canonical 10-step breeding SOP (P1 → F1 → F2 → BX1F1 → BX1F2 → BX2F1 → BX3 → stabilization). Verdant shows the current step, its selection criteria, and candidate suggestions from real phenotype data. The grower approves every generation transition through the Action Queue. No blind advancement, no fabricated data.

## Slice 0 — Fix RLS lineage check on pheno_keeper_clones (shipped)

- Migration replaced the tautological WITH CHECK with a predicate that verifies `parent_clone_id` exists, is owned by the caller, and shares the same `keeper_id`.
- Security finding `pheno_keeper_clones_self_referential_check` cleared.
- Follow-up in Slice 2 adds a runtime RLS harness (`scripts/run-pheno-keeper-clones-rls-harness.ts`) that proves cross-keeper parent linking is rejected.

## Slice 1 — SOP as constants + advisor (pure, no schema)

Deliverables:

- `src/constants/breedingSopSteps.ts` — the 10 canonical steps from the source SOP, encoded as a typed `readonly` array with `id`, `label`, `generation` (`P1|F1|F2|BX1F1|BX1F2|BX2F1|BX3F1|BX3Fn`), `parentStepIds`, `selectionCriteria` (structured: yield / resin / disease-resistance / flowering-time / aroma / effects, each `weight` + `required` + `notes`), `advanceRequires` (list of criteria that must be marked `met`), and `guidance` copy.
- `src/lib/breeding/breedingSopEngine.ts` — pure functions:
  - `getStep(id)`
  - `getNextStep(currentId)`
  - `evaluateCandidate(step, phenoScores)` → `{score, meetsRequired, missingCriteria[]}`
  - `rankCandidates(step, candidates)` → deterministic sort with explicit tie-breakers
  - `canAdvance(step, selectedCandidateIds, phenoScores)` → boolean + reasons
- No I/O, no Supabase calls, no randomness. All logic covered by `src/test/breedingSopEngine.test.ts` (happy path, edge, null, deterministic, safety fence: never returns `canAdvance=true` when a required criterion is missing).

Files:
- created `src/constants/breedingSopSteps.ts`
- created `src/lib/breeding/breedingSopEngine.ts`
- created `src/test/breedingSopEngine.test.ts`

## Slice 2 — Schema for programs + runtime RLS harness

Deliverables:

- Migration adds:
  - `public.breeding_programs` (`id`, `user_id`, `hunt_id` FK → `pheno_hunts`, `name`, `p1_maternal_label`, `p1_paternal_label`, `notes`, timestamps).
  - `public.breeding_program_steps` (`id`, `user_id`, `program_id` FK, `sop_step_id` text FK to constants, `status` enum `pending|active|complete|skipped`, `activated_at`, `completed_at`, `selected_clone_ids` uuid[], `criteria_met` jsonb, `note`, timestamps).
- Both tables: `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated;` + `GRANT ALL ... TO service_role;` (no anon), RLS enabled, owner-only policies scoped by `auth.uid()`. All FKs validated via `EXISTS ... AND user_id = auth.uid()` in `WITH CHECK` — the exact pattern Slice 0 fixed, applied correctly from day one.
- New static safety test `src/test/breeding-schema-safety.test.ts` asserts every new policy uses `auth.uid()`, no `USING (true)` / `WITH CHECK (true)`, and no anon grant on the two new tables — using the same fingerprints the `check:supabase-security` guardrail scans.
- Runtime harness `scripts/run-pheno-keeper-clones-rls-harness.ts` creates two users, tries to link a clone under user A to a parent under user B, and asserts the insert is rejected. Same harness pattern extended for `breeding_programs` and `breeding_program_steps`.

Files:
- migration `supabase/migrations/<ts>_breeding_programs.sql`
- created `src/test/breeding-schema-safety.test.ts`
- created `scripts/run-pheno-keeper-clones-rls-harness.ts`

## Slice 3 — View models + read-only UI

Deliverables:

- `src/lib/breeding/breedingProgramViewModel.ts` — joins `breeding_programs` + `breeding_program_steps` + the SOP constants + user's `pheno_candidate_scores` / `pheno_smoke_tests` / `pheno_lab_results` into a `BreedingProgramSummary` with `currentStep`, `criteriaProgress`, `topCandidates` (ranked, evidence-tagged), and `blockedReasons`.
- `src/hooks/useBreedingProgram.ts` — read-only fetch hook, no mutations, retries off, respects Supabase RLS.
- `src/pages/BreedingProgram.tsx` — presenter route at `/breeding/:programId`. Sections: SOP step banner, criteria checklist, top-5 candidate table with evidence chips (yield / resin / disease / flowering / aroma / effects), grower notes read-only, `Suggest advance to next step` CTA (disabled with reason when `canAdvance` is false).
- Link into existing Pheno Hunt detail page as `Open breeding program` when a program exists for that hunt.
- No AI calls yet, no writes.

Files:
- created `src/lib/breeding/breedingProgramViewModel.ts`
- created `src/hooks/useBreedingProgram.ts`
- created `src/pages/BreedingProgram.tsx`
- edited `src/pages/PhenoHuntCompare.tsx` (or the existing hunt detail page) to add the deep link

## Slice 4 — Suggest-and-approve via Action Queue

Deliverables:

- Edge function `supabase/functions/breeding-suggest-advance/index.ts`:
  - JWT-verified, validates `program_id` ownership, calls `evaluateCandidate` / `canAdvance` server-side, and — if allowed — enqueues an `action_queue` row of kind `breeding_advance_step` with structured payload (`program_id`, `from_step_id`, `to_step_id`, `selected_clone_ids`, `evidence_snapshot`).
  - Returns `{ok, action_queue_id, canAdvance, reasons[]}`.
  - Uses `ai_credit_spend` RPC if AI ranking is requested; suggest-only path skips AI to preserve free tier.
- The action queue row is **approval-required**. Grower approves in the existing queue UI; approval marks the current step `complete` and the next step `active`. No auto-execution, no device control.
- Alerts and AI Doctor are not called from this slice.
- Tests:
  - `src/test/breeding-suggest-advance-safety.test.ts` — static scan asserts the edge function verifies JWT, never trusts client `user_id`, uses `service_role` only server-side, and always writes with `approval_required=true`.
  - Runtime harness verifies a cross-user program id is rejected.

Files:
- created `supabase/functions/breeding-suggest-advance/index.ts`
- created `src/test/breeding-suggest-advance-safety.test.ts`
- extended runtime harness

## Non-goals (explicitly deferred)

- No changes to `pheno_hunts`, `pheno_keepers`, `pheno_candidate_scores`, `pheno_smoke_tests`, `pheno_lab_results` schemas.
- No AI Doctor prompt changes, no new AI Doctor call path.
- No device control, no environment automation, no auto-selfing/auto-crossing simulation.
- No public-share / community surface.
- No changes to Quick Log, sensor read-path, billing, or MCP.

## Safety guarantees

- Every new policy uses `auth.uid()` — no `USING (true)`, no `WITH CHECK (true)`.
- Every cross-table check in RLS references the incoming row's column (the exact pattern Slice 0 fixed), enforced by `src/test/breeding-schema-safety.test.ts` + the `check:supabase-security` CI baseline.
- All AI-tagged suggestions include a visible evidence snapshot; no fabricated data.
- All step advancement flows through Action Queue with human approval — matches Verdant's read-only + approval-required posture.
- Cultivation guidance follows workspace-knowledge rules: no bro-science, no aggressive stress recommendations for autoflowers, no nutrient escalations from weak evidence.

## Sequencing

- Slice 0 — shipped now.
- Slice 1 — small, pure, safe. Ready after your ack.
- Slice 2 — schema + tests. Migration goes through the approval flow.
- Slice 3 — UI. Read-only.
- Slice 4 — edge function + Action Queue write. Last, because it is the only write path.

I will pause after each slice and wait for green validation counts before starting the next.

## Open questions

1. Should Slice 1's `guidance` copy include the source SOP text verbatim (attribution and licensing?), or a rewritten grower-facing paraphrase?
2. Do you want the initial P1 pairing hard-coded to Afghan × Colombian as the source SOP describes, or generalized so any two P1 labels can seed a program from day one?
3. AI-ranked candidate suggestion in Slice 4 — enable now (costs AI credits per suggest) or defer to a later slice and ship deterministic ranking only?
