import type { BillingProvider, PlanId, SubscriptionStatus } from "@/lib/entitlements/types";

export type EntitlementPlannerProcessingStatus = "processed" | "ignored" | "blocked" | "failed";
export type RecurringEntitlementPlanId = Extract<PlanId, "pro_monthly" | "pro_annual">;

export type EntitlementPlannerBlockReason =
  | "missing_processing_row"
  | "missing_link_row"
  | "processing_not_processed"
  | "unknown_plan"
  | "founder_allocation_deferred"
  | "unknown_candidate_status"
  | "missing_provider_customer_id"
  | "missing_provider_subscription_id"
  | "link_not_linked"
  | "link_not_verified"
  | "link_provider_not_paddle"
  | "missing_link_user_id"
  | "missing_link_provider_customer_id"
  | "provider_customer_mismatch"
  | "missing_link_provider_subscription_id"
  | "provider_subscription_mismatch";

export interface PaddleProcessingEntitlementCandidateRow {
  status?: unknown;
  candidate_plan_id?: unknown;
  candidate_status?: unknown;
  provider_customer_id?: unknown;
  provider_subscription_id?: unknown;
  current_period_end?: unknown;
  cancel_at_period_end?: unknown;
  is_founder_candidate?: unknown;
}

export interface BillingCustomerLinkEntitlementCandidateRow {
  user_id?: unknown;
  provider?: unknown;
  provider_customer_id?: unknown;
  provider_subscription_id?: unknown;
  link_status?: unknown;
  confidence?: unknown;
}

export interface BillingSubscriptionEntitlementPlanPayload {
  user_id: string;
  plan_id: RecurringEntitlementPlanId;
  status: SubscriptionStatus;
  provider: Extract<BillingProvider, "paddle">;
  provider_customer_id: string;
  provider_subscription_id: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  founder_number: null;
}

export interface BillingEntitlementUpdatePlan {
  ok: true;
  payload: BillingSubscriptionEntitlementPlanPayload;
  conflictTarget: "user_id";
}

export interface BillingEntitlementUpdateBlocked {
  ok: false;
  reason: EntitlementPlannerBlockReason;
}

export type BillingEntitlementUpdatePlannerResult =
  | BillingEntitlementUpdatePlan
  | BillingEntitlementUpdateBlocked;

const RECURRING_PLANS = new Set<RecurringEntitlementPlanId>(["pro_monthly", "pro_annual"]);
const STATUSES = new Set<SubscriptionStatus>(["active", "past_due", "canceled", "paused", "expired"]);

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function cleanBoolean(value: unknown): boolean {
  return value === true;
}

function asRecurringPlan(value: unknown): RecurringEntitlementPlanId | null {
  const cleaned = cleanString(value);
  return cleaned && RECURRING_PLANS.has(cleaned as RecurringEntitlementPlanId)
    ? cleaned as RecurringEntitlementPlanId
    : null;
}

function asStatus(value: unknown): SubscriptionStatus | null {
  const cleaned = cleanString(value);
  return cleaned && STATUSES.has(cleaned as SubscriptionStatus)
    ? cleaned as SubscriptionStatus
    : null;
}

function block(reason: EntitlementPlannerBlockReason): BillingEntitlementUpdateBlocked {
  return { ok: false, reason };
}

export function planBillingEntitlementUpdate(
  processing: PaddleProcessingEntitlementCandidateRow | null | undefined,
  link: BillingCustomerLinkEntitlementCandidateRow | null | undefined,
): BillingEntitlementUpdatePlannerResult {
  if (!processing) return block("missing_processing_row");
  if (!link) return block("missing_link_row");

  if (processing.status !== "processed") return block("processing_not_processed");

  const rawPlan = cleanString(processing.candidate_plan_id);
  if (rawPlan === "founder_lifetime" || cleanBoolean(processing.is_founder_candidate)) {
    return block("founder_allocation_deferred");
  }

  const planId = asRecurringPlan(processing.candidate_plan_id);
  if (!planId) return block("unknown_plan");

  const candidateStatus = asStatus(processing.candidate_status);
  if (!candidateStatus) return block("unknown_candidate_status");

  const processingCustomerId = cleanString(processing.provider_customer_id);
  if (!processingCustomerId) return block("missing_provider_customer_id");

  const processingSubscriptionId = cleanString(processing.provider_subscription_id);
  if (!processingSubscriptionId) return block("missing_provider_subscription_id");

  if (link.link_status !== "linked") return block("link_not_linked");
  if (link.confidence !== "verified") return block("link_not_verified");
  if (link.provider !== "paddle") return block("link_provider_not_paddle");

  const userId = cleanString(link.user_id);
  if (!userId) return block("missing_link_user_id");

  const linkCustomerId = cleanString(link.provider_customer_id);
  if (!linkCustomerId) return block("missing_link_provider_customer_id");
  if (linkCustomerId !== processingCustomerId) return block("provider_customer_mismatch");

  const linkSubscriptionId = cleanString(link.provider_subscription_id);
  if (!linkSubscriptionId) return block("missing_link_provider_subscription_id");
  if (linkSubscriptionId !== processingSubscriptionId) return block("provider_subscription_mismatch");

  return {
    ok: true,
    conflictTarget: "user_id",
    payload: {
      user_id: userId,
      plan_id: planId,
      status: candidateStatus,
      provider: "paddle",
      provider_customer_id: processingCustomerId,
      provider_subscription_id: processingSubscriptionId,
      current_period_end: cleanString(processing.current_period_end),
      cancel_at_period_end: cleanBoolean(processing.cancel_at_period_end),
      founder_number: null,
    },
  };
}
