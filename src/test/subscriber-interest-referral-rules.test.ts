import { describe, expect, it } from "vitest";

import {
  buildSubscriberInterestReferralData,
  subscriberInterestReferralButtonLabel,
} from "@/lib/subscriberInterestReferralRules";

describe("subscriber interest referral rules", () => {
  it.each([
    ["pro_monthly", "Pro Monthly"],
    ["pro_annual", "Pro Annual"],
    ["founder_lifetime", "Founder Lifetime"],
  ] as const)("builds a preselected, attributed %s link", (plan, label) => {
    const data = buildSubscriberInterestReferralData(plan);
    expect(data).not.toBeNull();

    const url = new URL(data!.url);
    expect(url.origin + url.pathname).toBe("https://verdantgrowdiary.com/pricing");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      plan,
      utm_source: "pricing_interest_share",
      utm_medium: "referral",
      utm_campaign: "paid_launch",
    });
    expect(data!.title).toBe(`Verdant ${label}`);
    expect(subscriberInterestReferralButtonLabel(plan)).toBe(`Share ${label}`);
  });

  it("rejects unknown plans instead of generating an arbitrary checkout path", () => {
    for (const value of [null, undefined, "free", "evil_plan", 42]) {
      expect(buildSubscriberInterestReferralData(value)).toBeNull();
    }
  });

  it("is deterministic and contains no personal or entitlement-bearing data", () => {
    const first = buildSubscriberInterestReferralData("founder_lifetime");
    const second = buildSubscriberInterestReferralData("founder_lifetime");
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(
      /email|user_?id|token|password|entitlement|reservation|reward|referral_?code/i,
    );
  });
});
