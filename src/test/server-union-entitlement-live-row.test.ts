/**
 * loadUnionEntitlement — live-row environment rule.
 *
 * Regression for the 2026-07-16 walkthrough defect: /settings resolved a
 * Founder Lifetime account (live `subscriptions` row written by
 * allocate_lovable_founder_lifetime) while the server-authoritative
 * environment-summary gate denied it, because the gate filtered the
 * `subscriptions` read to resolveServerBillingEnvironment()'s expected
 * environment — which drifts to 'sandbox' whenever PAYMENTS_ENVIRONMENT is
 * unset/stale and both Paddle API keys are configured (the standard Lovable
 * posture, where the key-presence heuristic can never pick 'live').
 *
 * Rule under test (mirrors the DB gates has_pheno_tracker_entitlement and
 * ai_credit_spend, which pin their Lovable branch to environment='live'):
 *   - an ENTITLING live row unlocks regardless of the expected environment;
 *   - sandbox rows unlock ONLY when the server expects sandbox (unchanged);
 *   - a degraded/unknown live row changes nothing (fail-closed preserved);
 *   - the BYO read failing still fails closed (lookupFailed=true).
 */
import { describe, it, expect } from "vitest";
import { loadUnionEntitlement } from "../../supabase/functions/_shared/unionEntitlementLookup.ts";
import type { BillingSubscriptionRow, LovableSubscriptionRow } from "@/lib/entitlements";

const NOW = new Date("2026-07-16T12:00:00.000Z");
const FUTURE = new Date(NOW.getTime() + 30 * 86400_000).toISOString();

/** Exactly the shape allocate_lovable_founder_lifetime INSERTs. */
function liveFounderRow(over: Partial<LovableSubscriptionRow> = {}): LovableSubscriptionRow {
  return {
    user_id: "u1",
    paddle_subscription_id: "lifetime_txn_01abc",
    paddle_customer_id: "ctm_1",
    product_id: "founder_lifetime",
    price_id: "founder_lifetime",
    status: "active",
    current_period_start: "2026-07-01T00:00:00Z",
    current_period_end: null,
    cancel_at_period_end: false,
    environment: "live",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

function proRow(over: Partial<LovableSubscriptionRow> = {}): LovableSubscriptionRow {
  return {
    user_id: "u1",
    paddle_subscription_id: "sub_01xyz",
    paddle_customer_id: "ctm_1",
    product_id: "verdant_pro",
    price_id: "pro_monthly",
    status: "active",
    current_period_start: "2026-07-01T00:00:00Z",
    current_period_end: FUTURE,
    cancel_at_period_end: false,
    environment: "live",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

const byoFounderRow: BillingSubscriptionRow = {
  id: "byo1",
  user_id: "u1",
  plan_id: "founder_lifetime",
  status: "active",
  provider: "paddle",
  provider_customer_id: "ctm_1",
  provider_subscription_id: null,
  current_period_end: null,
  cancel_at_period_end: false,
  founder_number: 7,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

interface FakeDbState {
  byo?: { data: unknown[] | null; error: unknown };
  subsByEnv?: Partial<Record<"live" | "sandbox", LovableSubscriptionRow[]>>;
  subsError?: unknown;
}

/**
 * Minimal chainable fake of the supabase-js query builder — just enough for
 * loadUnionEntitlement's `.from().select().eq().order().limit()` chains.
 * Builders are thenables so `await Promise.all([...])` resolves them.
 * `order`/`limit` are honored (sort + slice) so multi-row fixtures exercise
 * the same newest-first window the real query returns.
 */
function fakeClient(state: FakeDbState) {
  return {
    from(table: string) {
      let env: "live" | "sandbox" | null = null;
      let descBy: string | null = null;
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
          if (opts?.ascending === false) descBy = column;
          return builder;
        },
        limit(n: number) {
          max = n;
          return builder;
        },
        then(resolve: (v: { data: unknown[] | null; error: unknown }) => void) {
          if (table === "billing_subscriptions") {
            resolve(state.byo ?? { data: [], error: null });
            return;
          }
          if (state.subsError) {
            resolve({ data: null, error: state.subsError });
            return;
          }
          let rows = [...((env && state.subsByEnv?.[env]) || [])];
          if (descBy) {
            rows.sort((a, b) =>
              String(b[descBy as keyof LovableSubscriptionRow] ?? "").localeCompare(
                String(a[descBy as keyof LovableSubscriptionRow] ?? ""),
              ),
            );
          }
          rows = rows.slice(0, max);
          resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  };
}

describe("loadUnionEntitlement — live-row environment rule", () => {
  it("REGRESSION: live Founder Lifetime row unlocks when the server expects sandbox", async () => {
    const { entitlement, lookupFailed } = await loadUnionEntitlement(
      fakeClient({ subsByEnv: { live: [liveFounderRow()] } }),
      "sandbox",
      NOW,
    );
    expect(lookupFailed).toBe(false);
    expect(entitlement.isActive).toBe(true);
    expect(entitlement.displayPlanId).toBe("founder_lifetime");
    expect(entitlement.source).toBe("lovable_paddle_lifetime");
    expect(entitlement.capabilities.advancedExports).toBe(true);
  });

  it("live Pro row unlocks when the server expects sandbox", async () => {
    const { entitlement } = await loadUnionEntitlement(
      fakeClient({ subsByEnv: { live: [proRow()] } }),
      "sandbox",
      NOW,
    );
    expect(entitlement.isActive).toBe(true);
    expect(entitlement.capabilities.advancedExports).toBe(true);
  });

  it("live Founder Lifetime row unlocks when the server expects live (unchanged)", async () => {
    const { entitlement } = await loadUnionEntitlement(
      fakeClient({ subsByEnv: { live: [liveFounderRow()] } }),
      "live",
      NOW,
    );
    expect(entitlement.isActive).toBe(true);
    expect(entitlement.displayPlanId).toBe("founder_lifetime");
    expect(entitlement.capabilities.advancedExports).toBe(true);
  });

  it("sandbox row NEVER unlocks when the server expects live (fail-closed preserved)", async () => {
    const { entitlement } = await loadUnionEntitlement(
      fakeClient({
        subsByEnv: {
          sandbox: [liveFounderRow({ environment: "sandbox" }), proRow({ environment: "sandbox" })],
        },
      }),
      "live",
      NOW,
    );
    expect(entitlement.isActive).toBe(true); // free plan is "active"
    expect(entitlement.effectivePlanId).toBe("free");
    expect(entitlement.capabilities.advancedExports).toBe(false);
  });

  it("sandbox row still unlocks when the server expects sandbox (unchanged)", async () => {
    const { entitlement } = await loadUnionEntitlement(
      fakeClient({ subsByEnv: { sandbox: [proRow({ environment: "sandbox" })] } }),
      "sandbox",
      NOW,
    );
    expect(entitlement.capabilities.advancedExports).toBe(true);
  });

  it("degraded live row does not unlock and does not block the sandbox row", async () => {
    const canceledLive = liveFounderRow({ status: "canceled" });
    const denied = await loadUnionEntitlement(
      fakeClient({ subsByEnv: { live: [canceledLive] } }),
      "sandbox",
      NOW,
    );
    expect(denied.entitlement.capabilities.advancedExports).toBe(false);

    const sandboxStillWins = await loadUnionEntitlement(
      fakeClient({
        subsByEnv: {
          live: [canceledLive],
          sandbox: [proRow({ environment: "sandbox" })],
        },
      }),
      "sandbox",
      NOW,
    );
    expect(sandboxStillWins.entitlement.capabilities.advancedExports).toBe(true);
  });

  it("REGRESSION: active Founder row + NEWER canceled Pro row → still Founder (expects sandbox)", async () => {
    // public.subscriptions is unique per paddle_subscription_id, not per
    // user: a Founder who later started (and canceled) a Pro subscription
    // holds both rows. The newer non-entitling row must not shadow the
    // entitling one.
    const { entitlement } = await loadUnionEntitlement(
      fakeClient({
        subsByEnv: {
          live: [
            liveFounderRow({ created_at: "2026-07-01T00:00:00Z" }),
            proRow({ status: "canceled", created_at: "2026-07-10T00:00:00Z" }),
          ],
        },
      }),
      "sandbox",
      NOW,
    );
    expect(entitlement.isActive).toBe(true);
    expect(entitlement.displayPlanId).toBe("founder_lifetime");
    expect(entitlement.source).toBe("lovable_paddle_lifetime");
    expect(entitlement.capabilities.advancedExports).toBe(true);
  });

  it("REGRESSION: active Founder row + NEWER canceled Pro row → still Founder (expects live)", async () => {
    const { entitlement } = await loadUnionEntitlement(
      fakeClient({
        subsByEnv: {
          live: [
            liveFounderRow({ created_at: "2026-07-01T00:00:00Z" }),
            proRow({ status: "canceled", created_at: "2026-07-10T00:00:00Z" }),
          ],
        },
      }),
      "live",
      NOW,
    );
    expect(entitlement.isActive).toBe(true);
    expect(entitlement.displayPlanId).toBe("founder_lifetime");
    expect(entitlement.capabilities.advancedExports).toBe(true);
  });

  it("only canceled/expired live rows → not entitled (any-row semantics stays fail-closed)", async () => {
    const { entitlement } = await loadUnionEntitlement(
      fakeClient({
        subsByEnv: {
          live: [
            liveFounderRow({ status: "canceled", created_at: "2026-07-01T00:00:00Z" }),
            proRow({ status: "expired", created_at: "2026-07-10T00:00:00Z" }),
          ],
        },
      }),
      "sandbox",
      NOW,
    );
    expect(entitlement.effectivePlanId).toBe("free");
    expect(entitlement.capabilities.advancedExports).toBe(false);
  });

  it("BYO Founder Lifetime row unlocks regardless of expected environment (unchanged)", async () => {
    const { entitlement } = await loadUnionEntitlement(
      fakeClient({ byo: { data: [byoFounderRow], error: null } }),
      "sandbox",
      NOW,
    );
    expect(entitlement.isActive).toBe(true);
    expect(entitlement.displayPlanId).toBe("founder_lifetime");
    expect(entitlement.capabilities.advancedExports).toBe(true);
  });

  it("no rows → free, denied", async () => {
    const { entitlement, lookupFailed } = await loadUnionEntitlement(
      fakeClient({}),
      "sandbox",
      NOW,
    );
    expect(lookupFailed).toBe(false);
    expect(entitlement.effectivePlanId).toBe("free");
    expect(entitlement.capabilities.advancedExports).toBe(false);
  });

  it("BYO read failure still fails closed (lookupFailed=true)", async () => {
    const { entitlement, lookupFailed } = await loadUnionEntitlement(
      fakeClient({
        byo: { data: null, error: { message: "boom" } },
        subsByEnv: { live: [liveFounderRow()] },
      }),
      "sandbox",
      NOW,
    );
    expect(lookupFailed).toBe(true);
    expect(entitlement.capabilities.advancedExports).toBe(false);
  });

  it("subscriptions read failure degrades to null rows (no throw, no unlock)", async () => {
    const { entitlement, lookupFailed } = await loadUnionEntitlement(
      fakeClient({ subsError: { message: "boom" } }),
      "sandbox",
      NOW,
    );
    expect(lookupFailed).toBe(false);
    expect(entitlement.effectivePlanId).toBe("free");
  });
});
