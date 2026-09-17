import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_LAST_RESOLVED_IDENTITY_STORAGE_KEY, AuthProvider, useAuth } from "@/store/auth";
import OAuthPostAuthRedirect from "@/components/OAuthPostAuthRedirect";
import { useLocation } from "@/lib/react-router-compat";
import {
  clearOAuthReturnHashRetention,
  OAUTH_RETURN_HASH_STASH_KEY,
} from "@/lib/oauthHashSessionConsumeRules";
import {
  OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY,
  savePendingOAuthPostAuthRedirect,
} from "@/lib/oauthPostAuthRedirectRules";

const fixture = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return fixture.client;
  },
}));
vi.mock("@/lib/react-router-compat", async () =>
  vi.importActual<typeof import("../lib/react-router-compat")>("../lib/react-router-compat"),
);

function sessionFor(owner: string): Session {
  const expiresAt = 4_102_444_800;
  const jwtPart = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return {
    access_token: [
      jwtPart({ alg: "HS256", typ: "JWT" }),
      jwtPart({ sub: owner, exp: expiresAt }),
      jwtPart("fixture-signature"),
    ].join("."),
    refresh_token: `fixture-refresh-${owner}`,
    token_type: "bearer",
    expires_at: expiresAt,
    expires_in: 3600,
    user: {
      id: owner,
      aud: "authenticated",
      role: "authenticated",
      email: `${owner}@example.invalid`,
      created_at: "2026-09-16T00:00:00Z",
      app_metadata: {},
      user_metadata: {},
    },
  };
}

const oauthSession = sessionFor("oauth-owner-b");
type Snapshot = { owner: string | null; loading: boolean; path: string };
let snapshots: Snapshot[];
let userRequestStarted: boolean;
let releaseUserRequest: () => void;
let sequence = 0;

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  clearOAuthReturnHashRetention();
  snapshots = [];
  userRequestStarted = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("External network forbidden");
    }),
  );
});

afterEach(async () => {
  cleanup();
  await fixture.client?.auth.stopAutoRefresh();
  expect(fetch).not.toHaveBeenCalled();
  delete (window as unknown as Record<string, unknown>)[OAUTH_RETURN_HASH_STASH_KEY];
  clearOAuthReturnHashRetention();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function prepareClient(
  initial: Session | null,
  oauthReturn: boolean,
  rejectOAuthSession = false,
) {
  const storageKey = `oauth-bootstrap-${++sequence}`;
  if (initial) window.sessionStorage.setItem(storageKey, JSON.stringify(initial));
  const userRequest = new Promise<void>((resolve) => {
    releaseUserRequest = resolve;
  });
  fixture.client = createClient("https://oauth-bootstrap.invalid", "fixture-public-key", {
    auth: {
      storageKey,
      storage: window.sessionStorage,
      autoRefreshToken: false,
      // No custom lock: this matches the application client. The early OAuth
      // script has already removed the hash before client initialization.
    },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        expect(url.origin).toBe("https://oauth-bootstrap.invalid");
        expect(url.pathname).toBe("/auth/v1/user");
        userRequestStarted = true;
        await userRequest;
        if (rejectOAuthSession)
          return new Response(JSON.stringify({ message: "Fixture session rejected" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        return new Response(JSON.stringify(oauthSession.user), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
  expect((await fixture.client.auth.getSession()).data.session?.user.id ?? null).toBe(
    initial?.user.id ?? null,
  );
  if (oauthReturn) {
    (window as unknown as Record<string, unknown>)[OAUTH_RETURN_HASH_STASH_KEY] =
      `#access_token=${oauthSession.access_token}&refresh_token=${oauthSession.refresh_token}&token_type=bearer`;
  }
}

function Probe() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => {
    snapshots.push({ owner: user?.id ?? null, loading, path: pathname });
  }, [user, loading, pathname]);
  return (
    <output data-testid="oauth-bootstrap-state">
      {loading ? "loading" : (user?.id ?? "signed-out")}:{pathname}
    </output>
  );
}

function mountOAuthReturn() {
  const root = createRootRoute({
    component: () => (
      <AuthProvider>
        <Probe />
        <OAuthPostAuthRedirect />
        <Outlet />
      </AuthProvider>
    ),
  });
  const index = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
  const sensors = createRoute({
    getParentRoute: () => root,
    path: "/sensors",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([index, sensors]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const mounted = render(<RouterProvider router={router} />);
  return { router, unmount: mounted.unmount };
}

describe("AuthProvider OAuth bootstrap with actual SDK initial-session delivery", () => {
  it.each(["old-owner-a", null])(
    "keeps an OAuth return unresolved while setSession is pending over held %s",
    async (owner) => {
      await prepareClient(owner ? sessionFor(owner) : null, true);
      expect(savePendingOAuthPostAuthRedirect("/sensors")).toBe(true);
      const heldRead = vi.spyOn(fixture.client.auth, "getSession");
      const { router } = mountOAuthReturn();

      await waitFor(() => expect(userRequestStarted).toBe(true));
      await act(async () => {
        // INITIAL_SESSION is emitted by the SDK itself. Drain any subsequent
        // held read while the OAuth /user response remains pending.
        await Promise.all(heldRead.mock.results.map((result) => result.value));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect.soft(screen.getByTestId("oauth-bootstrap-state")).toHaveTextContent("loading:/");
      expect.soft(snapshots.filter((snapshot) => !snapshot.loading)).toEqual([]);
      expect.soft(router.state.location.pathname).toBe("/");
      expect
        .soft(window.sessionStorage.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY))
        .not.toBeNull();

      await act(async () => releaseUserRequest());
      await waitFor(() =>
        expect(screen.getByTestId("oauth-bootstrap-state")).toHaveTextContent(
          "oauth-owner-b:/sensors",
        ),
      );
      expect((await fixture.client.auth.getSession()).data.session?.user.id).toBe("oauth-owner-b");
      expect(window.sessionStorage.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY)).toBeNull();
    },
  );

  it("resolves an ordinary initial session without waiting for an OAuth response", async () => {
    await prepareClient(sessionFor("ordinary-owner"), false);
    mountOAuthReturn();
    await waitFor(() =>
      expect(screen.getByTestId("oauth-bootstrap-state")).toHaveTextContent("ordinary-owner:/"),
    );
    expect(userRequestStarted).toBe(false);
  });

  it("settles a rejected OAuth session to the confirmed empty store without consuming the destination", async () => {
    await prepareClient(null, true, true);
    expect(savePendingOAuthPostAuthRedirect("/sensors")).toBe(true);
    const { router } = mountOAuthReturn();
    await waitFor(() => expect(userRequestStarted).toBe(true));
    expect(screen.getByTestId("oauth-bootstrap-state")).toHaveTextContent("loading:/");

    await act(async () => releaseUserRequest());
    await waitFor(() =>
      expect(screen.getByTestId("oauth-bootstrap-state")).toHaveTextContent("signed-out:/"),
    );
    expect((await fixture.client.auth.getSession()).data.session).toBeNull();
    expect(snapshots.some((snapshot) => snapshot.owner !== null)).toBe(false);
    expect(router.state.location.pathname).toBe("/");
    expect(window.sessionStorage.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY)).not.toBeNull();
  });

  it("does not publish identity or consume the destination after unmount during OAuth consumption", async () => {
    await prepareClient(sessionFor("old-owner-a"), true);
    expect(savePendingOAuthPostAuthRedirect("/sensors")).toBe(true);
    const { router, unmount } = mountOAuthReturn();
    await waitFor(() => expect(userRequestStarted).toBe(true));
    expect(screen.getByTestId("oauth-bootstrap-state")).toHaveTextContent("loading:/");
    unmount();

    await act(async () => releaseUserRequest());
    await waitFor(async () =>
      expect((await fixture.client.auth.getSession()).data.session?.user.id).toBe("oauth-owner-b"),
    );
    expect(snapshots.filter((snapshot) => !snapshot.loading)).toEqual([]);
    expect(window.sessionStorage.getItem(AUTH_LAST_RESOLVED_IDENTITY_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY)).not.toBeNull();
    expect(router.state.location.pathname).toBe("/");
  });

  it.each(["old-owner-a", null])(
    "keeps a replacement provider unresolved while the original OAuth request is pending over held %s",
    async (owner) => {
      await prepareClient(owner ? sessionFor(owner) : null, true);
      expect(savePendingOAuthPostAuthRedirect("/sensors")).toBe(true);
      const setSession = vi.spyOn(fixture.client.auth, "setSession");
      const first = mountOAuthReturn();
      await waitFor(() => expect(userRequestStarted).toBe(true));
      first.unmount();
      const { router } = mountOAuthReturn();

      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      expect.soft(screen.getByTestId("oauth-bootstrap-state")).toHaveTextContent("loading:/");
      expect.soft(snapshots.filter((snapshot) => !snapshot.loading)).toEqual([]);
      expect.soft(router.state.location.pathname).toBe("/");
      expect
        .soft(window.sessionStorage.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY))
        .not.toBeNull();
      expect(setSession).toHaveBeenCalledTimes(1);

      await act(async () => releaseUserRequest());
      await waitFor(() =>
        expect(screen.getByTestId("oauth-bootstrap-state")).toHaveTextContent(
          "oauth-owner-b:/sensors",
        ),
      );
      expect((await fixture.client.auth.getSession()).data.session?.user.id).toBe("oauth-owner-b");
      expect(setSession).toHaveBeenCalledTimes(1);
      expect(window.sessionStorage.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY)).toBeNull();
    },
  );

  it("consumes a later OAuth return after the previous shared consumption has settled", async () => {
    await prepareClient(null, true);
    const setSession = vi.spyOn(fixture.client.auth, "setSession");
    const first = mountOAuthReturn();
    await waitFor(() => expect(userRequestStarted).toBe(true));
    await act(async () => releaseUserRequest());
    await waitFor(() =>
      expect(screen.getByTestId("oauth-bootstrap-state")).toHaveTextContent("oauth-owner-b:/"),
    );
    first.unmount();

    (window as unknown as Record<string, unknown>)[OAUTH_RETURN_HASH_STASH_KEY] =
      `#access_token=${oauthSession.access_token}&refresh_token=${oauthSession.refresh_token}&token_type=bearer`;
    expect(savePendingOAuthPostAuthRedirect("/sensors")).toBe(true);
    mountOAuthReturn();
    await waitFor(() =>
      expect(screen.getByTestId("oauth-bootstrap-state")).toHaveTextContent(
        "oauth-owner-b:/sensors",
      ),
    );
    expect(setSession).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY)).toBeNull();
  });
});
