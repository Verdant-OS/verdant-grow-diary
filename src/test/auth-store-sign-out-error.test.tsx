/**
 * #588 — AuthProvider.signOut must not swallow supabase.auth.signOut `{ error }`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";

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
