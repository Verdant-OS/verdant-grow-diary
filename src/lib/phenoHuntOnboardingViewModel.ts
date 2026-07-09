/**
 * phenoHuntOnboardingViewModel — pure state machine + status derivation for
 * the Pheno Tracker first-run onboarding flow.
 *
 * Everything in this module is:
 *   - Pure (no React, no Supabase, no time reads, no I/O).
 *   - Deterministic (same input → same output).
 *   - Null-safe.
 *
 * The onboarding UI is a thin presenter over these outputs. Business rules
 * (comparison readiness, missing-evidence labels, candidate count status)
 * live here, not in JSX.
 */

import {
  DEFAULT_SELECTED_EVIDENCE_GOALS,
  PHENO_EVIDENCE_GOALS,
  type PhenoEvidenceGoalId,
} from "@/lib/phenoEvidenceGoals";

export type PhenoOnboardingStepId =
  | "basics"
  | "candidates"
  | "goals"
  | "packet_preview"
  | "checklist";

export const PHENO_ONBOARDING_STEP_ORDER: ReadonlyArray<PhenoOnboardingStepId> = [
  "basics",
  "candidates",
  "goals",
  "packet_preview",
  "checklist",
];

export type PhenoCandidateCountStatus =
  | "none"
  | "tracking_only"
  | "comparison_eligible";

export type PhenoChecklistItemStatus =
  | "ok"
  | "missing"
  | "pending";

export interface PhenoChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly status: PhenoChecklistItemStatus;
  readonly detail: string;
}

export type PhenoOnboardingReadiness =
  | "not_ready"
  | "tracking_only"
  | "comparison_ready";

export interface PhenoOnboardingDraft {
  readonly name: string;
  readonly growId: string | null;
  readonly tentId: string | null;
  readonly notes: string;
  readonly candidateIds: ReadonlyArray<string>;
  readonly evidenceGoals: ReadonlyArray<PhenoEvidenceGoalId>;
  /**
   * Optional per-candidate data the grower has already recorded (e.g. an
   * initial phenotype note or a photo). Passed in from the workspace once
   * the hunt exists; during first-run onboarding this is usually empty.
   */
  readonly candidateEvidence?: ReadonlyArray<{
    readonly candidateId: string;
    readonly hasPhenotypeNote?: boolean;
    readonly hasPhotoOrObservation?: boolean;
    readonly hasLabel?: boolean;
  }>;
}

export interface PhenoOnboardingStep {
  readonly id: PhenoOnboardingStepId;
  readonly label: string;
  readonly complete: boolean;
  readonly reason?: string;
}

export interface PhenoOnboardingViewModel {
  readonly steps: ReadonlyArray<PhenoOnboardingStep>;
  readonly candidateStatus: PhenoCandidateCountStatus;
  readonly candidateStatusLabel: string;
  readonly readiness: PhenoOnboardingReadiness;
  readonly readinessLabel: string;
  readonly checklist: ReadonlyArray<PhenoChecklistItem>;
  readonly evidenceGoalSummary: ReadonlyArray<{
    readonly id: PhenoEvidenceGoalId;
    readonly label: string;
    readonly selected: boolean;
    readonly pending: boolean;
  }>;
  /** True iff the draft is safe to submit to createPhenoHunt. */
  readonly canCreate: boolean;
  /** Human-readable reasons the draft cannot be created yet. */
  readonly blockingReasons: ReadonlyArray<string>;
}

const STEP_LABEL: Record<PhenoOnboardingStepId, string> = {
  basics: "Hunt basics",
  candidates: "Candidate plants",
  goals: "Evidence goals",
  packet_preview: "Evidence packet map",
  checklist: "Comparison-ready checklist",
};

function candidateStatus(count: number): PhenoCandidateCountStatus {
  if (count <= 0) return "none";
  if (count === 1) return "tracking_only";
  return "comparison_eligible";
}

function candidateStatusLabel(status: PhenoCandidateCountStatus): string {
  switch (status) {
    case "none":
      return "No candidates selected yet";
    case "tracking_only":
      return "Tracking only, not comparison-ready";
    case "comparison_eligible":
      return "Comparison-eligible";
  }
}

function readinessLabel(r: PhenoOnboardingReadiness): string {
  switch (r) {
    case "not_ready":
      return "Not comparison-ready yet";
    case "tracking_only":
      return "Ready for tracking";
    case "comparison_ready":
      return "Comparison-ready";
  }
}

/**
 * Build the deterministic onboarding view model. Callers should memoize on
 * the draft input; the function itself does no memoization.
 */
export function computePhenoHuntOnboardingViewModel(
  draft: PhenoOnboardingDraft,
): PhenoOnboardingViewModel {
  const nameOk = draft.name.trim().length > 0;
  const growOk = !!draft.growId;
  const candidateCount = draft.candidateIds.length;
  const status = candidateStatus(candidateCount);
  const goalsOk = draft.evidenceGoals.length > 0;

  const steps: PhenoOnboardingStep[] = [
    {
      id: "basics",
      label: STEP_LABEL.basics,
      complete: nameOk && growOk,
      reason: !nameOk
        ? "Hunt name is required"
        : !growOk
          ? "Linked grow is required"
          : undefined,
    },
    {
      id: "candidates",
      label: STEP_LABEL.candidates,
      complete: candidateCount >= 1,
      reason: candidateCount === 0 ? "Select at least one candidate plant" : undefined,
    },
    {
      id: "goals",
      label: STEP_LABEL.goals,
      complete: goalsOk,
      reason: !goalsOk ? "Select at least one evidence goal" : undefined,
    },
    {
      id: "packet_preview",
      // Preview is informational; completes as soon as candidates exist.
      label: STEP_LABEL.packet_preview,
      complete: candidateCount >= 1,
      reason:
        candidateCount === 0 ? "Add candidates to see the evidence packet map" : undefined,
    },
    {
      id: "checklist",
      label: STEP_LABEL.checklist,
      complete: nameOk && growOk && candidateCount >= 1 && goalsOk,
    },
  ];

  const evidenceMap = new Map<string, NonNullable<PhenoOnboardingDraft["candidateEvidence"]>[number]>();
  for (const e of draft.candidateEvidence ?? []) {
    evidenceMap.set(e.candidateId, e);
  }

  const anyPhenotypeNote = draft.candidateIds.some(
    (id) => evidenceMap.get(id)?.hasPhenotypeNote,
  );
  const allHavePhenotypeNote =
    candidateCount > 0 &&
    draft.candidateIds.every((id) => evidenceMap.get(id)?.hasPhenotypeNote);
  const anyPhoto = draft.candidateIds.some(
    (id) => evidenceMap.get(id)?.hasPhotoOrObservation,
  );
  const anyLabel = draft.candidateIds.some((id) => evidenceMap.get(id)?.hasLabel);

  const checklist: PhenoChecklistItem[] = [
    {
      id: "candidate_count",
      label: "2+ candidates selected",
      status: candidateCount >= 2 ? "ok" : candidateCount === 1 ? "missing" : "missing",
      detail:
        candidateCount >= 2
          ? `${candidateCount} candidates`
          : candidateCount === 1
            ? "1 candidate — tracking only, not comparison-ready"
            : "No candidates selected",
    },
    {
      id: "phenotype_notes",
      label: "Phenotype note per candidate",
      status: allHavePhenotypeNote ? "ok" : anyPhenotypeNote ? "missing" : "missing",
      detail: allHavePhenotypeNote
        ? "Every candidate has a phenotype note"
        : anyPhenotypeNote
          ? "Some candidates are missing a phenotype note"
          : "No phenotype notes yet",
    },
    {
      id: "photo_or_observation",
      label: "Photo or observation per candidate",
      status: anyPhoto ? "ok" : "missing",
      detail: anyPhoto
        ? "At least one candidate has a photo or observation"
        : "No photos or observations yet",
    },
    {
      id: "labels",
      label: "Candidate labels / status",
      status: anyLabel ? "ok" : "missing",
      detail: anyLabel ? "Labels captured" : "No labels captured yet",
    },
    {
      id: "post_harvest",
      label: "Post-harvest notes",
      status: "pending",
      detail: "Recorded after harvest",
    },
    {
      id: "post_cure",
      label: "Post-cure notes",
      status: "pending",
      detail: "Recorded after cure — post-cure follow-up pending",
    },
    {
      id: "replication_readiness",
      label: "Replication readiness",
      status: "pending",
      detail: "Clones / mother assignment recorded when available",
    },
  ];

  let readiness: PhenoOnboardingReadiness = "not_ready";
  if (status === "comparison_eligible" && goalsOk && nameOk && growOk) {
    readiness = "comparison_ready";
  } else if (status === "tracking_only" && goalsOk && nameOk && growOk) {
    readiness = "tracking_only";
  }

  const evidenceGoalSummary = PHENO_EVIDENCE_GOALS.map((g) => ({
    id: g.id,
    label: g.label,
    selected: draft.evidenceGoals.includes(g.id),
    pending: g.startsPending ?? false,
  }));

  const blockingReasons: string[] = [];
  if (!nameOk) blockingReasons.push("Hunt name is required");
  if (!growOk) blockingReasons.push("Linked grow is required");
  if (candidateCount === 0) blockingReasons.push("Select at least one candidate plant");
  if (!goalsOk) blockingReasons.push("Select at least one evidence goal");

  return {
    steps,
    candidateStatus: status,
    candidateStatusLabel: candidateStatusLabel(status),
    readiness,
    readinessLabel: readinessLabel(readiness),
    checklist,
    evidenceGoalSummary,
    canCreate: blockingReasons.length === 0,
    blockingReasons,
  };
}

/** Convenience: default evidence goal selection for a new hunt. */
export function defaultEvidenceGoalSelection(): PhenoEvidenceGoalId[] {
  return [...DEFAULT_SELECTED_EVIDENCE_GOALS];
}
