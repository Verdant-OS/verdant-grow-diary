import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "@/lib/react-router-compat";
import { QUICK_LOG_START_ROOM_TIMEOUT_MS } from "@/lib/quickLogStartScreenTargetRules";
import { setStartScreenChoice } from "@/lib/startScreenPreferences";
import { clearLocalStorageForTest } from "@/test/helpers/localStorageTestHelper";

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  signIn: vi.fn(),
  signUp: vi.fn(),
  oauth: vi.fn(),
  plants: vi.fn(),
  tents: vi.fn(),
  grows: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: h.user, session: null, loading: false, signOut: vi.fn() }),
}));

vi.mock("@/hooks/use-plants", () => ({
  fetchPlants: (...args: unknown[]) => h.plants(...args),
}));

vi.mock("@/hooks/use-tents", () => ({
  fetchTents: (...args: unknown[]) => h.tents(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => h.signIn(...args),
      signUp: (...args: unknown[]) => h.signUp(...args),
      resetPasswordForEmail: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => h.grows(),
    }),
  },
}));

vi.mock("@/integrations/lovable/index", () => ({
  lovable: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => h.oauth(...args),
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Auth from "@/pages/Auth";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function ReturnToAuth() {
  const nav = useNavigate();
  return (
    <button type="button" onClick={() => nav("/auth")}>
      Return to auth
    </button>
  );
}

function AuthHarness({ entry, persistAuth = false }: { entry: string; persistAuth?: boolean }) {
  const [userId, setUserId] = useState<string | null>(h.user?.id ?? null);
  h.user = userId ? { id: userId } : null;
  const auth = <Auth />;
  return (
    <MemoryRouter initialEntries={[entry]}>
      <button type="button" onClick={() => setUserId("user-1")}>
        Commit session
      </button>
      <button type="button" onClick={() => setUserId("user-2")}>
        Switch user
      </button>
      <ReturnToAuth />
      {persistAuth ? auth : null}
      <Routes>
        <Route path="/auth" element={persistAuth ? <div>Auth route</div> : auth} />
        <Route path="/grows" element={<div>Grows</div>} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
        <Route path="/onboarding" element={<div>Onboarding</div>} />
        <Route path="/plants/:plantId" element={<div>Plant</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

function renderAuth(entry: string, persistAuth = false) {
  return render(<AuthHarness entry={entry} persistAuth={persistAuth} />);
}

beforeEach(() => {
  h.user = null;
  h.signIn.mockReset();
  h.signUp.mockReset();
  h.oauth.mockReset();
  h.plants.mockReset();
  h.tents.mockReset();
  h.grows.mockReset();
  h.signIn.mockResolvedValue({ data: { session: { user: { id: "user-1" } } }, error: null });
  h.signUp.mockResolvedValue({
    data: { user: { id: "user-1" }, session: { user: { id: "user-1" } } },
    error: null,
  });
  h.oauth.mockResolvedValue({ error: null, redirected: false });
  h.plants.mockResolvedValue([]);
  h.tents.mockResolvedValue([]);
  h.grows.mockResolvedValue({ data: [], error: null });
  clearLocalStorageForTest();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Auth start-screen routing", () => {
  it("keeps redirectTo after a password sign-in once the user is set", async () => {
    renderAuth("/auth?redirectTo=%2Fgrows");
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "grower@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "longenough1" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(h.signIn).toHaveBeenCalled());
    expect(screen.getByTestId("location")).toHaveTextContent("/auth?redirectTo=%2Fgrows");
    fireEvent.click(screen.getByRole("button", { name: /commit session/i }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/grows"));
  });

  it("keeps redirectTo after sign-up once the user is set", async () => {
    renderAuth("/auth?mode=signup&redirectTo=%2Fgrows");
    fireEvent.pointerDown(screen.getByRole("tab", { name: /create account/i }), { button: 0 });
    fireEvent.click(screen.getByRole("tab", { name: /create account/i }));
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "grower@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "longenough1" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /terms of service/i }));
    fireEvent.click(screen.getByRole("button", { name: /^create account$/i }));
    await waitFor(() => expect(h.signUp).toHaveBeenCalled());
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/auth?mode=signup&redirectTo=%2Fgrows",
    );
    fireEvent.click(screen.getByRole("button", { name: /commit session/i }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/grows"));
  });

  it("keeps redirectTo after Google sign-in once the user is set", async () => {
    renderAuth("/auth?redirectTo=%2Fgrows");
    fireEvent.click(screen.getAllByRole("button", { name: /continue with google/i })[0]);
    await waitFor(() => expect(h.oauth).toHaveBeenCalled());
    expect(screen.getByTestId("location")).toHaveTextContent("/auth?redirectTo=%2Fgrows");
    fireEvent.click(screen.getByRole("button", { name: /commit session/i }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/grows"));
  });

  it("lands on the Dashboard without Quick Log when no plant can be resolved", async () => {
    setStartScreenChoice("user-1", "quickLog");
    renderAuth("/auth");
    fireEvent.click(screen.getByRole("button", { name: /commit session/i }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/dashboard"));
    expect(screen.getByTestId("location").textContent).not.toContain("open=quick-log");
  });

  it("opens Quick Log on the eligible plant after sign-in", async () => {
    setStartScreenChoice("user-1", "quickLog");
    h.plants.mockResolvedValue([
      {
        id: "plant-a",
        tent_id: "tent-a",
        grow_id: "grow-a",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
    ]);
    h.tents.mockResolvedValue([{ id: "tent-a", grow_id: "grow-a", is_archived: false }]);
    h.grows.mockResolvedValue({ data: [{ id: "grow-a", is_archived: false }], error: null });
    renderAuth("/auth");
    fireEvent.click(screen.getByRole("button", { name: /commit session/i }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/plants/plant-a?open=quick-log"),
    );
  });

  it("sends a first-time user with no saved start screen to onboarding", async () => {
    renderAuth("/auth");
    fireEvent.click(screen.getByRole("button", { name: /commit session/i }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/onboarding"));
  });

  it("does not keep the previous user's plant when the signed-in user changes", async () => {
    setStartScreenChoice("user-1", "quickLog");
    setStartScreenChoice("user-2", "quickLog");
    const plantA = [
      {
        id: "plant-a",
        tent_id: "tent-a",
        grow_id: "grow-a",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
    ];
    let calls = 0;
    h.plants.mockImplementation(() => {
      calls += 1;
      if (calls === 1) return Promise.resolve(plantA);
      return new Promise(() => {});
    });
    h.tents.mockResolvedValue([{ id: "tent-a", grow_id: "grow-a", is_archived: false }]);
    h.grows.mockResolvedValue({ data: [{ id: "grow-a", is_archived: false }], error: null });
    h.user = { id: "user-1" };
    renderAuth("/auth", true);
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/plants/plant-a?open=quick-log"),
    );
    fireEvent.click(screen.getByRole("button", { name: /switch user/i }));
    fireEvent.click(screen.getByRole("button", { name: /return to auth/i }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/auth");
    expect(screen.getByTestId("location").textContent).not.toContain("plant-a");
  });

  it("falls back to the Dashboard when the plant read hangs", async () => {
    vi.useFakeTimers();
    setStartScreenChoice("user-1", "quickLog");
    h.user = { id: "user-1" };
    h.plants.mockReturnValue(new Promise(() => {}));
    h.tents.mockReturnValue(new Promise(() => {}));
    h.grows.mockReturnValue(new Promise(() => {}));
    renderAuth("/auth");
    expect(screen.getByTestId("location")).toHaveTextContent("/auth");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUICK_LOG_START_ROOM_TIMEOUT_MS);
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
    expect(screen.getByTestId("location").textContent).not.toContain("open=quick-log");
  });

  it("aborts the plant and tent reads when the fallback timer fires", async () => {
    vi.useFakeTimers();
    setStartScreenChoice("user-1", "quickLog");
    h.user = { id: "user-1" };
    const signals: AbortSignal[] = [];
    const capture = (signal?: AbortSignal) => {
      if (signal) signals.push(signal);
      return new Promise(() => {});
    };
    h.plants.mockImplementation(capture);
    h.tents.mockImplementation(capture);
    h.grows.mockReturnValue(new Promise(() => {}));
    renderAuth("/auth");
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUICK_LOG_START_ROOM_TIMEOUT_MS);
    });
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
  });
});
