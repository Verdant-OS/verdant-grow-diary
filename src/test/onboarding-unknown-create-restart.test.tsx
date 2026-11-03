import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearHierarchyCreateOutcomeRecoveryAttempt,
  recordHierarchyCreateOutcomeRecoveryAttempt,
} from "@/lib/hierarchyCreateOutcomeRecovery";
import * as hierarchyCreatePersistence from "@/lib/hierarchyCreatePersistence";
import { OnboardingFlowControls } from "@/lib/onboardingFlowControls";
import { MemoryRouter } from "@/lib/react-router-compat";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

const USER = "44444444-4444-4444-8444-444444444444";
const ROW = "22222222-2222-4222-8222-222222222222";
const ROOM_KEY = `verdant.session-form.1.${USER}.start-your-room`;
const nav = vi.hoisted(() => vi.fn());

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
    grows: [],
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
  supabase: { from: () => ({}) },
}));

import Onboarding from "@/pages/Onboarding";
import StartYourRoom from "@/pages/StartYourRoom";

function roomDraft() {
  window.sessionStorage.setItem(
    ROOM_KEY,
    JSON.stringify({
      step: "grow",
      form: { growName: "Room", tentName: "Tent", plantName: "Plant", plantStage: "seedling" },
      ids: { growId: null, tentId: null, plantId: null },
      pendingRowIds: { grow: ROW, tent: null, plant: null },
      saveError: null,
    }),
  );
}

function markUnknown() {
  recordHierarchyCreateOutcomeRecoveryAttempt({
    entity: "grow",
    rowId: ROW,
    ownerId: USER,
  });
}

function renderRoom() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StartYourRoom />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("unknown create keeps the room idempotency key", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    nav.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("disables Back while the outcome is unknown and while a save is in flight", async () => {
    roomDraft();
    markUnknown();
    renderRoom();
    const back = await screen.findByRole("button", { name: "Back" });
    expect(back).toBeDisabled();
    fireEvent.click(back);
    expect(nav).not.toHaveBeenCalled();
    cleanup();

    clearHierarchyCreateOutcomeRecoveryAttempt({ entity: "grow", rowId: ROW, ownerId: USER });
    window.sessionStorage.clear();
    vi.spyOn(hierarchyCreatePersistence, "persistHierarchyCreateAttempt").mockImplementation(
      () => new Promise(() => undefined),
    );
    renderRoom();
    fireEvent.change(await screen.findByTestId("start-room-plant-name"), {
      target: { value: "In Flight" },
    });
    fireEvent.click(screen.getByTestId("start-room-submit"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Back" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(nav).not.toHaveBeenCalled();
  });

  it("keeps pendingRowIds when /onboarding Restart runs during an unknown create", () => {
    roomDraft();
    markUnknown();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Onboarding />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("onboarding-restart")).toBeDisabled();
    OnboardingFlowControls.clearFlowAnswers(USER);
    expect(window.sessionStorage.getItem(ROOM_KEY)).toContain(ROW);
  });

  it("reuses the preserved pending id on the next grow save", async () => {
    roomDraft();
    markUnknown();
    OnboardingFlowControls.clearFlowAnswers(USER);
    expect(window.sessionStorage.getItem(ROOM_KEY)).toContain(ROW);
    clearHierarchyCreateOutcomeRecoveryAttempt({ entity: "grow", rowId: ROW, ownerId: USER });
    const persist = vi
      .spyOn(hierarchyCreatePersistence, "persistHierarchyCreateAttempt")
      .mockResolvedValue({
        status: "confirmed",
        confirmed: { row: { id: ROW, user_id: USER, name: "Room" } },
      });
    renderRoom();
    fireEvent.click(await screen.findByTestId("start-room-submit"));
    await waitFor(() => expect(persist).toHaveBeenCalled());
    expect(persist.mock.calls[0]?.[1]).toMatchObject({ entity: "grow", rowId: ROW });
  });

  it("drops pending ids after a known failure, because no row was created", () => {
    roomDraft();
    OnboardingFlowControls.clearFlowAnswers(USER);
    expect(window.sessionStorage.getItem(ROOM_KEY)).toBeNull();
  });

  it("emits onboarding restart and skip from /onboarding", () => {
    const events: string[] = [];
    const onAnalytics = (event: Event) => {
      const name = (event as CustomEvent<{ name?: string }>).detail?.name;
      if (name) events.push(name);
    };
    window.addEventListener("verdant:analytics", onAnalytics);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Onboarding />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    fireEvent.click(screen.getByTestId("onboarding-restart"));
    fireEvent.click(screen.getByRole("button", { name: "Restart setup" }));
    expect(events).toEqual(["onboarding_skip", "onboarding_restart"]);
    window.removeEventListener("verdant:analytics", onAnalytics);
  });
});
