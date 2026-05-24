/**
 * Tests for Dashboard "Today's Grow Checks" empty / first-run states.
 *
 * Read-only UI/copy only. No persistence, no calculation changes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { buildDashboardDailyGrowCheckPanel } from "@/lib/dashboardDailyGrowCheckPanelRules";

const NOW = new Date(2026, 4, 24, 15, 0, 0);
const FORBIDDEN = /\b(perfect|completed|guaranteed healthy)\b/i;

function iso(y: number, m: number, d: number, hh = 9) {
  return new Date(y, m, d, hh, 0, 0).toISOString();
}

describe("buildDashboardDailyGrowCheckPanel · empty + first-run state", () => {
  it("scoped grow with no active plants → 'no-plants-scoped' variant + CTA", () => {
    const p = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: "grow-1",
      plants: [],
      tents: [],
      manualReadings: [],
      diaryEntries: [],
    });
    expect(p.isEmpty).toBe(true);
    expect(p.emptyVariant).toBe("no-plants-scoped");
    expect(p.emptyTitle).toBe("No active plants in this grow yet");
    expect(p.emptyMessage).toMatch(/Daily Grow Checks start/i);
    expect(p.emptyCtaHref).toBe("/plants");
    expect(p.emptyCtaLabel).toBe("Add a plant");
    expect(p.checked).toBe(0);
    expect(p.total).toBe(0);
    expect(p.firstRunHint).toBeNull();
    expect(p.emptyMessage).not.toMatch(FORBIDDEN);
    expect(p.emptyTitle).not.toMatch(FORBIDDEN);
  });

  it("no grow selected with no active plants → 'no-plants-all' variant", () => {
    const p = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: null,
      plants: [],
      tents: [],
      manualReadings: [],
      diaryEntries: [],
    });
    expect(p.emptyVariant).toBe("no-plants-all");
    expect(p.emptyTitle).toBe("No active plants yet");
    expect(p.emptyMessage).toMatch(/current grow/i);
    expect(p.checked).toBe(0);
    expect(p.total).toBe(0);
  });

  it("active plants with no checks today → firstRunHint set", () => {
    const p = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: null,
      plants: [{ id: "p1", name: "Mango", tentId: null, isArchived: false }],
      tents: [],
      manualReadings: [],
      diaryEntries: [],
    });
    expect(p.isEmpty).toBe(false);
    expect(p.firstRunHint).toBe("Start with one plant note or sensor snapshot.");
    expect(p.firstRunHint).not.toMatch(FORBIDDEN);
  });

  it("at least one checked plant → firstRunHint cleared", () => {
    const p = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: null,
      plants: [{ id: "p1", name: "Mango", tentId: null, isArchived: false }],
      tents: [],
      manualReadings: [],
      diaryEntries: [
        { entry_at: iso(2026, 4, 24, 10), id: "d1", plant_id: "p1" },
      ],
    });
    expect(p.firstRunHint).toBeNull();
  });
});

// --- UI render tests ------------------------------------------------------

function renderWith(modules: {
  plants: any[];
  tents?: any[];
  readings?: any[];
  diary?: any[];
}) {
  vi.resetModules();
  vi.doMock("@/hooks/useGrowData", () => ({
    useGrowPlants: () => ({ data: modules.plants }),
    useGrowTents: () => ({ data: modules.tents ?? [] }),
    getGrowDataMeta: () => ({}),
  }));
  vi.doMock("@/hooks/use-sensor-readings", () => ({
    useSensorReadings: () => ({ data: modules.readings ?? [] }),
  }));
  vi.doMock("@/hooks/use-diary-entries", () => ({
    useDiaryEntries: () => ({ data: modules.diary ?? [] }),
  }));
  return import("@/components/DashboardDailyGrowCheckPanel").then(
    ({ default: Panel }) => {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      return render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <Panel scopedGrowId={null} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("DashboardDailyGrowCheckPanel UI · empty + first-run states", () => {
  it("no active plants → shows improved empty state with CTA, hides chips + checked summary", async () => {
    await renderWith({ plants: [] });
    const empty = screen.getByTestId("dashboard-daily-grow-check-panel-empty");
    expect(empty.getAttribute("data-empty-variant")).toBe("no-plants-all");
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-empty-title").textContent,
    ).toMatch(/no active plants/i);
    const cta = screen.getByTestId("dashboard-daily-grow-check-panel-empty-cta");
    expect(cta.getAttribute("href")).toBe("/plants");
    // Chips hidden.
    expect(
      screen.queryByTestId("dashboard-daily-grow-check-panel-chips"),
    ).toBeNull();
    // Misleading checked summary hidden — replaced with neutral subtitle.
    expect(
      screen.queryByTestId("dashboard-daily-grow-check-panel-summary"),
    ).toBeNull();
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-empty-subtitle"),
    ).toBeTruthy();
  });

  it("scoped grow with no plants → 'no-plants-scoped' variant + CTA", async () => {
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
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Panel scopedGrowId="grow-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      screen
        .getByTestId("dashboard-daily-grow-check-panel-empty")
        .getAttribute("data-empty-variant"),
    ).toBe("no-plants-scoped");
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-empty-title").textContent,
    ).toMatch(/in this grow/i);
  });

  it("active plants with zero checks today → first-run hint shown; summary unchanged", async () => {
    await renderWith({
      plants: [
        { id: "p1", name: "Mango", tentId: null, growId: null, isArchived: false },
      ],
    });
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-first-run").textContent,
    ).toBe("Start with one plant note or sensor snapshot.");
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-summary").textContent,
    ).toBe("Checked 0 of 1 plant today");
  });

  it("active plants with checks → no first-run hint; existing list still renders", async () => {
    await renderWith({
      plants: [
        { id: "p1", name: "Mango", tentId: null, growId: null, isArchived: false },
      ],
      diary: [
        {
          id: "d1",
          entry_at: iso(2026, 4, 24, 10),
          created_at: iso(2026, 4, 24, 10),
          plant_id: "p1",
          tent_id: null,
        },
      ],
    });
    expect(
      screen.queryByTestId("dashboard-daily-grow-check-panel-first-run"),
    ).toBeNull();
    expect(
      screen.getAllByTestId("dashboard-daily-grow-check-panel-row"),
    ).toHaveLength(1);
    expect(
      screen.getByTestId("dashboard-daily-grow-check-panel-summary").textContent,
    ).toBe("Checked 1 of 1 plant today");
  });
});

// --- Safety scan ---------------------------------------------------------

describe("safety — empty/first-run surfaces", () => {
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
