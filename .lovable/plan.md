# Slice — Read-Only Candidate-Number Display Helper

> **STATUS: CONTRACT CONFIRMED — P.2 IMPLEMENTATION AUTHORIZED IN PROTECTED FILES ONLY.**  
> The `candidate_number` data contract has been explicitly confirmed: a direct nullable integer column on `public.plants`, unique within `pheno_hunt_id`, positive-integer values, `NULL` for legacy/unassigned rows, assignment only through the existing authenticated plants write path, immutability while attached to the same hunt, and `service_role` only for exceptional repair. PR #228's separate table + RPC architecture is rejected and must be discarded wholesale. Lovable's production scope remains read-only (helper + adapter/service/timeline consumer wiring) and only after Claude's corrected P.2 files land.

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
1. ✅ New pure helper `src/lib/phenoCandidateLabel.ts` — already implemented. `formatPhenoCandidateLabel({ candidateNumber, candidateLabel, plantName, plantId })` → string; deterministic; null-safe; legacy fallback chain: `candidateLabel → plantName → #<first 8 plant-id characters> → #unknown`.
2. ⛔ Extend `PhenoHuntCandidatePlantRow` with `candidate_number: number | null` — BLOCKED until Claude's corrected P.2 migration lands and the column is visible in the sandbox. Do not approximate the type or add a fallback alias.
3. ⛔ Extend the `plants` SELECT column list in `phenoHuntCandidatesService.ts` — BLOCKED until the corrected P.2 migration is merged and the generated types are refreshed.
4. ⛔ Adapter uses the helper for `candidateLabel` and adds a numeric secondary sort key — BLOCKED until the corrected P.2 migration is merged.
5. ⛔ Timeline section (`PhenoHuntTimelineSection.tsx`) — add the column to its independent SELECT and use the helper — BLOCKED until the corrected P.2 migration is merged.

**Out of scope (do not touch this slice)**
- Any INSERT/UPDATE/DELETE, RPC, or Edge Function.
- Assigning, reserving, or defaulting a candidate number client-side.
- Schema, migration, RLS, grants, generated types regeneration.
- The three protected P.2/P.3 files (see §9). Claude owns them; Lovable must not touch, reformat, or approximate them.
- Keepers/Stress/Sampling/ScoreRounds/AI/Action Queue behavior — they inherit the label through the adapter; no per-surface edits.
- Navigation, copy rewrites, empty-state changes, upgrade gates, billing, auth.
- Sort/order changes anywhere except the adapter's existing sort comparator.
- Editing `PhenoHuntNew.tsx` or any create/assignment path.
- PR #228 in its current form — it must not merge. Its separate `pheno_candidate_numbers` table and `allocate_pheno_candidate_number()` RPC are rejected.

## 4. Exact file-level plan

**Allowed now (Step 1 only):**
- **Create** `src/lib/phenoCandidateLabel.ts` ✅ Done.
- **New test file** `src/test/phenoCandidateLabel.test.ts` ✅ Done.

Both files are preserved. The helper exports:
- `type PhenoCandidateLabelInput = { candidateNumber: number | null | undefined; candidateLabel: string | null; plantName: string | null; plantId: string; }`
- `function formatPhenoCandidateLabel(input): string`
  - If `candidateNumber` is a finite positive integer: return `#${n}` when no textual label, else `#${n} · ${label}` where `label = trimmed candidateLabel || trimmed plantName`.
  - Else: exact legacy fallback chain: `trimmed candidateLabel || trimmed plantName || #<first 8 chars of plantId> || #unknown`.
  - Rejects: non-finite, negative, zero, non-integer, NaN, Infinity → treated as missing.

**Blocked until Claude's corrected P.2 migration is merged and the column is visible in the sandbox:**
- **Edit** `src/lib/phenoHuntCandidateAdapter.ts` — gated: needs `candidate_number` on `PhenoHuntCandidatePlantRow`.
  - Add `candidate_number?: number | null` to `PhenoHuntCandidatePlantRow`.
  - Replace inline `cleanLabel(p.candidate_label) ?? cleanLabel(p.name)` with `formatPhenoCandidateLabel(...)`.
  - Replace the final `candidates.sort(...)` with `comparePhenoCandidatesByNumberThenLabel` (to be added to the helper).

- **Edit** `src/lib/phenoHuntCandidatesService.ts` — gated: needs the corrected migration merged.
  - Add `candidate_number` to the `plants` select list.

- **Edit** `src/components/PhenoHuntTimelineSection.tsx` — gated: needs the corrected migration merged.
  - Add `candidate_number` to its local SELECT.
  - Replace the two `candidate_label`-only render expressions with `formatPhenoCandidateLabel(...)`.
  - Extend the local row type to include the number.

- **Extend** `src/lib/phenoHuntCandidateAdapter.test.ts` (if present) — gated: cannot run adapter-level wiring tests against a confirmed column until the field is present in generated types.

No other files change.

## 5. Data-contract assumptions and hard blockers

**Contract status: CONFIRMED.**

The following contract was explicitly confirmed by Verdant and supersedes any earlier assumptions or PR #228's rejected architecture.

- **Architecture**: direct nullable column on `public.plants`; no separate candidate-number table, no RPC allocator.
- **Identifier / type**: `candidate_number integer NULL`.
- **Uniqueness**: unique within `pheno_hunt_id` via a partial unique index where both `candidate_number` and `pheno_hunt_id` are non-null.
- **Valid value**: positive integer only.
- **Legacy behavior**: `NULL` means legacy/unassigned. Do not backfill existing plants.
- **Assignment**: an authenticated owner may assign the number once through the existing plants write path. P.2 adds no allocator RPC.
- **Immutability**: once non-null, the number cannot change or be cleared while the plant remains attached to the same hunt.
- **Exceptional repair**: `service_role` only; never exposed in client code.
- **Operator access**: operators may view the number through their existing plants access but cannot assign, clear, or renumber it.
- **Lineage**: a tagged plant's `user_id` and `grow_id` must match its `pheno_hunts` row.
- **Hunt/grow changes**:
  - Detaching or changing `pheno_hunt_id` clears `candidate_number`.
  - A plant cannot move to a grow inconsistent with its current hunt.
  - After detaching and moving, a future hunt assignment receives a new number.
- **Sequence semantics**: numbers must be positive and unique within a hunt; they do not need to be gap-free.
- **No automatic backfill, device automation, AI, alerts, or Action Queue behavior.**

**PR #228 decision**: PR #228's separate `pheno_candidate_numbers` table and `allocate_pheno_candidate_number()` RPC architecture is rejected. It must be discarded wholesale rather than partially reused. PR #228 must not merge in its current form.

**Implementation authorization**: The database-layer, RLS, and contract enforcement for this confirmed contract are authorized only inside the three protected P.2/P.3 files owned by Claude. Lovable may not touch those files or create substitutes.

**Lovable wiring remains blocked until**: the corrected P.2 migration is merged, generated types are refreshed, and the `candidate_number` field is visible in the sandbox. Until then, the adapter row type, SELECT lists, comparator, and timeline section remain untouched. The pure helper already implemented (Step 1) is safe because it has no data-layer dependency.

Explicit non-assumptions:
- No assumption about backfill of legacy rows — helper treats null/missing as legacy.
- No assumption about uniqueness enforcement at the display layer — duplicates render honestly; enforcement lives in the database index.
- No assumption about generated-types regeneration timing — the adapter row type is a local subset that already tolerates missing fields, but it must not be extended until the field exists in the database.

## 6. Targeted test plan and validation commands

Allowed now (Step 1 only):
- `src/test/phenoCandidateLabel.test.ts` (Vitest, pure — no Supabase, no React)
  - Happy path: `{ candidateNumber: 3, candidateLabel: "Alpha", plantId: "p1" }` → `#3 · Alpha`.
  - Number only, no label, no name: → `#7`.
  - Legacy: `{ candidateNumber: null, candidateLabel: "Alpha", ... }` → `Alpha`.
  - Legacy fallback chain: label null, name "Plant A" → `Plant A`; both null → returns `plantId`.
  - Invalid numbers rejected (fall through to legacy): `0`, `-1`, `1.5`, `NaN`, `Infinity`, `"3"` (string).
  - Whitespace-only label/name treated as missing.
  - Determinism: same input twice → identical output; no randomness, no `Date.now`.
  - Sort comparator: `[#10, #2, #1, "Zeta", "Alpha", { no label }]` → `[#1, #2, #10, Alpha, Zeta, id-fallback]` deterministically; stable on ties.

Blocked until contract confirmation:
- Adapter regression tests against `src/lib/phenoHuntCandidateAdapter.ts` — cannot run without the confirmed column name on the row type.
- Timeline section tests against `src/components/PhenoHuntTimelineSection.tsx` — cannot run without the confirmed SELECT column.

Validation commands (Step 1 only):
```
bun run lint
bunx tsc --noEmit
bunx vitest run src/test/phenoCandidateLabel.test.ts
```

Full validation commands (after contract confirmation):
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

Safety verdict: safe for Step 1 only. The pure helper is read-only, deterministic, and has no data-layer dependency.

Gated status: adapter/service/timeline wiring cannot be judged safe until the exact `candidate_number` contract is confirmed. Until then, no `plants` SELECT list, row type, comparator, or generated type is changed.

Rollback: for Step 1, delete `src/lib/phenoCandidateLabel.ts` and `src/test/phenoCandidateLabel.test.ts`. After the contract is confirmed and the gated files are edited, rollback extends to reverting those four edited files. Zero data migration in all cases; pre-P.2 builds remain untouched because the adapter currently has no `candidate_number` field to break.

## 9. Protected P.2/P.3 files — untouched confirmation

Explicitly NOT created, edited, renamed, reformatted, or approximated by this slice:
- `supabase/migrations/20260712010343_pheno_candidate_number_foundation.sql`
- `scripts/run-pheno-candidate-number-rls-harness.ts`
- `supabase/tests/pheno_candidate_number_contract.sql`

This slice does not add, remove, or reference those paths, and does not add its own migration, RLS harness, or SQL contract file. Claude's P.3 preservation work is not overlapped.
