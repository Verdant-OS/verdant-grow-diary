/**
 * phenoCloneInsuranceRules — pure "clone insurance" model for Pheno Hunt
 * candidates.
 *
 * THE PROBLEM THIS GUARDS AGAINST: the single irreversible mistake in a
 * hunt is flowering a seed plant with no living clone and then harvesting
 * a candidate you wanted to keep. A seed-grown phenotype only survives as
 * a rooted cutting; once the plant is chopped and no clone exists, that
 * exact individual is gone forever. A breeder takes clones of every
 * candidate in veg, before the flip, precisely so a keeper decision made
 * later is never a decision made too late.
 *
 * WHAT THIS IS: a description of which candidates have no clone recorded,
 * surfaced with stage-aware urgency so the grower can act while it's still
 * possible. It reads the grower's own records and nothing else.
 *
 * SUGGEST-ONLY BY CONSTRUCTION (see AGENTS.md doctrines):
 *  - Verdant never takes, roots, labels, or culls a clone for anyone. This
 *    module only reports what the recorded evidence shows.
 *  - It never ranks candidates, never singles one out as superior, never
 *    claims a candidate is a keeper. "At risk" means "no clone recorded",
 *    never "this is the one to keep".
 *  - A cull decision suppresses the nudge: if the grower recorded "cull",
 *    no clone is expected.
 *
 * PURE: no I/O, no Supabase, no React, no fetch, no AI, no randomness, no
 * module-level clock. Deterministic and null-safe.
 */

import { formatPhenoCandidateLabel } from "@/lib/phenoCandidateLabel";
import { normalizeKeeperDecision } from "@/lib/phenoKeeperDecisionModel";

/**
 * Insurance status for one candidate.
 *  - `insured`         — at least one clone is recorded; the phenotype
 *                        survives harvest.
 *  - `at_risk`         — no clone recorded and flowering is imminent or
 *                        underway, or a keep/hold decision is on record.
 *                        Actionable now.
 *  - `may_be_lost`     — no clone recorded and the candidate is already
 *                        harvested / past flower. Honest past tense.
 *  - `not_applicable`  — no clone recorded, but it is too early to matter,
 *                        or the grower recorded a cull decision.
 */
export type CloneInsuranceStatus =
  | "insured"
  | "at_risk"
  | "may_be_lost"
  | "not_applicable";

/**
 * The cloning window a candidate is in, driving the urgency of the copy.
 *  - `before_flower`   — veg / seedling, no keep intent: clone easily, no
 *                        pressure yet.
 *  - `prime_window`    — the prime moment: pre-flower, or veg with a
 *                        keep/hold decision already recorded.
 *  - `closing_window`  — in flower: a cutting can still root but must
 *                        re-vegetate; getting late.
 *  - `past`            — harvested or later: likely too late.
 */
export type CloneWindow =
  | "before_flower"
  | "prime_window"
  | "closing_window"
  | "past";

export interface CloneInsuranceInput {
  readonly candidateId: string;
  readonly candidateNumber?: number | null;
  readonly candidateLabel?: string | null;
  readonly plantLabel?: string | null;
  readonly stage?: string | null;
  /** True when at least one clone is recorded for this candidate. */
  readonly hasPreservedClone?: boolean | null;
  /** Optional recorded clone count (display only; presence is what gates). */
  readonly cloneCount?: number | null;
  /** Raw keeper decision; normalized here (keep / cull / hold / undecided). */
  readonly keeperDecision?: unknown;
}

export interface CloneInsuranceEvaluation {
  readonly candidateId: string;
  readonly candidateNumber: number | null;
  readonly displayLabel: string;
  readonly status: CloneInsuranceStatus;
  readonly window: CloneWindow;
  readonly hasPreservedClone: boolean;
  readonly cloneCount: number;
  /** True when the grower can still act (status at_risk or may_be_lost). */
  readonly isActionable: boolean;
  readonly headline: string;
  readonly detail: string;
  /** Lower sorts first: most time-critical actionable items lead. */
  readonly priority: number;
}

/**
 * Shown wherever clone insurance is surfaced. Keeps the suggest-only,
 * records-only posture explicit.
 */
export const CLONE_INSURANCE_CAVEAT =
  "Verdant never takes, roots, or culls a clone for you. This only flags candidates with no clone recorded, from the notes you keep.";

type CloningPhase =
  | "seedling"
  | "veg"
  | "preflower"
  | "flower"
  | "harvest"
  | "post"
  | "unknown";

/**
 * Classify a free-text stage for the CLONING decision. This differs from
 * the readiness stage rank: here pre-flower is a distinct, urgent moment
 * (the last comfortable window to clone), separate from deep flower.
 */
export function classifyCloningPhase(stage: string | null | undefined): CloningPhase {
  if (typeof stage !== "string") return "unknown";
  const s = stage.trim().toLowerCase();
  if (s.length === 0) return "unknown";
  // Order matters: check the more specific pre-flower / harvest / cure
  // vocabulary before the broader flower / veg matches.
  if (/(pre[\s_-]?flower|flip|transition|stretch)/.test(s)) return "preflower";
  if (/(harvest|chop)/.test(s)) return "harvest";
  if (/(dry|hang|cur(e|ed|ing)|finished|done|complete|archive)/.test(s)) return "post";
  if (/(flower|bloom|budd?ing)/.test(s)) return "flower";
  if (/(seed|germ|sprout|clone)/.test(s)) return "seedling";
  if (/(veg|grow)/.test(s)) return "veg";
  return "unknown";
}

function toCount(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function displayLabelOf(input: CloneInsuranceInput): string {
  return formatPhenoCandidateLabel({
    candidateNumber: input.candidateNumber ?? null,
    candidateLabel: input.candidateLabel ?? null,
    plantName: input.plantLabel ?? null,
    plantId: input.candidateId,
  });
}

const PRIME_DETAIL = (label: string) =>
  `${label} has no recorded clone. A cutting taken now, in veg, roots easily and preserves this plant even if you later harvest it. Once it is deep in flower a clone has to re-vegetate first.`;

const CLOSING_DETAIL = (label: string) =>
  `${label} is flowering with no recorded clone. A cutting from a lower branch can still root, but it will need to re-vegetate. If you harvest this plant without one, this phenotype is gone.`;

const LOST_DETAIL = (label: string) =>
  `${label} is past flower with no recorded clone. If the plant — or a rooted cutting — is still alive, take and record a clone now; otherwise this exact phenotype can't be recovered.`;

/**
 * Evaluate one candidate's clone insurance. Deterministic and null-safe.
 */
export function evaluateCloneInsurance(
  input: CloneInsuranceInput,
): CloneInsuranceEvaluation {
  const displayLabel = displayLabelOf(input);
  const candidateNumber =
    typeof input.candidateNumber === "number" &&
    Number.isInteger(input.candidateNumber) &&
    input.candidateNumber > 0
      ? input.candidateNumber
      : null;
  const cloneCount = toCount(input.cloneCount);
  const hasPreservedClone = input.hasPreservedClone === true || cloneCount > 0;
  const phase = classifyCloningPhase(input.stage);
  const decision = normalizeKeeperDecision(input.keeperDecision);
  const intentToKeep = decision === "keep" || decision === "hold";
  const beingCulled = decision === "cull";

  const base = {
    candidateId: input.candidateId,
    candidateNumber,
    displayLabel,
    hasPreservedClone,
    cloneCount,
  };

  // Insured always wins: a recorded clone preserves the phenotype
  // regardless of stage or decision.
  if (hasPreservedClone) {
    return {
      ...base,
      status: "insured",
      window: phase === "flower" ? "closing_window" : phase === "harvest" || phase === "post" ? "past" : "before_flower",
      isActionable: false,
      headline: "Clone on file",
      detail:
        cloneCount > 1
          ? `${cloneCount} clones are recorded, so this phenotype is preserved even after harvest.`
          : "A clone is recorded, so this phenotype is preserved even after harvest.",
      priority: 400,
    };
  }

  // A recorded cull decision means no clone is expected.
  if (beingCulled) {
    return {
      ...base,
      status: "not_applicable",
      window: "before_flower",
      isActionable: false,
      headline: "Marked to cull",
      detail: "You've recorded a cull decision for this candidate, so no clone is expected.",
      priority: 500,
    };
  }

  // Past flower with no clone — honest past tense; may still be saveable.
  if (phase === "harvest" || phase === "post") {
    return {
      ...base,
      status: "may_be_lost",
      window: "past",
      isActionable: true,
      headline: "Harvested with no clone on file",
      detail: LOST_DETAIL(displayLabel),
      priority: 200,
    };
  }

  // In flower — closing window, most time-critical live save.
  if (phase === "flower") {
    return {
      ...base,
      status: "at_risk",
      window: "closing_window",
      isActionable: true,
      headline: "In flower with no clone",
      detail: CLOSING_DETAIL(displayLabel),
      priority: 100,
    };
  }

  // Pre-flower / flip — the ideal moment to clone.
  if (phase === "preflower") {
    return {
      ...base,
      status: "at_risk",
      window: "prime_window",
      isActionable: true,
      headline: "No clone yet — clone before you flip",
      detail: PRIME_DETAIL(displayLabel),
      priority: 150,
    };
  }

  // Veg / seedling / unknown. A recorded keep/hold intent makes the lack
  // of a clone an emergency regardless of how early the stage is;
  // otherwise it is too early to nudge (a whole veg population would be
  // noise).
  if (intentToKeep) {
    return {
      ...base,
      status: "at_risk",
      window: "prime_window",
      isActionable: true,
      headline: "Keeping this one? Clone it now",
      detail: `${displayLabel} has a keep decision on record but no clone. A cutting taken now, in veg, roots easily and is the only way this phenotype survives harvest.`,
      priority: 120,
    };
  }

  return {
    ...base,
    status: "not_applicable",
    window: "before_flower",
    isActionable: false,
    headline: "Clone anytime in veg",
    detail:
      "No clone is recorded yet. There is no pressure this early — just take one before you flip so a keeper decision later is never made too late.",
    priority: 600,
  };
}

export interface CloneInsuranceSummary {
  readonly total: number;
  readonly insuredCount: number;
  readonly atRiskCount: number;
  readonly mayBeLostCount: number;
  readonly notApplicableCount: number;
  /** Actionable candidates (at_risk / may_be_lost), most time-critical first. */
  readonly actionable: readonly CloneInsuranceEvaluation[];
  /** True when at least one candidate needs attention. */
  readonly hasActionable: boolean;
}

/**
 * Roll a set of candidate inputs into a hunt-level insurance summary.
 * Actionable items are sorted most-time-critical first (in flower, then
 * pre-flower / keep-intent, then already-harvested), then by candidate
 * number, then label — deterministic.
 */
export function summarizeCloneInsurance(
  inputs: readonly CloneInsuranceInput[],
): CloneInsuranceSummary {
  const evals = (Array.isArray(inputs) ? inputs : []).map(evaluateCloneInsurance);
  let insuredCount = 0;
  let atRiskCount = 0;
  let mayBeLostCount = 0;
  let notApplicableCount = 0;
  for (const e of evals) {
    if (e.status === "insured") insuredCount += 1;
    else if (e.status === "at_risk") atRiskCount += 1;
    else if (e.status === "may_be_lost") mayBeLostCount += 1;
    else notApplicableCount += 1;
  }
  const actionable = evals
    .filter((e) => e.isActionable)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const an = a.candidateNumber;
      const bn = b.candidateNumber;
      if (an !== null && bn !== null && an !== bn) return an - bn;
      if (an !== null && bn === null) return -1;
      if (an === null && bn !== null) return 1;
      return a.displayLabel.localeCompare(b.displayLabel);
    });
  return {
    total: evals.length,
    insuredCount,
    atRiskCount,
    mayBeLostCount,
    notApplicableCount,
    actionable,
    hasActionable: actionable.length > 0,
  };
}

export function cloneInsuranceBannerCopy(summary: CloneInsuranceSummary): string {
  const live = summary.atRiskCount;
  const lost = summary.mayBeLostCount;
  if (live > 0 && lost > 0) {
    return `${live} ${live === 1 ? "candidate" : "candidates"} at risk of being lost, and ${lost} already harvested without a clone. Clone the live ones while you still can.`;
  }
  if (live > 0) {
    return `${live} ${live === 1 ? "candidate has" : "candidates have"} no clone recorded and could be lost at harvest. Clone them while you still can.`;
  }
  if (lost > 0) {
    return `${lost} harvested ${lost === 1 ? "candidate has" : "candidates have"} no clone on file. If a plant or cutting is still alive, clone it now.`;
  }
  return "Every candidate with a keep decision or in flower has a clone recorded.";
}
