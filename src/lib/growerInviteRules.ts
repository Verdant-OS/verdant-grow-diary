import { buildAttributedLandingPath } from "@/lib/paidAcquisitionAttributionRules";

export const GROWER_INVITE_ORIGIN = "https://verdantgrowdiary.com" as const;

export interface GrowerInviteShareData {
  title: string;
  text: string;
  url: string;
}

/**
 * Builds a fixed, PII-free referral to the public product-proof surface.
 * It carries no user id, email, reward, entitlement, or reservation claim.
 */
export function buildGrowerInviteShareData(): GrowerInviteShareData {
  const path = buildAttributedLandingPath({ source: "grower_invite" });
  return {
    title: "Verdant Grow Diary",
    text: "Verdant keeps plant logs, sensor context, and cautious AI guidance in one grower-controlled place. It has a free tier and optional paid plans.",
    url: `${GROWER_INVITE_ORIGIN}${path}`,
  };
}
