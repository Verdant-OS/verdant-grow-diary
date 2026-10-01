import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const GROW = "00000000-0000-4000-8000-000000000001";
const PLANT = "00000000-0000-4000-8000-000000000002";
const TENT = "00000000-0000-4000-8000-000000000003";
const OTHER_GROW = "00000000-0000-4000-8000-000000000099";

const fixture = vi.hoisted(() => ({
  activeGrowId: null as string | null,
  plants: [
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Legacy plant",
      grow_id: null as string | null,
      tent_id: "00000000-0000-4000-8000-000000000003",
    },
  ],
  tents: [
    {
      id: "00000000-0000-4000-8000-000000000003",
      name: "Assigned tent",
      grow_id: "00000000-0000-4000-8000-000000000001",
    },
  ],
  grows: [
    { id: "00000000-0000-4000-8000-000000000001", name: "Assigned grow" },
    { id: "00000000-0000-4000-8000-000000000099", name: "Other grow" },
  ],
  readings: [],
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: fixture.plants,
    isLoading: false,
  }),
}));
vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({
    data: fixture.tents,
    isLoading: false,
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: fixture.grows,
    activeGrowId: fixture.activeGrowId,
    loading: false,
  }),
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: fixture.readings }),
}));
vi.mock("@/components/ManualSensorReadingCard", () => ({ default: () => null }));
vi.mock("@/components/PlantAssignedTentAlertsPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantAssignedTentActionsPanel", () => ({ default: () => null }));
vi.mock("@/components/PlantStatusStrip", () => ({ default: () => null }));
vi.mock("@/components/DailyGrowCheckOnboardingCard", () => ({ default: () => null }));
vi.mock("@/components/QuickLog", () => ({
  default: ({
    prefill,
    open,
  }: {
    prefill: { growId: string | null; plantId: string | null };
    open: boolean;
  }) => (
    <output
      data-testid="note-save-context"
      data-grow={prefill.growId ?? ""}
      data-plant={prefill.plantId ?? ""}
      data-open={open ? "1" : "0"}
    />
  ),
}));
vi.mock("@/components/QuickLogAllActivitiesSection", () => ({
  default: ({
    growId,
    plantId,
    tentId,
  }: {
    growId: string | null;
    plantId: string | null;
    tentId: string | null;
  }) => (
    <output
      data-testid="activity-save-context"
      data-grow={growId ?? ""}
      data-plant={plantId ?? ""}
      data-tent={tentId ?? ""}
    />
  ),
}));

import DailyCheck from "@/pages/DailyCheck";

function renderDailyCheck(search = `?plantId=${PLANT}&from=dashboard&method=note`) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter initialEntries={[`/daily-check${search}`]}>
        <DailyCheck />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fixture.activeGrowId = null;
  fixture.plants[0].grow_id = null;
});

describe("Daily Check legacy plant save context", () => {
  it.each([null, OTHER_GROW])(
    "uses the assigned tent's grow when workspace grow is %s",
    (activeGrowId) => {
      fixture.activeGrowId = activeGrowId;
      renderDailyCheck();

      expect(screen.getByTestId("note-save-context")).toHaveAttribute("data-grow", GROW);
      expect(screen.getByTestId("note-save-context")).toHaveAttribute("data-plant", PLANT);
      expect(screen.getByTestId("note-save-context")).toHaveAttribute("data-open", "1");
      expect(screen.getByTestId("activity-save-context")).toHaveAttribute("data-grow", GROW);
      expect(screen.getByTestId("activity-save-context")).toHaveAttribute("data-plant", PLANT);
      expect(screen.getByTestId("activity-save-context")).toHaveAttribute("data-tent", TENT);
      expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    },
  );

  it("keeps the explicit grow guard for a legacy plant", () => {
    fixture.activeGrowId = OTHER_GROW;
    renderDailyCheck(`?plantId=${PLANT}&growId=${GROW}&from=dashboard&method=note`);

    expect(
      screen.getByText(
        "That plant is not assigned to the grow you're viewing. Switch grow or pick a plant from this grow below.",
      ),
    ).toBeVisible();
    expect(screen.queryByTestId("note-save-context")).not.toBeInTheDocument();
    expect(screen.getByTestId("activity-save-context")).toHaveAttribute("data-plant", "");
  });

  it("preserves the plant's own grow when it is known", () => {
    fixture.plants[0].grow_id = GROW;
    fixture.activeGrowId = OTHER_GROW;
    renderDailyCheck();
    expect(screen.getByTestId("note-save-context")).toHaveAttribute("data-grow", GROW);
    expect(screen.getByTestId("activity-save-context")).toHaveAttribute("data-grow", GROW);
  });
});
