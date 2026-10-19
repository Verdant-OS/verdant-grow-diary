import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { SensorReading } from "@/mock";
import type { SensorReadingLike } from "@/lib/sensorSnapshot";

const OWNED_TENT = {
  id: "tent-1",
  name: "Proof tent",
  stage: "veg",
  light: { on: false, schedule: "", wattage: 0 },
  growId: "grow-1",
};

const state = vi.hoisted(() => ({
  rows: [] as SensorReadingLike[],
  manuals: [] as SensorReading[],
  tent: null as unknown,
  manualArgs: [] as unknown[],
  manualPending: false,
  manualError: false,
  manualRefetch: vi.fn(() => Promise.resolve([])),
  stability: null as unknown,
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/hooks/useGrowData", async (original) => ({
  ...(await original<typeof import("@/hooks/useGrowData")>()),
  useGrowTent: () => ({
    data: state.tent,
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
  useSensorsQuickLogManualReadings: (tentId: unknown) => {
    state.manualArgs.push(tentId);
    return {
      data: state.manuals,
      isPending: state.manualPending,
      isLoading: state.manualPending,
      isError: state.manualError,
      isSuccess: !state.manualPending && !state.manualError,
      fetchStatus: state.manualPending ? "fetching" : "idle",
      refetch: state.manualRefetch,
    };
  },
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
vi.mock("@/components/EnvironmentStabilityCard", () => ({
  default: ({ result }: { result: unknown }) => {
    state.stability = result;
    return null;
  },
}));
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
  state.tent = OWNED_TENT;
  state.manualArgs = [];
  state.manualPending = false;
  state.manualError = false;
  state.manualRefetch.mockClear();
  state.stability = null;
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
    // The fallback's provenance sits on the VPD-specific element.
    expect(screen.getByTestId("tent-detail-vpd-stale")).toBeVisible();
    expect(screen.getByTestId("tent-detail-vpd-source")).toHaveTextContent("Manual reading");
    expect(screen.getByTestId("tent-detail-vpd-captured")).toBeVisible();
    // No stored snapshot: the shared Environment header claims nothing.
    expect(screen.queryByTestId("tent-detail-sensor-source")).toBeNull();
    expect(screen.queryByTestId("tent-detail-sensor-captured")).toBeNull();
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
    expect(screen.getByTestId("tent-detail-vpd-source")).toHaveTextContent("Manual reading");
    expect(screen.getByTestId("tent-detail-vpd-stale")).toBeVisible();
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
    expect(screen.queryByTestId("tent-detail-vpd-stale")).toBeNull();
    expect(screen.getByTestId("tent-detail-vpd-source")).toHaveTextContent("Manual reading");
  });

  it("never shows a recent CSV fallback VPD as a healthy current reading (Codex P1 at 5211eb07)", () => {
    const tempTs = new Date(NOW.getTime() - 20 * 60 * 1000).toISOString();
    const vpdTs = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    state.rows = [
      { metric: "temperature_c", value: 24, ts: tempTs, captured_at: tempTs, source: "live" },
    ];
    state.manuals = [{ ...manualVpd(vpdTs), source: "csv" }];
    mount();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toHaveTextContent(
      "historical, stale reading",
    );
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).not.toHaveTextContent(
      "In Veg VPD range. VPD targets",
    );
    expect(screen.getByTestId("tent-detail-vpd-stale")).toBeVisible();
  });
});

// Repair of #2148 review findings.
describe("Tent detail mixed-metric provenance (Codex P1 4288338459)", () => {
  it("keeps the shared Environment header on the stored snapshot's source, time and staleness", () => {
    const tempTs = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    const vpdTs = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    state.rows = [
      { metric: "temperature_c", value: 24, ts: tempTs, captured_at: tempTs, source: "live" },
      { metric: "humidity_pct", value: 55, ts: tempTs, captured_at: tempTs, source: "live" },
    ];
    state.manuals = [manualVpd(vpdTs)];
    mount();
    expect(screen.getByTestId("tent-detail-sensor-source")).not.toHaveTextContent("Manual reading");
    expect(screen.getByTestId("tent-detail-sensor-captured")).toHaveTextContent("5 minutes ago");
    // The live temp/RH are fresh; the old manual VPD must not mark them stale.
    expect(screen.queryByTestId("tent-detail-sensor-stale")).toBeNull();
    expect(screen.getByTestId("tent-detail-vpd-source")).toHaveTextContent("Manual reading");
    expect(screen.getByTestId("tent-detail-vpd-captured")).toHaveTextContent("2 days ago");
    expect(screen.getByTestId("tent-detail-vpd-stale")).toBeVisible();
  });

  it("shows no separate VPD provenance when the stored snapshot observed VPD", () => {
    const ts = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    state.rows = [
      { metric: "temperature_c", value: 24, ts, captured_at: ts, source: "live" },
      { metric: "humidity_pct", value: 55, ts, captured_at: ts, source: "live" },
      { metric: "vpd_kpa", value: 1.1, ts, captured_at: ts, source: "live" },
    ];
    mount();
    expect(screen.getByTestId("tent-detail-sensor-source")).toBeVisible();
    expect(screen.queryByTestId("tent-detail-vpd-provenance")).toBeNull();
  });
});

describe("Tent detail VPD sensor truth (Copilot 4286153360)", () => {
  it("does not restore or grade a VPD whose stored RH failed realism", () => {
    const ts = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    state.rows = [
      { metric: "temperature_c", value: 24, ts, captured_at: ts, source: "live" },
      { metric: "humidity_pct", value: 150, ts, captured_at: ts, source: "live" },
      { metric: "vpd_kpa", value: 1.2, ts, captured_at: ts, source: "live" },
    ];
    mount();
    // Header: the snapshot rejected this VPD and no fallback brings it back.
    expect(screen.queryByTestId("tent-detail-vpd-stage-hint")).toBeNull();
    expect(screen.queryByTestId("tent-detail-vpd-provenance")).toBeNull();
    // Card: the rejected VPD is not graded.
    const stability = state.stability as { last24h: { totalConsidered: number } } | null;
    expect(stability?.last24h.totalConsidered).toBe(0);
  });
});

describe("Tent detail manual-history read (Codex security 4288384000, Copilot 4286153585)", () => {
  it("does not start the manual-history read for a tent the owner-scoped read did not return", () => {
    state.tent = null;
    mount();
    expect(screen.getByText("Tent not found")).toBeVisible();
    expect(state.manualArgs.length).toBeGreaterThan(0);
    expect(state.manualArgs.every((arg) => arg === null || arg === undefined)).toBe(true);
  });

  it("starts the manual-history read only with the owned tent's id", () => {
    mount();
    expect(state.manualArgs).toContain("tent-1");
    expect(state.manualArgs.every((arg) => arg === "tent-1" || arg == null)).toBe(true);
  });

  it("discloses a pending manual-history read and keeps stored readings", () => {
    const ts = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    state.rows = [{ metric: "vpd_kpa", value: 1.1, ts, captured_at: ts, source: "live" }];
    state.manualPending = true;
    mount();
    expect(screen.getByTestId("tent-detail-manual-history-pending")).toBeVisible();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toBeVisible();
    const stability = state.stability as { last24h: { totalConsidered: number } } | null;
    expect(stability?.last24h.totalConsidered).toBe(1);
  });

  it("discloses a failed manual-history read with a retry", () => {
    const ts = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    state.rows = [{ metric: "vpd_kpa", value: 1.1, ts, captured_at: ts, source: "live" }];
    state.manualError = true;
    mount();
    const notice = screen.getByTestId("tent-detail-manual-history-error");
    expect(notice).toBeVisible();
    expect(screen.getByTestId("tent-detail-vpd-stage-hint")).toBeVisible();
    fireEvent.click(within(notice).getByRole("button", { name: /retry/i }));
    expect(state.manualRefetch).toHaveBeenCalledTimes(1);
  });
});
