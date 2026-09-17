import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "@/pages/Settings";
import { AuthProvider, useAuth } from "@/store/auth";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { getAuthSignOutOperation } from "@/lib/authSignOutOperationService";
import { supabase } from "@/integrations/supabase/client";
import { DELETE_ACCOUNT_GENERIC_FAILURE } from "@/lib/accountDeletion";
import * as accountDeletion from "@/lib/accountDeletion";
import { useNavigate } from "@/lib/react-router-compat";

const sdk = vi.hoisted(() => ({
  ownerId: "fixture-owner-a" as string | null,
  invoke: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  welcomeLoads: vi.fn(),
  toastError: vi.fn(),
  listeners: [] as Array<(event: string, session: unknown) => void>,
}));

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
    functions: { invoke: (...args: unknown[]) => sdk.invoke(...args) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Preserve real Settings, the typed confirmation dialog, AuthProvider and the
// account-deletion helper. Unrelated settings tiles have no network behavior.
vi.mock("@/lib/customerPortal", () => ({
  useOpenCustomerPortalState: () => ({
    opening: false,
    error: null,
    open: vi.fn(),
    clearError: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePaddleCancelNotice", () => ({
  usePaddleCancelNotice: () => ({ visible: false }),
}));
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { displayPlanId: "free" },
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/AccountPlanBadge", () => ({ default: () => null }));
vi.mock("@/components/RewardedReferralCard", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { error: sdk.toastError, success: vi.fn() } }));

type DeleteResponse = { data: { ok: boolean; error?: string } | null; error: unknown };
const successfulDeletion: DeleteResponse = { data: { ok: true }, error: null };
const pendingReleases: Array<() => void> = [];
const originalLocation = window.location;

function deferredDeletion() {
  let resolve!: (value: DeleteResponse) => void;
  const promise = new Promise<DeleteResponse>((release) => {
    resolve = release;
  });
  pendingReleases.push(() => resolve({ data: null, error: new Error("Fixture cleanup") }));
  return { promise, resolve };
}

function deferred<T>(cleanupValue: T) {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((release) => {
    resolve = release;
  });
  pendingReleases.push(() => resolve(cleanupValue));
  return { promise, resolve };
}

function currentSession() {
  if (!sdk.ownerId) return null;
  return {
    access_token: `fixture-access-${sdk.ownerId}`,
    refresh_token: `fixture-refresh-${sdk.ownerId}`,
    token_type: "bearer",
    expires_in: 3600,
    user: {
      id: sdk.ownerId,
      email: `${sdk.ownerId}@example.invalid`,
      email_confirmed_at: "2026-09-01T00:00:00Z",
    },
  };
}

function changeAccount(ownerId: string | null) {
  sdk.ownerId = ownerId;
  for (const listener of [...sdk.listeners]) {
    listener(ownerId ? "SIGNED_IN" : "SIGNED_OUT", currentSession());
  }
}

function Identity() {
  const { user, loading } = useAuth();
  return (
    <output data-testid="current-account">{loading ? "loading" : (user?.id ?? "none")}</output>
  );
}

function Welcome() {
  const navigate = useNavigate();
  return (
    <section data-testid="welcome-page">
      <button onClick={() => navigate("/auth")}>Sign in</button>
    </section>
  );
}

function SignInForm() {
  return (
    <form aria-label="Sign-in form">
      <label>
        Email
        <input name="email" />
      </label>
      <label>
        Password
        <input name="password" type="password" />
      </label>
    </form>
  );
}

function renderSettings(options?: {
  holdWelcome?: boolean;
  bridgeDocumentNavigation?: boolean;
  holdOther?: boolean;
  redirectOtherToSettings?: boolean;
}) {
  const welcomeGate = deferred<void>(undefined);
  const otherGate = deferred<void>(undefined);
  const otherLoader = vi.fn(async () => {
    if (options?.holdOther) await otherGate.promise;
    if (options?.redirectOtherToSettings) throw redirect({ to: "/settings" });
  });
  const welcomeLoader = vi.fn(async () => {
    sdk.welcomeLoads();
    if (options?.holdWelcome) await welcomeGate.promise;
  });
  const root = createRootRoute({
    component: () => (
      <AuthProvider>
        <Identity />
        <Outlet />
      </AuthProvider>
    ),
  });
  const settings = createRoute({
    getParentRoute: () => root,
    path: "/settings",
    component: Settings,
  });
  const other = createRoute({
    getParentRoute: () => root,
    path: "/plants",
    loader: otherLoader,
    component: () => <div data-testid="other-page">Other account page</div>,
  });
  const welcome = createRoute({
    getParentRoute: () => root,
    path: "/welcome",
    loader: welcomeLoader,
    component: Welcome,
  });
  const auth = createRoute({ getParentRoute: () => root, path: "/auth", component: SignInForm });
  const router = createRouter({
    routeTree: root.addChildren([settings, other, welcome, auth]),
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
    defaultPendingMs: 60_000,
  });
  if (options?.bridgeDocumentNavigation) {
    // Model the legacy browser navigation request without leaving jsdom. Its
    // completion is the same real held route commit the replacement code must
    // await; the actual compat navigate path does not call this fallback.
    sdk.replace.mockImplementation(() => router.navigate({ to: "/welcome", replace: true }));
  }
  const view = render(<RouterProvider router={router} />);
  return {
    ...view,
    router,
    welcomeGate,
    welcomeLoader,
    otherGate,
    otherLoader,
    leaveSettings: async () => {
      await act(async () => {
        await router.navigate({ to: "/plants" });
      });
    },
  };
}

async function openConfirmation(typed = "DELETE") {
  await waitFor(() =>
    expect(screen.getByTestId("current-account")).toHaveTextContent("fixture-owner-a"),
  );
  fireEvent.click(screen.getByTestId("settings-delete-account"));
  fireEvent.change(await screen.findByTestId("settings-delete-account-confirm-input"), {
    target: { value: typed },
  });
  return screen.getByTestId("settings-delete-account-confirm");
}

async function startDeletion() {
  fireEvent.click(await openConfirmation());
  await waitFor(() => expect(sdk.invoke).toHaveBeenCalledTimes(1));
  expect(sdk.invoke.mock.calls[0][0]).toBe("delete-account");
  expect(sdk.invoke.mock.calls[0][1]).toMatchObject({ body: { confirm: "DELETE" } });
}

async function flushContinuations() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  getAuthSignOutOperation(supabase.auth).clearFailedCleanup();
  window.sessionStorage.clear();
  sdk.ownerId = "fixture-owner-a";
  sdk.listeners = [];
  sdk.replace.mockReset();
  sdk.welcomeLoads.mockReset();
  sdk.toastError.mockReset();
  sdk.invoke.mockReset().mockResolvedValue(successfulDeletion);
  sdk.getSession.mockReset().mockImplementation(async () => ({
    data: { session: currentSession() },
    error: null,
  }));
  sdk.getUser.mockReset().mockImplementation(async () => ({
    data: { user: currentSession()?.user ?? null },
    error: null,
  }));
  sdk.signOut.mockReset().mockImplementation(async () => {
    changeAccount(null);
    return { error: null };
  });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      href: "https://example.invalid/settings",
      origin: "https://example.invalid",
      pathname: "/settings",
      search: "",
      hash: "",
      replace: sdk.replace,
    },
  });
});

afterEach(async () => {
  cleanup();
  for (const release of pendingReleases.splice(0)) release();
  await flushContinuations();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("account deletion completion belongs to its initiating account and mounted Settings", () => {
  it("cannot sign out account B or redirect after A leaves Settings with a deletion response pending", async () => {
    const deletion = deferredDeletion();
    sdk.invoke.mockReturnValueOnce(deletion.promise);
    const view = renderSettings();
    await startDeletion();
    await view.leaveSettings();
    act(() => changeAccount("fixture-owner-b"));
    await waitFor(() =>
      expect(screen.getByTestId("current-account")).toHaveTextContent("fixture-owner-b"),
    );
    window.sessionStorage.setItem("verdant:auth:new-account-draft", "keep-b");
    await act(async () => deletion.resolve(successfulDeletion));
    await flushContinuations();
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(sdk.replace).not.toHaveBeenCalled();
    expect(sdk.welcomeLoads).not.toHaveBeenCalled();
    expect(sdk.ownerId).toBe("fixture-owner-b");
    expect(screen.getByTestId("other-page")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("verdant:auth:new-account-draft")).toBe("keep-b");
    expect(sdk.toastError).not.toHaveBeenCalled();
  });

  it("does not revive A's old deletion completion after the mounted account changes A to B to A", async () => {
    const deletion = deferredDeletion();
    sdk.invoke.mockReturnValueOnce(deletion.promise);
    renderSettings();
    await startDeletion();
    act(() => changeAccount("fixture-owner-b"));
    await waitFor(() =>
      expect(screen.getByTestId("current-account")).toHaveTextContent("fixture-owner-b"),
    );
    act(() => changeAccount("fixture-owner-a"));
    await waitFor(() =>
      expect(screen.getByTestId("current-account")).toHaveTextContent("fixture-owner-a"),
    );
    await act(async () => deletion.resolve(successfulDeletion));
    await flushContinuations();
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(sdk.replace).not.toHaveBeenCalled();
    expect(sdk.welcomeLoads).not.toHaveBeenCalled();
    expect(sdk.ownerId).toBe("fixture-owner-a");
  });

  it("signs out and replaces with welcome after same-owner confirmed deletion succeeds", async () => {
    const view = renderSettings();
    await startDeletion();
    await screen.findByTestId("welcome-page");
    expect(view.router.state.resolvedLocation?.pathname).toBe("/welcome");
    expect(view.router.history.length).toBe(1);
    expect(sdk.replace).not.toHaveBeenCalled();
    expect(sdk.welcomeLoads).toHaveBeenCalledTimes(1);
    expect(sdk.signOut).toHaveBeenCalledTimes(1);
    expect(sdk.ownerId).toBeNull();
  });

  it("retains deletion ownership through a same-owner TOKEN_REFRESHED event", async () => {
    const deletion = deferredDeletion();
    sdk.invoke.mockReturnValueOnce(deletion.promise);
    const view = renderSettings();
    await startDeletion();
    act(() => {
      for (const listener of [...sdk.listeners]) listener("TOKEN_REFRESHED", currentSession());
    });
    await flushContinuations();
    expect(screen.getByTestId("current-account")).toHaveTextContent("fixture-owner-a");
    await act(async () => deletion.resolve(successfulDeletion));
    await screen.findByTestId("welcome-page");
    expect(view.router.state.resolvedLocation?.pathname).toBe("/welcome");
    expect(view.router.history.length).toBe(1);
    expect(sdk.signOut).toHaveBeenCalledTimes(1);
    expect(sdk.toastError).not.toHaveBeenCalled();
  });

  it.each(["SIGNED_IN", "SIGNED_OUT"])(
    "cleans the held account after another tab relays %s to the mounted provider",
    async (event) => {
      const deletion = deferredDeletion();
      sdk.invoke.mockReturnValueOnce(deletion.promise);
      const view = renderSettings();
      await startDeletion();
      const heldSession = currentSession();
      const delivered =
        event === "SIGNED_IN"
          ? {
              ...heldSession,
              access_token: "fixture-access-foreign-b",
              user: { ...heldSession?.user, id: "fixture-owner-b" },
            }
          : null;
      act(() => {
        for (const listener of [...sdk.listeners]) listener(event, delivered);
      });
      await flushContinuations();
      expect(sdk.ownerId).toBe("fixture-owner-a");
      expect(view.router.state.resolvedLocation?.pathname).toBe("/settings");
      await act(async () => deletion.resolve(successfulDeletion));
      await screen.findByTestId("welcome-page");
      expect(sdk.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
      expect(sdk.ownerId).toBeNull();
      expect(view.router.state.resolvedLocation?.pathname).toBe("/welcome");
    },
  );

  it("does not revive deletion ownership after SIGNED_OUT followed by a new sign-in as the same A", async () => {
    const deletion = deferredDeletion();
    sdk.invoke.mockReturnValueOnce(deletion.promise);
    renderSettings();
    await startDeletion();
    act(() => changeAccount(null));
    await waitFor(() => expect(screen.getByTestId("current-account")).toHaveTextContent("none"));
    act(() => changeAccount("fixture-owner-a"));
    await waitFor(() =>
      expect(screen.getByTestId("current-account")).toHaveTextContent("fixture-owner-a"),
    );
    await act(async () => deletion.resolve(successfulDeletion));
    await flushContinuations();
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(sdk.replace).not.toHaveBeenCalled();
    expect(sdk.welcomeLoads).not.toHaveBeenCalled();
    expect(sdk.toastError).not.toHaveBeenCalled();
    expect(sdk.ownerId).toBe("fixture-owner-a");
  });

  it("invalidates completion when Settings is left even if the same account remains current", async () => {
    const deletion = deferredDeletion();
    sdk.invoke.mockReturnValueOnce(deletion.promise);
    const view = renderSettings();
    await startDeletion();
    await view.leaveSettings();
    expect(screen.getByTestId("current-account")).toHaveTextContent("fixture-owner-a");
    await act(async () => deletion.resolve(successfulDeletion));
    await flushContinuations();
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(sdk.replace).not.toHaveBeenCalled();
    expect(sdk.welcomeLoads).not.toHaveBeenCalled();
    expect(view.router.state.resolvedLocation?.pathname).toBe("/plants");
  });

  it("still cleans up a confirmed deletion when an attempted navigation resolves back to Settings", async () => {
    const deletion = deferredDeletion();
    sdk.invoke.mockReturnValueOnce(deletion.promise);
    const view = renderSettings({ redirectOtherToSettings: true });
    await startDeletion();
    await waitFor(() => expect(view.router.state.status).toBe("idle"));
    await view.leaveSettings();
    expect(view.otherLoader).toHaveBeenCalledTimes(1);
    expect(view.router.state.resolvedLocation?.pathname).toBe("/settings");
    expect(screen.getByTestId("settings-delete-account-confirm")).toBeDisabled();

    await act(async () => deletion.resolve(successfulDeletion));
    await screen.findByTestId("welcome-page");
    expect(sdk.ownerId).toBeNull();
    expect(sdk.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(view.router.state.resolvedLocation?.pathname).toBe("/welcome");
  });

  it("does not abandon deletion while a different route is pending and Settings is still committed", async () => {
    const deletion = deferredDeletion();
    sdk.invoke.mockReturnValueOnce(deletion.promise);
    const view = renderSettings({ holdOther: true });
    await startDeletion();
    await waitFor(() => expect(view.router.state.status).toBe("idle"));
    let attemptedNavigation!: Promise<void>;
    await act(async () => {
      attemptedNavigation = view.router.navigate({ to: "/plants" });
    });
    await waitFor(() => expect(view.otherLoader).toHaveBeenCalledTimes(1));
    expect(view.router.state.status).toBe("pending");
    expect(view.router.state.resolvedLocation?.pathname).toBe("/settings");
    expect(screen.getByTestId("settings-delete-account-confirm")).toBeDisabled();

    await act(async () => deletion.resolve(successfulDeletion));
    await screen.findByTestId("welcome-page");
    expect(sdk.ownerId).toBeNull();
    expect(sdk.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    await act(async () => {
      view.otherGate.resolve();
      await attemptedNavigation;
    });
    expect(view.router.state.resolvedLocation?.pathname).toBe("/welcome");
    expect(screen.getByTestId("welcome-page")).toBeInTheDocument();
  });

  it("does not dispatch deletion when a held initiating session read returns A after the current account became B", async () => {
    const deletion = deferredDeletion();
    sdk.invoke.mockReturnValueOnce(deletion.promise);
    renderSettings();
    const confirm = await openConfirmation();
    const read = deferred({ data: { session: currentSession() }, error: null });
    const staleSession = { data: { session: currentSession() }, error: null };
    sdk.getSession.mockReturnValueOnce(read.promise);
    fireEvent.click(confirm);
    await flushContinuations();
    act(() => changeAccount("fixture-owner-b"));
    await waitFor(() =>
      expect(screen.getByTestId("current-account")).toHaveTextContent("fixture-owner-b"),
    );
    await act(async () => read.resolve(staleSession));
    await flushContinuations();
    expect(sdk.invoke).not.toHaveBeenCalled();
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(sdk.replace).not.toHaveBeenCalled();
    expect(sdk.welcomeLoads).not.toHaveBeenCalled();
  });

  it("pins the initiating A authorization on the deletion dispatch even when its response arrives under B", async () => {
    const deletion = deferredDeletion();
    sdk.invoke.mockReturnValueOnce(deletion.promise);
    renderSettings();
    await startDeletion();
    expect(sdk.invoke.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: "Bearer fixture-access-fixture-owner-a" },
    });
    act(() => changeAccount("fixture-owner-b"));
    await waitFor(() =>
      expect(screen.getByTestId("current-account")).toHaveTextContent("fixture-owner-b"),
    );
    await act(async () => deletion.resolve(successfulDeletion));
    await flushContinuations();
    expect(sdk.invoke).toHaveBeenCalledTimes(1);
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(sdk.replace).not.toHaveBeenCalled();
    expect(sdk.welcomeLoads).not.toHaveBeenCalled();
  });

  it("retains the cleanup entry mask across its expected Settings unmount and completes same-owner welcome", async () => {
    const logout = deferred<{ error: null }>({ error: null });
    sdk.signOut.mockImplementation(() => {
      changeAccount(null);
      return logout.promise;
    });
    const view = renderSettings();
    await startDeletion();
    await waitFor(() => expect(sdk.signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("settings-delete-account")).not.toBeInTheDocument();
    expect(screen.queryByTestId("current-account")).not.toBeInTheDocument();
    expect(sdk.replace).not.toHaveBeenCalled();
    expect(sdk.welcomeLoads).not.toHaveBeenCalled();
    await act(async () => logout.resolve({ error: null }));
    await screen.findByTestId("welcome-page");
    expect(view.router.state.resolvedLocation?.pathname).toBe("/welcome");
    expect(view.router.history.length).toBe(1);
    expect(sdk.signOut).toHaveBeenCalledTimes(1);
  });

  it("retains the auth entry fence after successful SDK cleanup until the welcome navigation commits", async () => {
    const view = renderSettings({ holdWelcome: true, bridgeDocumentNavigation: true });
    await startDeletion();
    await waitFor(() => expect(view.welcomeLoader).toHaveBeenCalledTimes(1));
    expect(sdk.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(sdk.ownerId).toBeNull();
    expect(view.router.state.status).toBe("pending");
    expect(getAuthSignOutOperation(supabase.auth).getSnapshot()).toBe("pending");
    expect(screen.queryByTestId("current-account")).not.toBeInTheDocument();
    expect(screen.queryByTestId("settings-delete-account")).not.toBeInTheDocument();
    expect(screen.queryByTestId("welcome-page")).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Sign-in form" })).not.toBeInTheDocument();

    await act(async () => view.welcomeGate.resolve());
    await screen.findByTestId("welcome-page");
    expect(view.router.state.resolvedLocation?.pathname).toBe("/welcome");
    expect(getAuthSignOutOperation(supabase.auth).getSnapshot()).toBe("idle");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const email = await screen.findByLabelText("Email");
    const password = screen.getByLabelText("Password");
    fireEvent.change(email, { target: { value: "new-owner@example.invalid" } });
    fireEvent.change(password, { target: { value: "fixture-password-only" } });
    await flushContinuations();
    expect(view.router.state.resolvedLocation?.pathname).toBe("/auth");
    expect(screen.getByLabelText("Email")).toBe(email);
    expect(email).toHaveValue("new-owner@example.invalid");
    expect(password).toHaveValue("fixture-password-only");
    expect(sdk.signOut).toHaveBeenCalledTimes(1);
    expect(sdk.toastError).not.toHaveBeenCalled();
  });

  it("does not revive welcome navigation after leaving and returning to Settings during SDK cleanup", async () => {
    const logout = deferred<{ error: null }>({ error: null });
    sdk.signOut.mockImplementation(() => {
      changeAccount(null);
      return logout.promise;
    });
    const view = renderSettings();
    await startDeletion();
    await waitFor(() => expect(sdk.signOut).toHaveBeenCalledTimes(1));
    await view.leaveSettings();
    await act(async () => {
      await view.router.navigate({ to: "/settings" });
    });
    await act(async () => logout.resolve({ error: null }));
    await flushContinuations();
    expect(view.router.state.resolvedLocation?.pathname).toBe("/settings");
    expect(sdk.replace).not.toHaveBeenCalled();
    expect(sdk.welcomeLoads).not.toHaveBeenCalled();
    expect(sdk.signOut).toHaveBeenCalledTimes(1);
  });

  it("does not reuse A's typed confirmation after Settings changes to account B", async () => {
    renderSettings();
    const confirm = await openConfirmation();
    act(() => changeAccount("fixture-owner-b"));
    await waitFor(() =>
      expect(screen.getByTestId("current-account")).toHaveTextContent("fixture-owner-b"),
    );
    fireEvent.click(confirm);
    await flushContinuations();
    expect(sdk.invoke).not.toHaveBeenCalled();
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(sdk.replace).not.toHaveBeenCalled();
    expect(sdk.welcomeLoads).not.toHaveBeenCalled();
    expect(screen.queryByTestId("settings-delete-account-dialog")).not.toBeInTheDocument();
  });

  it.each(["returned-error", "rejected-promise"])(
    "reports confirmed deletion but unconfirmed cleanup after SDK %s and retains the failure latch",
    async (failureKind) => {
      const actualRequest = vi.spyOn(accountDeletion, "requestAccountDeletion");
      sdk.signOut.mockImplementation(async () => {
        if (failureKind === "rejected-promise") throw new Error("Fixture cleanup rejected");
        return { error: { message: "Fixture cleanup failed" } };
      });
      renderSettings();
      await startDeletion();
      await waitFor(() => expect(actualRequest).toHaveBeenCalledTimes(1));
      // Spy only: this awaits the real helper invoked by actual Settings. No
      // replacement implementation can manufacture its partial-success result.
      const result = await actualRequest.mock.results[0].value;
      expect(result).toMatchObject({
        ok: true,
        disposition: "cleanup_unconfirmed",
        error:
          "Your account was deleted, but we couldn't confirm this browser signed out. Reload the page before continuing.",
      });
      expect(result).not.toMatchObject({ error: DELETE_ACCOUNT_GENERIC_FAILURE });
      expect(sdk.signOut).toHaveBeenCalledTimes(1);
      expect(sdk.replace).not.toHaveBeenCalled();
      expect(sdk.welcomeLoads).not.toHaveBeenCalled();
      expect(getAuthSignOutOperation(supabase.auth).hasFailedCleanup()).toBe(true);
      expect(sdk.ownerId).toBe("fixture-owner-a");
      expect(sdk.toastError).toHaveBeenCalledExactlyOnceWith(
        "Your account was deleted, but we couldn't confirm this browser signed out. Reload the page before continuing.",
      );
    },
  );

  it.each(["pending", "stalled"])(
    "does not append deletion cleanup to an unrelated %s SDK logout or release its entry fence",
    async (phase) => {
      const deletion = deferredDeletion();
      const otherLogout = deferred<{ error: null }>({ error: null });
      sdk.invoke.mockReturnValueOnce(deletion.promise);
      sdk.signOut.mockReturnValueOnce(otherLogout.promise);
      renderSettings();
      await startDeletion();
      const operation = getAuthSignOutOperation(supabase.auth);
      if (phase === "stalled") vi.useFakeTimers();
      let otherCompletion!: Promise<{ error: unknown }>;
      await act(async () => {
        otherCompletion = operation.runSdkSignOut(() => supabase.auth.signOut({ scope: "local" }));
      });
      if (phase === "stalled") await act(async () => vi.advanceTimersByTimeAsync(15_000));
      expect(operation.getSnapshot()).toBe(phase);
      await act(async () => deletion.resolve(successfulDeletion));
      await flushContinuations();
      expect(sdk.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
      expect(sdk.invoke).toHaveBeenCalledTimes(1);
      expect(sdk.replace).not.toHaveBeenCalled();
      expect(sdk.welcomeLoads).not.toHaveBeenCalled();
      expect(operation.getSnapshot()).toBe(phase);
      expect(screen.queryByTestId("settings-delete-account")).not.toBeInTheDocument();
      vi.useRealTimers();
      await act(async () => {
        otherLogout.resolve({ error: null });
        await otherCompletion;
      });
      expect(sdk.signOut).toHaveBeenCalledTimes(1);
      expect(sdk.replace).not.toHaveBeenCalled();
      expect(sdk.welcomeLoads).not.toHaveBeenCalled();
    },
  );

  it.each(["held-session", "read-error"])(
    "requires an authoritative cleared session after SDK success instead of accepting %s",
    async (readOutcome) => {
      const actualRequest = vi.spyOn(accountDeletion, "requestAccountDeletion");
      sdk.signOut.mockImplementation(async () => {
        if (readOutcome === "read-error") {
          sdk.getSession.mockResolvedValueOnce({
            data: { session: null },
            error: new Error("Fixture post-cleanup read failed"),
          });
        }
        // The SDK response alone does not prove it dropped its cached session.
        return { error: null };
      });
      renderSettings();
      await startDeletion();
      const result = await actualRequest.mock.results[0].value;
      expect(result).toMatchObject({ ok: true, disposition: "cleanup_unconfirmed" });
      expect(sdk.signOut).toHaveBeenCalledTimes(1);
      expect(sdk.replace).not.toHaveBeenCalled();
      expect(sdk.welcomeLoads).not.toHaveBeenCalled();
      expect(getAuthSignOutOperation(supabase.auth).hasFailedCleanup()).toBe(true);
      expect(sdk.toastError).toHaveBeenCalledExactlyOnceWith(
        "Your account was deleted, but we couldn't confirm this browser signed out. Reload the page before continuing.",
      );
    },
  );

  it("does not dispatch deletion, append logout or clear a prior failed cleanup awaiting explicit recovery", async () => {
    const operation = getAuthSignOutOperation(supabase.auth);
    await operation
      .runSdkSignOut(() => Promise.reject(new Error("Earlier cleanup failed")))
      .catch(() => undefined);
    expect(operation.hasFailedCleanup()).toBe(true);
    renderSettings();
    fireEvent.click(await openConfirmation());
    await flushContinuations();
    expect(sdk.invoke).not.toHaveBeenCalled();
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(sdk.replace).not.toHaveBeenCalled();
    expect(sdk.welcomeLoads).not.toHaveBeenCalled();
    expect(operation.hasFailedCleanup()).toBe(true);
    expect(operation.getSnapshot()).toBe("idle");
  });

  it.each(["returned-error", "rejected-promise"])(
    "does not sign out or navigate after deletion %s",
    async (failure) => {
      if (failure === "rejected-promise")
        sdk.invoke.mockRejectedValueOnce(new Error("Fixture error"));
      else sdk.invoke.mockResolvedValueOnce({ data: null, error: new Error("Fixture error") });
      renderSettings();
      await startDeletion();
      expect(await screen.findByRole("alert")).toHaveTextContent(DELETE_ACCOUNT_GENERIC_FAILURE);
      expect(sdk.signOut).not.toHaveBeenCalled();
      expect(sdk.replace).not.toHaveBeenCalled();
      expect(sdk.welcomeLoads).not.toHaveBeenCalled();
      expect(sdk.ownerId).toBe("fixture-owner-a");
    },
  );

  it("does not invoke deletion when typed confirmation is not the exact required literal", async () => {
    renderSettings();
    const confirm = await openConfirmation("delete");
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    await flushContinuations();
    expect(sdk.invoke).not.toHaveBeenCalled();
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(sdk.replace).not.toHaveBeenCalled();
    expect(sdk.welcomeLoads).not.toHaveBeenCalled();
  });

  it("dispatches one deletion for duplicate clicks while the original request is pending", async () => {
    const deletion = deferredDeletion();
    sdk.invoke.mockReturnValueOnce(deletion.promise);
    const view = renderSettings();
    const confirm = await openConfirmation();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(sdk.invoke).toHaveBeenCalledTimes(1));
    expect(confirm).toBeDisabled();
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(sdk.replace).not.toHaveBeenCalled();
    expect(sdk.welcomeLoads).not.toHaveBeenCalled();
    await act(async () => deletion.resolve(successfulDeletion));
    await screen.findByTestId("welcome-page");
    expect(view.router.state.resolvedLocation?.pathname).toBe("/welcome");
    expect(view.router.history.length).toBe(1);
    expect(sdk.invoke).toHaveBeenCalledTimes(1);
    expect(sdk.signOut).toHaveBeenCalledTimes(1);
  });
});
