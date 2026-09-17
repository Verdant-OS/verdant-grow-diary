import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/store/auth";
import AppShell from "@/components/AppShell";
import Auth from "@/pages/Auth";
import { clearPrivateClientStateBeforeAuthIdentityChange } from "@/lib/authIdentityTransitionFence";
import { GLOBAL_SEARCH_SESSION_STORAGE_KEY } from "@/lib/globalSearchSession";

const fixture = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return fixture.client;
  },
}));
vi.mock("@/lib/react-router-compat", async () =>
  vi.importActual<typeof import("../lib/react-router-compat")>("../lib/react-router-compat"),
);
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));
vi.mock("@/integrations/lovable/index", () => ({
  lovable: { auth: { signInWithOAuth: vi.fn() } },
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: { isActive: true, effectivePlanId: "pro" },
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({ useAlertsList: () => ({ alerts: [] }) }));
vi.mock("@/hooks/useCheckoutReturnCompletionTracking", () => ({
  useCheckoutReturnCompletionTracking: () => undefined,
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SidebarTrigger: () => null,
}));
vi.mock("@/components/AppSidebar", () => ({ default: () => null }));
vi.mock("@/components/MobileNav", () => ({ default: () => null }));
vi.mock("@/components/AuthStatusIndicator", () => ({ default: () => null }));
vi.mock("@/components/VerificationPendingBanner", () => ({ default: () => null }));
vi.mock("@/components/SubscriptionPastDueBanner", () => ({
  SubscriptionPastDueBanner: () => null,
}));
vi.mock("@/components/GlobalSearchDialog", () => ({ default: () => null }));
vi.mock("@/components/LegalFooterLinks", () => ({ default: () => null }));
vi.mock("@/components/BrandLogo", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Sheet", () => ({ default: () => null }));

const expiresAt = 4_102_444_800;
const heldSession: Session = {
  access_token: [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(JSON.stringify({ sub: "owner-a", exp: expiresAt })),
    "fixture-signature",
  ].join("."),
  refresh_token: "fixture-refresh-owner-a",
  token_type: "bearer",
  expires_at: expiresAt,
  expires_in: 3600,
  user: {
    id: "owner-a",
    aud: "authenticated",
    role: "authenticated",
    email: "owner-a@example.invalid",
    email_confirmed_at: "2026-09-16T00:00:00Z",
    created_at: "2026-09-16T00:00:00Z",
    app_metadata: {},
    user_metadata: {},
  },
};
let relaySignOut: () => Promise<void>;
let relayAuthEvent: (event: AuthChangeEvent, session: Session | null) => Promise<void>;
let renderedIdentities: Array<{
  owner: string | null;
  usesHeldBearer: boolean;
  privateCachePresent: boolean;
}>;
let clearHeldSession: () => void;
let serverSession: Session;
let logoutCount: number;
let sequence = 0;

beforeEach(async () => {
  window.sessionStorage.clear();
  logoutCount = 0;
  renderedIdentities = [];
  serverSession = heldSession;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("External network forbidden");
    }),
  );
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      addEventListener(_type: string, listener: (message: MessageEvent) => Promise<void>) {
        relayAuthEvent = async (event, session) => {
          await listener(new MessageEvent("message", { data: { event, session } }));
        };
        relaySignOut = () => relayAuthEvent("SIGNED_OUT", null);
      }
      postMessage() {}
      close() {}
    },
  );
  const storageKey = `protected-relay-${++sequence}`;
  const store = new Map([[storageKey, JSON.stringify(heldSession)]]);
  clearHeldSession = () => {
    store.delete(storageKey);
  };
  fixture.client = createClient("https://protected-relay.invalid", "fixture-public-key", {
    auth: {
      storageKey,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => {
          store.set(key, value);
        },
        removeItem: (key) => {
          store.delete(key);
        },
      },
    },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        expect(url.origin).toBe("https://protected-relay.invalid");
        if (url.pathname === "/auth/v1/user")
          return new Response(JSON.stringify(serverSession.user), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        if (url.pathname === "/auth/v1/logout") {
          logoutCount += 1;
          return new Response(null, { status: 204 });
        }
        if (url.pathname === "/auth/v1/token") {
          const body = JSON.parse(String(init?.body)) as { email: string };
          const owner = body.email.split("@")[0];
          serverSession = {
            ...heldSession,
            access_token: [
              btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
              btoa(JSON.stringify({ sub: owner, exp: expiresAt })),
              "fixture-signature",
            ].join("."),
            user: { ...heldSession.user, id: owner, email: body.email },
          };
          return new Response(JSON.stringify(serverSession), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`Unexpected intercepted route ${url.pathname}`);
      },
    },
  });
  expect((await fixture.client.auth.getSession()).data.session?.user.id).toBe("owner-a");
});

afterEach(async () => {
  cleanup();
  await fixture.client.auth.stopAutoRefresh();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Identity() {
  const { user, loading, session } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!loading)
      renderedIdentities.push({
        owner: user?.id ?? null,
        usesHeldBearer: session?.access_token === heldSession.access_token,
        privateCachePresent:
          queryClient.getQueryData(["fixture-plant-history", "owner-a"]) !== undefined,
      });
  }, [user, loading, session, queryClient]);
  return (
    <output
      data-testid="identity"
      data-held-bearer={session?.access_token === heldSession.access_token}
    >
      {loading ? "loading" : (user?.id ?? "none")}
    </output>
  );
}

function Draft() {
  const [note, setNote] = useState("");
  return (
    <label>
      Unsaved plant observation
      <input value={note} onChange={(event) => setNote(event.target.value)} />
    </label>
  );
}

function mountProtected(realSignIn = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider
          onBeforeAuthIdentityChange={() =>
            clearPrivateClientStateBeforeAuthIdentityChange(queryClient)
          }
        >
          <Identity />
          <Outlet />
        </AuthProvider>
      </QueryClientProvider>
    ),
  });
  const sensors = createRoute({
    getParentRoute: () => root,
    path: "/sensors",
    component: () => (
      <AppShell>
        <Draft />
      </AppShell>
    ),
  });
  const auth = createRoute({
    getParentRoute: () => root,
    path: "/auth",
    validateSearch: (search: Record<string, unknown>) => search,
    component: realSignIn ? Auth : () => <form aria-label="Sign-in form" />,
  });
  const router = createRouter({
    routeTree: root.addChildren([sensors, auth]),
    history: createMemoryHistory({
      initialEntries: [
        realSignIn ? "/auth?redirectTo=%2Fsensors" : "/sensors?tentId=tent-a#manual-reading",
      ],
    }),
  });
  render(<RouterProvider router={router} />);
  return { router, queryClient };
}

describe("protected route with actual SDK foreign-tab sign-out transport", () => {
  it("real password sign-in can navigate immediately and clears A's cache before B renders", async () => {
    clearHeldSession();
    const { router, queryClient } = mountProtected(true);
    await screen.findByRole("form", { name: "Sign in" });
    queryClient.setQueryData(["fixture-plant-history", "owner-a"], { private: "owner-a row" });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), {
      target: { value: "owner-b@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
      target: { value: "fixture-password" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));
    await screen.findByLabelText("Unsaved plant observation");
    expect(router.state.resolvedLocation?.pathname).toBe("/sensors");
    expect(screen.getByTestId("identity")).toHaveTextContent("owner-b");
    expect((await fixture.client.auth.getSession()).data.session?.user.id).toBe("owner-b");
    const committedB = renderedIdentities.filter((identity) => identity.owner === "owner-b");
    expect(committedB.length).toBeGreaterThan(0);
    expect(committedB.every((identity) => !identity.privateCachePresent)).toBe(true);
    expect(queryClient.getQueryData(["fixture-plant-history", "owner-a"])).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("real password sign-in waits for held identity confirmation after immediate navigation without an auth bounce", async () => {
    clearHeldSession();
    const { router } = mountProtected(true);
    await screen.findByRole("form", { name: "Sign in" });
    fireEvent.change(screen.getByLabelText("Email", { exact: true }), {
      target: { value: "owner-b@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
      target: { value: "fixture-password" },
    });
    let release!: (value: Awaited<ReturnType<typeof fixture.client.auth.getSession>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof fixture.client.auth.getSession>>>(
      (resolve) => {
        release = resolve;
      },
    );
    vi.spyOn(fixture.client.auth, "getSession").mockImplementationOnce(() => pending);
    fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));
    await waitFor(() => expect(router.state.resolvedLocation?.pathname).toBe("/sensors"));
    expect.soft(screen.getByTestId("identity")).toHaveTextContent("loading");
    expect.soft(screen.queryByLabelText("Unsaved plant observation")).not.toBeInTheDocument();
    await act(async () => release({ data: { session: serverSession }, error: null }));
    await screen.findByLabelText("Unsaved plant observation");
    expect(router.state.resolvedLocation?.pathname).toBe("/sensors");
    expect(screen.getByTestId("identity")).toHaveTextContent("owner-b");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      event: "SIGNED_IN" as const,
      delivered: {
        ...heldSession,
        access_token: "fixture-other-tab-b-token",
        user: { ...heldSession.user, id: "owner-b" },
      },
    },
    {
      event: "TOKEN_REFRESHED" as const,
      delivered: { ...heldSession, access_token: "fixture-other-tab-a-new-token" },
    },
  ])(
    "retains A's private evidence after foreign $event before and after reconciliation",
    async ({ event, delivered }) => {
      const { router, queryClient } = mountProtected();
      const draft = await screen.findByLabelText("Unsaved plant observation");
      fireEvent.change(draft, { target: { value: "Plant A observation pending save" } });
      queryClient.setQueryData(["fixture-plant-history", "owner-a"], {
        plantId: "plant-a",
        note: "saved observation",
      });
      window.sessionStorage.setItem(
        GLOBAL_SEARCH_SESSION_STORAGE_KEY,
        "owner-a private plant query",
      );
      renderedIdentities = [];
      await act(async () => {
        await relayAuthEvent(event, delivered);
      });
      const held = await fixture.client.auth.getSession();
      expect.soft(held.data.session?.user.id).toBe("owner-a");
      expect.soft(screen.getByTestId("identity")).toHaveTextContent("owner-a");
      expect.soft(screen.getByTestId("identity")).toHaveAttribute("data-held-bearer", "true");
      expect
        .soft(
          renderedIdentities.every(
            (identity) => identity.owner === "owner-a" && identity.usesHeldBearer,
          ),
        )
        .toBe(true);
      expect.soft(router.state.resolvedLocation?.pathname).toBe("/sensors");
      expect.soft(draft.isConnected).toBe(true);
      expect
        .soft(screen.queryByLabelText("Unsaved plant observation"))
        .toHaveValue("Plant A observation pending save");
      expect
        .soft(queryClient.getQueryData(["fixture-plant-history", "owner-a"]))
        .toEqual({ plantId: "plant-a", note: "saved observation" });
      expect
        .soft(window.sessionStorage.getItem(GLOBAL_SEARCH_SESSION_STORAGE_KEY))
        .toBe("owner-a private plant query");
      expect.soft(logoutCount).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      event: "SIGNED_IN" as const,
      delivered: {
        ...heldSession,
        access_token: "fixture-other-tab-b-token",
        user: { ...heldSession.user, id: "owner-b" },
      },
    },
    {
      event: "TOKEN_REFRESHED" as const,
      delivered: { ...heldSession, access_token: "fixture-other-tab-a-new-token" },
    },
  ])(
    "does not expose a relayed $event identity while this tab's held read is delayed",
    async ({ event, delivered }) => {
      const { router, queryClient } = mountProtected();
      const draft = await screen.findByLabelText("Unsaved plant observation");
      fireEvent.change(draft, { target: { value: "Plant A draft before relay" } });
      queryClient.setQueryData(["fixture-plant-history", "owner-a"], { plantId: "plant-a" });
      let release!: (value: Awaited<ReturnType<typeof fixture.client.auth.getSession>>) => void;
      const pending = new Promise<Awaited<ReturnType<typeof fixture.client.auth.getSession>>>(
        (resolve) => {
          release = resolve;
        },
      );
      const readHeldSession = fixture.client.auth.getSession.bind(fixture.client.auth);
      vi.spyOn(fixture.client.auth, "getSession").mockImplementationOnce(() => pending);
      renderedIdentities = [];
      await act(async () => {
        await relayAuthEvent(event, delivered);
      });
      const heldWhilePending = await readHeldSession();
      expect.soft(heldWhilePending.data.session?.user.id).toBe("owner-a");
      expect.soft(screen.getByTestId("identity")).toHaveTextContent("owner-a");
      expect.soft(screen.getByTestId("identity")).toHaveAttribute("data-held-bearer", "true");
      expect
        .soft(
          renderedIdentities.every(
            (identity) => identity.owner === "owner-a" && identity.usesHeldBearer,
          ),
        )
        .toBe(true);
      await act(async () => release({ data: { session: heldSession }, error: null }));
      expect.soft(screen.getByTestId("identity")).toHaveTextContent("owner-a");
      expect.soft(router.state.resolvedLocation?.pathname).toBe("/sensors");
      expect.soft(draft.isConnected).toBe(true);
      expect
        .soft(screen.queryByLabelText("Unsaved plant observation"))
        .toHaveValue("Plant A draft before relay");
      expect
        .soft(queryClient.getQueryData(["fixture-plant-history", "owner-a"]))
        .toEqual({ plantId: "plant-a" });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("retains the held owner's route, draft and cached evidence after a foreign SIGNED_OUT", async () => {
    const { router, queryClient } = mountProtected();
    const draft = await screen.findByLabelText("Unsaved plant observation");
    fireEvent.change(draft, { target: { value: "Plant A observation pending save" } });
    queryClient.setQueryData(["fixture-plant-history", "owner-a"], {
      plantId: "plant-a",
      note: "saved observation",
    });
    await act(async () => {
      await relaySignOut();
    });
    const held = await fixture.client.auth.getSession();
    expect.soft(held.data.session?.user.id).toBe("owner-a");
    expect.soft(screen.getByTestId("identity")).toHaveTextContent("owner-a");
    expect.soft(router.state.resolvedLocation?.pathname).toBe("/sensors");
    expect.soft(draft.isConnected).toBe(true);
    expect
      .soft(screen.queryByLabelText("Unsaved plant observation"))
      .toHaveValue("Plant A observation pending save");
    expect
      .soft(queryClient.getQueryData(["fixture-plant-history", "owner-a"]))
      .toEqual({ plantId: "plant-a", note: "saved observation" });
    expect.soft(logoutCount).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still removes protected content when this SDK actually clears its local session", async () => {
    const { router } = mountProtected();
    await screen.findByLabelText("Unsaved plant observation");
    await act(async () => {
      await fixture.client.auth.signOut({ scope: "local" });
    });
    await waitFor(() => expect(router.state.resolvedLocation?.pathname).toBe("/auth"));
    expect((await fixture.client.auth.getSession()).data.session).toBeNull();
    expect(screen.queryByLabelText("Unsaved plant observation")).not.toBeInTheDocument();
    expect(logoutCount).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
