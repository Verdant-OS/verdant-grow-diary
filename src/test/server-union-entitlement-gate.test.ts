/**
 * Phase 2b — server union entitlement helper tests.
 *
 * Uses the pure resolveUnionEntitlements exported from the entitlements
 * barrel to exercise the exact server-side decision the edge functions
 * make. Guards:
 *  - BYO Pro (billing_subscriptions) allows premium
 *  - Lovable Pro Monthly allows premium
 *  - Lovable Pro Annual allows premium
 *  - Lovable Founder Lifetime allows premium
 *  - Free (no rows) denies premium
 */
import { describe, it, expect } from "vitest";
import {
  resolveUnionEntitlements,
  type BillingSubscriptionRow,
  type LovableSubscriptionRow,
} from "@/lib/entitlements";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const FUTURE = new Date(NOW.getTime() + 30 * 86400_000).toISOString();

const byoPro: BillingSubscriptionRow = {
  id: "byo",
  user_id: "u",
  plan_id: "pro_monthly",
  status: "active",
  provider: "paddle",
  provider_customer_id: null,
  provider_subscription_id: null,
  current_period_end: FUTURE,
  cancel_at_period_end: false,
  founder_number: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function lovable(over: Partial<LovableSubscriptionRow>): LovableSubscriptionRow {
  return {
    user_id: "u",
    paddle_subscription_id: "sub_x",
    paddle_customer_id: "ctm_x",
    product_id: "verdant_pro",
    price_id: "pro_monthly",
    status: "active",
    current_period_end: FUTURE,
    current_period_start: null,
    cancel_at_period_end: false,
    environment: "sandbox",
    ...over,
  };
}

function premiumAllowed(byo: BillingSubscriptionRow | null, lv: LovableSubscriptionRow | null): boolean {
  const r = resolveUnionEntitlements({
    byoRow: byo,
    lovableRow: lv,
    expectedBillingEnvironment: "sandbox",
    now: NOW,
  });
  return r.capabilities.advancedExports === true && r.capabilities.liveSensors === true;
}

describe("server-side union gate decisions", () => {
  it("BYO Pro Monthly → allowed", () => {
    expect(premiumAllowed(byoPro, null)).toBe(true);
  });
  it("Lovable Pro Monthly → allowed", () => {
    expect(premiumAllowed(null, lovable({}))).toBe(true);
  });
  it("Lovable Pro Annual → allowed", () => {
    expect(premiumAllowed(null, lovable({ price_id: "pro_annual" }))).toBe(true);
  });
  it("Lovable Founder Lifetime → allowed", () => {
    expect(
      premiumAllowed(
        null,
        lovable({
          price_id: "founder_lifetime",
          product_id: "founder_lifetime",
          paddle_subscription_id: "lifetime_1",
          current_period_end: null,
        }),
      ),
    ).toBe(true);
  });
  it("Free (no rows) → denied", () => {
    expect(premiumAllowed(null, null)).toBe(false);
  });
  it("Sandbox row denied when server expects live", () => {
    const r = resolveUnionEntitlements({
      byoRow: null,
      lovableRow: lovable({}),
      expectedBillingEnvironment: "live",
      now: NOW,
    });
    expect(r.capabilities.advancedExports).toBe(false);
  });
});
