/**
 * useMyEntitlements — bounded-window / any-entitling-row regression tests.
 *
 * Client-side mirror of src/test/server-union-entitlement-live-row.test.ts
 * (PR #261): public.subscriptions is unique per paddle_subscription_id, NOT
 * per user, so a Founder who later started (and canceled) a Pro subscription
 * holds both rows. The previous limit(1) newest-first read let the newer
 * canceled row shadow the entitling Founder row, so /settings displayed
 * "Free" for an account the server gates grant access to.
 *
 * PRESENTATION-ONLY: the server gates remain authoritative. This suite only
 * guards what the client displays.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { SUBSCRIPTION_ROW_SCAN_LIMIT, type LovableSubscriptionRow } from "@/lib/entitlements";

// The hook resolves against real time (new Date() internally), so period
// ends are computed relative to now — frozen dates would rot.
const FUTURE = new Date(Date.now() + 30 * 86400_000).toISOString();
const PAST = new Date(Date.now() - 60_000).toISOString();

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

const db: {
  lovableRows: LovableSubscriptionRow[];
  lovableError: unknown;
  lovableErrorsByEnvironment: Partial<Record<"live" | "sandbox", unknown>>;
  capturedLimit: number | null;
} = {
  lovableRows: [],
  lovableError: null,
  lovableErrorsByEnvironment: {},
  capturedLimit: null,
};

const paddleEnvironment = vi.hoisted(() => ({
  current: "live" as "live" | "sandbox",
}));

// Stable user reference: doLoad's useCallback depends on `user` identity, so
// a per-call object literal here would refire the load effect on every render
// and `loading` would never settle.
const AUTH_USER = { id: "u1", email: "grower@example.com" };

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: AUTH_USER,
    loading: false,
    session: { user: AUTH_USER },
    signOut: async () => undefined,
  }),
}));

// getPaddleEnvironment() derives from the client token prefix, which is
// absent under Vitest and would default to sandbox — pin it to live so the
// fixtures mirror the server test verbatim.
vi.mock("@/lib/paddle", () => ({
  getPaddleEnvironment: () => paddleEnvironment.current,
}));

vi.mock("@/integrations/supabase/client", () => {
  type QueryResult = { data: unknown; error: unknown };
  // maybeSingle-terminated chain for billing_subscriptions / user_roles.
  const makeChain = (result: QueryResult) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.maybeSingle = async () => result;
    return chain;
  };
  // Windowed subscriptions read: honor eq("environment"), chained desc
  // order keys, and limit (sort + slice) so fixtures exercise the same
  // newest-first window (with unique tiebreak) the real query returns —
  // same shape as the server test's fakeClient.
  const makeSubscriptionsChain = () => {
    let env: string | null = null;
    const descKeys: Array<keyof LovableSubscriptionRow> = [];
    let max = Infinity;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (column: string, value: string) => {
      if (column === "environment") env = value;
      return chain;
    };
    chain.order = (column: keyof LovableSubscriptionRow, opts?: { ascending?: boolean }) => {
      if (opts?.ascending === false) descKeys.push(column);
      return chain;
    };
    chain.limit = (n: number) => {
      max = n;
      db.capturedLimit = n;
      return chain;
    };
    chain.then = (resolve: (v: { data: unknown[] | null; error: unknown }) => void) => {
      if (db.lovableError) {
        resolve({ data: null, error: db.lovableError });
        return;
      }
      if ((env === "live" || env === "sandbox") && db.lovableErrorsByEnvironment[env]) {
        resolve({ data: null, error: db.lovableErrorsByEnvironment[env] });
        return;
      }
      let rows = db.lovableRows.filter((r) => env == null || r.environment === env);
      if (descKeys.length > 0) {
        rows = [...rows].sort((a, b) => {
          for (const key of descKeys) {
            const cmp = String(b[key] ?? "").localeCompare(String(a[key] ?? ""));
            if (cmp !== 0) return cmp;
          }
          return 0;
        });
      }
      resolve({ data: rows.slice(0, max), error: null });
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "subscriptions") return makeSubscriptionsChain();
        return makeChain({ data: null, error: null });
      },
    },
  };
});

async function renderEntitlement() {
  const { result } = renderHook(() => useMyEntitlements());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result.current.entitlement;
}

async function renderEntitlementResult() {
  const { result } = renderHook(() => useMyEntitlements());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result.current;
}

beforeEach(() => {
  db.lovableRows = [];
  db.lovableError = null;
  db.lovableErrorsByEnvironment = {};
  db.capturedLimit = null;
  paddleEnvironment.current = "live";
});

describe("useMyEntitlements · bounded window, any-entitling-row wins", () => {
  it("REGRESSION: active Founder Lifetime row + NEWER elapsed canceled Pro row → displays Founder", async () => {
    db.lovableRows = [
      liveFounderRow({ created_at: "2026-07-01T00:00:00Z" }),
      proRow({ status: "canceled", current_period_end: PAST, created_at: "2026-07-10T00:00:00Z" }),
    ];
    const e = await renderEntitlement();
    expect(e.isActive).toBe(true);
    expect(e.displayPlanId).toBe("founder_lifetime");
    expect(e.source).toBe("lovable_paddle_lifetime");
    expect(e.capabilities.advancedExports).toBe(true);
  });

  it("REGRESSION: only canceled/expired rows → displays Free, newest row keeps degraded display", async () => {
    db.lovableRows = [
      liveFounderRow({ status: "canceled", created_at: "2026-07-01T00:00:00Z" }),
      proRow({ status: "expired", created_at: "2026-07-10T00:00:00Z" }),
    ];
    const e = await renderEntitlement();
    expect(e.effectivePlanId).toBe("free");
    expect(e.capabilities.advancedExports).toBe(false);
    // Newest-row fallback preserves the old limit(1) degraded display.
    expect(e.displayPlanId).toBe("pro_monthly");
    expect(e.degraded).toBe(true);
  });

  it("REGRESSION: active Founder Lifetime row + NEWER ACTIVE Pro row → still displays Founder (lifetime-first precedence)", async () => {
    // Both rows entitle. pickStrongestBilling documents that an active
    // founder_lifetime beats any recurring plan, so recency must not let
    // the Pro row take over the Founder's display identity.
    db.lovableRows = [
      liveFounderRow({ created_at: "2026-07-01T00:00:00Z" }),
      proRow({ created_at: "2026-07-10T00:00:00Z" }),
    ];
    const e = await renderEntitlement();
    expect(e.isActive).toBe(true);
    expect(e.displayPlanId).toBe("founder_lifetime");
    expect(e.source).toBe("lovable_paddle_lifetime");
    expect(e.capabilities.advancedExports).toBe(true);
  });

  it("equal created_at rows resolve deterministically (paddle_subscription_id tiebreak)", async () => {
    // created_at is not unique. Two degraded rows share a timestamp; the
    // unique desc tiebreak makes sub_01zzz the window's newest row, so its
    // plan identity wins the degraded display regardless of fixture order.
    db.lovableRows = [
      proRow({
        status: "canceled",
        current_period_end: PAST,
        price_id: "pro_annual",
        paddle_subscription_id: "sub_01aaa",
        created_at: "2026-07-10T00:00:00Z",
      }),
      proRow({
        status: "canceled",
        current_period_end: PAST,
        price_id: "pro_monthly",
        paddle_subscription_id: "sub_01zzz",
        created_at: "2026-07-10T00:00:00Z",
      }),
    ];
    const e = await renderEntitlement();
    expect(e.effectivePlanId).toBe("free");
    expect(e.displayPlanId).toBe("pro_monthly");
    expect(e.degraded).toBe(true);
  });

  it("single active Pro row still resolves (window read ≡ old single-row read)", async () => {
    db.lovableRows = [proRow()];
    const e = await renderEntitlement();
    expect(e.isActive).toBe(true);
    expect(e.effectivePlanId).toBe("pro_monthly");
    expect(e.source).toBe("lovable_paddle_subscription");
  });

  it("past_due retains paid capabilities in the client window", async () => {
    db.lovableRows = [proRow({ status: "past_due", current_period_end: PAST })];
    const dunning = await renderEntitlement();
    expect(dunning.effectivePlanId).toBe("pro_monthly");
    expect(dunning.capabilities.advancedExports).toBe(true);
  });

  it("cancellation grace retains paid capabilities in the client window", async () => {
    db.lovableRows = [proRow({ status: "canceled", current_period_end: FUTURE })];
    const grace = await renderEntitlement();
    expect(grace.effectivePlanId).toBe("pro_monthly");
    expect(grace.capabilities.advancedExports).toBe(true);
  });

  it("rows in the other environment never resolve (env filter preserved)", async () => {
    db.lovableRows = [
      liveFounderRow({ environment: "sandbox" }),
      proRow({ environment: "sandbox" }),
    ];
    const e = await renderEntitlement();
    expect(e.effectivePlanId).toBe("free");
    expect(e.capabilities.advancedExports).toBe(false);
  });

  it("no rows → free", async () => {
    const e = await renderEntitlement();
    expect(e.effectivePlanId).toBe("free");
    expect(e.displayPlanId).toBe("free");
  });

  it("subscription query failure is not presented as verified Free", async () => {
    db.lovableError = { message: "temporary outage" };
    const result = await renderEntitlementResult();

    expect(result.lookupFailed).toBe(true);
    expect(result.entitlement.effectivePlanId).toBe("free");
  });

  it("a live Founder row remains verified when the client expects sandbox", async () => {
    paddleEnvironment.current = "sandbox";
    db.lovableRows = [liveFounderRow()];

    const result = await renderEntitlementResult();

    expect(result.lookupFailed).toBe(false);
    expect(result.entitlement.displayPlanId).toBe("founder_lifetime");
    expect(result.entitlement.capabilities.advancedExports).toBe(true);
  });

  it("a proven live Founder row survives a lower-precedence sandbox read error", async () => {
    paddleEnvironment.current = "sandbox";
    db.lovableRows = [liveFounderRow()];
    db.lovableErrorsByEnvironment.sandbox = { message: "sandbox unavailable" };

    const result = await renderEntitlementResult();

    expect(result.lookupFailed).toBe(false);
    expect(result.entitlement.displayPlanId).toBe("founder_lifetime");
  });

  it("query scans the shared bounded window, not limit(1)", async () => {
    db.lovableRows = [liveFounderRow()];
    await renderEntitlement();
    expect(db.capturedLimit).toBe(SUBSCRIPTION_ROW_SCAN_LIMIT);
    expect(SUBSCRIPTION_ROW_SCAN_LIMIT).toBeGreaterThan(1);
  });
});
