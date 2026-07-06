/**
 * phenoKeeperDecisionModel
 *
 * Pure model for a grower's recorded keeper decision on a hunt candidate:
 * keep / cull / hold / undecided.
 *
 * Suggest-only by construction:
 *  - A decision is a NOTE TO SELF. Recording "cull" never deletes a plant;
 *    recording "keep" never triggers anything. Verdant does not act on a plant
 *    for the grower. The follow-up work a decision might imply is
 *    approval-required and lives in a later slice (the Action Queue), not here.
 *  - This module only normalizes, labels, and tallies decisions for display.
 *  - It never ranks candidates or names a "best" one.
 *
 * No I/O. No fetch. No Supabase. No AI. No writes. Deterministic, null-safe.
 */

export const PHENO_KEEPER_DECISIONS = ["keep", "cull", "hold", "undecided"] as const;
export type PhenoKeeperDecision = (typeof PHENO_KEEPER_DECISIONS)[number];

export const DEFAULT_KEEPER_DECISION: PhenoKeeperDecision = "undecided";

export const PHENO_KEEPER_DECISION_LABELS: Record<PhenoKeeperDecision, string> = {
  keep: "Keep",
  cull: "Cull",
  hold: "Hold",
  undecided: "Undecided",
};

/**
 * Reminder shown wherever decisions are surfaced: recording a decision does
 * nothing on its own. Keeps the suggest-only posture explicit.
 */
export const PHENO_KEEPER_DECISION_CAVEAT =
  "A keeper decision is your own note. Verdant never keeps, culls, or acts on a plant for you — recording a decision changes nothing on its own.";

/** Normalize arbitrary input to a known decision, defaulting to "undecided". */
export function normalizeKeeperDecision(input: unknown): PhenoKeeperDecision {
  if (typeof input === "string") {
    const v = input.trim().toLowerCase();
    if ((PHENO_KEEPER_DECISIONS as readonly string[]).includes(v)) {
      return v as PhenoKeeperDecision;
    }
  }
  return DEFAULT_KEEPER_DECISION;
}

export function keeperDecisionLabel(decision: PhenoKeeperDecision): string {
  return PHENO_KEEPER_DECISION_LABELS[decision];
}

export interface PhenoKeeperDecisionInput {
  readonly candidateId: string;
  readonly candidateLabel?: string | null;
  /** Raw stored value; normalized to a known decision. */
  readonly decision?: unknown;
  readonly decidedAt?: string | null;
  readonly note?: string | null;
}

export interface PhenoKeeperDecisionView {
  readonly candidateId: string;
  readonly candidateLabel: string;
  readonly decision: PhenoKeeperDecision;
  readonly decisionLabel: string;
  readonly decidedAt: string | null;
  readonly note: string | null;
  /** True once the grower has recorded a non-default decision. */
  readonly isRecorded: boolean;
}

export type PhenoKeeperDecisionTally = Record<PhenoKeeperDecision, number>;

export interface PhenoKeeperDecisionSummary {
  /** Per-candidate decision views, in INPUT order (never ranked). */
  readonly candidates: readonly PhenoKeeperDecisionView[];
  readonly tally: PhenoKeeperDecisionTally;
  readonly recordedCount: number;
  readonly undecidedCount: number;
  readonly caveat: string;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function emptyTally(): PhenoKeeperDecisionTally {
  return { keep: 0, cull: 0, hold: 0, undecided: 0 };
}

/** Build the display view for one candidate's keeper decision. */
export function buildKeeperDecisionView(input: PhenoKeeperDecisionInput): PhenoKeeperDecisionView {
  const candidateId = input.candidateId;
  const candidateLabel = cleanString(input.candidateLabel) ?? candidateId;
  const decision = normalizeKeeperDecision(input.decision);
  return {
    candidateId,
    candidateLabel,
    decision,
    decisionLabel: keeperDecisionLabel(decision),
    decidedAt: cleanString(input.decidedAt),
    note: cleanString(input.note),
    isRecorded: decision !== DEFAULT_KEEPER_DECISION,
  };
}

/**
 * Summarize keeper decisions across a set of candidates. Preserves input order
 * (this surface never ranks candidates) and reports a neutral tally.
 */
export function summarizeKeeperDecisions(
  inputs: readonly PhenoKeeperDecisionInput[] | null | undefined,
): PhenoKeeperDecisionSummary {
  const list = Array.isArray(inputs) ? inputs : [];
  const candidates: PhenoKeeperDecisionView[] = [];
  const tally = emptyTally();

  for (const input of list) {
    if (!input || typeof input.candidateId !== "string" || input.candidateId.length === 0) {
      continue;
    }
    const view = buildKeeperDecisionView(input);
    candidates.push(view);
    tally[view.decision] += 1;
  }

  const undecidedCount = tally.undecided;
  const recordedCount = candidates.length - undecidedCount;

  return {
    candidates,
    tally,
    recordedCount,
    undecidedCount,
    caveat: PHENO_KEEPER_DECISION_CAVEAT,
  };
}
