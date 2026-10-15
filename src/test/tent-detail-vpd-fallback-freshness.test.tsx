import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { SensorReading } from "@/mock";
import type { SensorReadingLike } from "@/lib/sensorSnapshot";

const state = vi.hoisted(() => ({
  rows: [] as SensorReadingLike[],
  manuals: [] as SensorReading[],
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/hooks/useGrowData", async (original) => ({
  ...(await original<typeof import("@/hooks/useGrowData")>()),
  useGrowTent: () => ({
    data: {
      id: "tent-1",
      name: "Proof tent",
      stage: "veg",
      light: { on: false, schedule: "", wattage: 0 },
      growId: "grow-1",
    },
    isLoading: false,
    isPending: false,
    isError: false,
    fetchStatus: "idle",
  }),
  useGrowPlants: () => ({
    data: [],
    isPending: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
  }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: state.rows, isPending: false, isError: false }),
}));
vi.mock("@/hooks/useSensorsQuickLogManualReadings", () => ({
  useSensorsQuickLogManualReadings: () => ({
    data: state.manuals,
    isPending: false,
    isLoading: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
    refetch: () => Promise.resolve([]),
  }),
}));
vi.mock("@/hooks/useImportedSensorHistory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useImportedSensorHistory")>()),
  useImportedSensorHistory: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/hooks/useCsvHistoryWindow", () => ({ useCsvHistoryWindow: () => ({}) }));
vi.mock("@/hooks/useTentPlantRosterActivity", () => ({
  useTentPlantRosterActivity: () => ({ byPlantId: {}, isLoading: false, isError: false }),
}));
vi.mock("@/components/VpdStageMissingBadge", () => ({ default: () => null }));
vi.mock("@/components/EcowittTentSnapshotV0Card", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentStabilityCard", () => ({ default: () => null }));
vi.mock("@/components/WateringCadenceHistoryStrip", () => ({ default: () => null }));
vi.mock("@/components/DrybackMonitoringStrip", () => ({ default: () => null }));
vi.mock("@/components/TentAiDoctorSessionsPanel", () => ({ default: () => null }));
vi.mock("@/components/StageBadge", () => ({ default: () => null }));
vi.mock("@/components/MetricChip", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));
vi.mock("@/components/AddExistingPlantDialog", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/TentCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/PlantPhoto", () => ({ default: () => null }));
vi.mock("@/components/TentManualSnapshotChangeContext", () => ({ default: () => null }));
vi.mock("@/components/TentManualSnapshotHistoryList", () => ({ default: () => null }));
vi.mock("@/components/ManualSnapshotTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TimelineMemorySection", () => ({ default: () => null }));
vi.mock("@/components/QuickLogGroupedTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/ImportedSensorHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/TentSensorWebhookSettingsCard", () => ({ default: () => null }));
vi.mock("@/components/TentBridgeTokensCard", () => ({ default: () => null }));
vi.mock("@/components/TentSensorSourceHealthCard", () => ({ default: () => null }));
vi.mock("@/components/FirstPlantMemoryCta", () => ({ default: () => null }));
vi.mock("@/components/TentPlantRosterPanel", () => ({ default: () => null }));
vi.mock("@/components/TentPlantTabs", () => ({ default: () => null }));
vi.mock("@/components/TentPlantActivityPanels", () => ({ default: () => null }));
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/TentPendingOutcomeNotice", () => ({ default: () => null }));

import TentDetail from "@/pages/TentDetail";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const clients: QueryClient[] = [];

function manualVpd(iso: string): SensorReading {
  return {
    ts: iso,
    capturedAt: iso,
    tentId: "tent-1",
    temp: 0,
    rh: 0,
    vpd: 1,
    co2: 0,
    soil: 0,
    observedMetrics: ["vpd"],
    source: "manual",
    status: "usable",
  };
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/tents/tent-1"]}>
        <Routes>
          <Route path="/tents/:id" element={<TentDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.rows = [];
  state.manuals = [];
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
});

describe("Tent detail fallback VPD freshness", () => {
  it("marks a two-day-old Quick Log VPD historical when no stored rows exist", () => {
    const ts = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    state.manuals = [manualVpd(ts)];
    mount();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent(
      "historical, stale reading",
    );
    expect(screen.getByTestId("tent-detail-sensor-stale")).toBeVisible();
    expect(screen.getByTestId("tent-detail-sensor-source")).toHaveTextContent("Manual reading");
    expect(screen.getByTestId("tent-detail-sensor-captured")).toBeVisible();
  });

  it("does not let a fresh temperature-only row make an old Quick Log VPD current", () => {
    const tempTs = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    const vpdTs = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    state.rows = [
      { metric: "temperature_c", value: 24, ts: tempTs, captured_at: tempTs, source: "live" },
    ];
    state.manuals = [manualVpd(vpdTs)];
    mount();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent(
      "historical, stale reading",
    );
    expect(screen.getByTestId("tent-detail-sensor-source")).toHaveTextContent("Manual reading");
    expect(screen.getByTestId("tent-detail-sensor-stale")).toBeVisible();
  });

  it("keeps a fresh Quick Log VPD current when the stored snapshot is already stale", () => {
    const tempTs = new Date(NOW.getTime() - 20 * 60 * 1000).toISOString();
    const vpdTs = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    state.rows = [
      { metric: "temperature_c", value: 24, ts: tempTs, captured_at: tempTs, source: "live" },
    ];
    state.manuals = [manualVpd(vpdTs)];
    mount();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent(
      "In Veg VPD range. VPD targets depend on plant stage.",
    );
    expect(screen.queryByTestId("tent-detail-sensor-stale")).toBeNull();
    expect(screen.getByTestId("tent-detail-sensor-source")).toHaveTextContent("Manual reading");
  });
});
