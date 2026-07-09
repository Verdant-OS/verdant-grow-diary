/**
 * Phase 2b — union resolver tests.
 *
 * Covers pickStrongestBilling precedence + the resolveUnionEntitlements
 * composer end-to-end (adapter → picker → pure resolver → source stamp).
 */
import { describe, it, expect } from "vitest";
import {
  pickStrongestBilling,
  resolveUnionEntitlements,
  type BillingSubscriptionRow,
  type LovableSubscriptionRow,
} from "@/lib/entitlements";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const FUTURE = new Date(NOW.getTime() + 30 * 86400_000).toISOString();
const PAST = new Date(NOW.getTime() - 60_000).toISOString();

function byo(over: Partial<BillingSubscriptionRow> = {}): BillingSubscriptionRow {
  return {
    id: "byo-1",
    user_id: "u-1",
    plan_id: "pro_monthly",
    status: "active",
    provider: "paddle",
    provider_customer_id: null,
    provider_subscription_id: null,
    current_period_end: FUTURE,
    cancel_at_period_end: false,
    founder_number: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function lovable(over: Partial<LovableSubscriptionRow> = {}): LovableSubscriptionRow {
  return {
    user_id: "u-1",
    paddle_subscription_id: "sub_x",
    paddle_customer_id: "ctm_x",
    product_id: "verdant_pro",
    price_id: "pro_monthly",
    status: "active",
    current_period_end: FUTURE,
    current_period_start: null,
    cancel_at_period_end: false,
    environment: "sandbox",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("pickStrongestBilling", () => {
  it("returns free when both rows are null", () => {
    const r = pickStrongestBilling(null, null, NOW);
    expect(r.source).toBe("free");
    expect(r.row).toBeNull();
  });

  it("returns byo_paddle when only BYO is active", () => {
    const r = pickStrongestBilling(byo(), null, NOW);
    expect(r.source).toBe("byo_paddle");
    expect(r.row?.plan_id).toBe("pro_monthly");
  });

  it("returns lovable_paddle_subscription when only Lovable pro_monthly is active", () => {
    const mappedLovable = byo({ id: "lovable_paddle:pro_monthly" });
    const r = pickStrongestBilling(null, mappedLovable, NOW);
    expect(r.source).toBe("lovable_paddle_subscription");
  });

  it("Lovable founder_lifetime beats BYO pro_monthly", () => {
    const lifetime = byo({
      id: "lovable_paddle:founder_lifetime",
      plan_id: "founder_lifetime",
      current_period_end: null,
    });
    const r = pickStrongestBilling(byo(), lifetime, NOW);
    expect(r.source).toBe("lovable_paddle_lifetime");
    expect(r.row?.plan_id).toBe("founder_lifetime");
  });

  it("BYO active preferred over Lovable active when both recurring", () => {
    const mappedLovable = byo({ id: "lovable_paddle:pro_annual", plan_id: "pro_annual" });
    const r = pickStrongestBilling(byo(), mappedLovable, NOW);
    expect(r.source).toBe("byo_paddle");
  });

  it("expired BYO + active Lovable → lovable wins", () => {
    const expired = byo({ status: "expired", current_period_end: PAST });
    const r = pickStrongestBilling(expired, byo({ id: "lovable" }), NOW);
    // BYO expired is not active; Lovable is active recurring → lovable.
    expect(r.source).toBe("lovable_paddle_subscription");
  });

  it("deterministic on repeated calls with same inputs", () => {
    const a = byo();
    const b = byo({ id: "lovable" });
    const r1 = pickStrongestBilling(a, b, NOW);
    const r2 = pickStrongestBilling(a, b, NOW);
    expect(r1.source).toBe(r2.source);
    expect(r1.row?.id).toBe(r2.row?.id);
  });
});

describe("resolveUnionEntitlements", () => {
  it("BYO active pro_monthly unlocks Pro (source byo_paddle)", () => {
    const r = resolveUnionEntitlements({
      byoRow: byo(),
      lovableRow: null,
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });
    expect(r.isActive).toBe(true);
    expect(r.effectivePlanId).toBe("pro_monthly");
    expect(r.source).toBe("byo_paddle");
    expect(r.capabilities.advancedExports).toBe(true);
  });

  it("Lovable pro_monthly active unlocks Pro", () => {
    const r = resolveUnionEntitlements({
      byoRow: null,
      lovableRow: lovable(),
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });
    expect(r.isActive).toBe(true);
    expect(r.effectivePlanId).toBe("pro_monthly");
    expect(r.source).toBe("lovable_paddle_subscription");
  });

  it("Lovable pro_annual active unlocks Pro", () => {
    const r = resolveUnionEntitlements({
      byoRow: null,
      lovableRow: lovable({ price_id: "pro_annual" }),
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });
    expect(r.effectivePlanId).toBe("pro_annual");
    expect(r.isActive).toBe(true);
  });

  it("Lovable founder_lifetime unlocks lifetime Pro", () => {
    const r = resolveUnionEntitlements({
      byoRow: null,
      lovableRow: lovable({
        price_id: "founder_lifetime",
        paddle_subscription_id: "lifetime_txn_1",
        current_period_end: null,
      }),
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });
    expect(r.effectivePlanId).toBe("founder_lifetime");
    expect(r.source).toBe("lovable_paddle_lifetime");
    expect(r.isActive).toBe(true);
  });

  it("Founder Lifetime beats simultaneous pro_monthly", () => {
    const r = resolveUnionEntitlements({
      byoRow: byo(),
      lovableRow: lovable({
        price_id: "founder_lifetime",
        paddle_subscription_id: "lifetime_1",
        current_period_end: null,
      }),
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });
    expect(r.effectivePlanId).toBe("founder_lifetime");
    expect(r.source).toBe("lovable_paddle_lifetime");
  });

  it("No rows returns Free", () => {
    const r = resolveUnionEntitlements({
      byoRow: null,
      lovableRow: null,
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });
    expect(r.effectivePlanId).toBe("free");
    expect(r.source).toBe("free");
  });

  it("Unknown Lovable row does not beat active BYO", () => {
    const r = resolveUnionEntitlements({
      byoRow: byo(),
      lovableRow: lovable({ price_id: "mystery_plan" }),
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });
    expect(r.source).toBe("byo_paddle");
    expect(r.isActive).toBe(true);
  });

  it("sandbox row ignored when expectedBillingEnvironment=live", () => {
    const r = resolveUnionEntitlements({
      byoRow: null,
      lovableRow: lovable({ environment: "sandbox" }),
      expectedBillingEnvironment: "live",
      now: NOW,
    });
    expect(r.effectivePlanId).toBe("free");
    expect(r.source).toBe("free");
  });

  it("expired Lovable pro_monthly does not unlock", () => {
    const r = resolveUnionEntitlements({
      byoRow: null,
      lovableRow: lovable({ status: "expired", current_period_end: PAST }),
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });
    expect(r.isActive).toBe(false);
  });

  it("deterministic output for identical inputs", () => {
    const a = resolveUnionEntitlements({
      byoRow: byo(),
      lovableRow: lovable(),
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });
    const b = resolveUnionEntitlements({
      byoRow: byo(),
      lovableRow: lovable(),
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });
    expect(a).toEqual(b);
  });
});
