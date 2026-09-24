import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { SensorReadingLike } from "@/lib/sensorSnapshot";
const state = vi.hoisted(() => ({ rows: [] as SensorReadingLike[], plants: [] }));
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
    data: state.plants,
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
vi.mock("@/hooks/useImportedSensorHistory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useImportedSensorHistory")>()),
  useImportedSensorHistory: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/hooks/useCsvHistoryWindow", () => ({ useCsvHistoryWindow: () => ({}) }));
vi.mock("@/hooks/useTentPlantRosterActivity", () => ({
  useTentPlantRosterActivity: () => ({ byPlantId: {}, isLoading: false, isError: false }),
}));

// Keep the real tent query, routes, source disclosure, header and blocked
// presenter. Unrelated cards and their IO are outside this read-state proof.
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
const NOW = new Date("2026-09-23T12:00:00Z");
const clients: QueryClient[] = [];
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
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(NOW);
  state.rows = [];
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.useRealTimers();
});
describe("Tent Detail idle snapshot freshness", () => {
  it.each([
    ["live", 14],
    ["manual", 1439],
  ] as const)("ages %s evidence without a new read", (source, minutes) => {
    const ts = new Date(NOW.getTime() - minutes * 60000).toISOString();
    state.rows = [{ metric: "vpd_kpa", value: 1, ts, captured_at: ts, source }];
    const original = state.rows;
    mount();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent("In Veg VPD range.");
    expect(screen.queryByTestId("tent-detail-sensor-stale")).toBeNull();
    act(() => vi.advanceTimersByTime(120000));
    expect(screen.getByTestId("tent-detail-sensor-stale")).toBeVisible();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent(
      "historical, stale reading",
    );
    expect(screen.getByTestId("tent-detail-sensor-source")).toHaveTextContent(
      source === "manual" ? "Manual" : "Live",
    );
    expect(state.rows).toBe(original);
  });
  it("keeps a successful empty read empty across clock ticks", () => {
    mount();
    act(() => vi.advanceTimersByTime(120000));
    expect(screen.getByTestId("tent-detail-sensor-empty")).toBeVisible();
    expect(screen.queryByTestId("tent-detail-sensor-stale")).toBeNull();
  });

  it("shows stale guidance immediately when the latest reading is already past threshold", () => {
    const ts = new Date(NOW.getTime() - 16 * 60000).toISOString();
    state.rows = [{ metric: "vpd_kpa", value: 1, ts, captured_at: ts, source: "live" }];
    mount();
    expect(screen.getByTestId("tent-detail-sensor-stale")).toBeVisible();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent(
      "historical, stale reading",
    );
  });

  it("keeps a newer manual snapshot fresh while an older live group would have aged out", () => {
    const liveTs = new Date(NOW.getTime() - 14 * 60000).toISOString();
    const manualTs = new Date(NOW.getTime() - 5 * 60000).toISOString();
    state.rows = [
      { metric: "vpd_kpa", value: 1, ts: liveTs, captured_at: liveTs, source: "live" },
      { metric: "vpd_kpa", value: 1.1, ts: manualTs, captured_at: manualTs, source: "manual" },
    ];
    mount();
    expect(screen.getByTestId("tent-detail-sensor-source")).toHaveTextContent("Manual");
    expect(screen.queryByTestId("tent-detail-sensor-stale")).toBeNull();
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.queryByTestId("tent-detail-sensor-stale")).toBeNull();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent("In Veg VPD range.");
  });
});
