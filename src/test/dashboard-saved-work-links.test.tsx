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

const NOW = new Date(2026, 4, 24, 15, 0, 0);
const TODAY = new Date(2026, 4, 24, 8, 0, 0).toISOString();
const LATER_TODAY = new Date(2026, 4, 24, 12, 0, 0).toISOString();
const TOMORROW = new Date(2026, 4, 25, 8, 0, 0).toISOString();
const LIVE_TODAY = new Date().toISOString();

const io = vi.hoisted(() => ({
  diary: [] as Array<Record<string, string>>,
  readings: [] as Array<Record<string, string>>,
}));

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
  useDiaryEntries: () => ok(io.diary),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ok(io.readings),
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

const plant = (id: string, name: string) => ({
  id,
  name,
  tentId: "t1",
  growId: "g1",
  isArchived: false,
  lastNote: "",
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

afterEach(() => {
  cleanup();
  io.diary = [];
  io.readings = [];
});

describe("Dashboard saved-work links", () => {
  it("sends a sensor-only panel check to the plant diary section", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [plant("p-1", "Sour D")],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [{ ts: TODAY, id: "m1", tent_id: "t1", source: "manual" }],
      diaryEntries: [],
    });
    expect(panel.rows[0]?.plantHref).toBe("/plants/p-1");
    expect(panel.rows[0]?.latestActivityHref).toBe("/plants/p-1#plant-relative-timeline");
  });

  it("leaves an unchecked row without an activity link", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [plant("p-1", "Sour D")],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [],
      diaryEntries: [],
    });
    expect(panel.rows[0]?.checkedToday).toBe(false);
    expect(panel.rows[0]?.latestActivityHref).toBeNull();
  });

  it("falls back when the entry id is empty or unsafe, and ignores a future-dated row", () => {
    const emptyId = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [plant("p-1", "Sour D")],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [],
      diaryEntries: [
        { entry_at: TODAY, id: "", plant_id: "p-1", tent_id: "t1" },
        { entry_at: TOMORROW, id: "tomorrow", plant_id: "p-1", tent_id: "t1" },
      ],
    });
    expect(emptyId.rows[0]?.latestActivityHref).toBe("/plants/p-1#plant-relative-timeline");

    const unsafeId = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [plant("p-1", "Sour D")],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [],
      diaryEntries: [{ entry_at: TODAY, id: "bad/id", plant_id: "p-1", tent_id: "t1" }],
    });
    expect(unsafeId.rows[0]?.latestActivityHref).toBe("/plants/p-1#plant-relative-timeline");
  });

  it("keeps each plant's own entry target", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "g1",
      plants: [plant("p-1", "Sour D"), plant("p-2", "Blue Dream")],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [],
      diaryEntries: [
        { entry_at: TODAY, id: "d1", plant_id: "p-1", tent_id: "t1" },
        { entry_at: LATER_TODAY, id: "d2", plant_id: "p-2", tent_id: "t1" },
      ],
    });
    const byId = new Map(panel.rows.map((row) => [row.plantId, row.latestActivityHref]));
    expect(byId.get("p-1")).toBe("/timeline?growId=g1#timeline-entry-d1");
    expect(byId.get("p-2")).toBe("/timeline?growId=g1#timeline-entry-d2");
  });

  it("links the status card plant name and last activity to the plant and entry", () => {
    io.diary = [
      {
        id: "d1",
        entry_at: LIVE_TODAY,
        created_at: LIVE_TODAY,
        tent_id: "t1",
        plant_id: "p-1",
      },
    ];
    mount(<DailyGrowCheckStatusCard growId="g1" />);

    const plant = screen.getByTestId("daily-grow-check-plant-name");
    const activity = screen.getByTestId("daily-grow-check-last-activity");
    const visible = activity.textContent ?? "";

    expect(plant.tagName).toBe("A");
    expect(plant).toHaveAttribute("href", "/plants/p-1");
    expect(plant).toHaveAccessibleName("Open Sour D");
    expect(plant.className).toContain("focus-visible:ring-2");

    expect(activity.tagName).toBe("A");
    expect(activity).toHaveAttribute("href", "/timeline?growId=g1#timeline-entry-d1");
    expect(activity).toHaveAccessibleName(new RegExp(escapeRegExp(visible)));
    expect(activity.className).toContain("focus-visible:ring-2");
  });

  it("keeps the status card sensor-only activity as plain text", () => {
    io.readings = [
      {
        id: "m1",
        ts: LIVE_TODAY,
        created_at: LIVE_TODAY,
        tent_id: "t1",
        source: "manual",
      },
    ];
    mount(<DailyGrowCheckStatusCard growId="g1" />);

    const activity = screen.getByTestId("daily-grow-check-last-activity");
    expect(activity.tagName).toBe("SPAN");
    expect(activity).toHaveTextContent(/Last check activity/);
    expect(screen.queryByTestId("daily-grow-check-plant-name")).toBeNull();
  });

  it("links each grow-check row name and guidance to the plant and entry", () => {
    io.diary = [
      {
        id: "d1",
        entry_at: LIVE_TODAY,
        created_at: LIVE_TODAY,
        tent_id: "t1",
        plant_id: "p-1",
      },
    ];
    mount(<DashboardDailyGrowCheckPanel scopedGrowId="g1" />);

    const plant = screen.getByTestId("dashboard-daily-grow-check-panel-plant-link");
    const activity = screen.getByTestId("dashboard-daily-grow-check-panel-activity-link");
    const visible = activity.textContent ?? "";

    expect(plant.tagName).toBe("A");
    expect(plant).toHaveAttribute("href", "/plants/p-1");
    expect(plant).toHaveAccessibleName("Open Sour D");
    expect(plant).toHaveTextContent("Sour D");
    expect(plant.className).toContain("block");
    expect(plant.className).toContain("truncate");
    expect(plant.className).toContain("focus-visible:ring-2");

    expect(activity.tagName).toBe("A");
    expect(activity).toHaveAttribute("href", "/timeline?growId=g1#timeline-entry-d1");
    expect(activity).toHaveAccessibleName(new RegExp(escapeRegExp(visible)));
    expect(activity.className).toContain("focus-visible:ring-2");
  });
});
