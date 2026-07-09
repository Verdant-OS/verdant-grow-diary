/**
 * phenoHuntOnboardingViewModel — pure guided-setup and readiness logic for
 * Pheno Hunts. No React, no Supabase, no fetch, no time reads.
 *
 * Key rule (honesty ladder — these are NOT the same thing):
 *   Setup complete    = hunt created with goals/candidates.
 *   Ready for tracking = enough to start logging evidence.
 *   Comparison-ready  = enough evidence exists to compare candidates honestly.
 *
 * The ladder is DERIVED from what was actually recorded — it is never stored
 * as a claim, and setup completion alone can never yield "comparison-ready".
 * Keeper decisions are deliberately NOT evidence: deciding is a judgment
 * about evidence, not a recorded observation.
 */

export const PHENO_GOAL_MAX_LENGTH = 500;

export interface PhenoHuntOnboardingDraft {
  name: string;
  goal: string;
  plantIds: readonly string[];
}

export type PhenoHuntOnboardingValidationError =
  | "name_required"
  | "grow_required"
  | "no_candidates"
  | "goal_required"
  | "goal_too_long";

export function validatePhenoHuntOnboardingDraft(
  draft: PhenoHuntOnboardingDraft,
  growId: string | null | undefined,
): PhenoHuntOnboardingValidationError[] {
  const errs: PhenoHuntOnboardingValidationError[] = [];
  if (!draft.name.trim()) errs.push("name_required");
  if (!growId) errs.push("grow_required");
  if (draft.plantIds.length === 0) errs.push("no_candidates");
  const goal = draft.goal.trim();
  if (!goal) errs.push("goal_required");
  else if (goal.length > PHENO_GOAL_MAX_LENGTH) errs.push("goal_too_long");
  return errs;
}

/** Ordered from least to most ready. */
export type HuntReadinessStage =
  | "setup_incomplete"
  | "setup_complete"
  | "ready_for_tracking"
  | "comparison_ready";

export const HUNT_READINESS_ORDER: readonly HuntReadinessStage[] = [
  "setup_incomplete",
  "setup_complete",
  "ready_for_tracking",
  "comparison_ready",
];

export interface HuntReadinessInput {
  /** Persisted, non-empty goal on the hunt row. */
  hasGoal: boolean;
  /** setup_confirmed_at is stamped (grower reviewed and confirmed setup). */
  setupConfirmed: boolean;
  candidateCount: number;
  /** Candidates with at least one recorded evidence signal. */
  candidatesWithEvidence: number;
}

/**
 * Derive the honest readiness stage:
 *   - setup_incomplete: no candidates, or neither a goal nor a confirmation
 *     (nothing meaningful was set up yet).
 *   - setup_complete: created with goals/candidates — but not yet reviewed.
 *     Legacy hunts (pre-guided-setup, goal NULL) are backfilled as confirmed
 *     and therefore never regress below this stage.
 *   - ready_for_tracking: setup confirmed — enough to start logging evidence.
 *   - comparison_ready: at least two candidates each have recorded evidence.
 *     Never granted on setup state alone.
 */
export function deriveHuntReadiness(input: HuntReadinessInput): HuntReadinessStage {
  const setupComplete =
    input.candidateCount >= 1 && (input.hasGoal || input.setupConfirmed);
  if (!setupComplete) return "setup_incomplete";
  if (!input.setupConfirmed) return "setup_complete";
  if (input.candidateCount >= 2 && input.candidatesWithEvidence >= 2) {
    return "comparison_ready";
  }
  return "ready_for_tracking";
}

export interface CandidateEvidenceSignals {
  /** Overall trait scores keyed by plant id. */
  scoresByPlant?: Readonly<Record<string, unknown>>;
  /** Latest sex observation keyed by plant id. */
  sexByPlant?: Readonly<Record<string, unknown>>;
  /** Post-cure smoke test keyed by plant id. */
  smokeByPlant?: Readonly<Record<string, unknown>>;
  /** Lab results keyed "plantId:source". */
  labByKey?: Readonly<Record<string, unknown>>;
  /** Per-round score cards keyed "plantId:round". */
  roundsByKey?: Readonly<Record<string, unknown>>;
}

/** Evidence = a recorded observation. Keeper decisions are NOT evidence. */
export function candidateHasEvidence(
  plantId: string,
  signals: CandidateEvidenceSignals,
): boolean {
  if (signals.scoresByPlant?.[plantId] != null) return true;
  if (signals.sexByPlant?.[plantId] != null) return true;
  if (signals.smokeByPlant?.[plantId] != null) return true;
  const prefix = `${plantId}:`;
  for (const key of Object.keys(signals.labByKey ?? {})) {
    if (key.startsWith(prefix)) return true;
  }
  for (const key of Object.keys(signals.roundsByKey ?? {})) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

export function countCandidatesWithEvidence(
  plantIds: readonly string[],
  signals: CandidateEvidenceSignals,
): number {
  let count = 0;
  for (const id of plantIds) {
    if (candidateHasEvidence(id, signals)) count += 1;
  }
  return count;
}

export const HUNT_READINESS_COPY: Readonly<
  Record<HuntReadinessStage, { label: string; description: string }>
> = {
  setup_incomplete: {
    label: "Setup in progress",
    description:
      "Add a goal and at least one candidate plant, then confirm your setup.",
  },
  setup_complete: {
    label: "Setup complete",
    description:
      "Hunt created with goals and candidates. Confirm your setup to start tracking.",
  },
  ready_for_tracking: {
    label: "Ready for tracking",
    description:
      "Enough to start logging evidence. Not comparison-ready until at least two candidates have recorded evidence.",
  },
  comparison_ready: {
    label: "Comparison-ready",
    description:
      "At least two candidates have recorded evidence — an honest side-by-side comparison is possible.",
  },
};
