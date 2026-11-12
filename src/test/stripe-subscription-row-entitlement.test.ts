/**
 * Stripe rows in public.subscriptions — entitlement reader (#2969, Slice A).
 *
 * Production's subscriptions table carries billing_provider ('paddle' |
 * 'stripe'), stripe_subscription_id and stripe_customer_id, and paddle_* ids
 * are null on a Stripe row (migration 20261104184500). Before this slice the
 * reader selected Paddle columns only and broke created_at ties on
 * paddle_subscription_id, so a Stripe row could not be identified or ordered.
 *
 * Rules under test:
 *   - a Stripe row with a known readable price key grants that plan;
 *   - an unknown price, a missing stripe_subscription_id, an unknown
 *     billing_provider, or a Stripe founder_lifetime row grants nothing;
 *   - a sandbox Stripe row never grants when the server expects live;
 *   - equal created_at resolves the same way whatever order rows arrive in;
 *   - Paddle rows (provider absent, null or 'paddle') map exactly as before.
 */
import { describe, it, expect } from "vitest";
import { loadUnionEntitlement } from "../../supabase/functions/_shared/unionEntitlementLookup.ts";
import { mapLovableSubscriptionRow, type LovableSubscriptionRow } from "@/lib/entitlements";

const NOW = new Date("2026-11-12T12:00:00.000Z");
const FUTURE = new Date(NOW.getTime() + 30 * 86400_000).toISOString();
const SAME_TIME = "2026-11-01T00:00:00Z";

function stripeRow(over: Partial<LovableSubscriptionRow> = {}): LovableSubscriptionRow {
  return {
    id: "00000000-0000-4000-8000-00000000000a",
    user_id: "u1",
    billing_provider: "stripe",
    stripe_subscription_id: "sub_stripe_1",
    stripe_customer_id: "cus_1",
    paddle_subscription_id: null,
    paddle_customer_id: null,
    product_id: "verdant_pro",
    price_id: "pro_monthly",
    status: "active",
    current_period_start: SAME_TIME,
    current_period_end: FUTURE,
    cancel_at_period_end: false,
    environment: "live",
    created_at: SAME_TIME,
    updated_at: SAME_TIME,
    ...over,
  };
}

function paddleRow(over: Partial<LovableSubscriptionRow> = {}): LovableSubscriptionRow {
  return {
    user_id: "u1",
    paddle_subscription_id: "sub_01xyz",
    paddle_customer_id: "ctm_1",
    product_id: "verdant_pro",
    price_id: "pro_annual",
    status: "active",
    current_period_start: SAME_TIME,
    current_period_end: FUTURE,
    cancel_at_period_end: false,
    environment: "live",
    created_at: SAME_TIME,
    updated_at: SAME_TIME,
    ...over,
  };
}

/** Chainable fake of the supabase-js builder; honors chained desc orders and limit. */
function fakeClient(subsByEnv: Partial<Record<"live" | "sandbox", LovableSubscriptionRow[]>>) {
  return {
    from() {
      let env: "live" | "sandbox" | null = null;
      const descKeys: string[] = [];
      let max = Infinity;
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: "live" | "sandbox") {
          if (column === "environment") env = value;
          return builder;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          if (opts?.ascending === false) descKeys.push(column);
          return builder;
        },
        limit(n: number) {
          max = n;
          return builder;
        },
        then(resolve: (v: { data: unknown[] | null; error: unknown }) => void) {
          const rows = [...((env && subsByEnv[env]) || [])] as unknown as Array<
            Record<string, unknown>
          >;
          // Desc with nulls last, as PostgREST's nullsFirst:false.
          rows.sort((a, b) => {
            for (const key of descKeys) {
              const cmp = String(b[key] ?? "").localeCompare(String(a[key] ?? ""));
              if (cmp !== 0) return cmp;
            }
            return 0;
          });
          resolve({ data: rows.slice(0, max), error: null });
        },
      };
      return builder;
    },
  };
}

const live = { expectedBillingEnvironment: "live" as const };

describe("mapLovableSubscriptionRow — Stripe rows", () => {
  it("grants the plan of a Stripe row with a known price key, labeled stripe", () => {
    const mapped = mapLovableSubscriptionRow(stripeRow(), live);
    expect(mapped?.plan_id).toBe("pro_monthly");
    expect(mapped?.provider).toBe("stripe");
    expect(mapped?.id).toBe("lovable_stripe:pro_monthly");
    // No raw provider ids leak downstream.
    expect(mapped?.provider_subscription_id).toBeNull();
    expect(mapped?.provider_customer_id).toBeNull();
  });

  it("grants nothing for an unknown price key", () => {
    expect(mapLovableSubscriptionRow(stripeRow({ price_id: "price_1Abc" }), live)).toBeNull();
  });

  it("grants nothing when stripe_subscription_id is missing or empty", () => {
    expect(mapLovableSubscriptionRow(stripeRow({ stripe_subscription_id: null }), live)).toBeNull();
    expect(mapLovableSubscriptionRow(stripeRow({ stripe_subscription_id: "" }), live)).toBeNull();
    expect(
      mapLovableSubscriptionRow(stripeRow({ stripe_subscription_id: undefined }), live),
    ).toBeNull();
  });

  it("grants nothing for an unknown billing_provider", () => {
    expect(mapLovableSubscriptionRow(stripeRow({ billing_provider: "square" }), live)).toBeNull();
    expect(mapLovableSubscriptionRow(paddleRow({ billing_provider: "square" }), live)).toBeNull();
  });

  it("grants nothing for a Stripe founder_lifetime row (Founder Lifetime is not sold)", () => {
    expect(
      mapLovableSubscriptionRow(
        stripeRow({ price_id: "founder_lifetime", current_period_end: null }),
        live,
      ),
    ).toBeNull();
  });

  it("never grants a sandbox Stripe row when live is expected", () => {
    expect(mapLovableSubscriptionRow(stripeRow({ environment: "sandbox" }), live)).toBeNull();
  });

  it("maps Paddle rows exactly as before, whether billing_provider is absent, null or paddle", () => {
    const baseline = mapLovableSubscriptionRow(paddleRow(), live);
    expect(baseline?.provider).toBe("paddle");
    expect(baseline?.id).toBe("lovable_paddle:pro_annual");
    expect(mapLovableSubscriptionRow(paddleRow({ billing_provider: null }), live)).toEqual(
      baseline,
    );
    expect(mapLovableSubscriptionRow(paddleRow({ billing_provider: "paddle" }), live)).toEqual(
      baseline,
    );
  });
});

describe("loadUnionEntitlement — Stripe rows", () => {
  it("a live Stripe Pro row unlocks Pro", async () => {
    const { entitlement, lookupFailed } = await loadUnionEntitlement(
      fakeClient({ live: [stripeRow()] }),
      "live",
      NOW,
    );
    expect(lookupFailed).toBe(false);
    expect(entitlement.effectivePlanId).toBe("pro_monthly");
    expect(entitlement.capabilities.advancedExports).toBe(true);
  });

  it("a sandbox Stripe row never unlocks when the server expects live", async () => {
    const { entitlement } = await loadUnionEntitlement(
      fakeClient({ sandbox: [stripeRow({ environment: "sandbox" })] }),
      "live",
      NOW,
    );
    expect(entitlement.effectivePlanId).toBe("free");
  });

  it("a Paddle and a Stripe row with equal created_at resolve the same in either order", async () => {
    const a = await loadUnionEntitlement(
      fakeClient({ live: [paddleRow(), stripeRow()] }),
      "live",
      NOW,
    );
    const b = await loadUnionEntitlement(
      fakeClient({ live: [stripeRow(), paddleRow()] }),
      "live",
      NOW,
    );
    expect(a.entitlement.effectivePlanId).toBe(b.entitlement.effectivePlanId);
  });

  it("two Stripe rows with equal created_at resolve the same in either order", async () => {
    const older = stripeRow({
      id: "00000000-0000-4000-8000-00000000000a",
      stripe_subscription_id: "sub_a",
      price_id: "pro_monthly",
    });
    const newer = stripeRow({
      id: "00000000-0000-4000-8000-00000000000b",
      stripe_subscription_id: "sub_b",
      price_id: "pro_annual",
    });
    const a = await loadUnionEntitlement(fakeClient({ live: [older, newer] }), "live", NOW);
    const b = await loadUnionEntitlement(fakeClient({ live: [newer, older] }), "live", NOW);
    expect(a.entitlement.effectivePlanId).toBe(b.entitlement.effectivePlanId);
    expect(a.entitlement.effectivePlanId).toBe("pro_annual");
  });
});
