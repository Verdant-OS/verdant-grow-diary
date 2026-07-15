/**
 * phenoCandidateIdentity — the single seam that maps an app-layer
 * `PhenoCandidateInput` (candidateId / candidateLabel / plantLabel /
 * candidateNumber) onto the pure, dependency-free label + comparator in
 * `phenoCandidateLabel.ts` (candidateNumber / candidateLabel / plantName /
 * plantId).
 *
 * WHY THIS EXISTS: `phenoCandidateLabel.ts` is intentionally dependency-free
 * (no import of PhenoCandidateInput) so it can stay a pure island. The adapter,
 * workspace, compare, keepers, timeline, and CSV all speak PhenoCandidateInput,
 * so the field-name bridge lives HERE, in one place, instead of being open-coded
 * (and drifting) at every call site.
 *
 * Pure. No I/O, no Supabase, no React, no time, no randomness. Never fabricates
 * a number — a missing/invalid candidateNumber flows through as unnumbered.
 */
import {
  formatPhenoCandidateLabel,
  comparePhenoCandidatesByNumberThenLabel,
  type PhenoCandidateLabelInput,
} from "@/lib/phenoCandidateLabel";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";

/** Minimal identity shape shared by PhenoCandidateInput and PhenoCandidateView. */
export interface PhenoCandidateIdentity {
  readonly candidateId: string;
  readonly candidateNumber?: number | null;
  readonly candidateLabel?: string | null;
  readonly plantLabel?: string | null;
}

/** Bridge the app candidate shape onto the pure formatter's input shape. */
export function toPhenoCandidateLabelInput(
  candidate: PhenoCandidateIdentity,
): PhenoCandidateLabelInput {
  return {
    candidateNumber: candidate.candidateNumber ?? null,
    candidateLabel: candidate.candidateLabel ?? null,
    plantName: candidate.plantLabel ?? null,
    plantId: candidate.candidateId,
  };
}

/**
 * The canonical on-screen identity string for a candidate. Numbered:
 * `#3 · Sour Zebra` / `#3`. Unnumbered: label -> plant name -> `#<id8>` ->
 * `#unknown`. Use everywhere a candidate is NAMED to a human (card header,
 * keeper dropdown, timeline entry, comparison column).
 */
export function phenoCandidateDisplayLabel(candidate: PhenoCandidateIdentity): string {
  return formatPhenoCandidateLabel(toPhenoCandidateLabelInput(candidate));
}

/**
 * Deterministic comparator for app candidates: numbered ascending, then
 * unnumbered-labeled alphabetically, then id fallback, with an explicit id
 * tie-breaker. Delegates to the pure comparator so ordering is identical across
 * workspace, compare, keepers, and exports.
 */
export function comparePhenoCandidateIdentity(
  a: PhenoCandidateIdentity,
  b: PhenoCandidateIdentity,
): number {
  return comparePhenoCandidatesByNumberThenLabel(
    toPhenoCandidateLabelInput(a),
    toPhenoCandidateLabelInput(b),
  );
}

/** Convenience: sort a copy of candidates by the canonical identity order. */
export function sortPhenoCandidatesByIdentity<T extends PhenoCandidateInput>(
  candidates: readonly T[],
): T[] {
  return [...candidates].sort(comparePhenoCandidateIdentity);
}
