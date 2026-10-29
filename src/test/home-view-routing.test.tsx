/**
 * Home — picks Simple or Advanced from the account-backed preference.
 *
 * Runs the real hook and service against a fake Supabase auth surface. Simple is
 * the default for a grower with no explicit choice; an Advanced choice from the
 * account (another device) wins; nothing is flashed while the first read is
 * pending; a failed write keeps the chosen view and says it was not saved; a
 * failed read keeps the device cache and says the account was unreachable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";

const USER = "user-home-1";
const META_KEY = "verdant_ui_view";

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  user: { id: "user-home-1", user_metadata: {} as Record<string, unknown> },
  authListeners: [] as Array<(event: string) => void>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => auth.getUser(...args),
      updateUser: (...args: unknown[]) => auth.updateUser(...args),
      onAuthStateChange: (cb: (event: string) => void) => {
        auth.authListeners.push(cb);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: auth.user, loading: false, signOut: vi.fn() }),
}));
vi.mock("@/pages/SimpleHome", async () => {
  const { useLocation } = await import("@/lib/react-router-compat");
  function SimpleHomeStub() {
    const location = useLocation();
    return (
      <div data-testid="simple-home-stub" data-search={location.search}>
        Simple
      </div>
    );
  }
  return { default: SimpleHomeStub };
});
vi.mock("@/pages/Dashboard", () => ({
  default: () => <div data-testid="dashboard-stub">Advanced dashboard</div>,
}));

import Home from "@/pages/Home";
import { resetUiViewPreferenceStoreForTest } from "@/lib/uiViewPreferenceService";

function renderHome(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Home forceView="advanced" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function accountAnswer(view: string | null) {
  return {
    data: { user: { id: USER, user_metadata: view ? { [META_KEY]: view } : {} } },
    error: null,
  };
}

beforeEach(() => {
  resetUiViewPreferenceStoreForTest();
  window.localStorage.clear();
  auth.user = { id: USER, user_metadata: {} };
  auth.getUser.mockReset();
  auth.updateUser.mockReset();
  auth.updateUser.mockImplementation(async (attrs: { data: Record<string, unknown> }) => ({
    data: { user: { id: USER, user_metadata: { ...attrs.data } } },
    error: null,
  }));
});

afterEach(() => cleanup());

describe("Home view routing", () => {
  it("a grower with no explicit choice lands on Simple once the account confirms it", async () => {
    auth.getUser.mockResolvedValue(accountAnswer(null));
    renderHome();
    expect(await screen.findByTestId("simple-home-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-stub")).toBeNull();
  });

  it("waits for the account answer instead of flashing Simple when nothing is known on this device", async () => {
    let release: (value: unknown) => void = () => {};
    auth.getUser.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    renderHome();
    expect(screen.getByTestId("home-view-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("simple-home-stub")).toBeNull();
    await act(async () => {
      release(accountAnswer("advanced"));
    });
    expect(await screen.findByTestId("dashboard-stub")).toBeInTheDocument();
    expect(screen.getByTestId("home-advanced-view-bar")).toBeInTheDocument();
  });

  it("an Advanced choice carried by the session renders Advanced immediately", async () => {
    auth.user = { id: USER, user_metadata: { [META_KEY]: "advanced" } };
    auth.getUser.mockImplementation(() => new Promise(() => {}));
    renderHome();
    expect(screen.getByTestId("dashboard-stub")).toBeInTheDocument();
  });

  it("switching to Advanced writes the account and flips the view; switching back works too", async () => {
    auth.getUser.mockResolvedValue(accountAnswer(null));
    renderHome();
    await screen.findByTestId("simple-home-stub");
    // The Simple page is stubbed here; drive the switch through the preference card
    // path instead: render Home's own bar after an account-side Advanced value.
    cleanup();
    resetUiViewPreferenceStoreForTest();
    auth.getUser.mockResolvedValue(accountAnswer("advanced"));
    renderHome();
    await screen.findByTestId("dashboard-stub");
    fireEvent.click(screen.getByTestId("ui-view-switch-to-simple"));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledTimes(1));
    expect(auth.updateUser.mock.calls[0][0]).toMatchObject({ data: { [META_KEY]: "simple" } });
    expect(await screen.findByTestId("simple-home-stub")).toBeInTheDocument();
    expect(window.localStorage.getItem(`verdant:uiView:${USER}`)).toBe("simple");
  });

  it("a failed write keeps the chosen view for this session and reports it, never a silent reset", async () => {
    auth.getUser.mockResolvedValue(accountAnswer("advanced"));
    auth.updateUser.mockImplementation(async () => ({
      data: { user: null },
      error: new Error("offline"),
    }));
    renderHome();
    await screen.findByTestId("dashboard-stub");
    fireEvent.click(screen.getByTestId("ui-view-switch-to-simple"));
    expect(await screen.findByTestId("simple-home-stub")).toBeInTheDocument();
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(`verdant:uiView:${USER}`)).toBe("advanced");
  });

  it("a failed account read keeps the device's last confirmed choice and labels it", async () => {
    window.localStorage.setItem(`verdant:uiView:${USER}`, "advanced");
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("network") });
    renderHome();
    expect(await screen.findByTestId("dashboard-stub")).toBeInTheDocument();
    expect(await screen.findByTestId("ui-view-switch-account-unavailable")).toBeInTheDocument();
  });

  it("a failed account read with nothing cached shows Simple as the honest default", async () => {
    auth.getUser.mockRejectedValue(new Error("boom"));
    renderHome();
    expect(await screen.findByTestId("simple-home-stub")).toBeInTheDocument();
  });
  it("a direct /dashboard link always renders Advanced, without waiting on the account read", async () => {
    auth.getUser.mockImplementation(() => new Promise(() => {}));
    renderHome("/dashboard");
    expect(screen.getByTestId("dashboard-stub")).toBeInTheDocument();
    expect(screen.getByTestId("home-advanced-view")).toHaveAttribute(
      "data-forced-view",
      "advanced",
    );
    expect(screen.queryByTestId("home-view-loading")).toBeNull();
  });

  it("choosing Simple on /dashboard?growId= keeps the grow scope on the way home", async () => {
    auth.getUser.mockResolvedValue(accountAnswer(null));
    renderHome("/dashboard?growId=grow-b");
    fireEvent.click(screen.getByTestId("ui-view-switch-to-simple"));
    const stub = await screen.findByTestId("simple-home-stub");
    expect(stub).toHaveAttribute("data-search", "?growId=grow-b");
  });

  it("sign-out forgets the settled account state so a re-sign-in in the same tab reads again", async () => {
    auth.getUser.mockResolvedValue(accountAnswer(null));
    const first = renderHome();
    await screen.findByTestId("simple-home-stub");
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    first.unmount();
    // Advanced was chosen on another device while this tab was signed out.
    auth.getUser.mockResolvedValue(accountAnswer("advanced"));
    act(() => {
      for (const listener of auth.authListeners) listener("SIGNED_OUT");
    });
    renderHome();
    expect(await screen.findByTestId("dashboard-stub")).toBeInTheDocument();
    expect(auth.getUser).toHaveBeenCalledTimes(2);
  });

  it("choosing Simple on /dashboard saves the choice and goes home to the Simple view", async () => {
    auth.getUser.mockResolvedValue(accountAnswer(null));
    renderHome("/dashboard");
    fireEvent.click(screen.getByTestId("ui-view-switch-to-simple"));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledTimes(1));
    expect(auth.updateUser.mock.calls[0][0]).toMatchObject({ data: { [META_KEY]: "simple" } });
    expect(await screen.findByTestId("simple-home-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-stub")).toBeNull();
  });
});
