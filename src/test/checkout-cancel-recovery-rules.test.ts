import { describe, expect, it } from "vitest";
import {
  buildCheckoutCancelPath,
  resolveCheckoutCancelRecovery,
} from "@/lib/checkoutCancelRecoveryRules";

describe("checkout cancel recovery rules", () => {
  it("carries an allowlisted plan and same-origin return path into cancellation", () => {
    expect(
      buildCheckoutCancelPath({
        planId: "pro_annual",
        returnTo: "/pheno-hunts/new",
      }),
    ).toBe("/checkout/cancel?plan=pro_annual&returnTo=%2Fpheno-hunts%2Fnew");
  });

  it("drops unknown plans and unsafe external return paths", () => {
    expect(
      buildCheckoutCancelPath({
        planId: "operator_override",
        returnTo: "https://evil.example/checkout",
      }),
    ).toBe("/checkout/cancel");
  });

  it("builds a plan-specific, non-automatic route back to pricing", () => {
    const recovery = resolveCheckoutCancelRecovery(
      "?plan=founder_lifetime&returnTo=%2Fpheno-hunts%2Fnew",
    );

    expect(recovery).toEqual({
      planId: "founder_lifetime",
      planLabel: "Founder Lifetime",
      pricingPath: "/pricing?plan=founder_lifetime&returnTo=%2Fpheno-hunts%2Fnew",
      returnPath: "/pheno-hunts/new",
      returnLabel: "Return to previous page",
    });
  });

  it("fails closed to generic pricing and the grow when query values are invalid", () => {
    const recovery = resolveCheckoutCancelRecovery(
      "?plan=free&returnTo=https%3A%2F%2Fevil.example",
    );

    expect(recovery.planId).toBeNull();
    expect(recovery.planLabel).toBeNull();
    expect(recovery.pricingPath).toBe("/pricing");
    expect(recovery.returnPath).toBe("/");
    expect(recovery.returnLabel).toBe("Go to my grow");
  });

  it("is deterministic for repeated inputs", () => {
    const first = resolveCheckoutCancelRecovery("?plan=pro_monthly");
    const second = resolveCheckoutCancelRecovery("?plan=pro_monthly");
    expect(second).toEqual(first);
  });
});
