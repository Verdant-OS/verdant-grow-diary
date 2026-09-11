/**
 * Auth truth alignment on cold / stale entry.
 *
 * MEASURED on da4825cae7bd (signed-in browser, fresh tab): the UI showed
 * "Signed in" / "Open dashboard" while no `sb-*-auth-token` existed in this
 * tab's sessionStorage, no /auth/v1/token or /auth/v1/user call fired,
 * /rest/v1/user_agreement_acceptances returned 401 and get-paddle-price
 * returned auth_required; /grows and /dashboard cold entry bounced to the
 * signed-out landing with redirectTo preserved.
 *
 * MECHANISM (read from @supabase/auth-js 2.111.0, GoTrueClient.js): the auth
 * client relays SIGNED_IN / TOKEN_REFRESHED between same-origin tabs over a
 * BroadcastChannel and hands the OTHER tab's session to onAuthStateChange
 * subscribers without saving it (broadcast handler -> _notifyAllSubscribers
 * with broadcast=false; no _saveSession). With `storage: sessionStorage` this
 * tab's client holds nothing: getSession() is null and getUser() returns
 * AuthSessionMissingError without a network call, while AuthProvider had
 * already exposed the relayed user to every consumer.
 *
 * The single auth truth these tests pin: `useAuth().user` mirrors a session
 * THIS tab's client holds; the protected boundary treats a missing or
 * server-rejected session as signed-out (redirectTo preserved), a transport
 * failure as revalidation_failed, and a hung getUser as bounded.
 *
 * The redirect-producing layer is AppShell (`buildSignedOutRedirect`), not the
 * hook's `/auth` default parameter. Since the signed-out re-entry slice the
 * landing it builds is the sign-in screen, `/auth?redirectTo=<destination>`
 * (measured live on 94f9c631: the marketing /welcome read as "I don't have an
 * account" to a returning grower). Anonymous visits to / and /welcome stay
 * marketing; sign-out still exits to /welcome.
 */
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "@/lib/react-router-compat";

type Listener = (event: string, session: unknown) => void | Promise<void>;

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  listeners: [] as Array<(event: string, session: unknown) => void | Promise<void>>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
      getUser: (...args: unknown[]) => mocks.getUser(...args),
      signOut: (...args: unknown[]) => mocks.signOut(...args),
      onAuthStateChange: (listener: (event: string, session: unknown) => void | Promise<void>) => {
        mocks.listeners.push(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                const index = mocks.listeners.indexOf(listener);
                if (index >= 0) mocks.listeners.splice(index, 1);
              },
            },
          },
        };
      },
    },
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

// AppShell collaborators that need a QueryClient or fire private REST: inert.
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: { isActive: false, effectivePlanId: "free" },
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({ useAlertsList: () => ({ alerts: [] }) }));
vi.mock("@/hooks/useCheckoutReturnCompletionTracking", () => ({
  useCheckoutReturnCompletionTracking: () => {},
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => children,
  SidebarTrigger: () => null,
}));
vi.mock("@/components/AppSidebar", () => ({ default: () => null }));
vi.mock("@/components/MobileNav", () => ({ default: () => null }));
vi.mock("@/components/GlobalFastAddButton", () => ({ default: () => null }));
vi.mock("@/components/SignOutConfirmDialog", () => ({ default: () => null }));
vi.mock("@/components/VerificationPendingBanner", () => ({ default: () => null }));
vi.mock("@/components/SubscriptionPastDueBanner", () => ({
  SubscriptionPastDueBanner: () => null,
}));
vi.mock("@/components/LegalFooterLinks", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Sheet", () => ({ default: () => null }));
vi.mock("@/components/GlobalSearchDialog", () => ({ default: () => null }));

import { AuthProvider, useAuth } from "@/store/auth";
import {
  AUTH_REVALIDATION_TIMEOUT_MS,
  classifyRevalidationFailure,
  useRequireAuth,
} from "@/hooks/useRequireAuth";
import { buildSignedOutRedirect, SIGNED_OUT_LANDING } from "@/lib/authRedirectRules";
import AppShell from "@/components/AppShell";

/** The destination AppShell hands to useRequireAuth for a /grows deep link. */
const GROWS_SIGNED_OUT = buildSignedOutRedirect("/grows");

function sessionFor(id: string) {
  return {
    access_token: `access-${id}`,
    refresh_token: `refresh-${id}`,
    expires_at: 4102444800,
    token_type: "bearer",
    user: { id, email: `${id}@example.com`, email_confirmed_at: "2026-07-01T00:00:00Z" },
  };
}

/** What auth-js returns from getUser() when this client holds no session. */
const SESSION_MISSING = {
  name: "AuthSessionMissingError",
  message: "Auth session missing!",
  status: 400,
};

function apiError(status: number, message: string) {
  return { name: "AuthApiError", message, status };
}

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Deliver an auth event to every subscriber, the way GoTrueClient does. */
function deliver(event: string, session: unknown) {
  for (const listener of [...mocks.listeners] as Listener[]) void listener(event, session);
}

/**
 * A relay from ANOTHER tab arrives as a BroadcastChannel message task, outside
 * React's control: deliver it without act() so scheduling matches production
 * (the provider's reconciliation read settles in microtasks, before the render
 * React schedules). The act-environment flag is lowered for that window only,
 * so React does not log the expected "not wrapped in act" warning.
 */
async function relayFromOtherTab(event: string, session: unknown) {
  const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    deliver(event, session);
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

const renderedIdentities: Array<string | null> = [];

function Probe() {
  const { user, loading } = useAuth();
  return <div data-testid="probe">{loading ? "loading" : (user?.id ?? "signed-out")}</div>;
}

/** Records every identity React actually committed a render for. */
function IdentityLog() {
  const { user, loading } = useAuth();
  if (!loading) renderedIdentities.push(user?.id ?? null);
  return null;
}

const renderedTokens: string[] = [];

/** Renders the access token AuthProvider exposes, so a relayed token would be visible. */
function TokenProbe() {
  const { session } = useAuth();
  if (session) renderedTokens.push(session.access_token);
  return <div data-testid="token">{session?.access_token ?? "none"}</div>;
}

const signInScreenIdentities: Array<string | null> = [];

/** Records every identity React committed a render for on the sign-in screen. */
function SignInScreenIdentityLog() {
  const { user, loading } = useAuth();
  if (!loading) signInScreenIdentities.push(user?.id ?? null);
  return null;
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function GoTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" data-testid={`go-${to}`} onClick={() => navigate(to)}>
      go {to}
    </button>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.listeners.length = 0;
  renderedIdentities.length = 0;
  signInScreenIdentities.length = 0;
  renderedTokens.length = 0;
  mocks.getSession.mockReset();
  mocks.getUser.mockReset();
  mocks.signOut.mockReset();
  // auth-js `_removeSession` notifies SIGNED_OUT after a local sign-out.
  mocks.signOut.mockImplementation(async () => {
    deliver("SIGNED_OUT", null);
    return { error: null };
  });
});

describe("the redirect-producing layer", () => {
  it("is AppShell's buildSignedOutRedirect landing on the sign-in screen with redirectTo, not the hook's bare /auth default", () => {
    expect(SIGNED_OUT_LANDING).toBe("/auth");
    expect(GROWS_SIGNED_OUT).toBe("/auth?redirectTo=%2Fgrows");
    expect(buildSignedOutRedirect("/dashboard")).toBe("/auth?redirectTo=%2Fdashboard");
  });
});

describe("AuthProvider exposes only a session this tab's client holds", () => {
  function renderProvider(fence?: (prev: string | null, next: string | null) => void) {
    return render(
      <AuthProvider onBeforeAuthIdentityChange={fence}>
        <Probe />
        <IdentityLog />
      </AuthProvider>,
    );
  }

  it("never exposes a SIGNED_IN relayed from another tab when this client holds no session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    renderProvider();
    expect(await screen.findByText("signed-out")).toBeInTheDocument();

    await relayFromOtherTab("SIGNED_IN", sessionFor("u-relayed"));

    // The provider reconciles against the client's own session (the second read).
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("signed-out"));
    expect(renderedIdentities).not.toContain("u-relayed");
  });

  it("never exposes a TOKEN_REFRESHED relayed from another tab when this client holds no session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    renderProvider();
    expect(await screen.findByText("signed-out")).toBeInTheDocument();

    await relayFromOtherTab("TOKEN_REFRESHED", sessionFor("u-relayed"));

    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("signed-out"));
    expect(renderedIdentities).not.toContain("u-relayed");
  });

  it("keeps a session the client actually holds (own sign-in in this tab)", async () => {
    mocks.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValue({ data: { session: sessionFor("u-own") }, error: null });
    renderProvider();
    expect(await screen.findByText("signed-out")).toBeInTheDocument();

    await act(async () => {
      deliver("SIGNED_IN", sessionFor("u-own"));
    });

    expect(await screen.findByText("u-own")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("probe")).toHaveTextContent("u-own");
  });

  it("keeps this tab's own session when a SIGNED_IN for another account is relayed", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sessionFor("u-own") }, error: null });
    renderProvider();
    expect(await screen.findByText("u-own")).toBeInTheDocument();

    await relayFromOtherTab("SIGNED_IN", sessionFor("u-relayed"));

    // This client still holds u-own, so every request runs as u-own: React must too.
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("u-own"));
    expect(renderedIdentities).not.toContain("u-relayed");
  });

  it("keeps this tab's own token when a TOKEN_REFRESHED for the same account is relayed", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sessionFor("u-own") }, error: null });
    render(
      <AuthProvider>
        <Probe />
        <TokenProbe />
      </AuthProvider>,
    );
    expect(await screen.findByTestId("token")).toHaveTextContent("access-u-own");

    await relayFromOtherTab("TOKEN_REFRESHED", {
      ...sessionFor("u-own"),
      access_token: "access-other-tab",
    });

    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("token")).toHaveTextContent("access-u-own"));
    expect(renderedTokens).not.toContain("access-other-tab");
  });

  it("still applies a session-bearing event synchronously (identity fence and post-sign-in navigation contract)", async () => {
    mocks.getSession
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValue({ data: { session: sessionFor("u-own") }, error: null });
    const fence = vi.fn();
    renderProvider(fence);
    expect(await screen.findByText("signed-out")).toBeInTheDocument();
    fence.mockClear();

    act(() => {
      deliver("SIGNED_IN", sessionFor("u-own"));
      expect(fence).toHaveBeenCalledWith(null, "u-own");
    });

    expect(await screen.findByText("u-own")).toBeInTheDocument();
  });

  it("applies a SIGNED_OUT immediately, without a reconciliation read", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sessionFor("u-own") }, error: null });
    renderProvider();
    expect(await screen.findByText("u-own")).toBeInTheDocument();

    act(() => {
      deliver("SIGNED_OUT", null);
    });

    expect(await screen.findByText("signed-out")).toBeInTheDocument();
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });

  it("applies the client's own INITIAL_SESSION without a reconciliation read", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sessionFor("u-own") }, error: null });
    renderProvider();
    expect(await screen.findByText("u-own")).toBeInTheDocument();

    act(() => {
      deliver("INITIAL_SESSION", sessionFor("u-own"));
    });

    expect(screen.getByTestId("probe")).toHaveTextContent("u-own");
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
  });
});

describe("useRequireAuth at the protected boundary", () => {
  function hookWrapper(initialPath: string) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <MemoryRouter initialEntries={[initialPath]}>
          {children}
          <LocationProbe />
        </MemoryRouter>
      );
    };
  }

  it("bounds the revalidation wait", () => {
    expect(AUTH_REVALIDATION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(AUTH_REVALIDATION_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });

  it("classifies getUser failures: missing session, server rejection, transport", () => {
    expect(classifyRevalidationFailure(SESSION_MISSING)).toBe("session_missing");
    expect(classifyRevalidationFailure(apiError(401, "invalid JWT"))).toBe("session_rejected");
    expect(classifyRevalidationFailure(apiError(403, "forbidden"))).toBe("session_rejected");
    expect(classifyRevalidationFailure(apiError(503, "upstream"))).toBe("transport");
    expect(classifyRevalidationFailure(apiError(429, "slow down"))).toBe("transport");
    expect(classifyRevalidationFailure({ message: "bad jwt" })).toBe("transport");
    expect(classifyRevalidationFailure(new TypeError("Failed to fetch"))).toBe("transport");
    expect(classifyRevalidationFailure(null)).toBe("transport");
    expect(classifyRevalidationFailure(undefined)).toBe("transport");
  });

  it("treats a missing client session as signed-out and preserves redirectTo (cold entry)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: SESSION_MISSING });
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT), {
      wrapper: hookWrapper("/grows"),
    });

    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/auth?redirectTo=%2Fgrows"),
    );
    // Nothing to clear: the client holds no session, so no local sign-out
    // (whose SIGNED_OUT would be relayed to the tab that does hold one).
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it.each([401, 403])(
    "treats a %i rejection as signed-out, clears the local session, preserves redirectTo",
    async (status) => {
      mocks.getUser.mockResolvedValue({
        data: { user: null },
        error: apiError(status, "rejected"),
      });
      const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT), {
        wrapper: hookWrapper("/grows"),
      });

      await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
      await waitFor(() =>
        expect(screen.getByTestId("location")).toHaveTextContent("/auth?redirectTo=%2Fgrows"),
      );
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    },
  );

  it("redirects on a rejection only once the local sign-out confirms the session is gone", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: apiError(401, "invalid JWT") });
    const signOut = pending<{ error: null }>();
    mocks.signOut.mockReturnValue(signOut.promise);
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT), {
      wrapper: hookWrapper("/grows"),
    });

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    // /logout is still in flight: no redirect may carry the rejected identity
    // onto /auth, whose signed-in branch would bounce it straight back here.
    expect(result.current.status).toBe("loading");
    expect(screen.getByTestId("location")).toHaveTextContent("/grows");

    await act(async () => {
      deliver("SIGNED_OUT", null);
      signOut.resolve({ error: null });
    });
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(screen.getByTestId("location")).toHaveTextContent("/auth?redirectTo=%2Fgrows");
  });

  it("keeps a rejection whose local sign-out returns { error } as revalidation_failed: no bounce", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: apiError(401, "invalid JWT") });
    mocks.signOut.mockResolvedValue({ error: apiError(500, "logout failed") });
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT), {
      wrapper: hookWrapper("/grows"),
    });

    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("location")).toHaveTextContent("/grows");
  });

  it("keeps a rejection whose local sign-out rejects as revalidation_failed: no bounce", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: apiError(403, "forbidden") });
    mocks.signOut.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT), {
      wrapper: hookWrapper("/grows"),
    });

    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    expect(screen.getByTestId("location")).toHaveTextContent("/grows");
  });

  it("bounds the local sign-out too, and a late confirmation still redirects", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: apiError(401, "invalid JWT") });
    const signOut = pending<{ error: null }>();
    mocks.signOut.mockReturnValue(signOut.promise);
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT, { timeoutMs: 25 }), {
      wrapper: hookWrapper("/grows"),
    });

    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    expect(screen.getByTestId("location")).toHaveTextContent("/grows");

    await act(async () => {
      deliver("SIGNED_OUT", null);
      signOut.resolve({ error: null });
    });
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(screen.getByTestId("location")).toHaveTextContent("/auth?redirectTo=%2Fgrows");
  });

  it("keeps a transport rejection as revalidation_failed: no bounce, no sign-out", async () => {
    mocks.getUser.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT), {
      wrapper: hookWrapper("/grows"),
    });

    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    expect(screen.getByTestId("location")).toHaveTextContent("/grows");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it.each([
    ["a 5xx", apiError(503, "upstream")],
    ["a status-less error", { message: "bad jwt" }],
  ])("keeps %s as revalidation_failed: no bounce, no sign-out", async (_label, error) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT), {
      wrapper: hookWrapper("/grows"),
    });

    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    expect(screen.getByTestId("location")).toHaveTextContent("/grows");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("reaches revalidation_failed when getUser never settles, without bouncing or signing out", async () => {
    mocks.getUser.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT, { timeoutMs: 25 }), {
      wrapper: hookWrapper("/grows"),
    });

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    expect(screen.getByTestId("location")).toHaveTextContent("/grows");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("still honours a late getUser success after the bound elapsed", async () => {
    const late = pending<{ data: { user: { id: string } | null }; error: null }>();
    mocks.getUser.mockReturnValue(late.promise);
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT, { timeoutMs: 25 }), {
      wrapper: hookWrapper("/grows"),
    });

    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    await act(async () => {
      late.resolve({ data: { user: { id: "u-own" } }, error: null });
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(screen.getByTestId("location")).toHaveTextContent("/grows");
  });

  it("retry re-runs getUser after a bounded failure", async () => {
    mocks.getUser.mockReturnValueOnce(new Promise(() => {}));
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u-own" } }, error: null });
    const { result } = renderHook(() => useRequireAuth(GROWS_SIGNED_OUT, { timeoutMs: 25 }), {
      wrapper: hookWrapper("/grows"),
    });

    await waitFor(() => expect(result.current.status).toBe("revalidation_failed"));
    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });
});

describe("AppShell cold / stale entry uses the same auth truth", () => {
  function renderApp(initialPath: string) {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <IdentityLog />
          <Routes>
            <Route
              path="/auth"
              element={
                <div data-testid="sign-in-screen">
                  <Probe />
                  <SignInScreenIdentityLog />
                  <GoTo to="/grows" />
                </div>
              }
            />
            <Route
              path="*"
              element={
                <AppShell>
                  <div data-testid="protected-child">private page</div>
                </AppShell>
              }
            />
          </Routes>
          <LocationProbe />
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it("a relayed identity with no client session lands on /auth?redirectTo=%2Fgrows, never as signed in", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: SESSION_MISSING });
    renderApp("/auth");
    expect(await screen.findByTestId("sign-in-screen")).toHaveTextContent("signed-out");

    await relayFromOtherTab("SIGNED_IN", sessionFor("u-relayed"));
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(2));

    // The grower opens a protected deep link in this tab.
    await act(async () => {
      screen.getByTestId("go-/grows").click();
    });

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/auth?redirectTo=%2Fgrows"),
    );
    expect(screen.queryByTestId("protected-child")).toBeNull();
    expect(screen.queryByText(/^Loading/)).toBeNull();
    expect(screen.getByTestId("sign-in-screen")).toHaveTextContent("signed-out");
    expect(renderedIdentities).not.toContain("u-relayed");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("a stale session the server rejects is cleared: no cached 'Signed in' outlives the 401", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sessionFor("u-stale") }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: apiError(401, "invalid JWT") });
    // /logout is a round trip; auth-js raises SIGNED_OUT only once it settles.
    mocks.signOut.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      deliver("SIGNED_OUT", null);
      return { error: null };
    });
    renderApp("/grows");

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/auth?redirectTo=%2Fgrows"),
    );
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(await screen.findByTestId("sign-in-screen")).toHaveTextContent("signed-out");
    // The sign-in screen never rendered the rejected identity, not even while
    // /logout was in flight — that render is what /auth would bounce back.
    expect(signInScreenIdentities).not.toContain("u-stale");
    expect(screen.queryByTestId("protected-child")).toBeNull();
    expect(screen.queryByTestId("auth-status-indicator")).toBeNull();
  });

  it("a rejected session whose local sign-out fails stays on the session card, never the sign-in screen", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sessionFor("u-stale") }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: apiError(401, "invalid JWT") });
    // The client could not remove its session: no SIGNED_OUT is raised.
    mocks.signOut.mockResolvedValue({ error: apiError(500, "logout failed") });
    renderApp("/grows");

    expect(await screen.findByTestId("app-shell-revalidation-failed")).toBeInTheDocument();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(screen.getByTestId("location")).toHaveTextContent("/grows");
    expect(screen.queryByTestId("sign-in-screen")).toBeNull();
    expect(screen.queryByTestId("protected-child")).toBeNull();
    expect(signInScreenIdentities).toEqual([]);
  });

  it("a session the server confirms mounts the protected page as signed in", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sessionFor("u-own") }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: sessionFor("u-own").user }, error: null });
    renderApp("/grows");

    expect(await screen.findByTestId("protected-child")).toBeInTheDocument();
    expect(screen.getByTestId("auth-status-indicator")).toHaveAttribute(
      "data-auth-state",
      "signed-in",
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/grows");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("a transport failure with a held session stays put: no bounce, no page, no sign-out", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sessionFor("u-own") }, error: null });
    mocks.getUser.mockRejectedValue(new TypeError("Failed to fetch"));
    renderApp("/grows");

    await waitFor(() => expect(mocks.getUser).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.getByTestId("location")).toHaveTextContent("/grows");
    expect(screen.queryByTestId("protected-child")).toBeNull();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
