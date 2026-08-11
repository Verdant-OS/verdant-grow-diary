/**
 * #564 — same user id must soft-revalidate without flipping loading=true,
 * so PhenoTrackerUpgradeGate does not unmount wizard/workspace children
 * on TOKEN_REFRESHED (new user object, same id).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";

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

function chain(data: unknown = [], error: unknown = null) {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit"]) {
    c[k] = () => c;
  }
  c.maybeSingle = async () => ({ data: null, error: null });
  // thenable for await on limit chain
  c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve, reject);
  return c;
}

describe("useMyEntitlements soft revalidate (#564)", () => {
  beforeEach(() => {
    authState = { user: { id: "user-1" }, loading: false };
    fromMock.mockReset();
    fromMock.mockImplementation(() => chain([]));
  });

  it("does not flip loading true when the same user id is reloaded after a new user object", async () => {
    const { result, rerender } = renderHook(() => useMyEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loading).toBe(false);

    // Simulate TOKEN_REFRESHED: new object, same id (doLoad deps use userId only).
    authState = { user: { id: "user-1" }, loading: false };
    rerender();

    // Soft refresh must not put the gate back into the loading shell.
    expect(result.current.loading).toBe(false);
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.loading).toBe(false);
  });

  it("hard-loads (loading true) when the signed-in user id changes", async () => {
    const { result, rerender } = renderHook(() => useMyEntitlements());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resolveQuery: (v: unknown) => void = () => {};
    const blocked = new Promise((resolve) => {
      resolveQuery = resolve;
    });
    fromMock.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      for (const k of ["select", "eq", "order", "limit"]) c[k] = () => c;
      c.maybeSingle = () => blocked.then(() => ({ data: null, error: null }));
      c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        blocked.then(() => ({ data: [], error: null })).then(resolve, reject);
      return c;
    });

    authState = { user: { id: "user-2" }, loading: false };
    rerender();
    await waitFor(() => expect(result.current.loading).toBe(true));
    await act(async () => {
      resolveQuery(null);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
