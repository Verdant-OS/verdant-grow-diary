import type { SubscriberGrowthCounts } from "@/lib/subscriberGrowthSnapshotRules";

export type SubscriberActivationStatus =
  | "no_active_paid"
  | "metrics_unavailable"
  | "integrity_mismatch"
  | "activation_incomplete"
  | "activation_observed";

export interface SubscriberActivationViewModel {
  activePaid: number;
  withGrow: number;
  withTent: number;
  withPlant: number;
  withFirstSignal: number;
  coreActivated: number;
  needsCoreActivation: number;
  activationRatePercent: number | null;
  status: SubscriberActivationStatus;
  statusLabel: string;
  guidance: string;
}

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/**
 * Builds a conservative, aggregate-only activation funnel. It never treats
 * product activity as billing state and refuses to calculate a rate when the
 * server counts contradict the authoritative active-paid total.
 */
export function buildSubscriberActivationViewModel(
  counts: SubscriberGrowthCounts,
): SubscriberActivationViewModel {
  const activePaid = safeCount(counts.activePaid);
  const withGrow = safeCount(counts.activePaidWithGrow);
  const withTent = safeCount(counts.activePaidWithTent);
  const withPlant = safeCount(counts.activePaidWithPlant);
  const withFirstSignal = safeCount(counts.activePaidWithFirstSignal);
  const coreActivated = safeCount(counts.activePaidCoreActivated);
  const stageCounts = [withGrow, withTent, withPlant, withFirstSignal];
  const integrityMismatch =
    stageCounts.some((count) => count > activePaid) ||
    coreActivated > activePaid ||
    stageCounts.some((count) => coreActivated > count);

  if (activePaid === 0) {
    return {
      activePaid,
      withGrow,
      withTent,
      withPlant,
      withFirstSignal,
      coreActivated,
      needsCoreActivation: 0,
      activationRatePercent: null,
      status: "no_active_paid",
      statusLabel: "No active-paid cohort",
      guidance:
        "No authoritative active-paid subscribers are available for an activation comparison yet.",
    };
  }

  if (!counts.activationMetricsAvailable) {
    return {
      activePaid,
      withGrow,
      withTent,
      withPlant,
      withFirstSignal,
      coreActivated,
      needsCoreActivation: 0,
      activationRatePercent: null,
      status: "metrics_unavailable",
      statusLabel: "Activation metrics unavailable",
      guidance:
        "The paid total is available, but the activation aggregate is not. Do not infer missing product activity from absent fields.",
    };
  }

  if (integrityMismatch) {
    return {
      activePaid,
      withGrow,
      withTent,
      withPlant,
      withFirstSignal,
      coreActivated,
      needsCoreActivation: 0,
      activationRatePercent: null,
      status: "integrity_mismatch",
      statusLabel: "Activation counts need review",
      guidance:
        "One or more activity counts exceed the authoritative paid cohort. Review the aggregate query before using this funnel.",
    };
  }

  const needsCoreActivation = activePaid - coreActivated;
  const activationRatePercent = Math.round((coreActivated / activePaid) * 1_000) / 10;
  const activationObserved = needsCoreActivation === 0;

  return {
    activePaid,
    withGrow,
    withTent,
    withPlant,
    withFirstSignal,
    coreActivated,
    needsCoreActivation,
    activationRatePercent,
    status: activationObserved ? "activation_observed" : "activation_incomplete",
    statusLabel: activationObserved ? "Core activation observed" : "Activation opportunity",
    guidance: activationObserved
      ? "Every currently active-paid subscriber has reached the measured core loop. Keep monitoring early retention and scheduled cancellations."
      : `${needsCoreActivation} active-paid ${needsCoreActivation === 1 ? "subscriber has" : "subscribers have"} not yet reached Grow → Tent → Plant → first diary or sensor signal. Review the post-purchase handoff before adding more onboarding steps.`,
  };
}
