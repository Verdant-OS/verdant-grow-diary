/**
 * Founder Lifetime stays retired as a product and intact as an entitlement.
 * Stripe test-mode checkout must not be required for an existing holder to
 * keep 100 monthly credits, the Blueprint, and credit-pack eligibility.
 */
import { describe, expect, it } from "vitest";
import { creditPackPurchaseEligible } from "@/lib/creditPackEligibility";
import { resolveUnionEntitlements } from "@/lib/entitlements/unionEntitlements";

const NOW = new Date("2026-11-01T15:00:00.000Z");

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
});
