/**
 * Phase 2b — lovablePaddleAdapter pure tests.
 *
 * Rules covered:
 *  - price_id mapping (pro_monthly, pro_annual, founder_lifetime).
 *  - Unknown price_id → null.
 *  - status must be a known status.
 *  - current_period_end NULL rejected for pro_monthly / pro_annual.
 *  - Founder Lifetime accepted only when all 4 invariants hold.
 *  - Environment mismatch → null (sandbox vs live safety).
 */
import { describe, it, expect } from "vitest";
import {
  mapLovableSubscriptionRow,
  type LovableSubscriptionRow,
} from "@/lib/entitlements/lovablePaddleAdapter";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const FUTURE = new Date(NOW.getTime() + 30 * 86400_000).toISOString();
const PAST = new Date(NOW.getTime() - 60_000).toISOString();

function baseRow(over: Partial<LovableSubscriptionRow> = {}): LovableSubscriptionRow {
  return {
    user_id: "u-1",
    paddle_subscription_id: "sub_abc",
    paddle_customer_id: "ctm_abc",
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

describe("mapLovableSubscriptionRow", () => {
  it("maps pro_monthly active → pro_monthly BillingSubscriptionRow", () => {
    const r = mapLovableSubscriptionRow(baseRow(), {
      expectedBillingEnvironment: "sandbox",
    });
    expect(r).not.toBeNull();
    expect(r!.plan_id).toBe("pro_monthly");
    expect(r!.status).toBe("active");
  });

  it("maps pro_annual active → pro_annual", () => {
    const r = mapLovableSubscriptionRow(
      baseRow({ price_id: "pro_annual" }),
      { expectedBillingEnvironment: "sandbox" },
    );
    expect(r!.plan_id).toBe("pro_annual");
  });

  it("maps founder_lifetime with all invariants → founder_lifetime", () => {
    const r = mapLovableSubscriptionRow(
      baseRow({
        price_id: "founder_lifetime",
        product_id: "founder_lifetime",
        paddle_subscription_id: "lifetime_txn_xyz",
        current_period_end: null,
      }),
      { expectedBillingEnvironment: "sandbox" },
    );
    expect(r!.plan_id).toBe("founder_lifetime");
    expect(r!.current_period_end).toBeNull();
  });

  it("returns null for unknown price_id", () => {
    const r = mapLovableSubscriptionRow(
      baseRow({ price_id: "some_unknown_price" }),
      { expectedBillingEnvironment: "sandbox" },
    );
    expect(r).toBeNull();
  });

  it("current_period_end NULL rejected for pro_monthly", () => {
    const r = mapLovableSubscriptionRow(
      baseRow({ current_period_end: null }),
      { expectedBillingEnvironment: "sandbox" },
    );
    expect(r).toBeNull();
  });

  it("current_period_end NULL rejected for pro_annual", () => {
    const r = mapLovableSubscriptionRow(
      baseRow({ price_id: "pro_annual", current_period_end: null }),
      { expectedBillingEnvironment: "sandbox" },
    );
    expect(r).toBeNull();
  });

  it("founder_lifetime rejected if paddle_subscription_id does not start with lifetime_", () => {
    const r = mapLovableSubscriptionRow(
      baseRow({
        price_id: "founder_lifetime",
        paddle_subscription_id: "sub_notlifetime",
        current_period_end: null,
      }),
      { expectedBillingEnvironment: "sandbox" },
    );
    expect(r).toBeNull();
  });

  it("founder_lifetime rejected when current_period_end is present", () => {
    const r = mapLovableSubscriptionRow(
      baseRow({
        price_id: "founder_lifetime",
        paddle_subscription_id: "lifetime_x",
        current_period_end: FUTURE,
      }),
      { expectedBillingEnvironment: "sandbox" },
    );
    expect(r).toBeNull();
  });

  it("expired-status pro_monthly still maps (union resolver decides activeness)", () => {
    // Adapter shape-only; period elapsed / expired handling is downstream.
    const r = mapLovableSubscriptionRow(
      baseRow({ status: "expired", current_period_end: PAST }),
      { expectedBillingEnvironment: "sandbox" },
    );
    expect(r).not.toBeNull();
    expect(r!.status).toBe("expired");
  });

  it("unknown status → null (defense-in-depth)", () => {
    const r = mapLovableSubscriptionRow(
      baseRow({ status: "banana" }),
      { expectedBillingEnvironment: "sandbox" },
    );
    expect(r).toBeNull();
  });

  it("sandbox row ignored when expectedBillingEnvironment is live", () => {
    const r = mapLovableSubscriptionRow(baseRow({ environment: "sandbox" }), {
      expectedBillingEnvironment: "live",
    });
    expect(r).toBeNull();
  });

  it("live row ignored when expectedBillingEnvironment is sandbox", () => {
    const r = mapLovableSubscriptionRow(baseRow({ environment: "live" }), {
      expectedBillingEnvironment: "sandbox",
    });
    expect(r).toBeNull();
  });

  it("does not expose raw Paddle IDs in mapped output", () => {
    const r = mapLovableSubscriptionRow(
      baseRow({ paddle_customer_id: "ctm_LEAK", paddle_subscription_id: "sub_LEAK" }),
      { expectedBillingEnvironment: "sandbox" },
    )!;
    const asJson = JSON.stringify(r);
    expect(asJson).not.toContain("ctm_LEAK");
    expect(asJson).not.toContain("sub_LEAK");
  });

  it("null row → null", () => {
    expect(
      mapLovableSubscriptionRow(null, { expectedBillingEnvironment: "sandbox" }),
    ).toBeNull();
  });
});
