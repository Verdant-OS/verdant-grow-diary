/**
 * useMyEntitlements({ enabled }) - hook unit test (#1256 P2 follow-up).
 *
 * AppShell gates this hook on the same `sessionReady` expression as alerts, so
 * a cached user during a getUser miss (revalidation_failed) never fires the
 * presentation-only subscriptions / user_roles reads. The AppShell wiring is
 * source-pinned in app-shell-auth-revalidation-gate and funnel-events-wiring;
 * this file proves the hook itself honours `enabled` without rendering
 * AppShell and without a network.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null, loading: false },
  from: vi.fn(),
}));

vi.mock("@/store/auth", () => ({ useAuth: () => mocks.auth }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => mocks.from(table) },
}));

import { useMyEntitlements } from "@/hooks/useMyEntitlements";

type QueryResult = { data: unknown; error: null };

/** Minimal PostgREST-style builder: every filter returns itself, awaits to `result`. */
function builder(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return chain;
}

function tablesRead(): string[] {
  return mocks.from.mock.calls.map(([table]) => String(table));
}

/** Let mount effects and any microtasks they queue settle. */
async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  mocks.from.mockReset();
  mocks.from.mockImplementation((table: string) =>
    table === "user_roles"
      ? builder({ data: null, error: null })
      : builder({ data: [], error: null }),
  );
  mocks.auth.loading = false;
  mocks.auth.user = null;
});

describe("useMyEntitlements({ enabled })", () => {
  it("enabled: false reads neither subscriptions nor user_roles even with a cached user", async () => {
    mocks.auth.user = { id: "user-cached-1" };

    const { result } = renderHook(() => useMyEntitlements({ enabled: false }));
    await flushEffects();

    expect(mocks.from).not.toHaveBeenCalled();
    expect(tablesRead()).not.toContain("subscriptions");
    expect(tablesRead()).not.toContain("user_roles");
    // Nothing was proven, so the presentation value stays Free and AppShell's
    // paid-destination predicate (isActive && plan !== free) stays false.
    expect(result.current.entitlement.effectivePlanId).toBe("free");
    expect(
      result.current.entitlement.isActive && result.current.entitlement.effectivePlanId !== "free",
    ).toBe(false);
  });

  it("refetch() resolves false and reads nothing while enabled is false", async () => {
    mocks.auth.user = { id: "user-cached-2" };

    const { result } = renderHook(() => useMyEntitlements({ enabled: false }));
    await flushEffects();

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.refetch();
    });

    expect(outcome).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("default (no options) still loads for existing callers", async () => {
    mocks.auth.user = { id: "user-default-3" };

    const { result } = renderHook(() => useMyEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(tablesRead()).toContain("subscriptions");
    expect(tablesRead()).toContain("user_roles");
  });

  it("enabled omitted inside an options object behaves like the default", async () => {
    mocks.auth.user = { id: "user-default-4" };

    const { result } = renderHook(() => useMyEntitlements({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(tablesRead()).toContain("subscriptions");
    expect(tablesRead()).toContain("user_roles");
  });

  it("loads once enabled flips from false to true (the sessionReady transition)", async () => {
    mocks.auth.user = { id: "user-flip-5" };

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useMyEntitlements({ enabled }),
      { initialProps: { enabled: false } },
    );
    await flushEffects();
    expect(mocks.from).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(tablesRead()).toContain("subscriptions");
    expect(tablesRead()).toContain("user_roles");
  });
});
