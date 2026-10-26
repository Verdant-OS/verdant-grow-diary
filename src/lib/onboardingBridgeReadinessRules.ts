/**
 * When the /welcome onboarding bridge may show its step count.
 *
 * QA 2026-10-20 bug 8: the bridge rendered "0 of 5 steps done" while the
 * grows, tents, plants or connected sensor/activation evidence it counts
 * were still loading, so it disagreed with the Dashboard pill. The count is
 * held until every applicable read has settled. An
 * unreported loading flag counts as settled, so callers without one keep
 * today's behaviour.
 *
 * Pure: no React, no Supabase.
 */
export const LANDING_ONBOARDING_BRIDGE_LOADING_LABEL = "Checking your setup…" as const;

export interface OnboardingBridgeReadsState {
  growsLoading: boolean | undefined;
  tentsLoading: boolean | undefined;
  plantsLoading: boolean | undefined;
  sensorReadPending?: boolean;
  activationEvidencePending?: boolean;
}

export function isOnboardingBridgeCountReady(state: OnboardingBridgeReadsState): boolean {
  return (
    state.growsLoading !== true &&
    state.tentsLoading !== true &&
    state.plantsLoading !== true &&
    state.sensorReadPending !== true &&
    state.activationEvidencePending !== true
  );
}
