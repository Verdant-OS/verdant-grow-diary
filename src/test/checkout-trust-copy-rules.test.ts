import { describe, expect, it } from "vitest";
import { buildCheckoutTrustCopy } from "@/lib/checkoutTrustCopyRules";

describe("buildCheckoutTrustCopy", () => {
  it("identifies live checkout and clearly warns that a confirmed purchase can charge", () => {
    const result = buildCheckoutTrustCopy({ environment: "live", blocked: false });

    expect(result.state).toBe("live");
    expect(result.canCreateLiveCharge).toBe(true);
    expect(result.summary).toContain("review");
    expect(result.faqAnswer).toContain("Paddle");
    expect(result.faqAnswer).toContain("server-side");
  });

  it("labels sandbox checkout and never implies a live charge", () => {
    const result = buildCheckoutTrustCopy({ environment: "sandbox", blocked: false });

    expect(result.state).toBe("sandbox");
    expect(result.canCreateLiveCharge).toBe(false);
    expect(result.summary).toContain("sandbox");
    expect(result.faqAnswer).toContain("nothing is charged");
  });

  it("fails closed for unavailable and missing environments", () => {
    for (const environment of ["unavailable", null, undefined] as const) {
      const result = buildCheckoutTrustCopy({ environment, blocked: false });
      expect(result.state).toBe("unavailable");
      expect(result.canCreateLiveCharge).toBe(false);
      expect(result.faqAnswer).toContain("nothing is charged");
    }
  });

  it("lets a runtime failure override live environment copy", () => {
    const result = buildCheckoutTrustCopy({ environment: "live", blocked: true });

    expect(result.state).toBe("unavailable");
    expect(result.canCreateLiveCharge).toBe(false);
    expect(result.summary).toContain("cannot open");
  });

  it("is deterministic and returns immutable shared copy", () => {
    const first = buildCheckoutTrustCopy({ environment: "live", blocked: false });
    const second = buildCheckoutTrustCopy({ environment: "live", blocked: false });

    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
