import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FREE_CAPABILITIES } from "@/lib/entitlements/capabilities";

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
    const root = await screen.findByTestId("start-your-room");
    expect(root.parentElement).toHaveClass("pb-[calc(8rem+env(safe-area-inset-bottom))]");
    expect(root.parentElement).toHaveClass("justify-start");
    expect(screen.getByTestId("start-room-submit")).toHaveClass("w-[calc(100%-4.5rem)]");
    fireEvent.change(screen.getByTestId("start-room-plant-name"), {
      target: { value: "Kept Plant" },
    });
    await waitFor(() => expect(window.sessionStorage.getItem(ROOM_KEY)).toContain("Kept Plant"));

    fireEvent.click(screen.getByTestId("start-room-back"));
    expect(nav).toHaveBeenCalledWith("/onboarding");
    expect(window.sessionStorage.getItem(ROOM_KEY)).toContain("Kept Plant");

    fireEvent.click(screen.getByTestId("start-room-restart"));
    expect(nav).toHaveBeenCalledWith("/onboarding");
    expect(window.sessionStorage.getItem(ROOM_KEY)).toBeNull();

    fireEvent.click(screen.getByTestId("start-room-skip"));
    expect(nav).toHaveBeenCalledWith("/dashboard?open=quick-log", { replace: true });
  });
});
