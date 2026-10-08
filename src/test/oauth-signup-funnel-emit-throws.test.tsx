/**
 * The Google OAuth signup emit runs inside an AuthProvider effect. Analytics
 * must never break auth: if the emit throws, AuthProvider still renders the
 * signed-in user with loading cleared.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createdAt: "2026-10-03T15:00:00.000Z",
  trackFunnelEvent: vi.fn(() => {
    throw new Error("analytics exploded");
  }),
}));

vi.mock("@/lib/funnelAnalytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/funnelAnalytics")>();
  return { ...actual, trackFunnelEvent: mocks.trackFunnelEvent };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: "fixture-oauth-bearer",
            user: {
              id: "throwing-google-user",
              aud: "authenticated",
              role: "authenticated",
              email: "throwing-google-user@example.invalid",
              user_metadata: {},
              email_confirmed_at: mocks.createdAt,
              created_at: mocks.createdAt,
              last_sign_in_at: mocks.createdAt,
              app_metadata: { provider: "google", providers: ["google"] },
              identities: [{ provider: "google" }],
            },
          },
        },
        error: null,
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(),
      setSession: vi.fn(),
    },
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

import { clearOAuthSignupFunnelEmissionMemoryForTests } from "@/lib/oauthSignupFunnelRules";
import { AuthProvider, useAuth } from "@/store/auth";

function Probe() {
  const { user, loading } = useAuth();
  return <div>{loading ? "loading" : (user?.id ?? "signed-out")}</div>;
}

describe("AuthProvider survives a throwing Google signup emit", () => {
  it("still renders the user with loading cleared", async () => {
    window.sessionStorage.clear();
    clearOAuthSignupFunnelEmissionMemoryForTests();

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText("throwing-google-user")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.trackFunnelEvent).toHaveBeenCalledWith("signup", { method: "google" }),
    );
    expect(screen.queryByText("loading")).not.toBeInTheDocument();
    expect(screen.getByText("throwing-google-user")).toBeInTheDocument();
  });
});
