
# Slice — Read-Only Candidate-Number Display Helper

## 1. Executive summary

Add one typed, pure helper (`formatPhenoCandidateLabel`) and wire it through the existing candidate adapter so — once the incoming P.2 foundation exposes a stable `candidate_number` — the Pheno Hunt comparison surface, workspace candidate list, and hunt timeline list render a deterministic, honest label (e.g. `#3 · Alpha`) instead of raw names. Legacy rows without a number keep today's exact fallback. No writes, no schema, no mutation, no new query, no new field invented beyond the single column that the P.2 migration is contracted to add.

## 2. Audit findings

Current read/display flow (verified):

- `src/lib/phenoHuntCandidatesService.ts` — SELECTs `plants` via `.select("id, name, candidate_label, strain, stage, grow_id, tent_id, photo_url, is_archived")` for a hunt.
- `src/lib/phenoHuntCandidateAdapter.ts` — pure adapter; row shape `PhenoHuntCandidatePlantRow` currently: `id, name, candidate_label, strain, stage, grow_id, tent_id, photo_url, is_archived`. Produces `PhenoCandidateInput.candidateLabel = cleanLabel(candidate_label) ?? cleanLabel(name)`. Sort key is `candidateLabel`, then id.
- `src/lib/phenoComparisonViewModel.ts` — normalizes `candidateLabel ?? candidateId`, then string-sorts. String sort of `#1, #10, #2` is not numeric — matters once numbers exist.
- `src/components/PhenoComparisonView.tsx` — renders `c.candidateLabel` verbatim (comparison cards).
- `src/pages/PhenoHuntWorkspace.tsx` — filter + several presenters read `c.candidateLabel ?? plantId`.
- `src/components/PhenoHuntTimelineSection.tsx` — its OWN SELECT of `plants` (`select("id,name,strain,candidate_label,tent_id")`) ordered by `candidate_label`. Separate from the adapter.
- Other surfaces reading `candidateLabel` are downstream of the adapter (`usePhenoHuntActivity`, `PhenoKeepersPage`, `PhenoStress*`, `PhenoSamplingWorkspaceTools`, `PhenoExpressionShowcase`) — they get the improved label for free.

No client code today assigns, increments, or writes a candidate number. Good baseline.

## 3. Recommended build scope

Build ONE thing: a pure display helper + minimal wiring.

**In scope**
1. New pure helper `src/lib/phenoCandidateLabel.ts` — `formatPhenoCandidateLabel({ candidateNumber, candidateLabel, plantName, plantId })` → string; deterministic; null-safe; legacy fallback identical to today.
2. Extend `PhenoHuntCandidatePlantRow` with `candidate_number: number | null` (optional field; adapter treats missing as null so pre-migration builds stay safe).
3. Extend the `plants` SELECT column list in `phenoHuntCandidatesService.ts` to include the new column name (see §5 for the hard blocker on the exact identifier).
4. Adapter uses the helper for `candidateLabel`; adds a numeric secondary sort key so `#2` precedes `#10`.
5. Timeline section (`PhenoHuntTimelineSection.tsx`) — add the column to its independent SELECT and use the same helper for the two labels it renders. Keep the SQL ORDER BY unchanged (stable enough; final display order comes from the helper output + client sort where it already sorts).

**Out of scope (do not touch this slice)**
- Any INSERT/UPDATE/DELETE, RPC, or Edge Function.
- Assigning, reserving, or defaulting a candidate number client-side.
- Schema, migration, RLS, grants, generated types regeneration.
- The three protected P.2/P.3 files (see §9).
- Keepers/Stress/Sampling/ScoreRounds/AI/Action Queue behavior — they inherit the label through the adapter; no per-surface edits.
- Navigation, copy rewrites, empty-state changes, upgrade gates, billing, auth.
- Sort/order changes anywhere except the adapter's existing sort comparator.
- Editing `PhenoHuntNew.tsx` or any create/assignment path.

## 4. Exact file-level plan

- **Create** `src/lib/phenoCandidateLabel.ts`
  - Export `interface PhenoCandidateLabelInput { candidateNumber: number | null | undefined; candidateLabel: string | null | undefined; plantName?: string | null; plantId: string; }`
  - Export `function formatPhenoCandidateLabel(input): string`
    - If `candidateNumber` is a finite positive integer: return `#${n}` when no textual label, else `#${n} · ${label}` where `label = trimmed candidateLabel || trimmed plantName`.
    - Else: exact current behavior — `trimmed candidateLabel || trimmed plantName || plantId`.
    - Rejects: non-finite, negative, zero, non-integer, NaN, Infinity → treated as missing.
  - Export `function comparePhenoCandidatesByNumberThenLabel(a, b)` for deterministic sort: numbered candidates first (ascending numeric), then unnumbered alphabetical, tie-break by id.

- **Edit** `src/lib/phenoHuntCandidateAdapter.ts`
  - Add `candidate_number?: number | null` to `PhenoHuntCandidatePlantRow`.
  - Replace inline `cleanLabel(p.candidate_label) ?? cleanLabel(p.name)` with `formatPhenoCandidateLabel(...)`.
  - Replace the final `candidates.sort(...)` with `comparePhenoCandidatesByNumberThenLabel`.

- **Edit** `src/lib/phenoHuntCandidatesService.ts`
  - Add the new column to the `plants` select list (single identifier — see §5).

- **Edit** `src/components/PhenoHuntTimelineSection.tsx`
  - Add the column to its local SELECT.
  - Replace the two `candidate_label`-only render expressions with `formatPhenoCandidateLabel(...)`.
  - Extend the local row type to include the number.

- **New test file** `src/test/phenoCandidateLabel.test.ts` (see §6).
- **Extend** `src/lib/phenoHuntCandidateAdapter.test.ts` (if present) or add a small adapter test covering: legacy row (no number), numbered row, mixed sort order, invalid number rejection.

No other files change.

## 5. Data-contract assumptions and hard blockers

Confirmed:
- The P.2 migration `20260712010343_pheno_candidate_number_foundation.sql` will add a stable, server-assigned per-hunt candidate number to `plants` (or a joinable view). No client assignment path exists or is planned in this slice.

Hard blocker — must be resolved by the user before the file-level plan can be finalized:
- **Exact column identifier** on `plants` (assumed `candidate_number: integer | null`, but not verifiable from current code — the migration file is protected and not-yet-present in this sandbox).
- **Whether the column lives on `plants` directly** or on a joined table/view. If it's a join, the SELECT column list and the row type differ.
- **Type**: `int`, `smallint`, or `bigint` — affects the JS type guard (all fit `number`, but confirm to keep the guard honest).

If any of the three is not `candidate_number: integer on public.plants`, do NOT invent a column name, RPC, view name, or generated type. Stop the build after Step 1 (the pure helper + tests) and report the exact mismatch. The helper alone is safe and useful; wiring waits.

Explicit non-assumptions:
- No assumption about backfill of legacy rows — helper treats null/missing as legacy.
- No assumption about uniqueness enforcement — pure display only, so duplicates would render honestly.
- No assumption about generated-types regeneration timing — the adapter row type is a local subset that already tolerates missing fields.

## 6. Targeted test plan and validation commands

New/updated tests (Vitest, pure — no Supabase, no React):

- `src/test/phenoCandidateLabel.test.ts`
  - Happy path: `{ candidateNumber: 3, candidateLabel: "Alpha", plantId: "p1" }` → `#3 · Alpha`.
  - Number only, no label, no name: → `#7`.
  - Legacy: `{ candidateNumber: null, candidateLabel: "Alpha", ... }` → `Alpha`.
  - Legacy fallback chain: label null, name "Plant A" → `Plant A`; both null → returns `plantId`.
  - Invalid numbers rejected (fall through to legacy): `0`, `-1`, `1.5`, `NaN`, `Infinity`, `"3"` (string).
  - Whitespace-only label/name treated as missing.
  - Determinism: same input twice → identical output; no randomness, no `Date.now`.
  - Sort comparator: `[#10, #2, #1, "Zeta", "Alpha", { no label }]` → `[#1, #2, #10, Alpha, Zeta, id-fallback]` deterministically; stable on ties.
- Adapter regression:
  - Row missing `candidate_number` field entirely → produces today's label byte-for-byte.
  - Mixed hunt (some numbered, some legacy) → correct sort, no crash, no fabrication.

Validation commands (report exact counts):
```
bun run lint
bunx tsc --noEmit
bunx vitest run src/test/phenoCandidateLabel.test.ts src/lib/phenoHuntCandidateAdapter.test.ts
bunx vitest run
```
No Playwright required — read-only display only, no route/nav change. Skip Playwright honestly rather than run irrelevant specs.

## 7. Mobile safety checks

Manual check at 320 / 360 / 375 px on the three touched surfaces:
- `PhenoComparisonView` candidate card header — `#12 · Alpha Cake OG` must not clip; card already uses truncation, verify no overflow of the new prefix.
- `PhenoHuntWorkspace` candidate list rows + filter chip — the `#N` prefix should not cause horizontal scroll; existing flex layout should handle it, verify.
- `PhenoHuntTimelineSection` per-candidate list — two-line stack acceptable; ensure the `#N · Name — Label` string wraps rather than clips.
- Selector/dropdown crowding (Sampling, Stress lists that render `candidateLabel`) — no changes needed, but spot-check that the longer prefixed label doesn't push select controls off-screen.
No CSS changes planned; if a real overflow shows up, it's a follow-up slice, not this one.

## 8. Safety verdict and rollback boundary

Safety verdict: safe. Read-only, pure helper, additive adapter field, one extra column in two existing SELECTs. No schema, no RLS, no grants, no Edge Function, no auth, no billing, no AI, no Action Queue, no automation, no device control, no navigation, no copy churn, no fake live data.

Rollback: revert the four edited files + delete the two new test/helper files. Zero data migration, zero state to unwind. Pre-P.2 builds keep working because the adapter treats a missing `candidate_number` as null (legacy fallback).

## 9. Protected P.2/P.3 files — untouched confirmation

Explicitly NOT created, edited, renamed, reformatted, or approximated by this slice:
- `supabase/migrations/20260712010343_pheno_candidate_number_foundation.sql`
- `scripts/run-pheno-candidate-number-rls-harness.ts`
- `supabase/tests/pheno_candidate_number_contract.sql`

This slice does not add, remove, or reference those paths, and does not add its own migration, RLS harness, or SQL contract file. Claude's P.3 preservation work is not overlapped.
