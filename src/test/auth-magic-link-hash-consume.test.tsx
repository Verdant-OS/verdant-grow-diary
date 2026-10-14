/**
 * URGENT production QA 2026-10-14 (~12:15 CT onward): a magic-link return,
 * `https://verdantgrowdiary.com/#access_token=…&refresh_token=…&type=magiclink`,
 * no longer signed the grower in. The before-paint wipe script and the
 * AuthProvider bootstrap deliberately skipped `type=magiclink` fragments
 * (preserved for ResetPassword, which only needs recovery-style callbacks),
 * so sign-in depended entirely on auth-js reading the hash after first paint.
 * A magic-link fragment now takes the same stash → setSession path Google
 * OAuth uses: captured before body parse, consumed before the first held read.
 */
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
import { AuthProvider, useAuth } from "@/store/auth";
import OAuthPostAuthRedirect from "@/components/OAuthPostAuthRedirect";
import { useLocation } from "@/lib/react-router-compat";
import {
  clearOAuthReturnHashRetention,
  OAUTH_RETURN_HASH_STASH_KEY,
} from "@/lib/oauthHashSessionConsumeRules";

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
      `#access_token=${oauthSession.access_token}&refresh_token=${oauthSession.refresh_token}&token_type=bearer&type=magiclink`;
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

import {
  AUTH_CALLBACK_HASH_PRESERVE_TYPES,
  consumeOAuthHashSessionIfPresent,
  OAUTH_HASH_EARLY_WIPE_SCRIPT,
  shouldPreserveAuthCallbackHash,
} from "@/lib/oauthHashSessionConsumeRules";

const ACCESS = "fixture-access-token-0123456789";
const REFRESH = "fixture-refresh-0123";
function hashWith(params: Record<string, string>): string {
  return `#${new URLSearchParams(params).toString()}`;
}

describe("magic-link fragments are consumed by the app bootstrap", () => {
  it("does not preserve a magiclink fragment for ResetPassword; recovery stays preserved", () => {
    expect(AUTH_CALLBACK_HASH_PRESERVE_TYPES).not.toContain("magiclink");
    expect(
      shouldPreserveAuthCallbackHash(
        hashWith({ access_token: ACCESS, refresh_token: REFRESH, type: "magiclink" }),
      ),
    ).toBe(false);
    expect(
      shouldPreserveAuthCallbackHash(
        hashWith({ access_token: ACCESS, refresh_token: REFRESH, type: "recovery" }),
      ),
    ).toBe(true);
  });

  it("consumes a magiclink fragment: wipes the address bar and calls setSession with its tokens", async () => {
    const replaceState = vi.fn();
    const setSession = vi.fn().mockResolvedValue({ error: null });
    await expect(
      consumeOAuthHashSessionIfPresent({
        hash: hashWith({ access_token: ACCESS, refresh_token: REFRESH, type: "magiclink" }),
        pathname: "/",
        search: "",
        setSession,
        replaceState,
      }),
    ).resolves.toBe("consumed");
    expect(replaceState).toHaveBeenCalledWith("/");
    expect(setSession).toHaveBeenCalledWith({ access_token: ACCESS, refresh_token: REFRESH });
  });

  it("the before-paint wipe script stashes a magiclink fragment but leaves recovery alone", () => {
    const run = () => new Function(OAUTH_HASH_EARLY_WIPE_SCRIPT)();
    const holder = window as unknown as Record<string, unknown>;

    window.history.replaceState(
      null,
      "",
      `/${hashWith({ access_token: ACCESS, refresh_token: REFRESH, type: "magiclink" })}`,
    );
    run();
    expect(holder[OAUTH_RETURN_HASH_STASH_KEY]).toContain("type=magiclink");
    expect(window.location.hash).toBe("");
    delete holder[OAUTH_RETURN_HASH_STASH_KEY];

    const recovery = hashWith({ access_token: ACCESS, refresh_token: REFRESH, type: "recovery" });
    window.history.replaceState(null, "", `/${recovery}`);
    run();
    expect(holder[OAUTH_RETURN_HASH_STASH_KEY]).toBeUndefined();
    expect(window.location.hash).toBe(recovery);
    expect(OAUTH_HASH_EARLY_WIPE_SCRIPT).not.toContain("magiclink");
    expect(OAUTH_HASH_EARLY_WIPE_SCRIPT).toContain("recovery");
  });
});

describe("AuthProvider bootstrap signs a magic-link return in through the stash (real SDK)", () => {
  it("resolves the magic-link owner before publishing a signed-out identity", async () => {
    await prepareClient(null, true);
    const { router } = mountOAuthReturn();
    await waitFor(() => expect(userRequestStarted).toBe(true));
    expect(snapshots.filter((snapshot) => !snapshot.loading)).toEqual([]);
    await act(async () => releaseUserRequest());
    await waitFor(() =>
      expect(screen.getByTestId("oauth-bootstrap-state")).toHaveTextContent("oauth-owner-b:/"),
    );
    expect(snapshots.some((snapshot) => !snapshot.loading && snapshot.owner === null)).toBe(false);
    expect(router.state.location.pathname).toBe("/");
    expect((await fixture.client.auth.getSession()).data.session?.user.id ?? null).toBe(
      "oauth-owner-b",
    );
  });
});
