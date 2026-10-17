import { describe, expect, it } from "vitest";
import { buildCheckoutTrustCopy } from "@/lib/checkoutTrustCopyRules";

describe("buildCheckoutTrustCopy — pack scope and paused checkout", () => {
  it("keeps live copy after a pack-scoped failure, because subscriptions can still charge", () => {
    const copy = buildCheckoutTrustCopy({
      environment: "live",
      blocked: true,
      blockedScope: "pack",
    });
    expect(copy.state).toBe("live");
    expect(copy.canCreateLiveCharge).toBe(true);
  });

  it("shows paused copy for the kill switch on any environment, never live or sandbox", () => {
    for (const environment of ["live", "sandbox", "unavailable", null] as const) {
      const copy = buildCheckoutTrustCopy({ environment, blocked: false, paused: true });
      expect(copy.state).toBe("unavailable");
      expect(copy.label).toBe("Checkout paused");
      expect(copy.canCreateLiveCharge).toBe(false);
      expect(`${copy.summary} ${copy.faqAnswer}`).not.toMatch(/sandbox|test mode/i);
      expect(copy.summary).toMatch(/no charge can be made/i);
    }
  });

  it("does not show paused copy unless the switch is exactly true", () => {
    const copy = buildCheckoutTrustCopy({ environment: "live", blocked: false, paused: false });
    expect(copy.state).toBe("live");
    expect(copy.label).not.toBe("Checkout paused");
  });
});
