/**
 * Pure resolver tests for src/lib/entitlements/resolveEntitlements.ts.
 *
 * Covers: null → free; each plan → caps; period boundary; expired/canceled/
 * past_due/paused; pro_monthly == pro_annual; founder credits hard-pinned;
 * unknown plan/status → free + degraded.
 */
import { describe, it, expect } from "vitest";
import {
  resolveEntitlements,
  PLAN_CATALOG,
  FREE_CAPABILITIES,
  type BillingSubscriptionRow,
} from "@/lib/entitlements";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const FUTURE = new Date(NOW.getTime() + 30 * 86400_000).toISOString();
const PAST = new Date(NOW.getTime() - 60_000).toISOString();

function row(overrides: Partial<BillingSubscriptionRow> = {}): BillingSubscriptionRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    user_id: "00000000-0000-0000-0000-0000000000aa",
    plan_id: "pro_monthly",
    status: "active",
    provider: "stripe",
    provider_customer_id: null,
    provider_subscription_id: null,
    current_period_end: FUTURE,
    cancel_at_period_end: false,
    founder_number: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

describe("resolveEntitlements — absence and free", () => {
  it("null row → free caps, active, not degraded", () => {
    const r = resolveEntitlements(null, NOW);
    expect(r.effectivePlanId).toBe("free");
    expect(r.displayPlanId).toBe("free");
    expect(r.isActive).toBe(true);
    expect(r.capabilities).toEqual(FREE_CAPABILITIES);
    expect(r.degraded).toBe(false);
  });

  it("free plan row → free caps, active", () => {
    const r = resolveEntitlements(row({ plan_id: "free", current_period_end: null }), NOW);
    expect(r.effectivePlanId).toBe("free");
    expect(r.isActive).toBe(true);
    expect(r.capabilities).toEqual(FREE_CAPABILITIES);
  });
});

describe("resolveEntitlements — each plan resolves to catalog caps", () => {
  for (const plan of ["pro_monthly", "pro_annual", "founder_lifetime"] as const) {
    it(`${plan} active+future → catalog caps, active`, () => {
      const r = resolveEntitlements(row({ plan_id: plan }), NOW);
      expect(r.effectivePlanId).toBe(plan);
      expect(r.isActive).toBe(true);
      expect(r.capabilities).toEqual(PLAN_CATALOG[plan]);
    });
  }

  it("pro_monthly capabilities === pro_annual capabilities", () => {
    expect(PLAN_CATALOG.pro_monthly).toEqual(PLAN_CATALOG.pro_annual);
  });

  it("founder_lifetime aiMonthlyCredits is exactly 100 (not null, not Infinity)", () => {
    expect(PLAN_CATALOG.founder_lifetime.aiMonthlyCredits).toBe(100);
    expect(PLAN_CATALOG.founder_lifetime.aiMonthlyCredits).not.toBe(null);
    expect(Number.isFinite(PLAN_CATALOG.founder_lifetime.aiMonthlyCredits)).toBe(true);
  });

  it("founder_lifetime current_period_end NULL → still active forever", () => {
    const r = resolveEntitlements(
      row({ plan_id: "founder_lifetime", current_period_end: null }),
      NOW,
    );
    expect(r.isActive).toBe(true);
    expect(r.effectivePlanId).toBe("founder_lifetime");
  });
});

describe("resolveEntitlements — degraded statuses fall back to free", () => {
  it("expired → free, degraded, displayPlanId retained", () => {
    const r = resolveEntitlements(row({ status: "expired" }), NOW);
    expect(r.effectivePlanId).toBe("free");
    expect(r.displayPlanId).toBe("pro_monthly");
    expect(r.isActive).toBe(false);
    expect(r.degraded).toBe(true);
    expect(r.degradedReason).toBe("expired");
  });

  it("canceled → free, degraded", () => {
    const r = resolveEntitlements(row({ status: "canceled" }), NOW);
    expect(r.effectivePlanId).toBe("free");
    expect(r.degradedReason).toBe("canceled");
  });

  it("past_due → free, degraded", () => {
    const r = resolveEntitlements(row({ status: "past_due" }), NOW);
    expect(r.effectivePlanId).toBe("free");
    expect(r.isActive).toBe(false);
    expect(r.degradedReason).toBe("past_due");
  });

  it("paused → free caps but plan_id retained in displayPlanId", () => {
    const r = resolveEntitlements(row({ status: "paused", plan_id: "pro_annual" }), NOW);
    expect(r.effectivePlanId).toBe("free");
    expect(r.displayPlanId).toBe("pro_annual");
    expect(r.isActive).toBe(false);
    expect(r.capabilities).toEqual(FREE_CAPABILITIES);
    expect(r.degradedReason).toBe("paused");
  });
});

describe("resolveEntitlements — period boundary", () => {
  it("active + future period (NOW+30d) → active", () => {
    const r = resolveEntitlements(row({ current_period_end: FUTURE }), NOW);
    expect(r.isActive).toBe(true);
  });

  it("active + period elapsed 60s ago → free, degraded expired", () => {
    const r = resolveEntitlements(row({ current_period_end: PAST }), NOW);
    expect(r.isActive).toBe(false);
    expect(r.effectivePlanId).toBe("free");
    expect(r.degradedReason).toBe("expired");
  });

  it("active + period exactly equal to now → treated as elapsed", () => {
    const r = resolveEntitlements(
      row({ current_period_end: NOW.toISOString() }),
      NOW,
    );
    expect(r.isActive).toBe(false);
  });

  it("active + period 1ms after now → still active", () => {
    const r = resolveEntitlements(
      row({ current_period_end: new Date(NOW.getTime() + 1).toISOString() }),
      NOW,
    );
    expect(r.isActive).toBe(true);
  });

  it("malformed current_period_end string → treated as elapsed (safe)", () => {
    const r = resolveEntitlements(
      row({ current_period_end: "not-a-date" as unknown as string }),
      NOW,
    );
    expect(r.isActive).toBe(false);
  });
});

describe("resolveEntitlements — unknown values degrade safely", () => {
  it("unknown plan_id → free, degraded unknown_plan_id", () => {
    const r = resolveEntitlements(row({ plan_id: "ultra_mega" }), NOW);
    expect(r.effectivePlanId).toBe("free");
    expect(r.isActive).toBe(false);
    expect(r.degraded).toBe(true);
    expect(r.degradedReason).toBe("unknown_plan_id");
  });

  it("unknown status → free, degraded unknown_status", () => {
    const r = resolveEntitlements(row({ status: "lapsed_or_something" }), NOW);
    expect(r.effectivePlanId).toBe("free");
    expect(r.isActive).toBe(false);
    expect(r.degradedReason).toBe("unknown_status");
  });
});

describe("resolveEntitlements — purity", () => {
  it("does not read internal now() — same input + same now → same output", () => {
    const a = resolveEntitlements(row(), NOW);
    const b = resolveEntitlements(row(), NOW);
    expect(a).toEqual(b);
  });

  it("does not mutate the input row", () => {
    const r = row({ status: "paused" });
    const snapshot = JSON.stringify(r);
    resolveEntitlements(r, NOW);
    expect(JSON.stringify(r)).toBe(snapshot);
  });
});
