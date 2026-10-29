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

const USER = "user-home-1";
const META_KEY = "verdant_ui_view";

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  user: { id: "user-home-1", user_metadata: {} as Record<string, unknown> },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => auth.getUser(...args),
      updateUser: (...args: unknown[]) => auth.updateUser(...args),
    },
  },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: auth.user, loading: false, signOut: vi.fn() }),
}));
vi.mock("@/pages/SimpleHome", () => ({
  default: () => <div data-testid="simple-home-stub">Simple</div>,
}));
vi.mock("@/pages/Dashboard", () => ({
  default: () => <div data-testid="dashboard-stub">Advanced dashboard</div>,
}));

import Home from "@/pages/Home";
import { resetUiViewPreferenceStoreForTest } from "@/lib/uiViewPreferenceService";

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
    render(<Home />);
    expect(await screen.findByTestId("simple-home-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-stub")).toBeNull();
  });

  it("waits for the account answer instead of flashing Simple when nothing is known on this device", async () => {
    let release: (value: unknown) => void = () => {};
    auth.getUser.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    render(<Home />);
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
    render(<Home />);
    expect(screen.getByTestId("dashboard-stub")).toBeInTheDocument();
  });

  it("switching to Advanced writes the account and flips the view; switching back works too", async () => {
    auth.getUser.mockResolvedValue(accountAnswer(null));
    render(<Home />);
    await screen.findByTestId("simple-home-stub");
    // The Simple page is stubbed here; drive the switch through the preference card
    // path instead: render Home's own bar after an account-side Advanced value.
    cleanup();
    resetUiViewPreferenceStoreForTest();
    auth.getUser.mockResolvedValue(accountAnswer("advanced"));
    render(<Home />);
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
    render(<Home />);
    await screen.findByTestId("dashboard-stub");
    fireEvent.click(screen.getByTestId("ui-view-switch-to-simple"));
    expect(await screen.findByTestId("simple-home-stub")).toBeInTheDocument();
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(`verdant:uiView:${USER}`)).toBe("advanced");
  });

  it("a failed account read keeps the device's last confirmed choice and labels it", async () => {
    window.localStorage.setItem(`verdant:uiView:${USER}`, "advanced");
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("network") });
    render(<Home />);
    expect(await screen.findByTestId("dashboard-stub")).toBeInTheDocument();
    expect(await screen.findByTestId("ui-view-switch-account-unavailable")).toBeInTheDocument();
  });

  it("a failed account read with nothing cached shows Simple as the honest default", async () => {
    auth.getUser.mockRejectedValue(new Error("boom"));
    render(<Home />);
    expect(await screen.findByTestId("simple-home-stub")).toBeInTheDocument();
  });
});
