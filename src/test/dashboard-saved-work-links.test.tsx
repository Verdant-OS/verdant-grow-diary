/**
 * Dashboard saved-work links: plant name opens the plant page, and the
 * latest-activity line opens the matching diary entry.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "@/lib/react-router-compat";
import DailyGrowCheckStatusCard from "@/components/DailyGrowCheckStatusCard";
import DashboardDailyGrowCheckPanel from "@/components/DashboardDailyGrowCheckPanel";
import { buildDashboardDailyGrowCheckPanel } from "@/lib/dashboardDailyGrowCheckPanelRules";

const NOW = new Date();
const TODAY = NOW.toISOString();

function ok<T>(data: T) {
  return {
    data,
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  };
}

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ok([{ id: "t1", name: "Tent A" }]),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ok([{ id: "p-1", name: "Sour D" }]),
}));
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () =>
    ok([
      {
        id: "d1",
        entry_at: TODAY,
        created_at: TODAY,
        tent_id: "t1",
        plant_id: "p-1",
      },
    ]),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ok([]),
}));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () =>
    ok([
      {
        id: "p-1",
        name: "Sour D",
        tentId: "t1",
        growId: "g1",
        isArchived: false,
        lastNote: "",
      },
    ]),
  useGrowTents: () => ok([{ id: "t1", name: "Tent A" }]),
}));

function mount(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("Dashboard saved-work links", () => {
  it("sends a sensor-only check to the plant diary section", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [
        {
          id: "p-1",
          name: "Sour D",
          tentId: "t1",
          growId: "g1",
          isArchived: false,
          lastNote: "",
        },
      ],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [{ ts: TODAY, id: "m1", tent_id: "t1", source: "manual" }],
      diaryEntries: [],
    });
    expect(panel.rows[0]?.plantHref).toBe("/plants/p-1");
    expect(panel.rows[0]?.latestActivityHref).toBe("/plants/p-1#plant-relative-timeline");
  });

  it("links the status card plant name and last activity to the plant and entry", () => {
    mount(<DailyGrowCheckStatusCard growId="g1" />);

    const plant = screen.getByTestId("daily-grow-check-plant-name");
    const activity = screen.getByTestId("daily-grow-check-last-activity");

    expect(plant.tagName).toBe("A");
    expect(plant).toHaveAttribute("href", "/plants/p-1");
    expect(plant).toHaveAccessibleName("Open Sour D");
    expect(plant.className).toContain("focus-visible:ring-2");

    expect(activity.tagName).toBe("A");
    expect(activity).toHaveAttribute("href", "/timeline?growId=g1#timeline-entry-d1");
    expect(activity).toHaveAccessibleName("Latest log for Sour D");
    expect(activity.className).toContain("focus-visible:ring-2");
  });

  it("links each grow-check row name and guidance to the plant and entry", () => {
    mount(<DashboardDailyGrowCheckPanel scopedGrowId="g1" />);

    const plant = screen.getByTestId("dashboard-daily-grow-check-panel-plant-link");
    const activity = screen.getByTestId("dashboard-daily-grow-check-panel-activity-link");

    expect(plant.tagName).toBe("A");
    expect(plant).toHaveAttribute("href", "/plants/p-1");
    expect(plant).toHaveAccessibleName("Open Sour D");
    expect(plant).toHaveTextContent("Sour D");
    expect(plant.className).toContain("focus-visible:ring-2");

    expect(activity.tagName).toBe("A");
    expect(activity).toHaveAttribute("href", "/timeline?growId=g1#timeline-entry-d1");
    expect(activity).toHaveAccessibleName("Latest log for Sour D");
    expect(activity.className).toContain("focus-visible:ring-2");
  });
});
