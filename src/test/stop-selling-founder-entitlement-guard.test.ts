/**
 * Existing Founder holders keep Founder access. This guard must stay green
 * across the sales-surface removal.
 */
import { describe, expect, it } from "vitest";
import { PLAN_CATALOG, resolveEntitlements, type BillingSubscriptionRow } from "@/lib/entitlements";

const NOW = new Date("2026-10-11T06:00:00.000Z");

describe("existing Founder entitlement", () => {
  it("still resolves an active founder_lifetime row to Founder access", () => {
    const row: BillingSubscriptionRow = {
      id: "00000000-0000-0000-0000-000000000001",
      user_id: "00000000-0000-0000-0000-0000000000aa",
      plan_id: "founder_lifetime",
      status: "active",
      provider: "paddle",
      provider_customer_id: null,
      provider_subscription_id: null,
      current_period_end: null,
      cancel_at_period_end: false,
      founder_number: 7,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
    };
    const resolved = resolveEntitlements(row, NOW);
    expect(resolved.effectivePlanId).toBe("founder_lifetime");
    expect(resolved.displayPlanId).toBe("founder_lifetime");
    expect(resolved.isActive).toBe(true);
    expect(resolved.capabilities).toEqual(PLAN_CATALOG.founder_lifetime);
    expect(resolved.capabilities.aiMonthlyCredits).toBe(100);
  });
});
