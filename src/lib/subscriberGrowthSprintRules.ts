import type {
  SubscriberGrowthCounts,
  SubscriberGrowthProgress,
} from "@/lib/subscriberGrowthSnapshotRules";
import type { SignupAcquisitionCounts } from "@/lib/signupAcquisitionSnapshotRules";

export type SubscriberGrowthSprintStatus =
  | "goal_reached"
  | "deadline_passed"
  | "on_pace"
  | "behind_pace";

export type SubscriberGrowthSprintPriority = "urgent" | "high" | "normal";

export type SubscriberGrowthSprintActionId =
  | "follow_up_due"
  | "first_contact"
  | "protect_retention"
  | "review_activation"
  | "close_pace_gap"
  | "activate_referrals"
  | "maintain_pace";

export interface SubscriberGrowthSprintAction {
  id: SubscriberGrowthSprintActionId;
  priority: SubscriberGrowthSprintPriority;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  sortWeight: number;
}

export interface SubscriberGrowthSprintBoard {
  status: SubscriberGrowthSprintStatus;
  statusLabel: string;
  summary: string;
  windowDays: number;
  requiredPaidNextWindow: number;
  observedPaid7d: number;
  paidPaceGap: number;
  accounts7d: number | null;
  interest7d: number;
  followUpDue: number;
  needsFirstContact: number;
  atRisk: number;
  scheduledCancellation: number;
  actions: readonly SubscriberGrowthSprintAction[];
  comparisonNote: string;
}

export interface BuildSubscriberGrowthSprintInput {
  progress: SubscriberGrowthProgress;
  counts: SubscriberGrowthCounts;
  acquisitionCounts?: SignupAcquisitionCounts | null;
}

const PRIORITY_WEIGHT: Readonly<Record<SubscriberGrowthSprintPriority, number>> = Object.freeze({
  urgent: 3,
  high: 2,
  normal: 1,
});

export const SUBSCRIBER_GROWTH_SPRINT_COMPARISON_NOTE =
  "Account starts, pricing-interest signals, and paid adds are separate windows, not a cohort conversion rate. Only active paid entitlements count toward the goal.";

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function sortActions(
  actions: readonly SubscriberGrowthSprintAction[],
): SubscriberGrowthSprintAction[] {
  return [...actions].sort((a, b) => {
    const priorityDelta = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (priorityDelta !== 0) return priorityDelta;
    if (a.sortWeight !== b.sortWeight) return b.sortWeight - a.sortWeight;
    return a.id.localeCompare(b.id);
  });
}

function buildWindow(progress: SubscriberGrowthProgress): {
  windowDays: number;
  requiredPaidNextWindow: number;
} {
  const remaining = safeCount(progress.remaining);
  const daysRemaining = safeCount(progress.daysRemaining);

  if (remaining === 0) return { windowDays: 0, requiredPaidNextWindow: 0 };
  if (daysRemaining === 0) return { windowDays: 0, requiredPaidNextWindow: remaining };

  const windowDays = Math.min(7, daysRemaining);
  return {
    windowDays,
    requiredPaidNextWindow: Math.ceil((remaining * windowDays) / daysRemaining),
  };
}

function buildStatus(input: {
  reached: boolean;
  deadlinePassed: boolean;
  observedPaid7d: number;
  requiredPaidNextWindow: number;
}): SubscriberGrowthSprintStatus {
  if (input.reached) return "goal_reached";
  if (input.deadlinePassed) return "deadline_passed";
  return input.observedPaid7d >= input.requiredPaidNextWindow ? "on_pace" : "behind_pace";
}

function statusLabel(status: SubscriberGrowthSprintStatus): string {
  switch (status) {
    case "goal_reached":
      return "Goal reached";
    case "deadline_passed":
      return "Deadline passed";
    case "on_pace":
      return "On pace";
    case "behind_pace":
      return "Behind pace";
  }
}

function buildSummary(input: {
  status: SubscriberGrowthSprintStatus;
  windowDays: number;
  requiredPaidNextWindow: number;
  observedPaid7d: number;
  paidPaceGap: number;
}): string {
  switch (input.status) {
    case "goal_reached":
      return "The active-paid target is reached. Protect retention and keep entitlement truth clean.";
    case "deadline_passed":
      return `The deadline passed with ${input.requiredPaidNextWindow} active paid subscribers still needed. Re-plan from current entitlement truth before setting a new pace.`;
    case "on_pace":
      return `The last 7 days added ${input.observedPaid7d} active paid subscribers against a ${input.windowDays}-day pace need of ${input.requiredPaidNextWindow}. Keep acquisition, follow-up, and retention steady.`;
    case "behind_pace":
      return `The next ${input.windowDays}-day pace needs ${input.requiredPaidNextWindow} active paid subscribers. The last 7 days added ${input.observedPaid7d}, leaving a directional pace gap of ${input.paidPaceGap}.`;
  }
}

/**
 * Builds a read-only seven-day operator sprint from aggregate, PII-free
 * snapshots. It never treats accounts or leads as paid subscribers and makes
 * no conversion-rate assumption between the separate reporting windows.
 */
export function buildSubscriberGrowthSprintBoard(
  input: BuildSubscriberGrowthSprintInput,
): SubscriberGrowthSprintBoard {
  const observedPaid7d = safeCount(input.counts.newActive7d);
  const interest7d = safeCount(input.counts.pricingInterest7d);
  const followUpDue = safeCount(input.counts.pricingInterestFollowUpDue);
  const needsFirstContact = safeCount(input.counts.pricingInterestNeedsContact);
  const atRisk = safeCount(input.counts.atRisk);
  const scheduledCancellation = safeCount(input.counts.scheduledCancellation);
  const accounts7d = input.acquisitionCounts ? safeCount(input.acquisitionCounts.accounts7d) : null;
  const { windowDays, requiredPaidNextWindow } = buildWindow(input.progress);
  const paidPaceGap = Math.max(0, requiredPaidNextWindow - observedPaid7d);
  const status = buildStatus({
    reached: input.progress.reached,
    deadlinePassed: input.progress.deadlinePassed,
    observedPaid7d,
    requiredPaidNextWindow,
  });

  const actions: SubscriberGrowthSprintAction[] = [];

  if (followUpDue > 0) {
    actions.push({
      id: "follow_up_due",
      priority: "urgent",
      title: "Clear due follow-ups",
      description: `${followUpDue} pricing-interest ${followUpDue === 1 ? "contact is" : "contacts are"} due for human follow-up. These are leads, not subscribers.`,
      ctaLabel: "Review due follow-ups",
      href: "/admin/leads",
      sortWeight: 100,
    });
  }

  if (needsFirstContact > 0) {
    actions.push({
      id: "first_contact",
      priority: "high",
      title: "Start first contact",
      description: `${needsFirstContact} pricing-interest ${needsFirstContact === 1 ? "lead has" : "leads have"} not received a recorded first contact. Outreach stays manual and operator-reviewed.`,
      ctaLabel: "Open interest leads",
      href: "/admin/leads",
      sortWeight: 95,
    });
  }

  if (atRisk > 0 || scheduledCancellation > 0) {
    actions.push({
      id: "protect_retention",
      priority: "high",
      title: "Protect existing paid subscribers",
      description: `${atRisk} paid ${atRisk === 1 ? "account is" : "accounts are"} at risk and ${scheduledCancellation} ${scheduledCancellation === 1 ? "has" : "have"} a scheduled cancellation. Audit entitlement state before taking any human retention action.`,
      ctaLabel: "Audit entitlements",
      href: "/operator/billing-entitlement-resolution",
      sortWeight: 90,
    });
  }

  if (accounts7d !== null && accounts7d > 0 && observedPaid7d === 0) {
    actions.push({
      id: "review_activation",
      priority: "high",
      title: "Review the activation-to-paid handoff",
      description: `${accounts7d} ${accounts7d === 1 ? "account start was" : "account starts were"} recorded in 7 days while no new active-paid entitlement was recorded. These are separate windows, so inspect the path without assuming causality.`,
      ctaLabel: "Review pricing path",
      href: "/pricing",
      sortWeight: 85,
    });
  }

  if (status === "behind_pace" || status === "deadline_passed") {
    actions.push({
      id: "close_pace_gap",
      priority: "high",
      title: "Put the Founder offer in front of qualified growers",
      description:
        "Use the existing truthful Founder launch surface for reviewed, manual outreach. Sharing does not reserve access, charge anyone, or grant an entitlement.",
      ctaLabel: "Open Founder launch page",
      href: "/founder",
      sortWeight: 80,
    });
    actions.push({
      id: "activate_referrals",
      priority: "normal",
      title: "Ask active growers for one relevant introduction",
      description:
        "Use the PII-free grower invite after reviewing the recipient fit. The invite creates no reward, sends no automatic message, and changes no billing state or entitlement.",
      ctaLabel: "Open grower invite",
      href: "/invite",
      sortWeight: 60,
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "maintain_pace",
      priority: "normal",
      title: "Maintain the current pace",
      description:
        "Keep manual follow-up current, continue qualified outreach, and re-check authoritative paid and retention counts before changing tactics.",
      ctaLabel: "Review interest leads",
      href: "/admin/leads",
      sortWeight: 10,
    });
  }

  return {
    status,
    statusLabel: statusLabel(status),
    summary: buildSummary({
      status,
      windowDays,
      requiredPaidNextWindow,
      observedPaid7d,
      paidPaceGap,
    }),
    windowDays,
    requiredPaidNextWindow,
    observedPaid7d,
    paidPaceGap,
    accounts7d,
    interest7d,
    followUpDue,
    needsFirstContact,
    atRisk,
    scheduledCancellation,
    actions: sortActions(actions),
    comparisonNote: SUBSCRIBER_GROWTH_SPRINT_COMPARISON_NOTE,
  };
}
