/**
 * Tests for the Daily Grow Check status badge on the Plants page.
 *
 * Read-only UI. Reuses the existing Daily Grow Check rules — does not
 * re-test that calculation. Also pins the `from=plants` entry-source
 * contract and the success-card CTAs for that source.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  buildDailyCheckPostSubmitActions,
  parseDailyCheckEntrySource,
} from "@/lib/dailyCheckPostSubmitRules";
import { buildDashboardDailyGrowCheckPanel } from "@/lib/dashboardDailyGrowCheckPanelRules";

// ---------------------------------------------------------------------------
// Hook mocks — feed deterministic data into Plants.tsx
// ---------------------------------------------------------------------------
const TODAY_ISO = new Date().toISOString();

const PLANTS = [
  {
    id: "p-checked",
    name: "Checked Plant",
    strain: "Sour D",
    stage: "veg",
    health: "healthy",
    tentId: "t1",
    growId: "g1",
    isArchived: false,
    photo: null,
    startedAt: null,
    lastNote: "",
  },
  {
    id: "p-needs",
    name: "Needs Plant",
    strain: "Blue Dream",
    stage: "veg",
    health: "healthy",
    tentId: "t1",
    growId: "g1",
    isArchived: false,
    photo: null,
    startedAt: null,
    lastNote: "",
  },
];

vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({ data: PLANTS }),
  useGrowTents: () => ({ data: [{ id: "t1", name: "Tent A" }] }),
  getGrowDataMeta: () => undefined,
}));

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    data: [
      { id: "d1", entry_at: TODAY_ISO, plant_id: "p-checked", tent_id: "t1" },
    ],
  }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [] }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: "/",
  }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({ grows: [{ id: "g1", name: "Grow 1" }] }),
}));

// CreatePlantDialog renders Supabase calls — stub it.
vi.mock("@/components/CreatePlantDialog", () => ({
  default: () => null,
}));
vi.mock("@/components/PlantCardActionsMenu", () => ({
  default: () => null,
}));
vi.mock("@/components/PlantPhoto", () => ({
  default: () => null,
}));

import Plants from "@/pages/Plants";

function renderPlants() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/plants"]}>
        <Plants />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Plants page · Daily Grow Check badge", () => {
  it("renders 'Checked today' badge for plants with today's check", () => {
    renderPlants();
    const rows = screen.getAllByTestId("plant-card-daily-check-row");
    const checked = rows.find((r) => r.getAttribute("data-plant-id") === "p-checked")!;
    expect(checked.getAttribute("data-checked-today")).toBe("1");
    const badge = within(checked).getByTestId("plant-card-daily-check-badge");
    expect(badge.getAttribute("data-state")).toBe("checked");
    expect(badge.textContent).toMatch(/checked today/i);
  });

  it("renders 'Needs check' badge for plants without today's check", () => {
    renderPlants();
    const rows = screen.getAllByTestId("plant-card-daily-check-row");
    const needs = rows.find((r) => r.getAttribute("data-plant-id") === "p-needs")!;
    expect(needs.getAttribute("data-checked-today")).toBe("0");
    const badge = within(needs).getByTestId("plant-card-daily-check-badge");
    expect(badge.getAttribute("data-state")).toBe("needs");
    expect(badge.textContent).toMatch(/needs check/i);
  });

  it("Needs-check plants show a Start check CTA to /daily-check?plantId=<id>&from=plants", () => {
    renderPlants();
    const ctas = screen.getAllByTestId("plant-card-daily-check-cta");
    expect(ctas).toHaveLength(1);
    expect(ctas[0].getAttribute("href")).toBe(
      "/daily-check?plantId=p-needs&from=plants",
    );
    expect(ctas[0].getAttribute("data-plant-id")).toBe("p-needs");
    expect(ctas[0].textContent).toMatch(/start check/i);
  });

  it("Checked-today plants do not render a Start check CTA", () => {
    renderPlants();
    const ctas = screen.queryAllByTestId("plant-card-daily-check-cta");
    expect(ctas.every((c) => c.getAttribute("data-plant-id") !== "p-checked")).toBe(true);
  });
});

describe("from=plants entry source", () => {
  it("parses 'plants' as a valid Daily Check entry source", () => {
    expect(parseDailyCheckEntrySource("plants")).toBe("plants");
  });

  it("dashboard and plant-detail still parse unchanged", () => {
    expect(parseDailyCheckEntrySource("dashboard")).toBe("dashboard");
    expect(parseDailyCheckEntrySource("plant-detail")).toBe("plant-detail");
    expect(parseDailyCheckEntrySource("bogus")).toBeNull();
  });
});

describe("Post-submit actions for source=plants", () => {
  it("primary CTA is 'Back to Plants' → /plants", () => {
    const actions = buildDailyCheckPostSubmitActions({
      plantId: "p-1",
      source: "plants",
    });
    const primary = actions.find((a) => a.primary)!;
    expect(primary.key).toBe("plants");
    expect(primary.label).toBe("Back to Plants");
    expect(primary.href).toBe("/plants");
  });

  it("secondary CTA is 'View Plant' when plantId is present", () => {
    const actions = buildDailyCheckPostSubmitActions({
      plantId: "p-1",
      source: "plants",
    });
    const secondary = actions.find((a) => !a.primary)!;
    expect(secondary.key).toBe("plant");
    expect(secondary.label).toBe("View Plant");
    expect(secondary.href).toBe("/plants/p-1");
  });

  it("no secondary when plantId is missing", () => {
    const actions = buildDailyCheckPostSubmitActions({
      plantId: null,
      source: "plants",
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].key).toBe("plants");
  });

  it("source=dashboard behavior is unchanged", () => {
    const actions = buildDailyCheckPostSubmitActions({
      plantId: "p-1",
      source: "dashboard",
    });
    const primary = actions.find((a) => a.primary)!;
    expect(primary.key).toBe("dashboard");
    expect(primary.href).toBe("/");
  });

  it("source=plant-detail behavior is unchanged", () => {
    const actions = buildDailyCheckPostSubmitActions({
      plantId: "p-1",
      source: "plant-detail",
    });
    const primary = actions.find((a) => a.primary)!;
    expect(primary.key).toBe("plant");
    expect(primary.label).toBe("Back to Plant");
    expect(primary.href).toBe("/plants/p-1");
  });
});

describe("Manual current-tent sensor snapshot still counts", () => {
  it("plant with no QuickLog today but a same-tent manual snapshot is treated as checked", () => {
    const now = new Date("2026-05-24T14:00:00.000Z");
    const panel = buildDashboardDailyGrowCheckPanel({
      now,
      scopedGrowId: null,
      plants: [
        { id: "p1", name: "P1", tentId: "t1", growId: null, isArchived: false },
      ],
      tents: [{ id: "t1", name: "Tent A" }],
      manualReadings: [
        { ts: now.toISOString(), id: "m1", tent_id: "t1" },
      ],
      diaryEntries: [],
    });
    expect(panel.rows[0].checkedToday).toBe(true);
  });
});

describe("Static safety · Plants daily-check badge wiring", () => {
  const PLANTS_SRC = readFileSync(
    resolve(__dirname, "../../src/pages/Plants.tsx"),
    "utf8",
  );

  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  }
  const CODE = stripComments(PLANTS_SRC);

  it("derives badge from shared rules — no fake local checked state", () => {
    expect(CODE).toMatch(/buildDashboardDailyGrowCheckPanel/);
    expect(CODE).not.toMatch(/setChecked|fakeChecked|optimisticChecked/i);
  });

  it("does not introduce persistence, RPC, ingestion, action queue, automation, or device control", () => {
    const forbidden = [
      /service_role/i,
      /action[_-]?queue/i,
      /sensor_readings.*\.insert/,
      /device[_-]?control/i,
      /\.rpc\(/,
      /\bautomation\b/i,
    ];
    for (const re of forbidden) {
      expect(CODE, `Plants.tsx should not match ${re}`).not.toMatch(re);
    }
  });

  it("avoids forbidden user-facing wording", () => {
    const lower = CODE.toLowerCase();
    expect(lower).not.toMatch(/\bperfect\b/);
    expect(lower).not.toMatch(/\bcompleted\b/);
    expect(lower).not.toMatch(/guaranteed healthy/);
  });
});
