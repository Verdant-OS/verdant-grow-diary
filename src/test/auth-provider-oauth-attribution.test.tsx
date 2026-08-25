import { QueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  rpc: vi.fn(),
  authListener: undefined as
    undefined | ((event: string, session: { user: { id: string } } | null) => void),
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
import { clearPrivateClientStateBeforeAuthIdentityChange } from "@/lib/authIdentityTransitionFence";
import { GLOBAL_SEARCH_SESSION_STORAGE_KEY } from "@/lib/globalSearchSession";
import { clearLocalStorageForTest } from "@/test/helpers/localStorageTestHelper";

function Probe() {
  const { user, loading } = useAuth();
  return <div>{loading ? "loading" : (user?.id ?? "signed-out")}</div>;
}

beforeEach(() => {
  window.sessionStorage.clear();
  clearLocalStorageForTest();
  mocks.getSession.mockReset();
  mocks.onAuthStateChange.mockReset();
  mocks.rpc.mockReset();
  mocks.authListener = undefined;
  mocks.onAuthStateChange.mockImplementation((listener) => {
    mocks.authListener = listener;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

describe("AuthProvider OAuth signup attribution handoff", () => {
  it("clears stale private search state on the first signed-out resolution", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    const transitions: Array<[string | null, string | null]> = [];
    const client = new QueryClient();
    window.sessionStorage.setItem(
      GLOBAL_SEARCH_SESSION_STORAGE_KEY,
      "private query from an expired session",
    );

    render(
      <AuthProvider
        onBeforeAuthIdentityChange={(previousUserId, nextUserId) => {
          transitions.push([previousUserId, nextUserId]);
          clearPrivateClientStateBeforeAuthIdentityChange(client);
        }}
      >
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText("signed-out")).toBeInTheDocument();
    expect(window.sessionStorage.getItem(GLOBAL_SEARCH_SESSION_STORAGE_KEY)).toBeNull();
    expect(transitions).toEqual([[null, null]]);
  });

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

  it("clears cached rows and search memory before every new auth identity is exposed", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "owner-a" } } },
    });
    const client = new QueryClient();
    const transitions: Array<[string | null, string | null]> = [];
    window.sessionStorage.setItem(GLOBAL_SEARCH_SESSION_STORAGE_KEY, "anonymous query");

    render(
      <AuthProvider
        onBeforeAuthIdentityChange={(previousUserId, nextUserId) => {
          transitions.push([previousUserId, nextUserId]);
          clearPrivateClientStateBeforeAuthIdentityChange(client);
        }}
      >
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText("owner-a")).toBeInTheDocument();
    expect(window.sessionStorage.getItem(GLOBAL_SEARCH_SESSION_STORAGE_KEY)).toBeNull();
    client.setQueryData(
      ["sensor_readings", "all", 60, "owner", "owner-a"],
      [{ id: "owner-a-private-row" }],
    );
    window.sessionStorage.setItem(GLOBAL_SEARCH_SESSION_STORAGE_KEY, "owner-a private query");
    expect(client.getQueryCache().getAll()).toHaveLength(1);

    act(() => {
      mocks.authListener?.("SIGNED_IN", { user: { id: "owner-b" } });
      // React has not committed owner B yet; the synchronous transition fence
      // has already destroyed owner A's cache entry.
      expect(client.getQueryCache().getAll()).toHaveLength(0);
      expect(window.sessionStorage.getItem(GLOBAL_SEARCH_SESSION_STORAGE_KEY)).toBeNull();
    });

    expect(await screen.findByText("owner-b")).toBeInTheDocument();
    window.sessionStorage.setItem(GLOBAL_SEARCH_SESSION_STORAGE_KEY, "owner-b private query");

    act(() => {
      mocks.authListener?.("SIGNED_OUT", null);
      expect(window.sessionStorage.getItem(GLOBAL_SEARCH_SESSION_STORAGE_KEY)).toBeNull();
    });

    expect(await screen.findByText("signed-out")).toBeInTheDocument();
    expect(transitions).toEqual([
      [null, "owner-a"],
      ["owner-a", "owner-b"],
      ["owner-b", null],
    ]);
  });
});
