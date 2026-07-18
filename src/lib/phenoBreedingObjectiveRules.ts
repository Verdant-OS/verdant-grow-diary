/**
 * phenoBreedingObjectiveRules — pure "breeding objective brief" model for a
 * Pheno Hunt.
 *
 * THE IDEA: before scoring candidates, a breeder writes down what they are
 * actually selecting for — a target ideotype with acceptance thresholds
 * (e.g. "nose loudness >= 7", "stretch <= 2"). Everything downstream then
 * reads against THAT STATED BAR, not against a generic notion of "good".
 *
 * THE DOCTRINE THIS ENFORCES, more strictly than any other pheno module:
 *  - A candidate is scored ONLY against the hunt's OWN targets — never
 *    against any other candidate. This module has no function that accepts
 *    more than one candidate's traits at a time for a scoring verdict; the
 *    only multi-candidate function (`summarizeHuntObjectiveCoverage`)
 *    returns hunt-wide COUNTS only, never a per-candidate ordering.
 *  - "Meets N of M targets you set" is purely descriptive. It is never a
 *    keeper recommendation and never singles a candidate out over the
 *    others. The grower still decides everything; a met target is not
 *    permission to act.
 *  - The axis catalog is NOT reinvented here. Targets are set against the
 *    same `LOUD_TRAIT_AXES` the workspace's own score editor already
 *    captures (`@/lib/phenoExpressionRules`), so a target is always
 *    comparable to real, already-recorded data — never a made-up metric.
 *  - Absent evidence never satisfies a target. A candidate with no
 *    recorded score for an axis reads as "not yet scored" against that
 *    target, never as met and never as failed.
 *
 * PURE: no I/O, no Supabase, no React, no fetch, no AI, no randomness, no
 * module-level clock. Deterministic and null-safe.
 */

import { LOUD_TRAIT_AXES, type PhenoTraitAxis } from "@/lib/phenoExpressionRules";

export type BreedingObjectiveComparator = "gte" | "lte";

export interface BreedingObjectiveTarget {
  readonly axisKey: string;
  readonly comparator: BreedingObjectiveComparator;
  readonly threshold: number;
}

const AXIS_BY_KEY: ReadonlyMap<string, PhenoTraitAxis> = new Map(
  LOUD_TRAIT_AXES.map((a) => [a.key, a]),
);

const VALID_COMPARATORS: ReadonlySet<string> = new Set(["gte", "lte"]);

/** Highest number of targets a hunt can meaningfully hold — one per axis. */
export const MAX_BREEDING_OBJECTIVE_TARGETS = LOUD_TRAIT_AXES.length;

/**
 * Validate and normalize raw target input into a clean target list.
 *  - Unknown axis keys are dropped (never invented).
 *  - Invalid comparators are dropped.
 *  - Non-finite or out-of-axis-range thresholds are dropped, never clamped
 *    or guessed — a silently-clamped threshold would misrepresent what the
 *    grower asked for.
 *  - Duplicate axis keys: the first valid entry wins (a grower editing the
 *    form replaces a target, never stacks two bars on one axis).
 *  - Capped at one target per known axis.
 */
export function sanitizeBreedingObjectiveTargets(
  input: readonly unknown[] | null | undefined,
): BreedingObjectiveTarget[] {
  if (!Array.isArray(input)) return [];
  const out: BreedingObjectiveTarget[] = [];
  const seenAxes = new Set<string>();
  for (const raw of input) {
    if (out.length >= MAX_BREEDING_OBJECTIVE_TARGETS) break;
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const axisKey = typeof r.axisKey === "string" ? r.axisKey.trim() : "";
    if (axisKey === "" || seenAxes.has(axisKey)) continue;
    const axis = AXIS_BY_KEY.get(axisKey);
    if (!axis) continue;
    const comparator = typeof r.comparator === "string" ? r.comparator : "";
    if (!VALID_COMPARATORS.has(comparator)) continue;
    const threshold = typeof r.threshold === "number" ? r.threshold : NaN;
    if (!Number.isFinite(threshold) || threshold < axis.min || threshold > axis.max) continue;
    seenAxes.add(axisKey);
    out.push({
      axisKey,
      comparator: comparator as BreedingObjectiveComparator,
      threshold,
    });
  }
  return out;
}

export interface BreedingObjectiveTargetEvaluation {
  readonly axisKey: string;
  readonly axisLabel: string;
  readonly comparator: BreedingObjectiveComparator;
  readonly threshold: number;
  /** The candidate's own recorded value for this axis, or null if unscored. */
  readonly actualValue: number | null;
  /** null when the candidate has no recorded value for this axis yet. */
  readonly met: boolean | null;
}

function compare(comparator: BreedingObjectiveComparator, actual: number, threshold: number): boolean {
  return comparator === "gte" ? actual >= threshold : actual <= threshold;
}

/**
 * Evaluate ONE candidate's own recorded trait values against a hunt's
 * targets. Never reads or references any other candidate.
 */
export function evaluateCandidateAgainstObjective(
  targets: readonly BreedingObjectiveTarget[],
  candidateTraits: Readonly<Record<string, number>> | null | undefined,
): BreedingObjectiveTargetEvaluation[] {
  const traits = candidateTraits && typeof candidateTraits === "object" ? candidateTraits : {};
  return (Array.isArray(targets) ? targets : []).map((t) => {
    const axis = AXIS_BY_KEY.get(t.axisKey);
    const rawValue = traits[t.axisKey];
    const actualValue = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null;
    return {
      axisKey: t.axisKey,
      axisLabel: axis?.label ?? t.axisKey,
      comparator: t.comparator,
      threshold: t.threshold,
      actualValue,
      met: actualValue === null ? null : compare(t.comparator, actualValue, t.threshold),
    };
  });
}

export interface CandidateObjectiveSummary {
  readonly targetCount: number;
  readonly metCount: number;
  readonly scoredCount: number;
  readonly allMet: boolean;
  readonly evaluations: readonly BreedingObjectiveTargetEvaluation[];
}

/**
 * Roll one candidate's target evaluations into a summary. `allMet` is true
 * only when every target both has a recorded value AND is met — a hunt
 * with zero targets reports `allMet: false` (there is nothing to have met).
 */
export function summarizeCandidateObjective(
  targets: readonly BreedingObjectiveTarget[],
  candidateTraits: Readonly<Record<string, number>> | null | undefined,
): CandidateObjectiveSummary {
  const evaluations = evaluateCandidateAgainstObjective(targets, candidateTraits);
  const scoredCount = evaluations.filter((e) => e.actualValue !== null).length;
  const metCount = evaluations.filter((e) => e.met === true).length;
  return {
    targetCount: evaluations.length,
    metCount,
    scoredCount,
    allMet: evaluations.length > 0 && metCount === evaluations.length,
    evaluations,
  };
}

/**
 * One line of copy describing a candidate's own standing against the
 * hunt's bar. Always framed as "the bar you set" — never a comparison to
 * other candidates, never a recommendation.
 */
export function candidateObjectiveCopy(summary: CandidateObjectiveSummary): string {
  if (summary.targetCount === 0) {
    return BREEDING_OBJECTIVE_EMPTY_COPY;
  }
  const unscored = summary.targetCount - summary.scoredCount;
  if (unscored > 0 && summary.scoredCount === 0) {
    return `Not yet scored against ${summary.targetCount === 1 ? "the target" : `any of the ${summary.targetCount} targets`} you set.`;
  }
  const base = `Meets ${summary.metCount} of ${summary.targetCount} ${summary.targetCount === 1 ? "target" : "targets"} you set`;
  return unscored > 0 ? `${base} (${unscored} not yet scored).` : `${base}.`;
}

export interface HuntObjectiveCoverage {
  readonly targetCount: number;
  readonly candidatesTotal: number;
  /** Candidates with a recorded value for every target axis. */
  readonly candidatesFullyScored: number;
  /** Candidates whose recorded values meet every target. */
  readonly candidatesMeetingAll: number;
}

export interface HuntObjectiveCandidateInput {
  readonly candidateId: string;
  readonly traits: Readonly<Record<string, number>> | null | undefined;
}

/**
 * Hunt-wide COUNTS only — never a per-candidate ordering. This exists so a
 * hunt-level view can say "3 of 8 candidates fully scored against your
 * targets" without exposing, sorting, or singling out which three.
 */
export function summarizeHuntObjectiveCoverage(
  targets: readonly BreedingObjectiveTarget[],
  candidates: readonly HuntObjectiveCandidateInput[],
): HuntObjectiveCoverage {
  const list = Array.isArray(candidates) ? candidates : [];
  const targetCount = Array.isArray(targets) ? targets.length : 0;
  let candidatesFullyScored = 0;
  let candidatesMeetingAll = 0;
  for (const c of list) {
    const summary = summarizeCandidateObjective(targets, c.traits);
    if (summary.targetCount > 0 && summary.scoredCount === summary.targetCount) {
      candidatesFullyScored += 1;
    }
    if (summary.allMet) candidatesMeetingAll += 1;
  }
  return {
    targetCount,
    candidatesTotal: list.length,
    candidatesFullyScored,
    candidatesMeetingAll,
  };
}

/** Axis choices available for a new target, in the canonical catalog order. */
export function availableObjectiveAxes(
  existingTargets: readonly BreedingObjectiveTarget[],
): readonly PhenoTraitAxis[] {
  const used = new Set((Array.isArray(existingTargets) ? existingTargets : []).map((t) => t.axisKey));
  return LOUD_TRAIT_AXES.filter((a) => !used.has(a.key));
}

/**
 * Shown wherever the objective is defined or a candidate's standing
 * against it is shown. Keeps the "your own bar, never a comparison to
 * other candidates" posture explicit.
 */
export const BREEDING_OBJECTIVE_CAVEAT =
  "This compares each candidate only to the bar you set for this hunt — never to each other. Verdant does not pick a phenotype for you.";

export const BREEDING_OBJECTIVE_EMPTY_COPY =
  "No targets set yet. Add a trait axis and a threshold to define what you're selecting for in this hunt.";
