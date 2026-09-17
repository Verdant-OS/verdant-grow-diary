import { useEffect, useState, type ReactNode } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/store/auth";
import AppShell from "@/components/AppShell";
import RootEntry from "@/components/RootEntry";
import { AUTH_REVALIDATE_EVENT } from "@/hooks/useRequireAuth";
import { useNavigate } from "@/lib/react-router-compat";
import { SIGN_OUT_FAILURE_MESSAGE } from "@/lib/authSessionExitRules";
import { getAuthSignOutOperation } from "@/lib/authSignOutOperationService";
import { supabase } from "@/integrations/supabase/client";

const sdk = vi.hoisted(() => ({
  hasSession: true,
  ownerId: "fixture-owner",
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  listeners: [] as Array<(event: string, session: unknown) => void>,
  authMounts: 0,
  toastError: vi.fn(),
}));

// Execute the production compat implementation and real TanStack navigation.
// The normal Vitest alias supplies a legacy router harness instead.
vi.mock("@/lib/react-router-compat", async () =>
  vi.importActual<typeof import("../lib/react-router-compat")>("../lib/react-router-compat"),
);
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => sdk.getSession(...args),
      getUser: (...args: unknown[]) => sdk.getUser(...args),
      signOut: (...args: unknown[]) => sdk.signOut(...args),
      onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
        sdk.listeners.push(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                sdk.listeners = sdk.listeners.filter((entry) => entry !== listener);
              },
            },
          },
        };
      },
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

// Keep all auth boundaries and the real confirmation dialog. Only unrelated
// private data, shell chrome and the leaf page contents are inert fixtures.
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
vi.mock("@/pages/Dashboard", () => ({
  default: () => <div data-testid="private-page">Private grow history</div>,
}));
vi.mock("@/pages/Landing", () => ({ default: SignInLanding }));
vi.mock("sonner", () => ({ toast: { error: sdk.toastError, success: vi.fn() } }));

const OWNER = { id: "fixture-owner", email_confirmed_at: "2026-09-01T00:00:00Z" };
const SESSION = {
  access_token: "fixture-access-token",
  refresh_token: "fixture-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  user: OWNER,
};
const missingSession = () => ({
  data: { user: null },
  error: { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 },
});
const authenticated = () => ({ data: { user: { ...OWNER, id: sdk.ownerId } }, error: null });
type UserResult = ReturnType<typeof authenticated> | ReturnType<typeof missingSession>;
const pendingReleases: Array<() => void> = [];

function deferred<T>(cleanupValue: T) {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((release) => {
    resolve = release;
  });
  pendingReleases.push(() => resolve(cleanupValue));
  return { promise, resolve };
}

function signedOutEvent() {
  sdk.hasSession = false;
  for (const listener of [...sdk.listeners]) listener("SIGNED_OUT", null);
}

function currentSession() {
  return {
    ...SESSION,
    access_token: `fixture-access-${sdk.ownerId}`,
    user: { ...OWNER, id: sdk.ownerId },
  };
}

function signedInEvent(ownerId: string) {
  sdk.ownerId = ownerId;
  sdk.hasSession = true;
  const session = currentSession();
  for (const listener of [...sdk.listeners]) listener("SIGNED_IN", session);
}

function AuthIdentity() {
  const { user, loading } = useAuth();
  return <output data-testid="auth-identity">{loading ? "loading" : (user?.id ?? "none")}</output>;
}

function SignInLanding() {
  const navigate = useNavigate();
  return (
    <section data-testid="public-landing">
      <button onClick={() => navigate("/auth")}>Sign in to Verdant</button>
    </section>
  );
}

function SignInForm() {
  useEffect(() => {
    sdk.authMounts += 1;
  }, []);
  return (
    <form aria-label="Sign-in form">
      <label>
        Email
        <input type="email" name="email" />
      </label>
      <label>
        Password
        <input type="password" name="password" />
      </label>
    </form>
  );
}

function renderRoutes(initialEntry: string) {
  const welcomeGate = deferred<void>(undefined);
  const welcomeLoader = vi.fn(async () => welcomeGate.promise);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function FixtureRoot() {
    const [providerGeneration, setProviderGeneration] = useState(0);
    return (
      <QueryClientProvider client={client}>
        <button onClick={() => setProviderGeneration((current) => current + 1)}>
          Remount provider
        </button>
        <AuthProvider key={providerGeneration} onBeforeAuthIdentityChange={() => client.clear()}>
          <AuthIdentity />
          <Outlet />
        </AuthProvider>
      </QueryClientProvider>
    );
  }
  const root = createRootRoute({ component: FixtureRoot });
  const apex = createRoute({ getParentRoute: () => root, path: "/", component: RootEntry });
  const sensors = createRoute({
    getParentRoute: () => root,
    path: "/sensors",
    validateSearch: (search: Record<string, unknown>) => search,
    component: () => (
      <AppShell>
        <div data-testid="private-page">Private grow history</div>
      </AppShell>
    ),
  });
  const welcome = createRoute({
    getParentRoute: () => root,
    path: "/welcome",
    loader: welcomeLoader,
    component: SignInLanding,
  });
  const auth = createRoute({
    getParentRoute: () => root,
    path: "/auth",
    validateSearch: (search: Record<string, unknown>) => search,
    component: SignInForm,
  });
  const router = createRouter({
    routeTree: root.addChildren([apex, sensors, welcome, auth]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    // Hold the actual source route mounted throughout the deterministic loader
    // gate. A pending fallback must not accidentally conceal a late redirect.
    defaultPendingMs: 60_000,
  });
  render(<RouterProvider router={router} />);
  return { router, welcomeGate, welcomeLoader, client };
}

async function confirmSignOut() {
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  const dialog = await screen.findByTestId("sign-out-confirm-dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(sdk.signOut).toHaveBeenCalledTimes(1));
}

async function flushOldContinuations() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  // Cases intentionally share one mocked SDK client. Runtime failure memory
  // survives provider remounts, but it must not leak between independent tests.
  getAuthSignOutOperation(supabase.auth).clearFailedCleanup();
  window.sessionStorage.clear();
  sdk.hasSession = true;
  sdk.ownerId = "fixture-owner";
  sdk.authMounts = 0;
  sdk.toastError.mockReset();
  sdk.listeners = [];
  sdk.getSession.mockReset().mockImplementation(async () => ({
    data: { session: sdk.hasSession ? currentSession() : null },
    error: null,
  }));
  sdk.getUser
    .mockReset()
    .mockImplementation(async () => (sdk.hasSession ? authenticated() : missingSession()));
  sdk.signOut.mockReset().mockImplementation(async () => {
    signedOutEvent();
    return { error: null };
  });
});

afterEach(async () => {
  cleanup();
  for (const release of pendingReleases.splice(0)) release();
  vi.useRealTimers();
  await flushOldContinuations();
});

describe("explicit sign-out owns navigation through the committed public destination", () => {
  it.each(["/sensors?tentId=tent-a#manual-reading", "/"])(
    "does not expose a usable sign-in form between synchronous SIGNED_OUT and completion from %s",
    async (initialEntry) => {
      const signOutGate = deferred<{ error: null }>({ error: null });
      sdk.signOut.mockImplementation(() => {
        signedOutEvent();
        return signOutGate.promise;
      });
      const { router, welcomeGate, welcomeLoader } = renderRoutes(initialEntry);
      await screen.findByTestId("private-page");
      await confirmSignOut();
      expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
      // The root swaps out AppShell on the auth event. If it exposes its landing
      // CTA early, exercise the same fast user action as the observed race.
      const prematureSignIn = screen.queryByRole("button", { name: "Sign in to Verdant" });
      if (prematureSignIn) fireEvent.click(prematureSignIn);
      await flushOldContinuations();
      expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
      expect(sdk.authMounts).toBe(0);

      await act(async () => signOutGate.resolve({ error: null }));
      await waitFor(() => expect(welcomeLoader).toHaveBeenCalledTimes(1));
      expect(router.state.status).toBe("pending");
      expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
      expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
      expect(sdk.authMounts).toBe(0);

      await act(async () => welcomeGate.resolve());
      await waitFor(() => expect(router.state.resolvedLocation?.pathname).toBe("/welcome"));
      fireEvent.click(await screen.findByRole("button", { name: "Sign in to Verdant" }));
      const email = await screen.findByLabelText("Email");
      const password = screen.getByLabelText("Password");
      fireEvent.change(email, { target: { value: "fixture@example.invalid" } });
      fireEvent.change(password, { target: { value: "fixture-only-value" } });
      await flushOldContinuations();
      expect(router.state.resolvedLocation?.pathname).toBe("/auth");
      expect(screen.getByLabelText("Email")).toBe(email);
      expect(email).toHaveValue("fixture@example.invalid");
      expect(password).toHaveValue("fixture-only-value");
      expect(sdk.authMounts).toBe(1);
    },
  );

  it("ordinary expiry ignores an older revalidation result after the sign-in form is filled", async () => {
    const { router } = renderRoutes("/sensors?tentId=tent-a#manual-reading");
    await screen.findByTestId("private-page");
    const oldRead = deferred<UserResult>(missingSession());
    sdk.getUser.mockReturnValueOnce(oldRead.promise);
    // Start a real revalidation while the confirmed session still exists.
    act(() => window.dispatchEvent(new Event(AUTH_REVALIDATE_EVENT)));
    await waitFor(() => expect(sdk.getUser).toHaveBeenCalledTimes(2));
    act(() => signedOutEvent());
    const email = await screen.findByLabelText("Email");
    fireEvent.change(email, { target: { value: "retained@example.invalid" } });
    await act(async () => oldRead.resolve(authenticated()));
    await flushOldContinuations();
    expect(email).toHaveValue("retained@example.invalid");
    expect(screen.getByLabelText("Email")).toBe(email);
    expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
    expect(router.state.resolvedLocation?.pathname).toBe("/auth");
    expect(sdk.signOut).not.toHaveBeenCalled();
  });

  it("ordinary session expiry still reaches auth with the exact protected return intent", async () => {
    const destination = "/sensors?tentId=tent-a#manual-reading";
    const { router, welcomeLoader } = renderRoutes(destination);
    await screen.findByTestId("private-page");
    act(() => signedOutEvent());
    await screen.findByRole("form", { name: "Sign-in form" });
    expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
    expect(router.state.resolvedLocation?.pathname).toBe("/auth");
    expect(router.state.resolvedLocation?.search.redirectTo).toBe(destination);
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(welcomeLoader).not.toHaveBeenCalled();
  });

  it("server revalidation preserves the same return intent when a cached user still exists", async () => {
    const destination = "/sensors?tentId=tent-a#manual-reading";
    const { router, welcomeLoader } = renderRoutes(destination);
    await screen.findByTestId("private-page");
    sdk.getUser.mockResolvedValueOnce(missingSession());
    act(() => window.dispatchEvent(new Event(AUTH_REVALIDATE_EVENT)));
    await screen.findByRole("form", { name: "Sign-in form" });
    expect(router.state.resolvedLocation?.pathname).toBe("/auth");
    expect(router.state.resolvedLocation?.search.redirectTo).toBe(destination);
    expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(welcomeLoader).not.toHaveBeenCalled();
  });

  it.each([
    { emitsSignedOut: false, rejects: false },
    { emitsSignedOut: true, rejects: false },
    { emitsSignedOut: false, rejects: true },
    { emitsSignedOut: true, rejects: true },
  ])(
    "commits safe welcome and sanitizes SDK failure (SIGNED_OUT=$emitsSignedOut, rejection=$rejects)",
    async ({ emitsSignedOut, rejects }) => {
      const sdkGate = deferred<void>(undefined);
      const privateFailure = "fixture-private-token-session-detail";
      sdk.signOut.mockImplementation(() => {
        if (emitsSignedOut) signedOutEvent();
        return sdkGate.promise.then(() => {
          if (rejects) throw new Error(privateFailure);
          return { error: { message: privateFailure } };
        });
      });
      const { router, welcomeGate, welcomeLoader } = renderRoutes("/sensors");
      await screen.findByTestId("private-page");
      await confirmSignOut();
      expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
      expect(sdk.toastError).not.toHaveBeenCalled();
      await act(async () => sdkGate.resolve());
      await waitFor(() => expect(welcomeLoader).toHaveBeenCalledTimes(1));
      expect(router.state.status).toBe("pending");
      expect(sdk.toastError).toHaveBeenCalledExactlyOnceWith(SIGN_OUT_FAILURE_MESSAGE);
      expect(JSON.stringify(sdk.toastError.mock.calls)).not.toContain(privateFailure);
      expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
      expect(screen.queryByTestId("public-landing")).not.toBeInTheDocument();
      expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
      await act(async () => welcomeGate.resolve());
      await screen.findByTestId("public-landing");
      expect(router.state.resolvedLocation?.pathname).toBe("/welcome");
      expect(sdk.authMounts).toBe(0);
      expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
    },
  );

  it.each(["fixture-owner-b", "fixture-owner"])(
    "a verified local sign-in as %s cancels old navigation but remains blocked until the underlying SDK settles",
    async (nextOwner) => {
      const sdkGate = deferred<{ error: null }>({ error: null });
      sdk.signOut.mockImplementation(() => {
        signedOutEvent();
        return sdkGate.promise;
      });
      const { router, welcomeLoader } = renderRoutes("/sensors?tentId=tent-a#manual-reading");
      await screen.findByTestId("private-page");
      await confirmSignOut();
      expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();

      act(() => signedInEvent(nextOwner));
      await flushOldContinuations();
      expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
      expect(screen.queryByTestId("public-landing")).not.toBeInTheDocument();
      expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
      const newAccountKey = `verdant:auth:${nextOwner}-draft`;
      window.sessionStorage.setItem(newAccountKey, "new-account-value");
      await act(async () => sdkGate.resolve({ error: null }));
      await screen.findByTestId("private-page");

      expect(window.sessionStorage.getItem(newAccountKey)).toBe("new-account-value");
      expect(screen.getByTestId("auth-identity")).toHaveTextContent(nextOwner);
      expect(screen.getByTestId("private-page")).toBeInTheDocument();
      expect(router.state.resolvedLocation?.href).toBe("/sensors?tentId=tent-a#manual-reading");
      expect(welcomeLoader).not.toHaveBeenCalled();
      expect(sdk.toastError).not.toHaveBeenCalled();
      expect(sdk.authMounts).toBe(0);
    },
  );

  it("a foreign-tab SIGNED_IN with no locally held session cannot release the pending explicit exit", async () => {
    const sdkGate = deferred<{ error: null }>({ error: null });
    sdk.signOut.mockImplementation(() => {
      signedOutEvent();
      return sdkGate.promise;
    });
    const { router, welcomeGate, welcomeLoader } = renderRoutes("/sensors");
    await screen.findByTestId("private-page");
    await confirmSignOut();
    expect(sdk.hasSession).toBe(false);
    const sessionReadsBeforeRelay = sdk.getSession.mock.calls.length;
    const foreignSession = {
      ...SESSION,
      access_token: "fixture-foreign-tab-bearer",
      user: { ...OWNER, id: "foreign-tab-owner" },
    };
    act(() => {
      for (const listener of [...sdk.listeners]) listener("SIGNED_IN", foreignSession);
    });
    await waitFor(() => expect(sdk.getSession).toHaveBeenCalledTimes(sessionReadsBeforeRelay + 1));
    await flushOldContinuations();
    expect(sdk.hasSession).toBe(false);
    expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("public-landing")).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
    expect(sdk.authMounts).toBe(0);

    await act(async () => sdkGate.resolve({ error: null }));
    await waitFor(() => expect(welcomeLoader).toHaveBeenCalledTimes(1));
    expect(router.state.status).toBe("pending");
    expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
    await act(async () => welcomeGate.resolve());
    await screen.findByTestId("public-landing");
    expect(router.state.resolvedLocation?.pathname).toBe("/welcome");
    expect(sdk.authMounts).toBe(0);
    expect(sdk.toastError).not.toHaveBeenCalled();
  });

  it("provider remount preserves the underlying SDK boundary while invalidating the old operation's navigation", async () => {
    const sdkGate = deferred<{ error: null }>({ error: null });
    sdk.signOut.mockImplementation(() => {
      signedOutEvent();
      return sdkGate.promise;
    });
    const { router, welcomeLoader } = renderRoutes("/sensors");
    await screen.findByTestId("private-page");
    await confirmSignOut();
    fireEvent.click(screen.getByRole("button", { name: "Remount provider" }));
    await flushOldContinuations();
    expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("public-landing")).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
    expect(sdk.authMounts).toBe(0);
    const newProviderKey = "verdant:auth:remounted-form";
    window.sessionStorage.setItem(newProviderKey, "keep-this-form");
    expect(sdk.listeners).toHaveLength(1);

    await act(async () => sdkGate.resolve({ error: null }));
    const email = await screen.findByLabelText("Email");
    fireEvent.change(email, { target: { value: "remounted@example.invalid" } });
    await flushOldContinuations();
    expect(router.state.resolvedLocation?.pathname).toBe("/auth");
    expect(screen.getByLabelText("Email")).toBe(email);
    expect(email).toHaveValue("remounted@example.invalid");
    expect(window.sessionStorage.getItem(newProviderKey)).toBe("keep-this-form");
    expect(welcomeLoader).not.toHaveBeenCalled();
    expect(sdk.toastError).not.toHaveBeenCalled();
  });

  it("keeps automatic rejected-bearer cleanup closed through Retry, null-session delivery and provider remount until the local SDK settles", async () => {
    const localGate = deferred<{ error: null }>({ error: null });
    sdk.signOut.mockImplementation(() =>
      localGate.promise.then((result) => {
        signedOutEvent();
        return result;
      }),
    );
    const destination = "/sensors?tentId=tent-a#manual-reading";
    const { router, welcomeLoader } = renderRoutes(destination);
    await screen.findByTestId("private-page");
    sdk.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { name: "AuthApiError", status: 401, message: "Fixture bearer rejected" },
    });
    vi.useFakeTimers();
    act(() => window.dispatchEvent(new Event(AUTH_REVALIDATE_EVENT)));
    await flushOldContinuations();
    expect(sdk.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    vi.useRealTimers();

    // The faulty recovery screen permits Retry while an older SDK logout is
    // still active. A session_missing response can deliver SIGNED_OUT before
    // that older promise settles. A protected cleanup boundary removes Retry;
    // the same SDK event must remain harmless even when there is no button.
    const retry = screen.queryByRole("button", { name: "Retry" });
    if (retry) {
      const readsBeforeRetry = sdk.getUser.mock.calls.length;
      sdk.getUser.mockImplementationOnce(async () => {
        signedOutEvent();
        return missingSession();
      });
      fireEvent.click(retry);
      await waitFor(() => expect(sdk.getUser).toHaveBeenCalledTimes(readsBeforeRetry + 1));
    } else {
      act(() => signedOutEvent());
    }
    // Exercise entry at the actual auth route as well as the event-driven
    // redirect; neither route resolution nor remount may release SDK cleanup.
    await act(async () => {
      await router.navigate({ to: "/auth", search: { redirectTo: destination } });
    });
    expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("public-landing")).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
    expect(sdk.authMounts).toBe(0);
    expect(screen.getByRole("button", { name: "Reload page" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Remount provider" }));
    await flushOldContinuations();
    expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
    expect(sdk.authMounts).toBe(0);
    expect(sdk.signOut).toHaveBeenCalledTimes(1);

    await act(async () => localGate.resolve({ error: null }));
    const email = await screen.findByLabelText("Email");
    fireEvent.change(email, { target: { value: "after-cleanup@example.invalid" } });
    await flushOldContinuations();
    expect(router.state.resolvedLocation?.pathname).toBe("/auth");
    expect(router.state.resolvedLocation?.search.redirectTo).toBe(destination);
    expect(screen.getByLabelText("Email")).toBe(email);
    expect(email).toHaveValue("after-cleanup@example.invalid");
    expect(sdk.authMounts).toBe(1);
    expect(sdk.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(welcomeLoader).not.toHaveBeenCalled();
    expect(sdk.toastError).not.toHaveBeenCalled();
  });

  it("keeps stalled automatic logout behind Reload recovery and permits a stable new account only after cleanup settles", async () => {
    const localGate = deferred<{ error: null }>({ error: null });
    sdk.signOut.mockImplementation(() =>
      localGate.promise.then((result) => {
        signedOutEvent();
        return result;
      }),
    );
    const destination = "/sensors?tentId=tent-a#manual-reading";
    const { router, welcomeLoader } = renderRoutes(destination);
    await screen.findByTestId("private-page");
    sdk.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { name: "AuthApiError", status: 401, message: "Fixture bearer rejected" },
    });
    vi.useFakeTimers();
    act(() => window.dispatchEvent(new Event(AUTH_REVALIDATE_EVENT)));
    await flushOldContinuations();
    expect(sdk.signOut).toHaveBeenCalledTimes(1);
    expect(sdk.signOut).toHaveBeenCalledWith({ scope: "local" });
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(screen.getByRole("button", { name: "Reload page" })).toBeEnabled();
    expect(screen.queryByTestId("app-shell-revalidation-failed")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    // An uncancellable automatic cleanup owns entry until it settles. The
    // stalled UI cannot dispatch a second SDK logout or admit another account.
    expect(sdk.signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
    expect(screen.queryByTestId("public-landing")).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
    expect(welcomeLoader).not.toHaveBeenCalled();
    vi.useRealTimers();

    await act(async () => localGate.resolve({ error: null }));
    const email = await screen.findByLabelText("Email");
    expect(router.state.resolvedLocation?.pathname).toBe("/auth");
    expect(router.state.resolvedLocation?.search.redirectTo).toBe(destination);
    expect(screen.queryByRole("button", { name: "Reload page" })).not.toBeInTheDocument();
    fireEvent.change(email, { target: { value: "new-owner@example.invalid" } });
    await flushOldContinuations();
    expect(email).toHaveValue("new-owner@example.invalid");
    expect(screen.getByLabelText("Email")).toBe(email);
    act(() => signedInEvent("fixture-owner-b"));
    await act(async () => {
      await router.navigate({
        to: "/sensors",
        search: { tentId: "tent-b" },
        hash: "manual-reading",
      });
    });
    await screen.findByTestId("private-page");
    const newAccountKey = "verdant:auth:after-automatic-cleanup";
    window.sessionStorage.setItem(newAccountKey, "new-account-draft");
    await flushOldContinuations();
    expect(sdk.hasSession).toBe(true);
    expect(screen.getByTestId("auth-identity")).toHaveTextContent("fixture-owner-b");
    expect(screen.getByTestId("private-page")).toBeInTheDocument();
    expect(router.state.resolvedLocation?.href).toBe("/sensors?tentId=tent-b#manual-reading");
    expect(window.sessionStorage.getItem(newAccountKey)).toBe("new-account-draft");
    expect(sdk.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(welcomeLoader).not.toHaveBeenCalled();
    expect(sdk.authMounts).toBe(1);
    expect(sdk.toastError).not.toHaveBeenCalled();
  });

  it.each(["returned-error", "rejected-promise"])(
    "automatic cleanup failure (%s) keeps the held account behind explicit revalidation recovery without repeating logout",
    async (failureKind) => {
      const firstCleanup = deferred<void>(undefined);
      const unexpectedCleanup = deferred<{ error: null }>({ error: null });
      sdk.signOut
        .mockImplementationOnce(() =>
          firstCleanup.promise.then(() => {
            if (failureKind === "rejected-promise") throw new Error("Fixture cleanup failed");
            return { error: { message: "Fixture cleanup failed" } };
          }),
        )
        // Keep an unexpected repeated cleanup pending so the regression fails
        // deterministically at its count, rather than creating an async loop.
        .mockImplementation(() => unexpectedCleanup.promise);
      const { router, welcomeLoader } = renderRoutes("/sensors?tentId=tent-a#manual-reading");
      await screen.findByTestId("private-page");
      sdk.getUser.mockImplementation(async () => ({
        data: { user: null },
        error: { name: "AuthApiError", status: 401, message: "Fixture bearer rejected" },
      }));
      act(() => window.dispatchEvent(new Event(AUTH_REVALIDATE_EVENT)));
      await waitFor(() => expect(sdk.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" }));
      expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
      expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
      await act(async () => firstCleanup.resolve());
      await waitFor(() =>
        expect(
          screen.queryByTestId("app-shell-revalidation-failed") !== null ||
            sdk.signOut.mock.calls.length > 1,
        ).toBe(true),
      );
      expect(sdk.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
      let recovery = screen.getByTestId("app-shell-revalidation-failed");
      expect(within(recovery).getByRole("button", { name: "Retry" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Reload page" })).not.toBeInTheDocument();
      expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
      expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
      expect(sdk.hasSession).toBe(true);
      expect(sdk.ownerId).toBe("fixture-owner");
      expect(sdk.authMounts).toBe(0);
      expect(welcomeLoader).not.toHaveBeenCalled();

      const validationsBeforeRemount = sdk.getUser.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: "Remount provider" }));
      recovery = await screen.findByTestId("app-shell-revalidation-failed");
      await flushOldContinuations();
      expect(within(recovery).getByRole("button", { name: "Retry" })).toBeEnabled();
      expect(sdk.getUser).toHaveBeenCalledTimes(validationsBeforeRemount);
      expect(sdk.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
      expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
      expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();

      // A deliberate Retry may recover once server validation succeeds; the
      // completed failed SDK cleanup must not run automatically on remount.
      sdk.getUser.mockImplementation(async () => authenticated());
      fireEvent.click(within(recovery).getByRole("button", { name: "Retry" }));
      await screen.findByTestId("private-page");
      await flushOldContinuations();
      expect(router.state.resolvedLocation?.href).toBe("/sensors?tentId=tent-a#manual-reading");
      expect(screen.getByTestId("auth-identity")).toHaveTextContent("fixture-owner");
      expect(sdk.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
      expect(sdk.authMounts).toBe(0);
    },
  );

  it.each(["sdk", "welcome-loader"])(
    "offers reload recovery after 15 seconds of held %s without releasing the active sign-out boundary",
    async (heldPhase) => {
      const sdkGate = deferred<{ error: null }>({ error: null });
      sdk.signOut.mockImplementation(() => {
        signedOutEvent();
        return heldPhase === "sdk" ? sdkGate.promise : Promise.resolve({ error: null });
      });
      const { router, welcomeGate, welcomeLoader } = renderRoutes("/sensors");
      await screen.findByTestId("private-page");
      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
      const dialog = await screen.findByTestId("sign-out-confirm-dialog");
      // Fake only the stalled operation's deadline after the real initial route
      // and session have resolved. No long wall-clock delay or test timeout.
      vi.useFakeTimers();
      fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
      await flushOldContinuations();
      expect(sdk.signOut).toHaveBeenCalledTimes(1);
      await act(async () => vi.advanceTimersByTimeAsync(15_000));
      expect(screen.getByRole("button", { name: "Reload page" })).toBeEnabled();
      expect(screen.queryByTestId("private-page")).not.toBeInTheDocument();
      expect(screen.queryByTestId("public-landing")).not.toBeInTheDocument();
      expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
      expect(sdk.authMounts).toBe(0);
      expect(sdk.signOut).toHaveBeenCalledTimes(1);
      if (heldPhase === "sdk") expect(welcomeLoader).not.toHaveBeenCalled();
      else expect(welcomeLoader).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
      await act(async () => sdkGate.resolve({ error: null }));
      await waitFor(() => expect(welcomeLoader).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();
      await act(async () => welcomeGate.resolve());
      await screen.findByTestId("public-landing");
      expect(router.state.resolvedLocation?.pathname).toBe("/welcome");
      expect(screen.queryByRole("button", { name: "Reload page" })).not.toBeInTheDocument();
      expect(sdk.authMounts).toBe(0);
      expect(sdk.toastError).not.toHaveBeenCalled();
    },
  );
});
