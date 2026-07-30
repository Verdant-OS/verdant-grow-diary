import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  authListener: undefined as
    | undefined
    | ((event: string, session: { user: { id: string } } | null) => void),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
      onAuthStateChange: (...args: unknown[]) => mocks.onAuthStateChange(...args),
      signOut: vi.fn(),
    },
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  },
}));

import { AuthProvider, useAuth } from "@/store/auth";

function Probe() {
  const { user, loading } = useAuth();
  return <div>{loading ? "loading" : (user?.id ?? "signed-out")}</div>;
}

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.getSession.mockReset();
  mocks.onAuthStateChange.mockReset();
  mocks.authListener = undefined;
  mocks.onAuthStateChange.mockImplementation((listener) => {
    mocks.authListener = listener;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

describe("AuthProvider initial session read failure", () => {
  // Regression: getSession() previously cleared `loading` only on the
  // fulfilled path, so a rejected initial read (network failure, corrupt
  // storage) left the public apex `/` and every AppShell route on a
  // permanent loading screen with no recovery path.
  it("resolves to signed-out instead of loading forever when getSession rejects", async () => {
    mocks.getSession.mockRejectedValue(new Error("storage unavailable"));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText("signed-out")).toBeInTheDocument();
    expect(screen.queryByText("loading")).not.toBeInTheDocument();
  });

  it("still accepts a later auth event after a failed initial read", async () => {
    mocks.getSession.mockRejectedValue(new Error("transient network failure"));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText("signed-out")).toBeInTheDocument();

    act(() => {
      mocks.authListener?.("SIGNED_IN", { user: { id: "recovered-user" } });
    });

    expect(await screen.findByText("recovered-user")).toBeInTheDocument();
  });

  it("keeps the fulfilled path unchanged", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "existing-user" } } },
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText("existing-user")).toBeInTheDocument();
  });
});
