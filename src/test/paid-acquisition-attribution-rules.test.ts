import { describe, expect, it } from "vitest";

import {
  buildAttributedLandingPath,
  buildAttributedPricingPath,
  buildFounderPricingPath,
  resolvePaidAcquisitionSource,
  resolvePaidInterestLeadSource,
} from "@/lib/paidAcquisitionAttributionRules";

describe("paid acquisition attribution rules", () => {
  it("builds a fixed public proof-first referral path", () => {
    expect(buildAttributedLandingPath({ source: "grower_invite" })).toBe(
      "/welcome?utm_source=grower_invite&utm_medium=referral&utm_campaign=grower_invite",
    );
  });

  it.each([
    ["landing_page", "owned", "paid_launch", "pricing_interest_landing"],
    ["pricing_page", "owned", "paid_launch", "pricing_interest_pricing_page"],
    ["founder_page", "owned", "founder_launch", "pricing_interest_founder_page"],
    ["founder_share", "referral", "founder_launch", "pricing_interest_founder_share"],
    ["pricing_interest_share", "referral", "paid_launch", "pricing_interest_referral"],
    ["operator_outreach", "owned", "conversion_sprint", "pricing_interest_operator_outreach"],
    ["grower_invite", "referral", "grower_invite", "pricing_interest_grower_invite"],
    ["context_check", "owned", "context_check", "pricing_interest_context_check"],
    ["vpd_calculator", "owned", "vpd_calculator", "pricing_interest_vpd_calculator"],
    ["csv_history", "owned", "csv_history", "pricing_interest"],
  ] as const)(
    "round-trips the fixed %s attribution tuple",
    (source, medium, campaign, leadSource) => {
      const path = buildAttributedPricingPath({ source, planId: "pro_annual" });
      const url = new URL(path, "https://verdantgrowdiary.com");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        plan: "pro_annual",
        utm_source: source,
        utm_medium: medium,
        utm_campaign: campaign,
      });
      expect(resolvePaidAcquisitionSource(url.searchParams)).toBe(source);
      expect(resolvePaidInterestLeadSource(url.searchParams)).toBe(leadSource);
    },
  );

  it("rejects raw, partial, mismatched, and PII-bearing query attribution", () => {
    for (const query of [
      "utm_source=reddit&utm_medium=referral&utm_campaign=paid_launch",
      "utm_source=founder_share",
      "utm_source=founder_share&utm_medium=owned&utm_campaign=founder_launch",
      "utm_source=grower%40example.com&utm_medium=referral&utm_campaign=paid_launch",
      "email=grower%40example.com&user_id=123&token=secret",
    ]) {
      expect(resolvePaidAcquisitionSource(query)).toBeNull();
      expect(resolvePaidInterestLeadSource(query)).toBe("pricing_interest");
    }
  });

  it("preserves a valid Founder share across the Founder-to-Pricing hop", () => {
    const shared = buildFounderPricingPath(
      "utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch",
    );
    expect(shared).toBe(
      "/pricing?plan=founder_lifetime&utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch",
    );
    expect(buildFounderPricingPath("utm_source=evil")).toBe(
      "/pricing?plan=founder_lifetime&utm_source=founder_page&utm_medium=owned&utm_campaign=founder_launch",
    );
  });
});
