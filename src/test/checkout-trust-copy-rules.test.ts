import { describe, expect, it } from "vitest";
import { buildCheckoutTrustCopy } from "@/lib/checkoutTrustCopyRules";

describe("buildCheckoutTrustCopy", () => {
  it("fails closed when a presenter is handed a live environment", () => {
    const result = buildCheckoutTrustCopy({ environment: "live", blocked: false });

    expect(result.state).toBe("unavailable");
    expect(result.canCreateLiveCharge).toBe(false);
    expect(result.summary).toContain("Live checkout is disabled");
    expect(result.faqAnswer).toContain("sandbox");
    expect(result.faqAnswer).toContain("cannot create a real charge");
  });

  it("labels sandbox checkout and never implies a live charge", () => {
    const result = buildCheckoutTrustCopy({ environment: "sandbox", blocked: false });

    expect(result.state).toBe("sandbox");
    expect(result.canCreateLiveCharge).toBe(false);
    expect(result.label).toContain("Test only");
    expect(result.summary).toContain("No real charges");
    expect(result.faqAnswer).toContain("cannot create a real charge");
  });

  it("fails closed for unavailable and missing environments", () => {
    for (const environment of ["unavailable", null, undefined] as const) {
      const result = buildCheckoutTrustCopy({ environment, blocked: false });
      expect(result.state).toBe("unavailable");
      expect(result.canCreateLiveCharge).toBe(false);
      expect(result.faqAnswer).toContain("cannot create a real charge");
    }
  });

  it("lets a runtime failure override live environment copy", () => {
    const result = buildCheckoutTrustCopy({ environment: "live", blocked: true });

    expect(result.state).toBe("unavailable");
    expect(result.canCreateLiveCharge).toBe(false);
    expect(result.summary).toContain("Live checkout is disabled");
  });

  it("is deterministic and returns immutable shared copy", () => {
    const first = buildCheckoutTrustCopy({ environment: "sandbox", blocked: false });
    const second = buildCheckoutTrustCopy({ environment: "sandbox", blocked: false });

    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
