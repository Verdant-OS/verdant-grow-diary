import { describe, expect, it } from "vitest";

import {
  buildSubscriberGrowthProgress,
  parseSubscriberGrowthSnapshot,
  SUBSCRIBER_GROWTH_TARGET,
} from "@/lib/subscriberGrowthSnapshotRules";

describe("subscriber growth snapshot rules", () => {
  it("parses the sanitized count allow-list and ignores extra fields", () => {
    const parsed = parseSubscriberGrowthSnapshot({
      ok: true,
      generated_at: "2026-07-14T12:00:00Z",
      counts: {
        active_paid: 12,
        pro_monthly: 5,
        pro_annual: 4,
        founder_lifetime: 3,
        at_risk: 2,
        scheduled_cancellation: 1,
        new_active_7d: 4,
        new_active_30d: 10,
        pricing_interest_total: 25,
        pricing_interest_7d: 8,
        pricing_interest_needs_contact: 6,
        pricing_interest_follow_up_due: 2,
        pricing_interest_contacted_7d: 5,
        pricing_interest_direct: 4,
        pricing_interest_landing: 7,
        pricing_interest_pricing_page: 6,
        pricing_interest_founder_page: 5,
        pricing_interest_founder_share: 6,
        pricing_interest_referral: 3,
        pricing_interest_grower_invite: 4,
        pricing_interest_context_check: 9,
        all_leads_7d: 11,
        email: "must-not-survive@example.com",
      },
      user_id: "must-not-survive",
    });

    expect(parsed).toEqual({
      ok: true,
      reason: null,
      reasonLabel: null,
      generatedAt: "2026-07-14T12:00:00Z",
      counts: {
        activePaid: 12,
        proMonthly: 5,
        proAnnual: 4,
        founderLifetime: 3,
        atRisk: 2,
        scheduledCancellation: 1,
        newActive7d: 4,
        newActive30d: 10,
        pricingInterestTotal: 25,
        pricingInterest7d: 8,
        pricingInterestNeedsContact: 6,
        pricingInterestFollowUpDue: 2,
        pricingInterestContacted7d: 5,
        pricingInterestDirect: 4,
        pricingInterestLanding: 7,
        pricingInterestPricingPage: 6,
        pricingInterestFounderPage: 5,
        pricingInterestFounderShare: 6,
        pricingInterestReferral: 3,
        pricingInterestGrowerInvite: 4,
        pricingInterestContextCheck: 9,
        allLeads7d: 11,
      },
    });
    expect(JSON.stringify(parsed)).not.toContain("must-not-survive");
  });

  it("fails closed for malformed and invalid counts", () => {
    expect(parseSubscriberGrowthSnapshot(null).ok).toBe(false);
    const parsed = parseSubscriberGrowthSnapshot({
      ok: true,
      counts: {
        active_paid: -1,
        pro_monthly: Number.POSITIVE_INFINITY,
        pro_annual: "5",
        founder_lifetime: 2.9,
      },
    });
    expect(parsed.counts.activePaid).toBe(0);
    expect(parsed.counts.proMonthly).toBe(0);
    expect(parsed.counts.proAnnual).toBe(0);
    expect(parsed.counts.founderLifetime).toBe(2);
  });

  it("calculates the exact >100 target pace deterministically", () => {
    const progress = buildSubscriberGrowthProgress(10, Date.parse("2026-07-14T05:00:00.000Z"));
    expect(SUBSCRIBER_GROWTH_TARGET).toBe(101);
    expect(progress).toMatchObject({
      target: 101,
      activePaid: 10,
      remaining: 91,
      daysRemaining: 49,
      requiredPerDay: 1.9,
      reached: false,
      deadlinePassed: false,
    });
    expect(buildSubscriberGrowthProgress(10, Date.parse("2026-07-14T05:00:00.000Z"))).toEqual(
      progress,
    );
  });

  it("handles the reached and deadline-passed boundaries without Infinity", () => {
    expect(
      buildSubscriberGrowthProgress(101, Date.parse("2026-09-02T05:00:00.000Z")),
    ).toMatchObject({
      remaining: 0,
      requiredPerDay: 0,
      reached: true,
      deadlinePassed: false,
    });
    expect(
      buildSubscriberGrowthProgress(100, Date.parse("2026-09-02T05:00:00.000Z")),
    ).toMatchObject({
      remaining: 1,
      daysRemaining: 0,
      requiredPerDay: null,
      reached: false,
      deadlinePassed: true,
    });
  });
});
