/**
 * Tests for Dashboard "Today's Grow Checks" method summary chips.
 *
 * Read-only UI/copy. Chip counts derive from the same panel rows as the
 * list, are never affected by the active filter, and never invent state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  buildDashboardDailyGrowCheckPanel,
  buildDashboardDailyGrowCheckMethodChips,
  buildDashboardDailyGrowCheckMethodCounts,
} from "@/lib/dashboardDailyGrowCheckPanelRules";

const NOW = new Date(2026, 4, 24, 15, 0, 0);
const A = "tent-a", B = "tent-b", C = "tent-c", D = "tent-d";

function iso(y: number, m: number, d: number, hh = 9) {
  return new Date(y, m, d, hh, 0, 0).toISOString();
}

const PLANTS = [
  { id: "p-note", name: "A-Note", tentId: A, isArchived: false },
  { id: "p-snap", name: "B-Snap", tentId: B, isArchived: false },
  { id: "p-both", name: "C-Both", tentId: C, isArchived: false },
  { id: "p-needs", name: "D-Needs", tentId: D, isArchived: false },
];
const TENTS = [
  { id: A, name: "A" },
  { id: B, name: "B" },
  { id: C, name: "C" },
  { id: D, name: "D" },
];
const DIARY = [
  { entry_at: iso(2026, 4, 24, 10), id: "d1", plant_id: "p-note" },
  { entry_at: iso(2026, 4, 24, 10), id: "d2", plant_id: "p-both" },
];
const MANUAL = [
  { ts: iso(2026, 4, 24, 11), id: "m1", tent_id: B },
  { ts: iso(2026, 4, 24, 11), id: "m2", tent_id: C },
];

function buildPanel() {
  return buildDashboardDailyGrowCheckPanel({
    now: NOW,
    scopedGrowId: null,
    plants: PLANTS,
    tents: TENTS,
    manualReadings: MANUAL,
    diaryEntries: DIARY,
  });
}

describe("buildDashboardDailyGrowCheckMethodCounts · pure rules", () => {
  it("derives needs / note / sensor / both counts from rows", () => {
    const counts = buildDashboardDailyGrowCheckMethodCounts(buildPanel().rows);
    expect(counts).toEqual({ needs: 1, note: 1, sensorSnapshot: 1, both: 1 });
  });

  it("returns zero counts when no rows exist", () => {
    const counts = buildDashboardDailyGrowCheckMethodCounts([]);
    expect(counts).toEqual({ needs: 0, note: 0, sensorSnapshot: 0, both: 0 });
  });
});

describe("buildDashboardDailyGrowCheckMethodChips · pure rules", () => {
  it("returns 4 chips in fixed order with counts when rows exist", () => {
    const chips = buildDashboardDailyGrowCheckMethodChips(buildPanel().rows);
    expect(chips.map((c) => c.key)).toEqual([
      "needs",
      "note",
      "sensor-snapshot",
      "both",
    ]);
    expect(chips.map((c) => c.count)).toEqual([1, 1, 1, 1]);
    expect(chips.map((c) => c.filterValue)).toEqual([
      "needs",
      "note",
      "sensor-snapshot",
      "both",
    ]);
  });

  it("returns [] when there are no rows (no meaningless zero chips)", () => {
    expect(buildDashboardDailyGrowCheckMethodChips([])).toEqual([]);
  });
});

// --- UI render tests ------------------------------------------------------

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({
    data: PLANTS.map((p) => ({ ...p, growId: null })),
  }),
  useGrowTents: () => ({ data: TENTS }),
  getGrowDataMeta: () => ({}),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: MANUAL.map((r) => ({ ...r, created_at: r.ts, source: "manual" })),
  }),
}));
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    data: DIARY.map((e) => ({ ...e, created_at: e.entry_at, tent_id: null })),
  }),
}));

import DashboardDailyGrowCheckPanel from "@/components/DashboardDailyGrowCheckPanel";

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardDailyGrowCheckPanel scopedGrowId={null} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  if (!(Element.prototype as any).hasPointerCapture) {
    (Element.prototype as any).hasPointerCapture = () => false;
    (Element.prototype as any).setPointerCapture = () => {};
    (Element.prototype as any).releasePointerCapture = () => {};
    (Element.prototype as any).scrollIntoView = () => {};
  }
});

describe("DashboardDailyGrowCheckPanel summary chips UI", () => {
  it("renders all four chips with correct counts", () => {
    renderPanel();
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-chip-needs-count").textContent,
    ).toBe("1");
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-chip-note-count").textContent,
    ).toBe("1");
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-chip-sensor-snapshot-count")
        .textContent,
    ).toBe("1");
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-chip-both-count").textContent,
    ).toBe("1");
  });

  it("summary text is unchanged regardless of chips", () => {
    renderPanel();
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-summary").textContent,
    ).toBe("Checked 3 of 4 plants today");
  });

  it("chip click sets the filter; counts stay the same after filtering", () => {
    renderPanel();
    const before = screen.getByTestId(
      "dashboard-daily-grow-check-panel-chip-note-count",
    ).textContent;
    fireEvent.click(
      screen.getByTestId("dashboard-daily-grow-check-panel-chip-note"),
    );
    // Filter applied → only note row visible.
    const rows = screen.getAllByTestId("dashboard-daily-grow-check-panel-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-today-method")).toBe("note");
    // Counts unchanged.
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-chip-note-count").textContent,
    ).toBe(before);
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-chip-needs-count").textContent,
    ).toBe("1");
    // Active chip reflects state.
    expect(
      screen
        .getByTestId("dashboard-daily-grow-check-panel-chip-note")
        .getAttribute("data-active"),
    ).toBe("1");
    // Clicking the active chip again clears the filter back to "all".
    fireEvent.click(
      screen.getByTestId("dashboard-daily-grow-check-panel-chip-note"),
    );
    expect(
      screen.getAllByTestId("dashboard-daily-grow-check-panel-row"),
    ).toHaveLength(4);
  });
});

// --- Empty-grow chip suppression -----------------------------------------

describe("DashboardDailyGrowCheckPanel chip suppression when no active plants", () => {
  it("does not render chips block when the grow has no active plants", async () => {
    vi.resetModules();
    vi.doMock("@/hooks/useGrowData", () => ({
      useGrowPlants: () => ({ data: [] }),
      useGrowTents: () => ({ data: [] }),
      getGrowDataMeta: () => ({}),
    }));
    vi.doMock("@/hooks/use-sensor-readings", () => ({
      useSensorReadings: () => ({ data: [] }),
    }));
    vi.doMock("@/hooks/use-diary-entries", () => ({
      useDiaryEntries: () => ({ data: [] }),
    }));
    const { default: Panel } = await import(
      "@/components/DashboardDailyGrowCheckPanel"
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Panel scopedGrowId={null} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      screen.queryByTestId("dashboard-daily-grow-check-panel-chips"),
    ).toBeNull();
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-empty"),
    ).toBeTruthy();
  });
});

// --- Safety scan ---------------------------------------------------------

describe("safety — chip surfaces", () => {
  const files = [
    "lib/dashboardDailyGrowCheckPanelRules.ts",
    "components/DashboardDailyGrowCheckPanel.tsx",
  ];
  it.each(files)("%s contains no unsafe surfaces or forbidden wording", (rel) => {
    const txt = readFileSync(resolve(__dirname, "..", rel), "utf-8");
    const stripped = txt
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(stripped).not.toMatch(/service_role/);
    expect(stripped).not.toMatch(/\.rpc\(/);
    expect(stripped).not.toMatch(/sensor_readings.*\.insert\(/);
    expect(stripped).not.toMatch(/action_queue.*\.insert\(/);
    expect(stripped).not.toMatch(/device_control/);
    const lower = stripped.toLowerCase();
    expect(lower).not.toMatch(/\bperfect\b/);
    expect(lower).not.toMatch(/\bguaranteed healthy\b/);
    expect(lower).not.toMatch(/grow completed/);
  });
});
