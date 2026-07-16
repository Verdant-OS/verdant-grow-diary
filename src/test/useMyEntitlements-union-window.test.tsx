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

const db: { lovableRows: LovableSubscriptionRow[]; capturedLimit: number | null } = {
  lovableRows: [],
  capturedLimit: null,
};

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
  getPaddleEnvironment: () => "live" as const,
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
  // Windowed subscriptions read: honor eq("environment"), order desc, and
  // limit (sort + slice) so fixtures exercise the same newest-first window
  // the real query returns — same shape as the server test's fakeClient.
  const makeSubscriptionsChain = () => {
    let env: string | null = null;
    let descBy: keyof LovableSubscriptionRow | null = null;
    let max = Infinity;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (column: string, value: string) => {
      if (column === "environment") env = value;
      return chain;
    };
    chain.order = (column: keyof LovableSubscriptionRow, opts?: { ascending?: boolean }) => {
      if (opts?.ascending === false) descBy = column;
      return chain;
    };
    chain.limit = (n: number) => {
      max = n;
      db.capturedLimit = n;
      return chain;
    };
    chain.then = (resolve: (v: { data: unknown[]; error: null }) => void) => {
      let rows = db.lovableRows.filter((r) => env == null || r.environment === env);
      if (descBy != null) {
        const by = descBy;
        rows = [...rows].sort((a, b) => String(b[by] ?? "").localeCompare(String(a[by] ?? "")));
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

beforeEach(() => {
  db.lovableRows = [];
  db.capturedLimit = null;
});

describe("useMyEntitlements · bounded window, any-entitling-row wins", () => {
  it("REGRESSION: active Founder Lifetime row + NEWER canceled Pro row → displays Founder", async () => {
    db.lovableRows = [
      liveFounderRow({ created_at: "2026-07-01T00:00:00Z" }),
      proRow({ status: "canceled", created_at: "2026-07-10T00:00:00Z" }),
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

  it("single active Pro row still resolves (window read ≡ old single-row read)", async () => {
    db.lovableRows = [proRow()];
    const e = await renderEntitlement();
    expect(e.isActive).toBe(true);
    expect(e.effectivePlanId).toBe("pro_monthly");
    expect(e.source).toBe("lovable_paddle_subscription");
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

  it("query scans the shared bounded window, not limit(1)", async () => {
    db.lovableRows = [liveFounderRow()];
    await renderEntitlement();
    expect(db.capturedLimit).toBe(SUBSCRIPTION_ROW_SCAN_LIMIT);
    expect(SUBSCRIPTION_ROW_SCAN_LIMIT).toBeGreaterThan(1);
  });
});
