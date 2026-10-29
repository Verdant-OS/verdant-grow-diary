import { describe, expect, it } from "vitest";
import { checkoutBlockedScopeForReason } from "@/lib/checkoutBlockedScopeRules";

describe("checkoutBlockedScopeForReason", () => {
  it.each(["unknown_plan", "price_not_configured", "plan_sold_out"])(
    "scopes %s to the attempted plan",
    (reason) => {
      expect(checkoutBlockedScopeForReason(reason)).toBe("plan");
    },
  );

  it("scopes pack_requires_monthly_plan to every credit pack", () => {
    expect(checkoutBlockedScopeForReason("pack_requires_monthly_plan")).toBe("pack");
  });

  it.each([
    "price_resolution_unavailable",
    "auth_required",
    "price_gateway_unavailable",
    "price_request_failed",
    "price_response_unusable",
    "some_future_reason",
    "",
  ])("fails shared or unknown reason %j closed to checkout-wide", (reason) => {
    expect(checkoutBlockedScopeForReason(reason)).toBe("checkout");
  });

  it.each([null, undefined])("fails a missing reason (%s) closed", (reason) => {
    expect(checkoutBlockedScopeForReason(reason)).toBe("checkout");
  });
});
