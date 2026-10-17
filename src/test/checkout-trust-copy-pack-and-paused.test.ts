import { describe, expect, it } from "vitest";
import { LIVE_CHECKOUT_FAQ_ANSWER, buildCheckoutTrustCopy } from "@/lib/checkoutTrustCopyRules";

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

  it("answers the FAQ as unavailable after a checkout-wide live failure, never as live", () => {
    for (const blockedScope of ["checkout", null, undefined] as const) {
      const copy = buildCheckoutTrustCopy({ environment: "live", blocked: true, blockedScope });
      expect(copy.state).toBe("unavailable");
      expect(copy.faqAnswer).not.toBe(LIVE_CHECKOUT_FAQ_ANSWER);
      expect(copy.faqAnswer).toMatch(/^Not right now\./);
      expect(copy.faqAnswer).toMatch(/no charge was made/i);
      expect(copy.faqAnswer).not.toMatch(/sandbox|test mode/i);
    }
  });

  it("shows paused copy for the kill switch on any environment, never live or sandbox", () => {
    for (const environment of ["live", "sandbox", "unavailable", null] as const) {
      const copy = buildCheckoutTrustCopy({ environment, blocked: false, paused: true });
      expect(copy.state).toBe("unavailable");
      expect(copy.label).toBe("Checkout paused");
      expect(copy.canCreateLiveCharge).toBe(false);
      expect(`${copy.summary} ${copy.faqAnswer}`).not.toMatch(/sandbox|test mode/i);
      expect(copy.summary).toBe(
        "New checkout is paused. Existing plans, renewals and billing management are not affected.",
      );
    }
  });

  it("does not show paused copy unless the switch is exactly true", () => {
    const copy = buildCheckoutTrustCopy({ environment: "live", blocked: false, paused: false });
    expect(copy.state).toBe("live");
    expect(copy.label).not.toBe("Checkout paused");
  });

  it("gives a live token off the production host its own copy, never sandbox wording", () => {
    const copy = buildCheckoutTrustCopy({
      environment: "unavailable",
      blocked: true,
      liveOffHost: true,
    });
    expect(copy.state).toBe("unavailable");
    expect(copy.label).toBe("Checkout unavailable on this site");
    expect(copy.canCreateLiveCharge).toBe(false);
    expect(`${copy.label} ${copy.summary} ${copy.faqAnswer}`).not.toMatch(/sandbox|test mode/i);
    expect(copy.summary).toBe(
      "Checkout opens only on verdantgrowdiary.com. No charge can be made here.",
    );
  });

  it("ignores liveOffHost when checkout is live, and paused still wins", () => {
    expect(
      buildCheckoutTrustCopy({ environment: "live", blocked: false, liveOffHost: true }).state,
    ).toBe("live");
    expect(
      buildCheckoutTrustCopy({
        environment: "unavailable",
        blocked: true,
        liveOffHost: true,
        paused: true,
      }).label,
    ).toBe("Checkout paused");
  });
});
