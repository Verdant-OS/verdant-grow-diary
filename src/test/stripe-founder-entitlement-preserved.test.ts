/**
 * Founder Lifetime stays retired as a product and intact as an entitlement.
 * Stripe test-mode checkout must not be required for an existing holder to
 * keep 100 monthly credits, the Blueprint, and credit-pack eligibility.
 */
import { describe, expect, it } from "vitest";
import { creditPackPurchaseEligible } from "@/lib/creditPackEligibility";
import { mapLovableSubscriptionRow } from "@/lib/entitlements/lovablePaddleAdapter";
import { resolveUnionEntitlements } from "@/lib/entitlements/unionEntitlements";

const NOW = new Date("2026-11-01T15:00:00.000Z");
const FUTURE = "2026-12-01T15:00:00.000Z";

describe("existing Founder holders", () => {
  it("keeps 100 monthly credits, the Blueprint, and pack eligibility", () => {
    const resolved = resolveUnionEntitlements({
      byoRow: null,
      lovableRow: {
        user_id: "00000000-0000-4000-8000-000000000001",
        paddle_subscription_id: "lifetime_existing_holder",
        paddle_customer_id: "ctm_existing_holder",
        product_id: "founder_lifetime",
        price_id: "founder_lifetime",
        status: "active",
        current_period_end: null,
        environment: "sandbox",
      },
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });

    expect(resolved.effectivePlanId).toBe("founder_lifetime");
    expect(resolved.isActive).toBe(true);
    expect(resolved.capabilities.aiMonthlyCredits).toBe(100);
    expect(resolved.capabilities.blueprint).toBe(true);
    expect(resolved.source).toBe("lovable_paddle_lifetime");
    expect(creditPackPurchaseEligible(resolved)).toBe(true);
  });

  it("maps a stripe test subscription without exposing provider ids", () => {
    const mapped = mapLovableSubscriptionRow(
      {
        user_id: "00000000-0000-4000-8000-000000000001",
        paddle_subscription_id: "stripe:sub_testfixture",
        paddle_customer_id: "stripe:cus_testfixture",
        product_id: "pro_monthly",
        price_id: "pro_monthly",
        status: "active",
        current_period_end: FUTURE,
        environment: "sandbox",
        provider: "stripe",
      },
      { expectedBillingEnvironment: "sandbox" },
    );

    expect(mapped?.provider).toBe("stripe");
    expect(mapped?.id).toBe("stripe_test:pro_monthly");
    expect(mapped?.provider_customer_id).toBeNull();
    expect(mapped?.provider_subscription_id).toBeNull();
    expect(JSON.stringify(mapped)).not.toContain("sub_testfixture");
    expect(JSON.stringify(mapped)).not.toContain("cus_testfixture");
  });
});
