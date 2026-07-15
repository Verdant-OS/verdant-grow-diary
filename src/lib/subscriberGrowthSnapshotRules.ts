/**
 * Pure parsing and goal-progress rules for the operator subscriber-growth
 * snapshot. This module performs no I/O and never accepts or returns PII.
 */

export const SUBSCRIBER_GROWTH_TARGET = 101;
export const SUBSCRIBER_GROWTH_DEADLINE_ISO = "2026-09-01T05:00:00.000Z";
export const SUBSCRIBER_GROWTH_GOAL_LABEL =
  "More than 100 active paid subscribers by August 31, 2026";

export interface SubscriberGrowthCounts {
  activationMetricsAvailable: boolean;
  activePaid: number;
  proMonthly: number;
  proAnnual: number;
  founderLifetime: number;
  atRisk: number;
  scheduledCancellation: number;
  newActive7d: number;
  newActive30d: number;
  activePaidWithGrow: number;
  activePaidWithTent: number;
  activePaidWithPlant: number;
  activePaidWithFirstSignal: number;
  activePaidCoreActivated: number;
  pricingInterestTotal: number;
  pricingInterest7d: number;
  pricingInterestNeedsContact: number;
  pricingInterestFollowUpDue: number;
  pricingInterestContacted7d: number;
  pricingInterestDirect: number;
  pricingInterestLanding: number;
  pricingInterestPricingPage: number;
  pricingInterestFounderPage: number;
  pricingInterestFounderShare: number;
  pricingInterestReferral: number;
  pricingInterestOperatorOutreach: number;
  pricingInterestGrowerInvite: number;
  pricingInterestContextCheck: number;
  pricingInterestVpdCalculator: number;
  allLeads7d: number;
}

export interface SubscriberGrowthSnapshot {
  ok: boolean;
  reason: string | null;
  reasonLabel: string | null;
  generatedAt: string | null;
  counts: SubscriberGrowthCounts;
}

export interface SubscriberGrowthProgress {
  target: number;
  activePaid: number;
  remaining: number;
  daysRemaining: number;
  requiredPerDay: number | null;
  progressPercent: number;
  reached: boolean;
  deadlinePassed: boolean;
}

const EMPTY_COUNTS: SubscriberGrowthCounts = Object.freeze({
  activationMetricsAvailable: false,
  activePaid: 0,
  proMonthly: 0,
  proAnnual: 0,
  founderLifetime: 0,
  atRisk: 0,
  scheduledCancellation: 0,
  newActive7d: 0,
  newActive30d: 0,
  activePaidWithGrow: 0,
  activePaidWithTent: 0,
  activePaidWithPlant: 0,
  activePaidWithFirstSignal: 0,
  activePaidCoreActivated: 0,
  pricingInterestTotal: 0,
  pricingInterest7d: 0,
  pricingInterestNeedsContact: 0,
  pricingInterestFollowUpDue: 0,
  pricingInterestContacted7d: 0,
  pricingInterestDirect: 0,
  pricingInterestLanding: 0,
  pricingInterestPricingPage: 0,
  pricingInterestFounderPage: 0,
  pricingInterestFounderShare: 0,
  pricingInterestReferral: 0,
  pricingInterestOperatorOutreach: 0,
  pricingInterestGrowerInvite: 0,
  pricingInterestContextCheck: 0,
  pricingInterestVpdCalculator: 0,
  allLeads7d: 0,
});

const REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  not_authenticated: "Sign in is required to view subscriber growth.",
  operator_required: "Operator role is required to view subscriber growth.",
  unknown_response: "Subscriber growth data was not recognized.",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function isValidCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Parses only the count allow-list returned by the operator RPC. Extra server
 * fields are discarded, so a future response cannot accidentally surface PII.
 */
export function parseSubscriberGrowthSnapshot(input: unknown): SubscriberGrowthSnapshot {
  if (!isRecord(input)) {
    return {
      ok: false,
      reason: "unknown_response",
      reasonLabel: REASON_LABELS.unknown_response,
      generatedAt: null,
      counts: { ...EMPTY_COUNTS },
    };
  }

  const ok = input.ok === true;
  const reason = asString(input.reason) ?? (ok ? null : "unknown_response");
  const raw = isRecord(input.counts) ? input.counts : {};
  const activationMetricsAvailable = [
    raw.active_paid_with_grow,
    raw.active_paid_with_tent,
    raw.active_paid_with_plant,
    raw.active_paid_with_first_signal,
    raw.active_paid_core_activated,
  ].every(isValidCount);

  return {
    ok,
    reason,
    reasonLabel: reason
      ? (REASON_LABELS[reason] ?? "Subscriber growth data is unavailable.")
      : null,
    generatedAt: asString(input.generated_at),
    counts: {
      activationMetricsAvailable,
      activePaid: asCount(raw.active_paid),
      proMonthly: asCount(raw.pro_monthly),
      proAnnual: asCount(raw.pro_annual),
      founderLifetime: asCount(raw.founder_lifetime),
      atRisk: asCount(raw.at_risk),
      scheduledCancellation: asCount(raw.scheduled_cancellation),
      newActive7d: asCount(raw.new_active_7d),
      newActive30d: asCount(raw.new_active_30d),
      activePaidWithGrow: asCount(raw.active_paid_with_grow),
      activePaidWithTent: asCount(raw.active_paid_with_tent),
      activePaidWithPlant: asCount(raw.active_paid_with_plant),
      activePaidWithFirstSignal: asCount(raw.active_paid_with_first_signal),
      activePaidCoreActivated: asCount(raw.active_paid_core_activated),
      pricingInterestTotal: asCount(raw.pricing_interest_total),
      pricingInterest7d: asCount(raw.pricing_interest_7d),
      pricingInterestNeedsContact: asCount(raw.pricing_interest_needs_contact),
      pricingInterestFollowUpDue: asCount(raw.pricing_interest_follow_up_due),
      pricingInterestContacted7d: asCount(raw.pricing_interest_contacted_7d),
      pricingInterestDirect: asCount(raw.pricing_interest_direct),
      pricingInterestLanding: asCount(raw.pricing_interest_landing),
      pricingInterestPricingPage: asCount(raw.pricing_interest_pricing_page),
      pricingInterestFounderPage: asCount(raw.pricing_interest_founder_page),
      pricingInterestFounderShare: asCount(raw.pricing_interest_founder_share),
      pricingInterestReferral: asCount(raw.pricing_interest_referral),
      pricingInterestOperatorOutreach: asCount(raw.pricing_interest_operator_outreach),
      pricingInterestGrowerInvite: asCount(raw.pricing_interest_grower_invite),
      pricingInterestContextCheck: asCount(raw.pricing_interest_context_check),
      pricingInterestVpdCalculator: asCount(raw.pricing_interest_vpd_calculator),
      allLeads7d: asCount(raw.all_leads_7d),
    },
  };
}

/**
 * Calculates the minimum pace from an authoritative active-paid count. The
 * deadline is an injectable instant so boundary behavior is deterministic.
 */
export function buildSubscriberGrowthProgress(
  activePaidInput: number,
  nowMs: number,
  target = SUBSCRIBER_GROWTH_TARGET,
  deadlineMs = Date.parse(SUBSCRIBER_GROWTH_DEADLINE_ISO),
): SubscriberGrowthProgress {
  const activePaid = asCount(activePaidInput);
  const safeTarget = Math.max(1, asCount(target));
  const remaining = Math.max(0, safeTarget - activePaid);
  const remainingMs = Number.isFinite(nowMs) ? deadlineMs - nowMs : 0;
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  const reached = remaining === 0;
  const deadlinePassed = remainingMs <= 0 && !reached;
  const requiredPerDay = reached
    ? 0
    : daysRemaining > 0
      ? Math.ceil((remaining / daysRemaining) * 10) / 10
      : null;

  return {
    target: safeTarget,
    activePaid,
    remaining,
    daysRemaining,
    requiredPerDay,
    progressPercent: Math.min(100, Math.round((activePaid / safeTarget) * 1000) / 10),
    reached,
    deadlinePassed,
  };
}
