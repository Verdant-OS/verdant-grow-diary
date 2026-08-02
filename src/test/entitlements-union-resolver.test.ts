/**
 * Phase 2b — union resolver tests.
 *
 * Covers pickStrongestBilling precedence + the resolveUnionEntitlements
 * composer end-to-end (adapter → picker → pure resolver → source stamp).
 *
 * Also anchors the multi-row Lovable window helpers (pickEntitlingLovableRow /
 * lovableRowEntitles) shared with the server union lookup — these must stay
 * pure-unit covered so Founder Lifetime cannot be shadowed by a newer row.
 */
import { describe, it, expect } from "vitest";
import {
  pickStrongestBilling,
  resolveUnionEntitlements,
  pickEntitlingLovableRow,
  lovableRowEntitles,
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

  it("past-due BYO remains entitling during dunning", () => {
    const r = pickStrongestBilling(
      byo({ status: "past_due", current_period_end: PAST }),
      null,
      NOW,
    );
    expect(r.source).toBe("byo_paddle");
    expect(r.row?.status).toBe("past_due");
  });

  it("canceled BYO remains entitling only before its paid-through end", () => {
    const grace = pickStrongestBilling(
      byo({ status: "canceled", current_period_end: FUTURE }),
      null,
      NOW,
    );
    expect(grace.source).toBe("byo_paddle");

    const elapsed = pickStrongestBilling(
      byo({ status: "canceled", current_period_end: PAST }),
      null,
      NOW,
    );
    expect(elapsed.row?.status).toBe("canceled");
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

  it("Lovable past_due retains Pro during dunning", () => {
    const r = resolveUnionEntitlements({
      byoRow: null,
      lovableRow: lovable({ status: "past_due", current_period_end: PAST }),
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });
    expect(r.effectivePlanId).toBe("pro_monthly");
    expect(r.isActive).toBe(true);
  });

  it("Lovable canceled subscription retains Pro only during cancellation grace", () => {
    const grace = resolveUnionEntitlements({
      byoRow: null,
      lovableRow: lovable({ status: "canceled", current_period_end: FUTURE }),
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });
    expect(grace.effectivePlanId).toBe("pro_monthly");
    expect(grace.isActive).toBe(true);

    const elapsed = resolveUnionEntitlements({
      byoRow: null,
      lovableRow: lovable({ status: "canceled", current_period_end: PAST }),
      expectedBillingEnvironment: "sandbox",
      now: NOW,
    });
    expect(elapsed.effectivePlanId).toBe("free");
    expect(elapsed.isActive).toBe(false);
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

describe("lovableRowEntitles", () => {
  it("returns true for active sandbox pro_monthly in sandbox env", () => {
    expect(lovableRowEntitles(lovable(), "sandbox", NOW)).toBe(true);
  });

  it("returns false when environment mismatches (sandbox row / live expected)", () => {
    expect(lovableRowEntitles(lovable({ environment: "sandbox" }), "live", NOW)).toBe(false);
  });

  it("returns false for expired rows past paid-through", () => {
    expect(
      lovableRowEntitles(lovable({ status: "expired", current_period_end: PAST }), "sandbox", NOW),
    ).toBe(false);
  });

  it("returns true for founder_lifetime with null period end", () => {
    expect(
      lovableRowEntitles(
        lovable({
          price_id: "founder_lifetime",
          product_id: "founder_lifetime",
          paddle_subscription_id: "lifetime_1",
          current_period_end: null,
        }),
        "sandbox",
        NOW,
      ),
    ).toBe(true);
  });
});

describe("pickEntitlingLovableRow", () => {
  it("returns null for an empty window", () => {
    expect(pickEntitlingLovableRow([], "sandbox", NOW)).toBeNull();
  });

  it("returns the only active pro row", () => {
    const row = lovable({ paddle_subscription_id: "sub_pro" });
    expect(pickEntitlingLovableRow([row], "sandbox", NOW)).toBe(row);
  });

  it("REGRESSION: newer canceled Pro does not shadow older Founder Lifetime", () => {
    // Rows arrive newest-first (created_at desc, paddle_subscription_id desc).
    const newerCanceledPro = lovable({
      paddle_subscription_id: "sub_01zzz",
      price_id: "pro_monthly",
      status: "canceled",
      current_period_end: PAST,
      created_at: "2026-05-20T00:00:00.000Z",
    });
    const olderFounder = lovable({
      paddle_subscription_id: "lifetime_txn_01abc",
      product_id: "founder_lifetime",
      price_id: "founder_lifetime",
      status: "active",
      current_period_end: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const picked = pickEntitlingLovableRow([newerCanceledPro, olderFounder], "sandbox", NOW);
    expect(picked).toBe(olderFounder);
    expect(picked?.price_id).toBe("founder_lifetime");
  });

  it("REGRESSION: newer ACTIVE Pro still loses to Founder Lifetime (lifetime-first)", () => {
    const newerActivePro = lovable({
      paddle_subscription_id: "sub_pro_new",
      price_id: "pro_monthly",
      status: "active",
      created_at: "2026-05-20T00:00:00.000Z",
    });
    const olderFounder = lovable({
      paddle_subscription_id: "lifetime_txn_01abc",
      product_id: "founder_lifetime",
      price_id: "founder_lifetime",
      status: "active",
      current_period_end: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const picked = pickEntitlingLovableRow([newerActivePro, olderFounder], "sandbox", NOW);
    expect(picked).toBe(olderFounder);
  });

  it("falls back to newest row when nothing entitles (degraded display)", () => {
    const newestExpired = lovable({
      paddle_subscription_id: "sub_new",
      status: "expired",
      current_period_end: PAST,
      created_at: "2026-05-01T00:00:00.000Z",
    });
    const olderExpired = lovable({
      paddle_subscription_id: "sub_old",
      status: "canceled",
      current_period_end: PAST,
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const picked = pickEntitlingLovableRow([newestExpired, olderExpired], "sandbox", NOW);
    expect(picked).toBe(newestExpired);
  });

  it("picks the newest entitling recurring when no lifetime is present", () => {
    const newerPro = lovable({
      paddle_subscription_id: "sub_new_pro",
      price_id: "pro_monthly",
      created_at: "2026-05-01T00:00:00.000Z",
    });
    const olderPro = lovable({
      paddle_subscription_id: "sub_old_pro",
      price_id: "pro_annual",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    // Window is newest-first; first entitling recurring should win.
    expect(pickEntitlingLovableRow([newerPro, olderPro], "sandbox", NOW)).toBe(newerPro);
  });

  it("ignores rows from the wrong billing environment", () => {
    const sandboxOnly = lovable({
      environment: "sandbox",
      paddle_subscription_id: "sub_sandbox",
    });
    const picked = pickEntitlingLovableRow([sandboxOnly], "live", NOW);
    // Wrong env → not entitling → falls back to newest (only) row for degraded display.
    expect(picked).toBe(sandboxOnly);
    expect(lovableRowEntitles(sandboxOnly, "live", NOW)).toBe(false);
  });

  it("is deterministic for identical inputs", () => {
    const rows = [
      lovable({ paddle_subscription_id: "a" }),
      lovable({
        paddle_subscription_id: "lifetime_1",
        price_id: "founder_lifetime",
        product_id: "founder_lifetime",
        current_period_end: null,
      }),
    ];
    expect(pickEntitlingLovableRow(rows, "sandbox", NOW)).toEqual(
      pickEntitlingLovableRow(rows, "sandbox", NOW),
    );
  });
});
