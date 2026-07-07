/**
 * Pure advisor for the Verdant breeding SOP.
 *
 * No I/O. No randomness. No Supabase calls. Deterministic output only.
 * All ranking uses stable, explicit tie-breakers. Nothing here executes an
 * action — the UI and edge function must route every advancement through
 * the Action Queue with grower approval.
 */

import {
  BREEDING_CRITERIA_IDS,
  BREEDING_SOP_STEPS,
  type BreedingCriterionId,
  type BreedingSopStep,
} from "@/constants/breedingSopSteps";

/**
 * A grower-scored candidate. Scores are 0..1 per criterion. Missing values
 * are treated as "not scored" (never as 0 for ranking, never as met for gating).
 */
export interface CandidateScores {
  readonly candidateId: string;
  readonly scores: Partial<Record<BreedingCriterionId, number>>;
  /** Explicit met flags. A criterion may score high but still be marked not met. */
  readonly met?: Partial<Record<BreedingCriterionId, boolean>>;
  /** Optional deterministic tie-breaker — lower wins first. */
  readonly evidenceCount?: number;
}

export interface CandidateEvaluation {
  readonly candidateId: string;
  /** Weighted score in [0, 1]. Missing criteria contribute 0 to numerator. */
  readonly score: number;
  /** True only if every required criterion is explicitly marked met. */
  readonly meetsRequired: boolean;
  readonly missingCriteria: readonly BreedingCriterionId[];
}

export interface CanAdvanceResult {
  readonly canAdvance: boolean;
  readonly reasons: readonly string[];
}

const STEPS_BY_ID: ReadonlyMap<string, BreedingSopStep> = new Map(
  BREEDING_SOP_STEPS.map((s) => [s.id, s]),
);

const STEPS_BY_ORDER: readonly BreedingSopStep[] = [...BREEDING_SOP_STEPS].sort(
  (a, b) => a.order - b.order,
);

export function getStep(id: string | null | undefined): BreedingSopStep | null {
  if (!id) return null;
  return STEPS_BY_ID.get(id) ?? null;
}

export function getNextStep(currentId: string | null | undefined): BreedingSopStep | null {
  if (!currentId) return STEPS_BY_ORDER[0] ?? null;
  const current = STEPS_BY_ID.get(currentId);
  if (!current) return null;
  const idx = STEPS_BY_ORDER.findIndex((s) => s.id === current.id);
  if (idx < 0 || idx + 1 >= STEPS_BY_ORDER.length) return null;
  return STEPS_BY_ORDER[idx + 1] ?? null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function evaluateCandidate(
  step: BreedingSopStep | null | undefined,
  candidate: CandidateScores | null | undefined,
): CandidateEvaluation {
  const candidateId = candidate?.candidateId ?? "";
  if (!step || !candidate) {
    return { candidateId, score: 0, meetsRequired: false, missingCriteria: [] };
  }

  let weighted = 0;
  let weightSum = 0;
  for (const criterion of step.selectionCriteria) {
    weightSum += criterion.weight;
    const raw = candidate.scores?.[criterion.id];
    if (typeof raw === "number") {
      weighted += clamp01(raw) * criterion.weight;
    }
  }
  const score = weightSum > 0 ? weighted / weightSum : 0;

  const missing: BreedingCriterionId[] = [];
  for (const req of step.advanceRequires) {
    if (candidate.met?.[req] !== true) missing.push(req);
  }

  return {
    candidateId,
    score,
    meetsRequired: missing.length === 0,
    missingCriteria: missing,
  };
}

/**
 * Deterministic ranking. Sort order:
 *   1. meetsRequired desc (true first)
 *   2. score desc
 *   3. evidenceCount desc (more evidence wins ties)
 *   4. candidateId asc (stable final tie-breaker)
 */
export function rankCandidates(
  step: BreedingSopStep | null | undefined,
  candidates: readonly CandidateScores[] | null | undefined,
): readonly CandidateEvaluation[] {
  if (!step || !candidates || candidates.length === 0) return [];
  const evaluated = candidates.map((c) => ({
    evaluation: evaluateCandidate(step, c),
    evidenceCount: c.evidenceCount ?? 0,
  }));
  evaluated.sort((a, b) => {
    if (a.evaluation.meetsRequired !== b.evaluation.meetsRequired) {
      return a.evaluation.meetsRequired ? -1 : 1;
    }
    if (a.evaluation.score !== b.evaluation.score) {
      return b.evaluation.score - a.evaluation.score;
    }
    if (a.evidenceCount !== b.evidenceCount) {
      return b.evidenceCount - a.evidenceCount;
    }
    return a.evaluation.candidateId.localeCompare(b.evaluation.candidateId);
  });
  return evaluated.map((e) => e.evaluation);
}

export function canAdvance(
  step: BreedingSopStep | null | undefined,
  selectedCandidateIds: readonly string[] | null | undefined,
  candidates: readonly CandidateScores[] | null | undefined,
): CanAdvanceResult {
  const reasons: string[] = [];
  if (!step) {
    return { canAdvance: false, reasons: ["Unknown SOP step."] };
  }
  const ids = selectedCandidateIds ?? [];
  if (ids.length === 0) {
    reasons.push("Select at least one candidate before advancing.");
  }
  const byId = new Map((candidates ?? []).map((c) => [c.candidateId, c]));
  for (const id of ids) {
    const candidate = byId.get(id);
    if (!candidate) {
      reasons.push(`Selected candidate not found: ${id}`);
      continue;
    }
    const evaluation = evaluateCandidate(step, candidate);
    if (!evaluation.meetsRequired) {
      for (const missing of evaluation.missingCriteria) {
        reasons.push(`${id}: required criterion not met — ${missing}`);
      }
    }
  }
  return { canAdvance: reasons.length === 0, reasons };
}

// Re-export for consumers that want a stable module boundary.
export { BREEDING_CRITERIA_IDS, BREEDING_SOP_STEPS };
