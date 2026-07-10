/**
 * phenoComparisonActionState — pure derivation of the "Compare candidates"
 * workspace action.
 *
 * A hunt can be Setup complete but still Not comparison-ready. The
 * comparison action is enabled only when there is enough recorded evidence
 * to compare candidates honestly. Never inferred from setup state.
 *
 * No React. No I/O. Deterministic.
 */
import { PHENO_STATUS_LABELS } from "@/constants/phenoOnboardingCopy";
import type { PhenoWorkspaceComparisonReadiness } from "@/components/PhenoHuntSetupProgressCard";

export interface PhenoComparisonActionInput {
  readonly huntId: string | null | undefined;
  readonly candidateCount: number;
  readonly goalsSelected: number;
  readonly allCandidatesHavePhenotypeNote: boolean;
  readonly anyPostHarvestObservation: boolean;
  readonly anyPostCureObservation: boolean;
  /**
   * Optional signal — if provided as `false`, blocks readiness with a
   * "replication readiness" pending reason. If `undefined`, treated as
   * satisfied (post-cure is the deciding gate today).
   */
  readonly replicationReadinessRecorded?: boolean;
}

export interface PhenoComparisonActionState {
  readonly enabled: boolean;
  readonly readiness: PhenoWorkspaceComparisonReadiness;
  readonly label: string;
  readonly reason: string;
  readonly missingEvidence: ReadonlyArray<string>;
  readonly nextStepTarget: string | null;
}

export const PHENO_COMPARISON_HELP_COPY =
  "Add the missing evidence before comparing candidates.";

export function buildPhenoComparisonActionState(
  input: PhenoComparisonActionInput,
): PhenoComparisonActionState {
  const missing: string[] = [];
  let readiness: PhenoWorkspaceComparisonReadiness = "not_ready";

  if (input.candidateCount < 2) {
    missing.push("Add at least 2 candidates");
  }
  if (input.goalsSelected <= 0) {
    missing.push("Select at least one evidence goal");
  }

  if (input.candidateCount >= 2 && input.goalsSelected > 0) {
    if (!input.allCandidatesHavePhenotypeNote) {
      readiness = "missing_evidence";
      missing.push("Add a phenotype note for every candidate");
    } else if (!input.anyPostHarvestObservation) {
      readiness = "pending_until_harvest";
      missing.push("Record post-harvest observations");
    } else if (!input.anyPostCureObservation) {
      readiness = "pending_until_cure";
      missing.push("Record a post-cure smoke test");
    } else if (input.replicationReadinessRecorded === false) {
      readiness = "not_ready";
      missing.push("Record replication readiness (clones / mother assignment)");
    } else {
      readiness = "comparison_ready";
    }
  }

  const enabled = readiness === "comparison_ready" && !!input.huntId;
  const label = enabled
    ? "Compare candidates"
    : PHENO_STATUS_LABELS.notComparisonReadyYet;

  const primaryReason =
    readiness === "missing_evidence"
      ? PHENO_STATUS_LABELS.missingEvidence
      : readiness === "pending_until_harvest"
        ? PHENO_STATUS_LABELS.pendingUntilHarvest
        : readiness === "pending_until_cure"
          ? PHENO_STATUS_LABELS.pendingUntilCure
          : enabled
            ? ""
            : PHENO_COMPARISON_HELP_COPY;

  const nextStepTarget =
    enabled && input.huntId ? `/pheno-hunts/${input.huntId}/compare` : null;

  return {
    enabled,
    readiness,
    label,
    reason: primaryReason,
    missingEvidence: missing,
    nextStepTarget,
  };
}
