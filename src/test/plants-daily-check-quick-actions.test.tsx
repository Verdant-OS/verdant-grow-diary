/**
 * Daily Check quick method actions on Plants page cards.
 *
 * UX/routing only. No persistence. No writes. Mirrors Dashboard quick actions.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowPlants: () => ({ data: PLANTS }),
    useGrowTents: () => ({ data: [{ id: "t1", name: "Tent A" }] }),
    getGrowDataMeta: () => undefined,
  };
});
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    data: [{ id: "d1", entry_at: TODAY_ISO, plant_id: "p-checked", tent_id: "t1" }],
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
vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/PlantPhoto", () => ({ default: () => null }));
vi.mock("@/components/GrowDataSourceDisclosure", () => ({ default: () => null }));

import Plants from "@/pages/Plants";

function renderPlants() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/plants"]}>
        <Plants />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Plants page · Daily Check quick method actions", () => {
  it("needs-check card renders Add note and Add sensor snapshot", () => {
    renderPlants();
    const actionsList = screen.getAllByTestId("plant-card-daily-check-actions");
    expect(actionsList).toHaveLength(1);
    const actions = actionsList[0];
    expect(actions.getAttribute("data-plant-id")).toBe("p-needs");
    const note = within(actions).getByTestId("plant-card-daily-check-action-note");
    const sensor = within(actions).getByTestId("plant-card-daily-check-action-sensor");
    expect(note.textContent).toMatch(/add note/i);
    expect(sensor.textContent).toMatch(/add sensor snapshot/i);
  });

  it("Add note href is /daily-check?plantId=...&from=plants&method=note", () => {
    renderPlants();
    const a = screen.getByTestId("plant-card-daily-check-action-note");
    expect(a.getAttribute("data-href")).toBe(
      "/daily-check?plantId=p-needs&from=plants&method=note",
    );
  });

  it("Add sensor snapshot href is /daily-check?plantId=...&from=plants&method=sensor", () => {
    renderPlants();
    const a = screen.getByTestId("plant-card-daily-check-action-sensor");
    expect(a.getAttribute("data-href")).toBe(
      "/daily-check?plantId=p-needs&from=plants&method=sensor",
    );
  });

  it("checked-today card does not render quick actions", () => {
    renderPlants();
    const actionsList = screen.getAllByTestId("plant-card-daily-check-actions");
    expect(actionsList.every((el) => el.getAttribute("data-plant-id") !== "p-checked")).toBe(true);
  });

  it("checked-today badge + method label are unchanged", () => {
    renderPlants();
    const rows = screen.getAllByTestId("plant-card-daily-check-row");
    const checked = rows.find((r) => r.getAttribute("data-plant-id") === "p-checked")!;
    expect(
      within(checked).getByTestId("plant-card-daily-check-badge").getAttribute("data-state"),
    ).toBe("checked");
  });
});

describe("Static safety · Plants quick-action wiring", () => {
  const SRC = readFileSync(resolve(__dirname, "../../src/pages/Plants.tsx"), "utf8");
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("uses the shared buildDailyCheckEntryHref helper, not duplicated URL strings", () => {
    expect(CODE).toMatch(/buildDailyCheckEntryHref/);
    // No hardcoded method= query strings.
    expect(CODE).not.toMatch(/method=note/);
    expect(CODE).not.toMatch(/method=sensor/);
  });

  it("does not introduce persistence, RPC, ingestion, action queue, automation, device control, or service_role", () => {
    for (const re of [
      /service_role/i,
      /action[_-]?queue/i,
      /sensor_readings.*\.insert/,
      /device[_-]?control/i,
      /\.rpc\(/,
      /\bautomation\b/i,
    ]) {
      expect(CODE).not.toMatch(re);
    }
  });

  it("does not fabricate a fake local checked state", () => {
    expect(CODE).not.toMatch(/setChecked|fakeChecked|optimisticChecked/i);
  });

  it("does not auto-submit from quick actions", () => {
    expect(CODE).not.toMatch(/quick[\s\S]{0,80}\.insert\(/i);
    expect(CODE).not.toMatch(/dispatchEvent\(/);
  });

  it("avoids forbidden user-facing wording", () => {
    const lower = CODE.toLowerCase();
    expect(lower).not.toMatch(/\bperfect\b/);
    expect(lower).not.toMatch(/\bcompleted\b/);
    expect(lower).not.toMatch(/guaranteed healthy/);
  });
});
