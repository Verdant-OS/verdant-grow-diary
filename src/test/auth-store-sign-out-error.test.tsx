/**
 * #588 — AuthProvider.signOut must not swallow supabase.auth.signOut `{ error }`.
 * Sign-out navigation ownership (#1501) keeps entry surfaces masked until SDK work settles.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, renderHook, waitFor, act, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { SIGN_OUT_LOADING_LABEL } from "@/lib/authSessionExitRules";

const signOutApi = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: (...a: unknown[]) => signOutApi(...a),
    },
  },
}));

import { AuthProvider, useAuth } from "@/store/auth";

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthProvider.signOut (#588)", () => {
  beforeEach(() => {
    signOutApi.mockReset();
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("throws a non-sensitive error when supabase returns { error }", async () => {
    signOutApi.mockResolvedValueOnce({ error: { message: "Auth session missing!" } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(
      act(async () => {
        await result.current.signOut();
      }),
    ).rejects.toThrow(/sign_out_failed/);
  });

  it("resolves cleanly when supabase returns no error", async () => {
    signOutApi.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.signOut();
    });
    expect(signOutApi).toHaveBeenCalledTimes(1);
  });
});

describe("AuthProvider sign-out navigation ownership (#1501)", () => {
  beforeEach(() => {
    signOutApi.mockReset();
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("rejects duplicate beginSignOutNavigation leases while one exit is active", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let first: ReturnType<NonNullable<typeof result.current.beginSignOutNavigation>> | null = null;
    act(() => {
      first = result.current.beginSignOutNavigation?.() ?? null;
    });
    expect(first).not.toBeNull();
    expect(result.current.isSignOutNavigationPending?.()).toBe(true);
    expect(result.current.beginSignOutNavigation?.()).toBeNull();

    act(() => first?.finish());
    await waitFor(() => expect(result.current.isSignOutNavigationPending?.()).toBe(false));
  });

  it("masks children with the signing-out status while navigation ownership is held", async () => {
    function Harness() {
      const auth = useAuth();
      return (
        <>
          <div data-testid="child">Private content</div>
          <button type="button" onClick={() => auth.beginSignOutNavigation?.()}>
            Begin exit
          </button>
        </>
      );
    }

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("child")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Begin exit" }));

    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(SIGN_OUT_LOADING_LABEL);
  });
});
