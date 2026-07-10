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
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";

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

/**
 * A single missing-evidence hint. `nextStepTarget` is a real in-app route
 * (workspace) or `null` when no safe target exists — presenters MUST render
 * null-target rows as inert helper text, never as a link.
 *
 * Targets never point at /compare. They only send growers to a surface
 * where they can RECORD the missing evidence.
 */
export interface PhenoMissingEvidenceItem {
  readonly id:
    | "add_candidates"
    | "select_goals"
    | "phenotype_notes"
    | "post_harvest"
    | "post_cure"
    | "replication_readiness";
  readonly message: string;
  readonly nextStepLabel: string | null;
  readonly nextStepTarget: string | null;
}

export interface PhenoComparisonActionState {
  readonly enabled: boolean;
  readonly readiness: PhenoWorkspaceComparisonReadiness;
  readonly label: string;
  readonly reason: string;
  readonly missingEvidence: ReadonlyArray<string>;
  readonly missingEvidenceItems: ReadonlyArray<PhenoMissingEvidenceItem>;
  readonly nextStepTarget: string | null;
}

export const PHENO_COMPARISON_HELP_COPY =
  "Add the missing evidence before comparing candidates.";

function workspaceTarget(
  huntId: string | null | undefined,
): string | null {
  if (typeof huntId !== "string" || huntId.trim() === "") return null;
  return `/pheno-hunts/${huntId}/workspace`;
}

export function buildPhenoComparisonActionState(
  input: PhenoComparisonActionInput,
): PhenoComparisonActionState {
  const items: PhenoMissingEvidenceItem[] = [];
  let readiness: PhenoWorkspaceComparisonReadiness = "not_ready";
  const ws = workspaceTarget(input.huntId);

  if (input.candidateCount < 2) {
    items.push({
      id: "add_candidates",
      message: "Add at least 2 candidates",
      nextStepLabel: ws ? "Add candidates in workspace" : null,
      nextStepTarget: ws,
    });
  }
  if (input.goalsSelected <= 0) {
    items.push({
      id: "select_goals",
      message: "Select at least one evidence goal",
      nextStepLabel: ws ? "Set evidence goals" : null,
      nextStepTarget: ws,
    });
  }

  if (input.candidateCount >= 2 && input.goalsSelected > 0) {
    if (!input.allCandidatesHavePhenotypeNote) {
      readiness = "missing_evidence";
      items.push({
        id: "phenotype_notes",
        message: "Add a phenotype note for every candidate",
        nextStepLabel: ws ? "Record phenotype notes" : null,
        nextStepTarget: ws,
      });
    } else if (!input.anyPostHarvestObservation) {
      readiness = "pending_until_harvest";
      items.push({
        id: "post_harvest",
        message: "Record post-harvest observations",
        nextStepLabel: ws ? "Log post-harvest observation" : null,
        nextStepTarget: ws,
      });
    } else if (!input.anyPostCureObservation) {
      readiness = "pending_until_cure";
      items.push({
        id: "post_cure",
        message: "Record a post-cure smoke test",
        nextStepLabel: ws ? "Record post-cure smoke test" : null,
        nextStepTarget: ws,
      });
    } else if (input.replicationReadinessRecorded === false) {
      readiness = "not_ready";
      items.push({
        id: "replication_readiness",
        message: "Record replication readiness (clones / mother assignment)",
        nextStepLabel: ws ? "Record replication readiness" : null,
        nextStepTarget: ws,
      });
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
    missingEvidence: items.map((i) => i.message),
    missingEvidenceItems: items,
    nextStepTarget,
  };
}

/**
 * Derive comparison readiness DIRECTLY from PhenoCandidateInput data on the
 * live compare route. The compare page has no access to scores/decisions,
 * so we approximate:
 *
 *   - phenotype note satisfied when a candidate has ANY expression signal:
 *     traits, aroma descriptors, nose note, or a smoke test.
 *   - post-harvest satisfied when any candidate has a smoke test OR a lab
 *     result attached (both require harvested material).
 *   - post-cure satisfied when any candidate has smoke-test content.
 *
 * Approximation is CONSERVATIVE — when unsure, flag Not comparison-ready.
 */
export function derivePhenoCompareReadinessFromCandidates(
  huntId: string | null | undefined,
  inputs: readonly PhenoCandidateInput[] | null | undefined,
): PhenoComparisonActionState {
  const list = Array.isArray(inputs) ? inputs : [];
  const candidateCount = list.length;

  const hasPhenoSignal = (c: PhenoCandidateInput): boolean => {
    const e = c.expression;
    if (!e) return false;
    if ((e.traits?.length ?? 0) > 0) return true;
    if ((e.aromaDescriptors?.length ?? 0) > 0) return true;
    if (e.noseNote?.trim()) return true;
    const s = e.smokeTest;
    if (
      s &&
      (s.verdict?.trim() ||
        (s.flavorDescriptors?.length ?? 0) > 0 ||
        (s.effectDescriptors?.length ?? 0) > 0)
    ) {
      return true;
    }
    return false;
  };
  const hasSmoke = (c: PhenoCandidateInput): boolean => {
    const s = c.expression?.smokeTest;
    if (!s) return false;
    return !!(
      s.verdict?.trim() ||
      (s.flavorDescriptors?.length ?? 0) > 0 ||
      (s.effectDescriptors?.length ?? 0) > 0
    );
  };
  const hasHarvestSignal = (c: PhenoCandidateInput): boolean =>
    hasSmoke(c) || !!c.expression?.labResult;

  const allHavePheno =
    candidateCount > 0 && list.every(hasPhenoSignal);
  const anyHarvest = list.some(hasHarvestSignal);
  const anyCure = list.some(hasSmoke);

  return buildPhenoComparisonActionState({
    huntId: huntId ?? null,
    candidateCount,
    // Compare page cannot see stored evidence goals; use a conservative >0
    // when candidates exist so goal-selection isn't spuriously flagged as
    // missing on the read-only compare surface. Setup-time gating already
    // owns the goals check.
    goalsSelected: candidateCount > 0 ? 1 : 0,
    allCandidatesHavePhenotypeNote: allHavePheno,
    anyPostHarvestObservation: anyHarvest,
    anyPostCureObservation: anyCure,
  });
}
