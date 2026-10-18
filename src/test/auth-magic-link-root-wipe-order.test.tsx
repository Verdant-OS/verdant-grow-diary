/**
 * Follow-up #2122. The #2106 real-SDK harness creates the client and calls
 * getSession before the stash exists, and it mounts a test root. Production
 * `RootDocument` in `src/routes/__root.tsx` injects `OAUTH_HASH_EARLY_WIPE_SCRIPT`
 * in `<head>` so the wipe and stash finish before body parse and before the
 * Supabase client reads a session.
 *
 * jsdom does not execute `dangerouslySetInnerHTML` scripts, so this runs that
 * same script source, then constructs the client. On the pre-#2106 preserve
 * list the script leaves a `type=magiclink` fragment in the address bar and
 * this case fails. After magic-link fragments are stashed, bootstrap consumes
 * them and the grower is signed in.
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
  OAUTH_HASH_EARLY_WIPE_SCRIPT,
  OAUTH_RETURN_HASH_STASH_KEY,
} from "@/lib/oauthHashSessionConsumeRules";

const fixture = vi.hoisted(() => ({ client: null as unknown as SupabaseClient | null }));
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
const MAGIC_LINK_RETURN_HASH = `#access_token=${oauthSession.access_token}&refresh_token=${oauthSession.refresh_token}&token_type=bearer&type=magiclink`;

type Snapshot = { owner: string | null; loading: boolean; path: string };
let snapshots: Snapshot[];
let userRequestStarted: boolean;
let releaseUserRequest: () => void;
let sequence = 0;

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  clearOAuthReturnHashRetention();
  fixture.client = null;
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

/** Same blocking head script `RootDocument` emits, before any client exists. */
function runRootEarlyHashWipe(hash: string) {
  window.history.replaceState(null, "", `/${hash}`);
  new Function(OAUTH_HASH_EARLY_WIPE_SCRIPT)();
}

async function createClientAfterEarlyWipe() {
  const storageKey = `oauth-root-wipe-${++sequence}`;
  const userRequest = new Promise<void>((resolve) => {
    releaseUserRequest = resolve;
  });
  fixture.client = createClient("https://oauth-bootstrap.invalid", "fixture-public-key", {
    auth: {
      storageKey,
      storage: window.sessionStorage,
      autoRefreshToken: false,
    },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        expect(url.origin).toBe("https://oauth-bootstrap.invalid");
        expect(url.pathname).toBe("/auth/v1/user");
        userRequestStarted = true;
        await userRequest;
        return new Response(JSON.stringify(oauthSession.user), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
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
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

describe("magic-link return follows the __root.tsx wipe-before-session order", () => {
  it("stashes and strips the fragment before the client exists, then signs in", async () => {
    runRootEarlyHashWipe(MAGIC_LINK_RETURN_HASH);
    const holder = window as unknown as Record<string, unknown>;
    expect(window.location.hash).toBe("");
    expect(String(holder[OAUTH_RETURN_HASH_STASH_KEY])).toContain("type=magiclink");
    expect(fixture.client).toBeNull();

    await createClientAfterEarlyWipe();
    mountOAuthReturn();
    await waitFor(() => expect(userRequestStarted).toBe(true));
    expect(snapshots.filter((snapshot) => !snapshot.loading)).toEqual([]);
    await act(async () => releaseUserRequest());
    await waitFor(() =>
      expect(screen.getByTestId("oauth-bootstrap-state")).toHaveTextContent("oauth-owner-b:/"),
    );
    expect(snapshots.some((snapshot) => !snapshot.loading && snapshot.owner === null)).toBe(false);
    expect(window.location.hash).toBe("");
    expect((await fixture.client!.auth.getSession()).data.session?.user.id ?? null).toBe(
      "oauth-owner-b",
    );
  });
});
