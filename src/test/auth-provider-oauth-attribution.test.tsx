import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
      onAuthStateChange: (...args: unknown[]) => mocks.onAuthStateChange(...args),
      signOut: vi.fn(),
    },
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  },
}));

import { AuthProvider, useAuth } from "@/store/auth";
import {
  OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY,
  savePendingOAuthSignupAcquisition,
} from "@/lib/oauthSignupAcquisitionRules";

function Probe() {
  const { user, loading } = useAuth();
  return <div>{loading ? "loading" : (user?.id ?? "signed-out")}</div>;
}

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.getSession.mockReset();
  mocks.onAuthStateChange.mockReset();
  mocks.rpc.mockReset();
  mocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

describe("AuthProvider OAuth signup attribution handoff", () => {
  it("flushes a pending fixed source after the verified session exists", async () => {
    savePendingOAuthSignupAcquisition("csv_history", window.sessionStorage, Date.now());
    mocks.getSession.mockResolvedValue({
      data: {
        session: { user: { id: "verified-session-user" } },
      },
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText("verified-session-user")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("record_signup_acquisition_first_touch", {
        p_source: "csv_history",
      }),
    );
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("verified-session-user");
    await waitFor(() =>
      expect(window.sessionStorage.getItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY)).toBeNull(),
    );
  });

  it("does not call the RPC when no pending source exists", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "existing-user" } } },
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText("existing-user")).toBeInTheDocument();
    await waitFor(() => expect(mocks.rpc).not.toHaveBeenCalled());
  });
});
