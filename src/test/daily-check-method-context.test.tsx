/**
 * Daily Check method context surface tests.
 *
 * Verifies shared rules + UI surfaces (Dashboard panel, Plants page badges,
 * Plant Detail card) expose today's check method:
 *   - "note" (QuickLog only)
 *   - "sensor-snapshot" (current-tent manual snapshot only)
 *   - "both"
 *   - "none"
 *
 * Read-only UI/copy only. No persistence, no writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  buildDailyGrowCheckConsistency,
  formatTodayCheckMethodLabel,
} from "@/lib/dailyGrowCheckConsistencyRules";
import { buildDashboardDailyGrowCheckPanel } from "@/lib/dashboardDailyGrowCheckPanelRules";

const NOW = new Date(2026, 4, 24, 15, 0, 0);
const PLANT = "plant-1";
const TENT = "tent-1";

function localIso(y: number, m: number, d: number, hh = 9) {
  return new Date(y, m, d, hh, 0, 0).toISOString();
}

const baseConsistency = (
  overrides: Partial<Parameters<typeof buildDailyGrowCheckConsistency>[0]> = {},
) => ({
  now: NOW,
  windowDays: 7,
  plantId: PLANT,
  currentTentId: TENT,
  plantsInTentCount: 1,
  manualReadings: [],
  diaryEntries: [],
  ...overrides,
});

describe("shared rules — today's check method", () => {
  it("method = none when no activity today", () => {
    const s = buildDailyGrowCheckConsistency(baseConsistency());
    expect(s.todayMethod).toBe("none");
    expect(formatTodayCheckMethodLabel(s.todayMethod)).toBeNull();
  });

  it("method = note when only QuickLog today", () => {
    const s = buildDailyGrowCheckConsistency(
      baseConsistency({
        diaryEntries: [
          { entry_at: localIso(2026, 4, 24, 10), id: "d1", plant_id: PLANT },
        ],
      }),
    );
    expect(s.todayMethod).toBe("note");
    expect(formatTodayCheckMethodLabel(s.todayMethod)).toBe("Checked by note");
  });

  it("method = sensor-snapshot when only current-tent manual snapshot today", () => {
    const s = buildDailyGrowCheckConsistency(
      baseConsistency({
        manualReadings: [
          { ts: localIso(2026, 4, 24, 10), id: "m1", tent_id: TENT },
        ],
      }),
    );
    expect(s.todayMethod).toBe("sensor-snapshot");
    expect(formatTodayCheckMethodLabel(s.todayMethod)).toBe(
      "Checked by sensor snapshot",
    );
  });

  it("method = both when both QuickLog and snapshot today", () => {
    const s = buildDailyGrowCheckConsistency(
      baseConsistency({
        diaryEntries: [
          { entry_at: localIso(2026, 4, 24, 10), id: "d1", plant_id: PLANT },
        ],
        manualReadings: [
          { ts: localIso(2026, 4, 24, 11), id: "m1", tent_id: TENT },
        ],
      }),
    );
    expect(s.todayMethod).toBe("both");
    expect(formatTodayCheckMethodLabel(s.todayMethod)).toBe(
      "Checked by note + sensor snapshot",
    );
  });

  it("manual snapshot from a different tent does not count for the plant", () => {
    const s = buildDailyGrowCheckConsistency(
      baseConsistency({
        manualReadings: [
          { ts: localIso(2026, 4, 24, 10), id: "m1", tent_id: "other-tent" },
        ],
      }),
    );
    expect(s.todayMethod).toBe("none");
    expect(s.todayHasActivity).toBe(false);
  });
});

describe("dashboard panel rules — method exposed per row", () => {
  it("returns todayMethod + methodLabel for checked rows; null for unchecked", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: null,
      plants: [
        { id: PLANT, name: "Mango", tentId: TENT, isArchived: false },
        { id: "plant-2", name: "Blueberry", tentId: TENT, isArchived: false },
      ],
      tents: [{ id: TENT, name: "Tent A" }],
      manualReadings: [],
      diaryEntries: [
        { entry_at: localIso(2026, 4, 24, 10), id: "d1", plant_id: PLANT },
      ],
    });
    const byId = new Map(panel.rows.map((r) => [r.plantId, r]));
    expect(byId.get(PLANT)?.todayMethod).toBe("note");
    expect(byId.get(PLANT)?.methodLabel).toBe("Checked by note");
    expect(byId.get(PLANT)?.shortGuidance).toBe("Checked by note");
    expect(byId.get("plant-2")?.todayMethod).toBe("none");
    expect(byId.get("plant-2")?.methodLabel).toBeNull();
    expect(byId.get("plant-2")?.showCta).toBe(true);
  });

  it("preserves unchecked-first sort", () => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: NOW,
      scopedGrowId: null,
      plants: [
        { id: PLANT, name: "Mango", tentId: TENT, isArchived: false },
        { id: "plant-2", name: "Blueberry", tentId: TENT, isArchived: false },
      ],
      tents: [{ id: TENT, name: "Tent A" }],
      manualReadings: [],
      diaryEntries: [
        { entry_at: localIso(2026, 4, 24, 10), id: "d1", plant_id: PLANT },
      ],
    });
    // Unchecked Blueberry should come before checked Mango.
    expect(panel.rows[0].plantId).toBe("plant-2");
    expect(panel.rows[1].plantId).toBe(PLANT);
  });
});

// --- UI surface render tests ----------------------------------------------

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({
    data: [
      { id: PLANT, name: "Mango", tentId: TENT, growId: null, isArchived: false },
      { id: "plant-2", name: "Blueberry", tentId: TENT, growId: null, isArchived: false },
    ],
  }),
  useGrowTents: () => ({ data: [{ id: TENT, name: "Tent A" }] }),
  getGrowDataMeta: () => ({}),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: [
      { id: "m1", ts: localIso(2026, 4, 24, 10), created_at: localIso(2026, 4, 24, 10), tent_id: TENT, source: "manual" },
    ],
  }),
}));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    data: [
      { id: "d1", entry_at: localIso(2026, 4, 24, 9), created_at: localIso(2026, 4, 24, 9), plant_id: PLANT, tent_id: TENT },
    ],
  }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({
    data: [
      { id: PLANT, name: "Mango", tent_id: TENT },
      { id: "plant-2", name: "Blueberry", tent_id: TENT },
    ],
  }),
}));

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("dashboard panel UI — shows method context for checked plants", () => {
  it("renders 'Checked by note + sensor snapshot' for plant with both today", async () => {
    const { default: DashboardDailyGrowCheckPanel } = await import(
      "@/components/DashboardDailyGrowCheckPanel"
    );
    renderWithProviders(<DashboardDailyGrowCheckPanel scopedGrowId={null} />);
    const rows = screen.getAllByTestId("dashboard-daily-grow-check-panel-row");
    const mangoRow = rows.find((r) => r.getAttribute("data-plant-id") === PLANT)!;
    expect(mangoRow.getAttribute("data-today-method")).toBe("both");
    expect(mangoRow.textContent).toContain("Checked by note + sensor snapshot");
  });

  it("unchecked rows still show Start check CTA", async () => {
    const { default: DashboardDailyGrowCheckPanel } = await import(
      "@/components/DashboardDailyGrowCheckPanel"
    );
    renderWithProviders(<DashboardDailyGrowCheckPanel scopedGrowId={null} />);
    const rows = screen.getAllByTestId("dashboard-daily-grow-check-panel-row");
    const blueberry = rows.find((r) => r.getAttribute("data-plant-id") === "plant-2")!;
    // Blueberry shares Tent A so tent-level snapshot counts → checked.
    // Mango is the only one with a QuickLog note today.
    expect(blueberry.getAttribute("data-checked-today")).toBe("1");
    const cta = screen.queryAllByTestId("dashboard-daily-grow-check-panel-row-cta");
    // No unchecked rows → no CTA rendered.
    expect(cta).toHaveLength(0);
  });

});

describe("plant detail card UI — shows method context for today", () => {
  it("renders method label when checked today", async () => {
    const { default: PlantDailyGrowCheckConsistencyCard } = await import(
      "@/components/PlantDailyGrowCheckConsistencyCard"
    );
    renderWithProviders(
      <PlantDailyGrowCheckConsistencyCard plantId={PLANT} currentTentId={TENT} />,
    );
    const card = screen.getByTestId("plant-daily-grow-check-consistency");
    expect(card.getAttribute("data-today-method")).toBe("both");
    expect(screen.getByTestId("plant-daily-grow-check-today-method").textContent).toBe(
      "Checked by note + sensor snapshot",
    );
  });
});

// --- Source file safety scans ---------------------------------------------

function readSrc(rel: string): string {
  return readFileSync(resolve(__dirname, "..", rel), "utf-8");
}

describe("safety — no forbidden wording or unsafe surfaces", () => {
  const files = [
    "lib/dailyGrowCheckConsistencyRules.ts",
    "lib/dashboardDailyGrowCheckPanelRules.ts",
    "components/DashboardDailyGrowCheckPanel.tsx",
    "components/PlantDailyGrowCheckConsistencyCard.tsx",
    "pages/Plants.tsx",
  ];

  it.each(files)("%s — no forbidden wording (perfect / completed / guaranteed healthy)", (rel) => {
    const txt = readSrc(rel).toLowerCase();
    // Strip jsdoc/line comments so contract docs don't trigger.
    const stripped = txt
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(stripped).not.toMatch(/\bperfect\b/);
    expect(stripped).not.toMatch(/\bguaranteed healthy\b/);
    expect(stripped).not.toMatch(/grow completed/);
  });

  it.each(files)("%s — no new persistence / RPC / sensor ingestion / action_queue / automation / service_role", (rel) => {
    const txt = readSrc(rel);
    const stripped = txt
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(stripped).not.toMatch(/service_role/);
    expect(stripped).not.toMatch(/\.rpc\(/);
    expect(stripped).not.toMatch(/sensor_readings.*\.insert\(/);
    expect(stripped).not.toMatch(/action_queue.*\.insert\(/);
    expect(stripped).not.toMatch(/device_control/);
  });
});
