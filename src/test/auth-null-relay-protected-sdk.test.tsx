import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/store/auth";
import AppShell from "@/components/AppShell";

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
let logoutCount: number;
let sequence = 0;

beforeEach(async () => {
  window.sessionStorage.clear();
  logoutCount = 0;
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
        relaySignOut = async () => {
          await listener(
            new MessageEvent("message", { data: { event: "SIGNED_OUT", session: null } }),
          );
        };
      }
      postMessage() {}
      close() {}
    },
  );
  const storageKey = `protected-relay-${++sequence}`;
  const store = new Map([[storageKey, JSON.stringify(heldSession)]]);
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
      fetch: async (input) => {
        const url = new URL(String(input));
        expect(url.origin).toBe("https://protected-relay.invalid");
        if (url.pathname === "/auth/v1/user")
          return new Response(JSON.stringify(heldSession.user), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        if (url.pathname === "/auth/v1/logout") {
          logoutCount += 1;
          return new Response(null, { status: 204 });
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
  const { user, loading } = useAuth();
  return <output data-testid="identity">{loading ? "loading" : (user?.id ?? "none")}</output>;
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

function mountProtected() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider onBeforeAuthIdentityChange={() => queryClient.clear()}>
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
    component: () => <form aria-label="Sign-in form" />,
  });
  const router = createRouter({
    routeTree: root.addChildren([sensors, auth]),
    history: createMemoryHistory({ initialEntries: ["/sensors?tentId=tent-a#manual-reading"] }),
  });
  render(<RouterProvider router={router} />);
  return { router, queryClient };
}

describe("protected route with actual SDK foreign-tab sign-out transport", () => {
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
