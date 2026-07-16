/**
 * useMyEntitlements — staff role regression tests.
 *
 * Guards the presentation-only staff capability lift:
 *  - never infers staff from email
 *  - never defaults to isStaff=true on lookup error
 *  - lifts to Pro-tier capabilities only when a real staff row is returned
 *
 * Mocks are narrow: only @/integrations/supabase/client and @/store/auth.
 * No network, no service_role, no writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

type QueryResult = { data: unknown; error: unknown };
type QueryPlan = { billing: QueryResult; roles: QueryResult };

const currentPlan: { value: QueryPlan } = {
  value: {
    billing: { data: null, error: null },
    roles: { data: null, error: null },
  },
};

const authState: { user: { id: string; email: string } | null; loading: boolean } = {
  user: null,
  loading: false,
};

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
    session: authState.user ? { user: authState.user } : null,
    signOut: async () => undefined,
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  // Build a thenable-less chain that terminates in maybeSingle().
  const makeChain = (result: QueryResult) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.maybeSingle = async () => result;
    return chain;
  };
  // The subscriptions read is a windowed list query awaited directly (no
  // maybeSingle), so its chain must be a thenable resolving { data: rows[] }.
  const makeListChain = (result: QueryResult) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.then = (resolve: (v: QueryResult) => void) => resolve(result);
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "billing_subscriptions") return makeChain(currentPlan.value.billing);
        if (table === "user_roles") return makeChain(currentPlan.value.roles);
        // Phase 2b: hook also reads public.subscriptions (Lovable Paddle sink).
        // Default to empty; tests can override via currentPlan.value.lovable.
        if (table === "subscriptions")
          return makeListChain(
            (currentPlan.value as unknown as { lovable?: QueryResult }).lovable ?? {
              data: [],
              error: null,
            },
          );
        return makeChain({ data: null, error: null });
      },
    },
  };
});

beforeEach(() => {
  authState.user = null;
  authState.loading = false;
  currentPlan.value = {
    billing: { data: null, error: null },
    roles: { data: null, error: null },
  };
});

describe("useMyEntitlements · staff safety defaults", () => {
  it("A. no session → isStaff=false, free capabilities", async () => {
    authState.user = null;
    const { result } = renderHook(() => useMyEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const e = result.current.entitlement;
    expect(e.isStaff).toBe(false);
    expect(e.effectivePlanId).toBe("free");
    expect(e.capabilities).toEqual(FREE_CAPABILITIES);
  });

  it("B. session + user_roles empty → isStaff=false, free capabilities", async () => {
    authState.user = { id: "u-1", email: "grower@example.com" };
    currentPlan.value.roles = { data: null, error: null };
    currentPlan.value.billing = { data: null, error: null };

    const { result } = renderHook(() => useMyEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const e = result.current.entitlement;
    expect(e.isStaff).toBe(false);
    expect(e.effectivePlanId).toBe("free");
    expect(e.capabilities).toEqual(FREE_CAPABILITIES);
  });

  it("C. session + user_roles lookup error → isStaff=false, no lift, no throw", async () => {
    authState.user = { id: "u-2", email: "grower@example.com" };
    currentPlan.value.roles = { data: null, error: { message: "boom" } };
    currentPlan.value.billing = { data: null, error: null };

    const { result } = renderHook(() => useMyEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const e = result.current.entitlement;
    expect(e.isStaff).toBe(false);
    expect(e.effectivePlanId).toBe("free");
    expect(e.capabilities).toEqual(FREE_CAPABILITIES);
  });

  it("D. session + staff row → isStaff=true, Pro-tier capabilities lift", async () => {
    authState.user = { id: "u-3", email: "matt@verdantgrowdiary.com" };
    currentPlan.value.roles = { data: { role: "staff" }, error: null };
    currentPlan.value.billing = { data: null, error: null };

    const { result } = renderHook(() => useMyEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const e = result.current.entitlement;
    expect(e.isStaff).toBe(true);
    expect(e.effectivePlanId).toBe("pro_monthly");
    expect(e.capabilities).toEqual(PLAN_CATALOG.pro_monthly);
    expect(e.isActive).toBe(true);
  });

  it("E. session + user_roles empty + email on allow-list → still isStaff=false (no email inference)", async () => {
    authState.user = { id: "u-4", email: "matt@verdantgrowdiary.com" };
    currentPlan.value.roles = { data: null, error: null };
    currentPlan.value.billing = { data: null, error: null };

    const { result } = renderHook(() => useMyEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entitlement.isStaff).toBe(false);
    expect(result.current.entitlement.effectivePlanId).toBe("free");
  });
});
