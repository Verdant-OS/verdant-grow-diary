import { z } from "zod";

import type { PlanId } from "@/lib/entitlements/types";
import {
  isPaidInterestLeadSource,
  type PaidInterestLeadSource,
} from "@/lib/paidAcquisitionAttributionRules";

export type SubscriberInterestPlanId = Exclude<PlanId, "free">;

export const SUBSCRIBER_INTEREST_SOURCE = "pricing_interest" as const;

const PLAN_LABELS: Readonly<Record<SubscriberInterestPlanId, string>> = Object.freeze({
  pro_monthly: "Pro Monthly",
  pro_annual: "Pro Annual",
  founder_lifetime: "Founder Lifetime",
});

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(255)
  .transform((email) => email.toLowerCase());

export interface SubscriberInterestInput {
  email: unknown;
  planId: unknown;
  leadSource?: unknown;
}

export interface SubscriberInterestLeadPayload {
  email: string;
  lead_type: "grower";
  source: PaidInterestLeadSource;
  message: string;
}

export type SubscriberInterestBuildResult =
  | { ok: true; payload: SubscriberInterestLeadPayload }
  | { ok: false; reason: "invalid_email" | "invalid_plan" };

export function isSubscriberInterestPlanId(value: unknown): value is SubscriberInterestPlanId {
  return value === "pro_monthly" || value === "pro_annual" || value === "founder_lifetime";
}

export function subscriberInterestPlanLabel(planId: SubscriberInterestPlanId): string {
  return PLAN_LABELS[planId];
}

/**
 * Builds the existing public.leads insert payload for explicit pricing-page
 * interest. No entitlement, reservation, checkout, or marketing opt-in is
 * implied. The caller may send one requested checkout-availability email.
 */
export function buildSubscriberInterestLead(
  input: SubscriberInterestInput,
): SubscriberInterestBuildResult {
  if (!isSubscriberInterestPlanId(input.planId)) {
    return { ok: false, reason: "invalid_plan" };
  }

  const email = emailSchema.safeParse(input.email);
  if (!email.success) {
    return { ok: false, reason: "invalid_email" };
  }

  const source = isPaidInterestLeadSource(input.leadSource)
    ? input.leadSource
    : SUBSCRIBER_INTEREST_SOURCE;

  return {
    ok: true,
    payload: {
      email: email.data,
      lead_type: "grower",
      source,
      message: `Requested checkout availability notice for ${PLAN_LABELS[input.planId]} (${input.planId}).`,
    },
  };
}
