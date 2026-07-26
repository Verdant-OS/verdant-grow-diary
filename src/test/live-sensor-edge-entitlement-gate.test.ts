import { describe, expect, it } from "vitest";
import type { BillingSubscriptionRow, LovableSubscriptionRow, PlanId } from "@/lib/entitlements";
import { requireLiveSensorEntitlement } from "../../supabase/functions/_shared/liveSensorEntitlementGate.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-07-25T12:00:00.000Z");
const FUTURE = "2026-08-25T12:00:00.000Z";
const PAST = "2026-07-24T12:00:00.000Z";

function row(
  planId: Exclude<PlanId, "free">,
  overrides: Partial<LovableSubscriptionRow> = {},
): LovableSubscriptionRow {
  const lifetime = planId === "founder_lifetime";
  return {
    user_id: USER_ID,
    paddle_subscription_id: lifetime ? "lifetime_txn_sensor" : `sub_${planId}`,
    paddle_customer_id: "ctm_sensor",
    product_id: lifetime ? "founder_lifetime" : "verdant_paid",
    price_id: planId,
    status: "active",
    current_period_start: "2026-07-25T00:00:00.000Z",
    current_period_end: lifetime ? null : FUTURE,
    cancel_at_period_end: false,
    environment: "live",
    created_at: "2026-07-25T00:00:00.000Z",
    updated_at: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}

function billingRow(overrides: Partial<BillingSubscriptionRow> = {}): BillingSubscriptionRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    user_id: USER_ID,
    plan_id: "pro_monthly",
    status: "active",
    provider: "paddle",
    provider_customer_id: null,
    provider_subscription_id: "sub_byo_sensor",
    current_period_end: FUTURE,
    cancel_at_period_end: false,
    founder_number: null,
    created_at: "2026-07-25T00:00:00.000Z",
    updated_at: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}

interface FakeState {
  rows: LovableSubscriptionRow[];
  error?: unknown;
  billingRows?: BillingSubscriptionRow[];
  billingError?: unknown;
  filters: Array<{ column: string; value: string }>;
}

function fakeClient(state: FakeState) {
  return {
    from(table: string) {
      expect(["billing_subscriptions", "subscriptions"]).toContain(table);
      const filters: Array<{ column: string; value: string }> = [];
      let max = Infinity;
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: string) {
          filters.push({ column, value });
          state.filters.push({ column, value });
          return builder;
        },
        order() {
          return builder;
        },
        limit(value: number) {
          max = value;
          return builder;
        },
        then(resolve: (result: { data: unknown[] | null; error: unknown }) => void) {
          const error = table === "billing_subscriptions" ? state.billingError : state.error;
          if (error) {
            resolve({ data: null, error });
            return;
          }
          const candidates =
            table === "billing_subscriptions" ? (state.billingRows ?? []) : state.rows;
          const data = candidates
            .filter((candidate) =>
              filters.every(
                ({ column, value }) =>
                  String((candidate as unknown as Record<string, unknown>)[column]) === value,
              ),
            )
            .slice(0, max);
          resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
}

describe("requireLiveSensorEntitlement", () => {
  it.each(["pro_monthly", "craft_annual", "founder_lifetime"] as const)(
    "allows server-resolved %s live-sensor access",
    async (planId) => {
      const state: FakeState = { rows: [row(planId)], filters: [] };
      const result = await requireLiveSensorEntitlement(fakeClient(state), USER_ID, "live", NOW);

      expect(result).toMatchObject({
        ok: true,
        effectivePlanId: planId,
      });
      expect(state.filters).toContainEqual({ column: "user_id", value: USER_ID });
    },
  );

  it("fails a Free user closed without trusting another user's paid row", async () => {
    const state: FakeState = {
      rows: [row("pro_monthly", { user_id: OTHER_USER_ID })],
      filters: [],
    };
    const result = await requireLiveSensorEntitlement(fakeClient(state), USER_ID, "live", NOW);

    expect(result).toEqual({ ok: false, reason: "upgrade_required" });
    expect(state.filters).toContainEqual({ column: "user_id", value: USER_ID });
  });

  it("honors an active billing_subscriptions row when Lovable has no row", async () => {
    const state: FakeState = {
      rows: [],
      billingRows: [billingRow()],
      filters: [],
    };

    await expect(
      requireLiveSensorEntitlement(fakeClient(state), USER_ID, "live", NOW),
    ).resolves.toMatchObject({
      ok: true,
      effectivePlanId: "pro_monthly",
    });
  });

  it("fails a degraded paid row closed after its paid-through period", async () => {
    const state: FakeState = {
      rows: [row("pro_monthly", { status: "canceled", current_period_end: PAST })],
      filters: [],
    };

    await expect(
      requireLiveSensorEntitlement(fakeClient(state), USER_ID, "live", NOW),
    ).resolves.toEqual({ ok: false, reason: "upgrade_required" });
  });

  it("distinguishes an unverifiable lookup and fails closed", async () => {
    const state: FakeState = {
      rows: [],
      error: { message: "database unavailable" },
      filters: [],
    };

    await expect(
      requireLiveSensorEntitlement(fakeClient(state), USER_ID, "live", NOW),
    ).resolves.toEqual({ ok: false, reason: "entitlement_lookup_failed" });
  });

  it("fails closed when billing_subscriptions is unverifiable even if Lovable is paid", async () => {
    const state: FakeState = {
      rows: [row("craft_monthly")],
      billingError: { message: "authority unavailable" },
      filters: [],
    };

    await expect(
      requireLiveSensorEntitlement(fakeClient(state), USER_ID, "live", NOW),
    ).resolves.toEqual({ ok: false, reason: "entitlement_lookup_failed" });
  });

  it("rejects a missing server-resolved owner without querying", async () => {
    const state: FakeState = { rows: [row("pro_monthly")], filters: [] };

    await expect(requireLiveSensorEntitlement(fakeClient(state), "", "live", NOW)).resolves.toEqual(
      { ok: false, reason: "entitlement_lookup_failed" },
    );
    expect(state.filters).toEqual([]);
  });
});
