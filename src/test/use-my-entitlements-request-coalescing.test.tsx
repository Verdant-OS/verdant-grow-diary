/**
 * useMyEntitlements — concurrent mounts share ONE in-flight lookup.
 *
 * Plant Detail mounts several consumers of this hook in the same render
 * turn (Blueprint section, AI Doctor review, the tent-alerts credit gate).
 * Each instance used to fire its own subscriptions + user_roles reads —
 * 2 extra Supabase requests per additional consumer, per visit. The
 * in-flight snapshot map coalesces concurrent identical lookups WITHOUT
 * caching settled responses: a later mount or refetch still reads fresh
 * rows, so soft-revalidate (#564) semantics are untouched.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...a: unknown[]) => fromMock(...a),
  },
}));

let authState: { user: { id: string } | null; loading: boolean } = {
  user: { id: "user-1" },
  loading: false,
};
vi.mock("@/store/auth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/lib/paddle", () => ({
  getPaddleEnvironment: () => "live",
}));

import { useMyEntitlements } from "@/hooks/useMyEntitlements";

/** Query chain whose settlement is externally gated. */
function gatedChain(gate: Promise<unknown>) {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit"]) c[k] = () => c;
  c.maybeSingle = () => gate.then(() => ({ data: null, error: null }));
  c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    gate.then(() => ({ data: [], error: null })).then(resolve, reject);
  return c;
}

describe("useMyEntitlements request coalescing", () => {
  beforeEach(() => {
    authState = { user: { id: "user-1" }, loading: false };
    fromMock.mockReset();
  });

  it("two concurrent mounts issue one set of reads, and both settle", async () => {
    let open: (v?: unknown) => void = () => {};
    const gate = new Promise((resolve) => {
      open = resolve;
    });
    fromMock.mockImplementation(() => gatedChain(gate));

    // Mount two instances while the first lookup is still in flight.
    const first = renderHook(() => useMyEntitlements());
    const second = renderHook(() => useMyEntitlements());
    const inflightCalls = fromMock.mock.calls.length;

    await act(async () => {
      open();
      await gate;
    });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    // One live-environment load = subscriptions + user_roles. A second
    // concurrent instance must not add reads.
    expect(inflightCalls).toBe(2);
    expect(fromMock.mock.calls.length).toBe(2);
    expect(first.result.current.entitlement.effectivePlanId).toBe(
      second.result.current.entitlement.effectivePlanId,
    );
  });

  it("does NOT cache settled lookups — a later mount reads fresh rows", async () => {
    fromMock.mockImplementation(() => gatedChain(Promise.resolve()));
    const first = renderHook(() => useMyEntitlements());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    const afterFirst = fromMock.mock.calls.length;
    expect(afterFirst).toBe(2);

    const second = renderHook(() => useMyEntitlements());
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    // The in-flight entry is removed on settle, so the second mount pays
    // its own fresh reads — coalescing must never become a stale cache.
    expect(fromMock.mock.calls.length).toBe(afterFirst + 2);
  });
});
