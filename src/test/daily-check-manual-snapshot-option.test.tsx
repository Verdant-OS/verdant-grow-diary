/**
 * Tests for the "Choose today's check" option on /daily-check that exposes
 * the manual sensor snapshot path as a first-class Daily Grow Check option,
 * alongside QuickLog. Also covers the cross-component
 * `verdant:sensor-reading-created` success event so Dashboard, Plants, and
 * Plant Detail refresh after a successful manual snapshot.
 *
 * Read-only/UX wiring only. No new persistence, no schema, no sensor
 * ingestion changes, no automation, no device control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  DAILY_CHECK_SUCCESS_EVENTS,
  ENTRY_CREATED_EVENT,
  SENSOR_READING_CREATED_EVENT,
} from "@/lib/dailyCheckRefreshRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const PAGE = read("src/pages/DailyCheck.tsx");
const HOOK = read("src/hooks/useInsertSensorReading.ts");
const DASH = read("src/components/DashboardDailyGrowCheckPanel.tsx");
const PLANT_CARD = read("src/components/PlantDailyGrowCheckConsistencyCard.tsx");
const RULES = read("src/lib/dailyCheckRefreshRules.ts");
const DOC = read("docs/daily-grow-check-operating-loop.md");

// ---------------------------------------------------------------------------
// Refresh rules — sensor event contract
// ---------------------------------------------------------------------------
describe("Daily Grow Check sensor success event contract", () => {
  it("exposes verdant:sensor-reading-created as a recognized success event", () => {
    expect(SENSOR_READING_CREATED_EVENT).toBe("verdant:sensor-reading-created");
    expect(DAILY_CHECK_SUCCESS_EVENTS).toContain(ENTRY_CREATED_EVENT);
    expect(DAILY_CHECK_SUCCESS_EVENTS).toContain(SENSOR_READING_CREATED_EVENT);
  });

  it("manual sensor reading hook dispatches the sensor success event with createdAt + tentId", () => {
    expect(HOOK).toMatch(/verdant:sensor-reading-created/);
    expect(HOOK).toMatch(/createdAt/);
    expect(HOOK).toMatch(/tentId/);
    // Must only dispatch from the success callback, never on failure.
    expect(HOOK).toMatch(/onSuccess[\s\S]{0,1200}dispatchEvent/);
  });

  it("does not introduce any new persistence, RPC, automation, or service_role wiring", () => {
    for (const src of [PAGE, HOOK, DASH, PLANT_CARD, RULES]) {
      const code = stripComments(src);
      expect(code).not.toMatch(/service_role|action_queue|device_command|\.rpc\(/i);
      expect(code).not.toMatch(/\bautomation\b/i);
    }
    // The hook still inserts sensor readings (that's its existing job) but
    // must not introduce additional insert/update/delete on other tables.
    for (const src of [PAGE, DASH, PLANT_CARD, RULES]) {
      const code = stripComments(src);
      expect(code).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    }
  });
});

// ---------------------------------------------------------------------------
// DailyCheck page — "Choose today's check" UI contract
// ---------------------------------------------------------------------------
describe("DailyCheck · Choose today's check section", () => {
  it("renders both plant-note and sensor-snapshot options as first-class entries", () => {
    expect(PAGE).toMatch(/Choose today's check/);
    expect(PAGE).toMatch(/data-testid="daily-grow-check-choose"/);
    expect(PAGE).toMatch(/data-testid="daily-grow-check-choose-quicklog"/);
    expect(PAGE).toMatch(/data-testid="daily-grow-check-choose-snapshot"/);
    expect(PAGE).toMatch(/Add plant note/);
    expect(PAGE).toMatch(/Add sensor snapshot/);
  });

  it("guards the sensor-snapshot option when the selected plant has no tent", () => {
    expect(PAGE).toMatch(/Sensor snapshots need a tent assignment\./);
    expect(PAGE).toMatch(/data-testid="daily-grow-check-choose-no-tent"/);
    // The button must be disabled when a plant is selected without a tent —
    // never silently routes to an arbitrary tent.
    expect(PAGE).toMatch(/disabled=\{!!selectedPlant && !selectedPlant\.tent_id\}/);
  });

  it("listens for the sensor success event to drive the success card", () => {
    expect(PAGE).toMatch(/verdant:sensor-reading-created/);
    // Must source the Logged-at timestamp from the event detail, not Date.now() unconditionally.
    expect(PAGE).toMatch(/detail\?\.createdAt/);
  });

  it("does not introduce fake local checked state or forbidden wording", () => {
    expect(PAGE).not.toMatch(/setChecked|optimisticChecked|fakeChecked/i);
    expect(PAGE).not.toMatch(/\bperfect\b/i);
    expect(PAGE).not.toMatch(/\bguaranteed healthy\b/i);
    // "completed" appears only in the existing surrounding code as a doc
    // word; the new section must not add a fresh "completed" claim about
    // the plant.
    expect(PAGE).not.toMatch(/check\s+completed/i);
  });
});

// ---------------------------------------------------------------------------
// Dashboard panel + Plant Detail card listen for the sensor event
// ---------------------------------------------------------------------------
function wrap(ui: React.ReactNode, qc: QueryClient) {
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: [] }),
}));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => ({ data: [] }),
  useGrowTents: () => ({ data: [] }),
}));

import DashboardDailyGrowCheckPanel from "@/components/DashboardDailyGrowCheckPanel";
import PlantDailyGrowCheckConsistencyCard from "@/components/PlantDailyGrowCheckConsistencyCard";

describe("Dashboard + Plant Detail refresh on sensor success event", () => {
  let qc: QueryClient;
  let invalidateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidateSpy = vi.fn();
    qc.invalidateQueries = invalidateSpy as never;
  });

  it("Dashboard panel invalidates diary + sensor caches on sensor success event", () => {
    render(wrap(<DashboardDailyGrowCheckPanel scopedGrowId={null} />, qc));
    invalidateSpy.mockClear();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SENSOR_READING_CREATED_EVENT, {
          detail: { createdAt: new Date().toISOString(), tentId: "t1" },
        }),
      );
    });
    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey?.[0]);
    expect(keys).toContain("diary_entries");
    expect(keys).toContain("sensor_readings");
  });

  it("Plant Detail card invalidates diary + sensor caches on sensor success event", () => {
    render(
      wrap(
        <PlantDailyGrowCheckConsistencyCard plantId="p-1" currentTentId="t-1" />,
        qc,
      ),
    );
    invalidateSpy.mockClear();
    act(() => {
      window.dispatchEvent(new CustomEvent(SENSOR_READING_CREATED_EVENT));
    });
    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey?.[0]);
    expect(keys).toContain("diary_entries");
    expect(keys).toContain("sensor_readings");
  });

  it("Plants page derives Daily Check status from the same panel rules (auto-refresh via query cache)", () => {
    // Plants.tsx renders from useSensorReadings + useDiaryEntries — when the
    // sensor success event invalidates those caches, the page re-derives
    // checked-today without needing its own event listener.
    const PLANTS = read("src/pages/Plants.tsx");
    expect(PLANTS).toMatch(/buildDashboardDailyGrowCheckPanel/);
    expect(PLANTS).toMatch(/useSensorReadings/);
    expect(PLANTS).toMatch(/useDiaryEntries/);
  });
});

// ---------------------------------------------------------------------------
// Doc contract
// ---------------------------------------------------------------------------
describe("Operating-loop doc covers manual snapshot option", () => {
  it("documents the Choose today's check section and sensor event", () => {
    expect(DOC).toMatch(/Choose today's check/);
    expect(DOC).toMatch(/Add plant note/);
    expect(DOC).toMatch(/Add sensor snapshot/);
    expect(DOC).toMatch(/verdant:sensor-reading-created/);
    expect(DOC).toMatch(/Sensor snapshots need a tent assignment\./);
  });
});
