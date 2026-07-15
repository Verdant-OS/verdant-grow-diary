import { isPreselectPlanId, type PricingPreselectPlan } from "@/lib/pricingPlanPreselect";

export type PaidAcquisitionSource =
  | "landing_page"
  | "pricing_page"
  | "founder_page"
  | "founder_share"
  | "pricing_interest_share"
  | "operator_outreach"
  | "grower_invite"
  | "context_check"
  | "vpd_calculator";

export type PaidInterestLeadSource =
  | "pricing_interest"
  | "pricing_interest_landing"
  | "pricing_interest_pricing_page"
  | "pricing_interest_founder_page"
  | "pricing_interest_founder_share"
  | "pricing_interest_referral"
  | "pricing_interest_operator_outreach"
  | "pricing_interest_grower_invite"
  | "pricing_interest_context_check"
  | "pricing_interest_vpd_calculator";

interface PaidAcquisitionAttribution {
  source: PaidAcquisitionSource;
  medium: "owned" | "referral";
  campaign:
    | "paid_launch"
    | "founder_launch"
    | "conversion_sprint"
    | "grower_invite"
    | "context_check"
    | "vpd_calculator";
  leadSource: PaidInterestLeadSource;
}

export const PAID_ACQUISITION_ATTRIBUTIONS: Readonly<
  Record<PaidAcquisitionSource, PaidAcquisitionAttribution>
> = Object.freeze({
  landing_page: Object.freeze({
    source: "landing_page",
    medium: "owned",
    campaign: "paid_launch",
    leadSource: "pricing_interest_landing",
  }),
  pricing_page: Object.freeze({
    source: "pricing_page",
    medium: "owned",
    campaign: "paid_launch",
    leadSource: "pricing_interest_pricing_page",
  }),
  founder_page: Object.freeze({
    source: "founder_page",
    medium: "owned",
    campaign: "founder_launch",
    leadSource: "pricing_interest_founder_page",
  }),
  founder_share: Object.freeze({
    source: "founder_share",
    medium: "referral",
    campaign: "founder_launch",
    leadSource: "pricing_interest_founder_share",
  }),
  pricing_interest_share: Object.freeze({
    source: "pricing_interest_share",
    medium: "referral",
    campaign: "paid_launch",
    leadSource: "pricing_interest_referral",
  }),
  operator_outreach: Object.freeze({
    source: "operator_outreach",
    medium: "owned",
    campaign: "conversion_sprint",
    leadSource: "pricing_interest_operator_outreach",
  }),
  grower_invite: Object.freeze({
    source: "grower_invite",
    medium: "referral",
    campaign: "grower_invite",
    leadSource: "pricing_interest_grower_invite",
  }),
  context_check: Object.freeze({
    source: "context_check",
    medium: "owned",
    campaign: "context_check",
    leadSource: "pricing_interest_context_check",
  }),
  vpd_calculator: Object.freeze({
    source: "vpd_calculator",
    medium: "owned",
    campaign: "vpd_calculator",
    leadSource: "pricing_interest_vpd_calculator",
  }),
});

const PAID_INTEREST_LEAD_SOURCE_SET = new Set<PaidInterestLeadSource>([
  "pricing_interest",
  "pricing_interest_landing",
  "pricing_interest_pricing_page",
  "pricing_interest_founder_page",
  "pricing_interest_founder_share",
  "pricing_interest_referral",
  "pricing_interest_operator_outreach",
  "pricing_interest_grower_invite",
  "pricing_interest_context_check",
  "pricing_interest_vpd_calculator",
]);

export function isPaidInterestLeadSource(value: unknown): value is PaidInterestLeadSource {
  return (
    typeof value === "string" && PAID_INTEREST_LEAD_SOURCE_SET.has(value as PaidInterestLeadSource)
  );
}

function asSearchParams(input: string | URLSearchParams | null | undefined): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  if (typeof input !== "string") return new URLSearchParams();
  return new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
}

/**
 * Accepts only exact, first-party attribution tuples. Raw query values never
 * become database source labels or analytics properties.
 */
export function resolvePaidAcquisitionSource(
  input: string | URLSearchParams | null | undefined,
): PaidAcquisitionSource | null {
  const params = asSearchParams(input);
  const source = params.get("utm_source");
  if (!source || !(source in PAID_ACQUISITION_ATTRIBUTIONS)) return null;

  const config = PAID_ACQUISITION_ATTRIBUTIONS[source as PaidAcquisitionSource];
  return params.get("utm_medium") === config.medium &&
    params.get("utm_campaign") === config.campaign
    ? config.source
    : null;
}

export function resolvePaidInterestLeadSource(
  input: string | URLSearchParams | null | undefined,
): PaidInterestLeadSource {
  const source = resolvePaidAcquisitionSource(input);
  return source ? PAID_ACQUISITION_ATTRIBUTIONS[source].leadSource : "pricing_interest";
}

export function buildAttributedLandingPath(input: { source: PaidAcquisitionSource }): string {
  const config = PAID_ACQUISITION_ATTRIBUTIONS[input.source];
  const params = new URLSearchParams();
  params.set("utm_source", config.source);
  params.set("utm_medium", config.medium);
  params.set("utm_campaign", config.campaign);
  return `/welcome?${params.toString()}`;
}

export function buildAttributedPricingPath(input: {
  source: PaidAcquisitionSource;
  planId?: PricingPreselectPlan | null;
}): string {
  const config = PAID_ACQUISITION_ATTRIBUTIONS[input.source];
  const params = new URLSearchParams();
  if (input.planId && isPreselectPlanId(input.planId)) params.set("plan", input.planId);
  params.set("utm_source", config.source);
  params.set("utm_medium", config.medium);
  params.set("utm_campaign", config.campaign);
  return `/pricing?${params.toString()}`;
}

/** Preserve an inbound Founder share only; all other Founder visits are owned. */
export function buildFounderPricingPath(
  input: string | URLSearchParams | null | undefined,
): string {
  const inbound = resolvePaidAcquisitionSource(input);
  return buildAttributedPricingPath({
    source: inbound === "founder_share" ? "founder_share" : "founder_page",
    planId: "founder_lifetime",
  });
}
