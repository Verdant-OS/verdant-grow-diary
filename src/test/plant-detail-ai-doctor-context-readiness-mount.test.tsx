/**
 * Mount tests for PlantDetailAiDoctorContextReadinessMount.
 *
 * Verifies loading/empty/fallback states, that compiled context flows
 * into AiDoctorContextReadinessPanel, and that no writes/network calls
 * occur during render.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PlantDetailAiDoctorContextReadinessMount from "@/components/PlantDetailAiDoctorContextReadinessMount";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      throw new Error("Supabase access not allowed in mount render test");
    },
    functions: {
      invoke: () => {
        throw new Error("functions.invoke not allowed in mount render test");
      },
    },
  },
}));

const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
  throw new Error("fetch not allowed in mount render test");
}) as never);

const HOUR = 3600 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

let recentActivityState: { data?: unknown; isLoading: boolean } = {
  data: [],
  isLoading: false,
};
let manualLogsState: { data?: unknown; isLoading: boolean } = {
  data: [],
  isLoading: false,
};
let alertsState: { rows: ReadonlyArray<{ id: string }> } = { rows: [] };

vi.mock("@/hooks/usePlantRecentActivity", () => ({
  PLANT_RECENT_ACTIVITY_LIMIT: 10,
  usePlantRecentActivity: () => recentActivityState,
}));
vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  PLANT_MANUAL_SENSOR_HISTORY_LIMIT: 30,
  usePlantManualSensorHistory: () => ({ data: undefined, isLoading: false }),
  usePlantManualSensorLogs: () => manualLogsState,
}));
vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({
    status: "idle",
    rows: alertsState.rows,
    error: null,
  }),
}));

const baseProps = {
  plantId: "p1",
  growId: "g1",
  tentId: "t1",
  plantName: "Plant A",
  strain: "Northern Lights",
  stage: "veg" as const,
};

beforeEach(() => {
  recentActivityState = { data: [], isLoading: false };
  manualLogsState = { data: [], isLoading: false };
  alertsState = { rows: [] };
  fetchSpy.mockClear();
});

describe("PlantDetailAiDoctorContextReadinessMount", () => {
  it("renders loading state while hooks resolve", () => {
    recentActivityState = { data: undefined, isLoading: true };
    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />);
    expect(
      screen.getByTestId("plant-detail-ai-doctor-context-readiness-mount-loading"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("plant-detail-ai-doctor-context-readiness-mount-loading").textContent,
    ).toContain("Checking AI Doctor context");
  });

  it("renders the readiness panel with compiled context when data is present", () => {
    recentActivityState = {
      data: [{ entry_at: ago(12 * HOUR), entry_type: "watering" }],
      isLoading: false,
    };
    manualLogsState = {
      data: [
        {
          capturedAt: ago(2 * HOUR),
          source: "manual",
          metrics: { temp_f: 75, humidity_percent: 55, ph: null, ec: null },
        },
      ],
      isLoading: false,
    };
    alertsState = { rows: [{ id: "a1" }, { id: "a2" }] };

    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />);
    expect(
      screen.getByTestId("plant-detail-ai-doctor-context-readiness-mount"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel"),
    ).toBeTruthy();
    // Stage from props flowed through
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-stage").textContent,
    ).toBe("veg");
    // Open alerts forwarded
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-count-open-alerts").textContent,
    ).toBe("2");
    // Manual source labeled, no live label
    expect(
      screen.getByTestId("ai-doctor-context-readiness-panel-source-manual"),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("ai-doctor-context-readiness-panel-source-live"),
    ).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders 'Sensor data missing' when no sensor data exists", () => {
    recentActivityState = {
      data: [{ entry_at: ago(12 * HOUR), entry_type: "watering" }],
      isLoading: false,
    };
    manualLogsState = { data: [], isLoading: false };
    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />);
    const panel = screen.getByTestId("ai-doctor-context-readiness-panel");
    expect(panel.getAttribute("data-readiness-state")).toBe("sensor_missing");
  });

  it("renders safe fallback when compilation throws", () => {
    // Force the adapter to throw by feeding a freezing trap: replace data
    // with a getter that throws when iterated.
    const exploding: unknown[] = [];
    Object.defineProperty(exploding, "length", {
      get() {
        throw new Error("boom");
      },
    });
    recentActivityState = { data: exploding, isLoading: false };
    render(<PlantDetailAiDoctorContextReadinessMount {...baseProps} />);
    expect(
      screen.getByTestId("plant-detail-ai-doctor-context-readiness-mount-fallback"),
    ).toBeTruthy();
  });

  it("static guard: mount source imports no Supabase/network/write helpers", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "src/components/PlantDetailAiDoctorContextReadinessMount.tsx",
      "utf8",
    );
    expect(src).not.toMatch(/integrations\/supabase/);
    expect(src).not.toMatch(/functions\s*\.\s*invoke/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/actionQueue/i);
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/createAlert|insertAlert/);
  });
});
