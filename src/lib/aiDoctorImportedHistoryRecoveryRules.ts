export type AiDoctorImportedHistoryRecoveryState =
  | "loading"
  | "ready"
  | "decision_required"
  | "omitted_by_choice";

export interface AiDoctorImportedHistoryRecoveryInput {
  hasTentScope?: boolean | null;
  isFetching?: boolean | null;
  isError?: boolean | null;
  omissionAcknowledged?: boolean | null;
}

export interface AiDoctorImportedHistoryRecoveryDecision {
  state: AiDoctorImportedHistoryRecoveryState;
  /** Prevents any AI request or credit spend while evidence is unresolved. */
  blocksReview: boolean;
  /** Keeps the recovery shell reachable even when normal eligibility fails. */
  showsRecovery: boolean;
}

/**
 * Resolve the imported-history read into an explicit grower decision.
 *
 * A previous query error can remain present while React Query refetches. In
 * that case the decision/omission copy stays visible, while `blocksReview`
 * remains true until the refetch settles.
 */
export function resolveAiDoctorImportedHistoryRecovery(
  input: AiDoctorImportedHistoryRecoveryInput | null | undefined,
): AiDoctorImportedHistoryRecoveryDecision {
  if (input?.hasTentScope !== true) {
    return { state: "ready", blocksReview: false, showsRecovery: false };
  }

  const isFetching = input.isFetching === true;
  if (input.isError === true) {
    const state = input.omissionAcknowledged === true ? "omitted_by_choice" : "decision_required";
    return {
      state,
      blocksReview: isFetching || state === "decision_required",
      showsRecovery: true,
    };
  }

  if (isFetching) {
    return { state: "loading", blocksReview: true, showsRecovery: false };
  }

  return { state: "ready", blocksReview: false, showsRecovery: false };
}
