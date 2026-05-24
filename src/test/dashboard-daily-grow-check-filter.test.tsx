/**
 * Tests for the Dashboard "Today's Grow Checks" method/status filter.
 *
 * Read-only display filter. Never changes calculation basis, persistence,
 * writes, or summary text.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  buildDashboardDailyGrowCheckPanel,
  filterDashboardDailyGrowCheckRows,
  DASHBOARD_DAILY_GROW_CHECK_FILTER_OPTIONS,
  DASHBOARD_DAILY_GROW_CHECK_FILTER_EMPTY,
} from "@/lib/dashboardDailyGrowCheckPanelRules";

const NOW = new Date(2026, 4, 24, 15, 0, 0);
const TENT_A = "tent-a";
const TENT_B = "tent-b";
const TENT_C = "tent-c";
const TENT_D = "tent-d";

function iso(y: number, m: number, d: number, hh = 9) {
  return new Date(y, m, d, hh, 0, 0).toISOString();
}

// Four plants with four distinct method outcomes:
//   p-note   → only QuickLog today
//   p-snap   → only manual snapshot today (own tent, count=1)
//   p-both   → both QuickLog + manual snapshot today
//   p-needs  → nothing today
const PLANTS = [
  { id: "p-note", name: "A-Note", tentId: TENT_A, isArchived: false },
  { id: "p-snap", name: "B-Snap", tentId: TENT_B, isArchived: false },
  { id: "p-both", name: "C-Both", tentId: TENT_C, isArchived: false },
  { id: "p-needs", name: "D-Needs", tentId: TENT_D, isArchived: false },
];
const TENTS = [
  { id: TENT_A, name: "Tent A" },
  { id: TENT_B, name: "Tent B" },
  { id: TENT_C, name: "Tent C" },
  { id: TENT_D, name: "Tent D" },
];
const DIARY = [
  { entry_at: iso(2026, 4, 24, 10), id: "d1", plant_id: "p-note" },
  { entry_at: iso(2026, 4, 24, 10), id: "d2", plant_id: "p-both" },
];
const MANUAL = [
  { ts: iso(2026, 4, 24, 11), id: "m1", tent_id: TENT_B },
  { ts: iso(2026, 4, 24, 11), id: "m2", tent_id: TENT_C },
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

describe("filterDashboardDailyGrowCheckRows · pure rules", () => {
  const panel = buildPanel();

  it("default 'all' returns all rows", () => {
    const out = filterDashboardDailyGrowCheckRows(panel.rows, "all");
    expect(out).toHaveLength(4);
  });

  it("'needs' returns only unchecked plants", () => {
    const out = filterDashboardDailyGrowCheckRows(panel.rows, "needs");
    expect(out.map((r) => r.plantId)).toEqual(["p-needs"]);
  });

  it("'note' returns only note-method plants", () => {
    const out = filterDashboardDailyGrowCheckRows(panel.rows, "note");
    expect(out.map((r) => r.plantId)).toEqual(["p-note"]);
  });

  it("'sensor-snapshot' returns only sensor-method plants", () => {
    const out = filterDashboardDailyGrowCheckRows(panel.rows, "sensor-snapshot");
    expect(out.map((r) => r.plantId)).toEqual(["p-snap"]);
  });

  it("'both' returns only both-method plants", () => {
    const out = filterDashboardDailyGrowCheckRows(panel.rows, "both");
    expect(out.map((r) => r.plantId)).toEqual(["p-both"]);
  });

  it("summary text does not depend on filter", () => {
    // Summary is on the panel object itself; filter is row-only.
    expect(panel.summaryText).toBe("Checked 3 of 4 plants today");
    expect(panel.checked).toBe(3);
    expect(panel.total).toBe(4);
  });

  it("sort is unchecked-first then alphabetical and preserved by filter", () => {
    expect(panel.rows.map((r) => r.plantId)).toEqual([
      "p-needs", // unchecked first
      "p-note",
      "p-snap",
      "p-both",
    ]);
    // Filtering preserves the original order.
    const out = filterDashboardDailyGrowCheckRows(panel.rows, "all");
    expect(out.map((r) => r.plantId)).toEqual([
      "p-needs",
      "p-note",
      "p-snap",
      "p-both",
    ]);
  });

  it("returns [] when no rows match the filter (used to show empty state)", () => {
    const emptyPanel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: null,
      plants: [{ id: "p1", name: "Only", tentId: null, isArchived: false }],
      tents: [],
      manualReadings: [],
      diaryEntries: [],
    });
    const out = filterDashboardDailyGrowCheckRows(emptyPanel.rows, "note");
    expect(out).toHaveLength(0);
  });

  it("exposes 5 options including default 'all'", () => {
    expect(DASHBOARD_DAILY_GROW_CHECK_FILTER_OPTIONS.map((o) => o.value)).toEqual([
      "all",
      "needs",
      "note",
      "sensor-snapshot",
      "both",
    ]);
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
    data: MANUAL.map((r) => ({
      ...r,
      created_at: r.ts,
      source: "manual",
    })),
  }),
}));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    data: DIARY.map((e) => ({ ...e, created_at: e.entry_at, tent_id: null })),
  }),
}));

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {/* lazy import to ensure mocks are wired */}
        <PanelHarness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

import DashboardDailyGrowCheckPanel from "@/components/DashboardDailyGrowCheckPanel";
function PanelHarness() {
  return <DashboardDailyGrowCheckPanel scopedGrowId={null} />;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // jsdom shims for Radix Select pointer capture.
  if (!(Element.prototype as any).hasPointerCapture) {
    (Element.prototype as any).hasPointerCapture = () => false;
  }
  if (!(Element.prototype as any).setPointerCapture) {
    (Element.prototype as any).setPointerCapture = () => {};
  }
  if (!(Element.prototype as any).releasePointerCapture) {
    (Element.prototype as any).releasePointerCapture = () => {};
  }
  if (!(Element.prototype as any).scrollIntoView) {
    (Element.prototype as any).scrollIntoView = () => {};
  }
});

function changeFilter(value: string) {
  // shadcn Select is a native-like combobox; emulate via internal state by
  // dispatching a click on the matching option after opening.
  const trigger = screen.getByTestId("dashboard-daily-grow-check-panel-filter");
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
  const option = screen.getByTestId(
    `dashboard-daily-grow-check-panel-filter-option-${value}`,
  );
  fireEvent.click(option);
}

describe("DashboardDailyGrowCheckPanel filter UI", () => {
  it("default filter shows all rows; summary unaffected", () => {
    renderPanel();
    const rows = screen.getAllByTestId("dashboard-daily-grow-check-panel-row");
    expect(rows).toHaveLength(4);
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-summary").textContent,
    ).toBe("Checked 3 of 4 plants today");
    expect(
      screen
        .getByTestId("dashboard-daily-grow-check-panel-filter")
        .getAttribute("data-filter"),
    ).toBe("all");
  });

  it("'needs check' filter shows only unchecked plants and keeps summary", () => {
    renderPanel();
    changeFilter("needs");
    const rows = screen.getAllByTestId("dashboard-daily-grow-check-panel-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-plant-id")).toBe("p-needs");
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-summary").textContent,
    ).toBe("Checked 3 of 4 plants today");
  });

  it("'checked by note' filter shows only note-method plants", () => {
    renderPanel();
    changeFilter("note");
    const rows = screen.getAllByTestId("dashboard-daily-grow-check-panel-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-today-method")).toBe("note");
  });

  it("'checked by sensor snapshot' filter shows only sensor-method plants", () => {
    renderPanel();
    changeFilter("sensor-snapshot");
    const rows = screen.getAllByTestId("dashboard-daily-grow-check-panel-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-today-method")).toBe("sensor-snapshot");
  });

  it("'checked by both' filter shows only both-method plants", () => {
    renderPanel();
    changeFilter("both");
    const rows = screen.getAllByTestId("dashboard-daily-grow-check-panel-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-today-method")).toBe("both");
  });
});

// --- Filter empty state (separate harness with only checked plants) -------

describe("DashboardDailyGrowCheckPanel filter empty state", () => {
  it("renders useful empty state when no rows match", async () => {
    // Re-mock with only a single checked plant so 'needs' yields nothing.
    vi.resetModules();
    vi.doMock("@/hooks/useGrowData", () => ({
      useGrowPlants: () => ({
        data: [{ id: "only", name: "Only", tentId: null, growId: null, isArchived: false }],
      }),
      useGrowTents: () => ({ data: [] }),
      getGrowDataMeta: () => ({}),
    }));
    vi.doMock("@/hooks/use-sensor-readings", () => ({
      useSensorReadings: () => ({ data: [] }),
    }));
    vi.doMock("@/hooks/use-diary-entries", () => ({
      useDiaryEntries: () => ({
        data: [
          {
            id: "d1",
            entry_at: iso(2026, 4, 24, 10),
            created_at: iso(2026, 4, 24, 10),
            plant_id: "only",
            tent_id: null,
          },
        ],
      }),
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
    // 1 row by default.
    expect(
      screen.getAllByTestId("dashboard-daily-grow-check-panel-row"),
    ).toHaveLength(1);
    // Switch to 'needs' → no matches.
    const trigger = screen.getByTestId("dashboard-daily-grow-check-panel-filter");
    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByTestId("dashboard-daily-grow-check-panel-filter-option-needs"),
    );
    expect(
      screen.queryAllByTestId("dashboard-daily-grow-check-panel-row"),
    ).toHaveLength(0);
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-filter-empty")
        .textContent,
    ).toBe(DASHBOARD_DAILY_GROW_CHECK_FILTER_EMPTY);
  });
});

// --- Safety scan ---------------------------------------------------------

describe("safety — filter surfaces do not introduce unsafe writes", () => {
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
