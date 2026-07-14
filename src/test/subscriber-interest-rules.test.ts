import { describe, expect, it } from "vitest";

import {
  buildSubscriberInterestLead,
  isSubscriberInterestPlanId,
  subscriberInterestPlanLabel,
  type SubscriberInterestPlanId,
} from "@/lib/subscriberInterestRules";

describe("subscriberInterestRules", () => {
  it("builds a normalized, deterministic lead payload", () => {
    const input = { email: "  Grower@Example.COM ", planId: "pro_annual" };
    const first = buildSubscriberInterestLead(input);
    const second = buildSubscriberInterestLead(input);

    expect(first).toEqual(second);
    expect(first).toEqual({
      ok: true,
      payload: {
        email: "grower@example.com",
        lead_type: "grower",
        source: "pricing_interest",
        message: "Requested checkout availability notice for Pro Annual (pro_annual).",
      },
    });
  });

  it.each<SubscriberInterestPlanId>(["pro_monthly", "pro_annual", "founder_lifetime"])(
    "accepts the paid plan %s",
    (planId) => {
      expect(buildSubscriberInterestLead({ email: "g@example.com", planId }).ok).toBe(true);
      expect(isSubscriberInterestPlanId(planId)).toBe(true);
      expect(subscriberInterestPlanLabel(planId)).not.toHaveLength(0);
    },
  );

  it("accepts a fixed acquisition source and rejects arbitrary source values", () => {
    expect(
      buildSubscriberInterestLead({
        email: "g@example.com",
        planId: "pro_annual",
        leadSource: "pricing_interest_referral",
      }),
    ).toMatchObject({ ok: true, payload: { source: "pricing_interest_referral" } });
    expect(
      buildSubscriberInterestLead({
        email: "g@example.com",
        planId: "pro_annual",
        leadSource: "pricing_interest_grower_invite",
      }),
    ).toMatchObject({ ok: true, payload: { source: "pricing_interest_grower_invite" } });
    expect(
      buildSubscriberInterestLead({
        email: "g@example.com",
        planId: "pro_annual",
        leadSource: "pricing_interest_context_check",
      }),
    ).toMatchObject({ ok: true, payload: { source: "pricing_interest_context_check" } });
    expect(
      buildSubscriberInterestLead({
        email: "g@example.com",
        planId: "pro_annual",
        leadSource: "reddit:user@example.com",
      }),
    ).toMatchObject({ ok: true, payload: { source: "pricing_interest" } });
  });

  it.each(["", "not-an-email", "g@example", null, "a".repeat(250) + "@x.com"])(
    "rejects invalid email input %s",
    (email) => {
      expect(buildSubscriberInterestLead({ email, planId: "pro_monthly" })).toEqual({
        ok: false,
        reason: "invalid_email",
      });
    },
  );

  it.each(["free", "enterprise", "", null, undefined])(
    "rejects the unsupported plan %s",
    (planId) => {
      expect(buildSubscriberInterestLead({ email: "g@example.com", planId })).toEqual({
        ok: false,
        reason: "invalid_plan",
      });
      expect(isSubscriberInterestPlanId(planId)).toBe(false);
    },
  );
});
