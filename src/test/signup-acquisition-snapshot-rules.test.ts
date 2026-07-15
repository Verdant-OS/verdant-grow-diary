import { describe, expect, it } from "vitest";

import { parseSignupAcquisitionSnapshot } from "@/lib/signupAcquisitionSnapshotRules";

describe("signup acquisition snapshot rules", () => {
  it("parses only the fixed aggregate allowlist", () => {
    const parsed = parseSignupAcquisitionSnapshot({
      ok: true,
      generated_at: "2026-07-14T23:30:00Z",
      counts: {
        accounts_total: 20,
        accounts_7d: 8,
        attributed_total: 12,
        attributed_7d: 7,
        unattributed_total: 8,
        landing_page: 3,
        pricing_page: 2,
        founder_page: 1,
        founder_share: 2,
        pricing_interest_share: 1,
        grower_invite: 2,
        context_check: 1,
        vpd_calculator: 4,
        email: "must-not-survive@example.com",
      },
      user_id: "must-not-survive",
    });

    expect(parsed).toEqual({
      ok: true,
      reason: null,
      reasonLabel: null,
      generatedAt: "2026-07-14T23:30:00Z",
      counts: {
        accountsTotal: 20,
        accounts7d: 8,
        attributedTotal: 12,
        attributed7d: 7,
        unattributedTotal: 8,
        landingPage: 3,
        pricingPage: 2,
        founderPage: 1,
        founderShare: 2,
        pricingInterestShare: 1,
        growerInvite: 2,
        contextCheck: 1,
        vpdCalculator: 4,
      },
    });
    expect(JSON.stringify(parsed)).not.toContain("must-not-survive");
  });

  it("fails closed for malformed, negative, non-finite, and string counts", () => {
    expect(parseSignupAcquisitionSnapshot(null).ok).toBe(false);
    const parsed = parseSignupAcquisitionSnapshot({
      ok: true,
      counts: {
        accounts_total: -1,
        accounts_7d: Number.POSITIVE_INFINITY,
        attributed_total: "4",
        attributed_7d: 2.9,
      },
    });
    expect(parsed.counts.accountsTotal).toBe(0);
    expect(parsed.counts.accounts7d).toBe(0);
    expect(parsed.counts.attributedTotal).toBe(0);
    expect(parsed.counts.attributed7d).toBe(2);
  });
});
