import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { recordHierarchyCreateOutcomeRecoveryAttempt } from "@/lib/hierarchyCreateOutcomeRecovery";
import * as hierarchyCreatePersistence from "@/lib/hierarchyCreatePersistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

const nav = vi.hoisted(() => vi.fn());
const growsBag = vi.hoisted(() => ({
  grows: [] as Array<{ id: string; name: string }>,
}));

vi.mock("@/lib/react-router-compat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/react-router-compat")>(
    "@/lib/react-router-compat",
  );
  return { ...actual, useNavigate: () => nav };
});

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: { id: "44444444-4444-4444-8444-444444444444" },
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: growsBag.grows,
    loading: false,
    error: null,
    activeGrowId: null,
    activeGrow: null,
    setActiveGrowId: vi.fn(),
    refresh: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    lookupFailed: false,
    entitlement: { capabilities: FREE_CAPABILITIES },
    refetch: vi.fn(async () => false),
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));

import Onboarding from "@/pages/Onboarding";
import StartYourRoom from "@/pages/StartYourRoom";

const ROOM_KEY = "verdant.session-form.1.44444444-4444-4444-8444-444444444444.start-your-room";

function renderOnboarding() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/onboarding"]}>
        <Onboarding />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("onboarding flow controls on the pages", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    nav.mockReset();
    growsBag.grows = [];
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("keeps the first step free of Back and Restart restores the default answer", () => {
    renderOnboarding();
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();
    const timeline = screen
      .getAllByRole("radio")
      .find((radio) => (radio as HTMLInputElement).value === "timeline") as HTMLInputElement;
    fireEvent.click(timeline);
    fireEvent.click(screen.getByTestId("onboarding-restart"));
    expect(screen.getByRole("alertdialog", { name: "Restart this setup?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restart setup" }));
    const quickLog = screen
      .getAllByRole("radio")
      .find((radio) => (radio as HTMLInputElement).value === "quickLog") as HTMLInputElement;
    expect(quickLog.checked).toBe(true);
  });

  it("restores the start-screen answer after Back from the room", () => {
    window.sessionStorage.setItem(
      "verdant.session-form.1.44444444-4444-4444-8444-444444444444.onboarding-start-screen",
      JSON.stringify("timeline"),
    );
    renderOnboarding();
    const timeline = screen
      .getAllByRole("radio")
      .find((radio) => (radio as HTMLInputElement).value === "timeline") as HTMLInputElement;
    expect(timeline.checked).toBe(true);
  });

  it("gives /start-room Back, Restart and Skip, and reserves space above the mobile nav", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StartYourRoom />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.queryByTestId("start-your-room-skip-start-screen")).toBeNull();
    fireEvent.change(screen.getByTestId("start-room-plant-name"), {
      target: { value: "Kept Plant" },
    });
    await waitFor(() => expect(window.sessionStorage.getItem(ROOM_KEY)).toContain("Kept Plant"));

    const events: string[] = [];
    const onAnalytics = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string }>).detail;
      if (detail?.name) events.push(detail.name);
    };
    window.addEventListener("verdant:analytics", onAnalytics);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(nav).toHaveBeenCalledWith("/onboarding");
    expect(window.sessionStorage.getItem(ROOM_KEY)).toContain("Kept Plant");

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(window.sessionStorage.getItem(ROOM_KEY)).toContain("Kept Plant");
    fireEvent.click(screen.getByRole("button", { name: "Restart setup" }));
    expect(nav).toHaveBeenCalledWith("/onboarding");
    expect(window.sessionStorage.getItem(ROOM_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(nav).toHaveBeenCalledWith("/dashboard?open=quick-log", { replace: true });
    expect(events).toEqual(["onboarding_back", "onboarding_restart", "onboarding_skip"]);
    window.removeEventListener("verdant:analytics", onAnalytics);
  });

  it("hides Back and Restart once a grow row exists and keeps that id", async () => {
    const growId = "11111111-1111-4111-8111-111111111111";
    growsBag.grows = [{ id: growId, name: "Saved room" }];
    window.sessionStorage.setItem(
      ROOM_KEY,
      JSON.stringify({
        step: "tent",
        form: { growName: "", tentName: "Tent", plantName: "Plant", plantStage: "seedling" },
        ids: { growId, tentId: null, plantId: null },
        pendingRowIds: { grow: null, tent: null, plant: null },
        saveError: null,
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StartYourRoom />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByTestId("start-your-room");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Back" })).toBeNull());
    expect(screen.queryByRole("button", { name: "Restart" })).toBeNull();
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeTruthy();
    expect(window.sessionStorage.getItem(ROOM_KEY)).toContain(growId);
  });

  it("does not discard pending row ids while the create outcome is unknown", async () => {
    const rowId = "22222222-2222-4222-8222-222222222222";
    recordHierarchyCreateOutcomeRecoveryAttempt({
      entity: "grow",
      rowId,
      ownerId: "44444444-4444-4444-8444-444444444444",
    });
    window.sessionStorage.setItem(
      ROOM_KEY,
      JSON.stringify({
        step: "grow",
        form: { growName: "Room", tentName: "Tent", plantName: "Plant", plantStage: "seedling" },
        ids: { growId: null, tentId: null, plantId: null },
        pendingRowIds: { grow: rowId, tent: null, plant: null },
        saveError: null,
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StartYourRoom />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const restart = await screen.findByRole("button", { name: "Restart" });
    expect(restart).toBeDisabled();
    fireEvent.click(restart);
    expect(window.sessionStorage.getItem(ROOM_KEY)).toContain(rowId);
    expect(nav).not.toHaveBeenCalled();
  });

  it("disables Restart while a create is still in flight and keeps the pending id", async () => {
    vi.spyOn(hierarchyCreatePersistence, "persistHierarchyCreateAttempt").mockImplementation(
      () => new Promise(() => undefined),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StartYourRoom />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(await screen.findByTestId("start-room-plant-name"), {
      target: { value: "In Flight" },
    });
    fireEvent.click(screen.getByTestId("start-room-submit"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Restart" })).toBeDisabled());
    const stored = window.sessionStorage.getItem(ROOM_KEY);
    expect(stored).toContain("In Flight");
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(window.sessionStorage.getItem(ROOM_KEY)).toBe(stored);
    vi.restoreAllMocks();
  });
});
