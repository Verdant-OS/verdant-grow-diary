/**
 * Daily Check quick method actions on the Plant Detail consistency card.
 *
 * UX/routing only. No persistence. No writes. Mirrors Dashboard/Plants quick actions.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const PLANT = "plant-1";
const TENT = "tent-1";
const TODAY_ISO = new Date().toISOString();

let diaryEntries: Array<{ id: string; entry_at: string; plant_id: string; tent_id: string }> = [];
let manualReadings: Array<{ id: string; ts: string; tent_id: string; source: string }> = [];

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({ data: diaryEntries }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: manualReadings }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: [{ id: PLANT, name: "Mango", tent_id: TENT }] }),
}));

import PlantDailyGrowCheckConsistencyCard from "@/components/PlantDailyGrowCheckConsistencyCard";

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PlantDailyGrowCheckConsistencyCard plantId={PLANT} currentTentId={TENT} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Plant Detail · Daily Check quick method actions", () => {
  it("unchecked today shows Add note and Add sensor snapshot", () => {
    diaryEntries = [];
    manualReadings = [];
    renderCard();
    const actions = screen.getByTestId("plant-daily-grow-check-quick-actions");
    expect(actions.getAttribute("data-plant-id")).toBe(PLANT);
    const note = within(actions).getByTestId("plant-daily-grow-check-quick-action-note");
    const sensor = within(actions).getByTestId("plant-daily-grow-check-quick-action-sensor");
    expect(note.textContent).toMatch(/add note/i);
    expect(sensor.textContent).toMatch(/add sensor snapshot/i);
  });

  it("Add note href includes from=plant-detail&method=note", () => {
    diaryEntries = [];
    manualReadings = [];
    renderCard();
    const a = screen
      .getByTestId("plant-daily-grow-check-quick-action-note")
      .querySelector("a")!;
    expect(a.getAttribute("href")).toBe(
      `/daily-check?plantId=${PLANT}&from=plant-detail&method=note`,
    );
  });

  it("Add sensor snapshot href includes from=plant-detail&method=sensor", () => {
    diaryEntries = [];
    manualReadings = [];
    renderCard();
    const a = screen
      .getByTestId("plant-daily-grow-check-quick-action-sensor")
      .querySelector("a")!;
    expect(a.getAttribute("href")).toBe(
      `/daily-check?plantId=${PLANT}&from=plant-detail&method=sensor`,
    );
  });

  it("checked-today does not show the quick action group; legacy CTA remains", () => {
    diaryEntries = [
      { id: "d1", entry_at: TODAY_ISO, plant_id: PLANT, tent_id: TENT },
    ];
    manualReadings = [];
    renderCard();
    expect(screen.queryByTestId("plant-daily-grow-check-quick-actions")).toBeNull();
    expect(screen.getByTestId("plant-daily-grow-check-consistency-cta")).toBeTruthy();
  });

  it("checked-today preserves today method label", () => {
    diaryEntries = [
      { id: "d1", entry_at: TODAY_ISO, plant_id: PLANT, tent_id: TENT },
    ];
    manualReadings = [];
    renderCard();
    const label = screen.getByTestId("plant-daily-grow-check-today-method");
    expect(label.textContent).toMatch(/checked by/i);
  });

  it("7-day method breakdown still renders", () => {
    diaryEntries = [];
    manualReadings = [];
    renderCard();
    const region = screen.getByTestId("plant-daily-grow-check-method-breakdown");
    expect(region.getAttribute("data-day-count")).toBe("7");
  });
});

// --- Static safety scans ---------------------------------------------------

const SRC = readFileSync(
  resolve(__dirname, "../components/PlantDailyGrowCheckConsistencyCard.tsx"),
  "utf8",
);
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("Static safety · Plant Detail quick-action wiring", () => {
  it("uses the shared buildDailyCheckEntryHref helper", () => {
    expect(CODE).toMatch(/buildDailyCheckEntryHref/);
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
    expect(CODE).not.toMatch(/\.insert\(/);
    expect(CODE).not.toMatch(/dispatchEvent\(/);
  });

  it("avoids forbidden user-facing wording", () => {
    const lower = CODE.toLowerCase();
    expect(lower).not.toMatch(/\bperfect\b/);
    expect(lower).not.toMatch(/\bcompleted\b/);
    expect(lower).not.toMatch(/guaranteed healthy/);
  });
});
