import {
  isSubscriberInterestPlanId,
  subscriberInterestPlanLabel,
  type SubscriberInterestPlanId,
} from "@/lib/subscriberInterestRules";
import { buildAttributedPricingPath } from "@/lib/paidAcquisitionAttributionRules";

export const SUBSCRIBER_INTEREST_REFERRAL_ORIGIN = "https://verdantgrowdiary.com" as const;

export interface SubscriberInterestReferralData {
  title: string;
  text: string;
  url: string;
}

/**
 * Builds the public share payload shown only after an explicit paid-plan
 * interest submission succeeds.
 *
 * The URL contains a known plan id and fixed campaign attribution only. It
 * deliberately carries no email, user id, referral code, entitlement, reward,
 * or reservation claim.
 */
export function buildSubscriberInterestReferralData(
  planId: unknown,
): SubscriberInterestReferralData | null {
  if (!isSubscriberInterestPlanId(planId)) return null;

  const label = subscriberInterestPlanLabel(planId);
  const path = buildAttributedPricingPath({
    source: "pricing_interest_share",
    planId,
  });

  return {
    title: `Verdant ${label}`,
    text: "A grow OS built around plant memory, sensor truth, and grower-approved decisions.",
    url: `${SUBSCRIBER_INTEREST_REFERRAL_ORIGIN}${path}`,
  };
}

export function subscriberInterestReferralButtonLabel(planId: SubscriberInterestPlanId): string {
  return `Share ${subscriberInterestPlanLabel(planId)}`;
}
