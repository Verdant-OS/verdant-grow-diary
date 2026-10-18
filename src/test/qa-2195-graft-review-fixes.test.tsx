/**
 * Regression suite for PR #2195 exact-head review findings at 97334f6b:
 *  - P1 #1: Validate Celsius values before displaying a Timeline chip (both with and without
 *    validateManualCompatibility, and when dual temp_f/temp_c fields are out of range).
 *  - P1 #2: Include the tent on each reading in the aggregate CSV export (including when
 *    SensorChart exports aggregate exportData or when tentNamesById has blank names).
 *  - P1 #3: Disable Dashboard CSV export while sensor history is refreshing (isFetching).
 *  - P2 #1: Keep cached Quick Log manual readings visible on the Dashboard chart during a
 *    background refetch while keeping CSV export disabled.
 *  - P2 #2: Keep manualSensorSnapshotChangeContextRules and manualSensorSnapshotHistoryListRules
 *    pure (do not read localStorage when temperatureUnit is omitted).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SensorReading } from "@/mock";
import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";
import {
  clearTemperatureUnitPreference,
  saveTemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";
import { buildSensorReadingsCsv, downloadTextFile } from "@/lib/sensorChartExport";
import { buildTimelineSensorSnapshotViewModel } from "@/lib/timelineSensorSnapshotViewModel";
import { buildManualSnapshotChangeContext } from "@/lib/manualSensorSnapshotChangeContextRules";
import { buildManualSnapshotHistoryList } from "@/lib/manualSensorSnapshotHistoryListRules";
import SensorChart from "@/components/SensorChart";

const H = vi.hoisted(() => ({
  scoped: true,
  tentId: "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f",
  aggregateRows: [] as unknown[],
  perTentRows: [] as unknown[],
  sensorReadingsFetching: false,
  quickLogManuals: [] as SensorReading[],
  quickLogManualsPending: false,
  quickLogManualsError: false,
  quickLogManualsFetching: false,
  alertRows: [] as unknown[],
  snapshotState: null as SnapshotState | null,
}));

vi.mock("@/lib/sensorChartExport", async (original) => ({
  ...(await original<typeof import("@/lib/sensorChartExport")>()),
  downloadTextFile: vi.fn(),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data: [
      {
        id: H.tentId,
        name: "Main Tent",
        brand: "",
        size: "",
        stage: "veg",
        light: { on: false, schedule: "", wattage: 0 },
        alertCount: 0,
        growId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    ],
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
    refetch: vi.fn(),
  }),
  useGrowPlants: () => ({
    data: [],
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: H.aggregateRows,
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: H.sensorReadingsFetching,
    fetchStatus: H.sensorReadingsFetching ? "fetching" : "idle",
    refetch: vi.fn(),
  }),
  useSensorReadingsByTents: () => ({
    byTent: {
      [H.tentId]: H.perTentRows,
    },
    statusByTent: {
      [H.tentId]: "success",
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useSensorsQuickLogManualReadings", () => ({
  useSensorsQuickLogManualReadings: () => ({
    data: H.quickLogManuals,
    isPending: H.quickLogManualsPending,
    isLoading: H.quickLogManualsPending,
    isError: H.quickLogManualsError,
    isSuccess: !H.quickLogManualsPending && !H.quickLogManualsError,
    fetchStatus: H.quickLogManualsPending || H.quickLogManualsFetching ? "fetching" : "idle",
    refetch: () => Promise.resolve([]),
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: H.scoped ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : null,
    scopedGrow: H.scoped
      ? { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "QA Grow", stage: "veg" }
      : null,
    scopedGrowName: "QA Grow",
    isValidScopedGrow: H.scoped,
    backHref: null,
  }),
}));

vi.mock("@/hooks/useDashboardScopedData", () => ({
  useDashboardScopedData: () => ({
    recent: { status: "ok", items: [] },
    pending: { status: "ok", items: [] },
  }),
}));

vi.mock("@/hooks/useOneTentActivationEvidence", () => ({
  useOneTentActivationEvidence: () => ({
    status: "idle",
    summary: { count: 0, latestAt: null, latestSource: null },
  }),
}));

vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () =>
    H.snapshotState ?? {
      status: "ok",
      snapshot: {
        source: "manual",
        ts: "2026-10-15T12:00:00.000Z",
        tent_id: H.tentId,
        temp: 24,
        rh: 55,
        vpd: 1.1,
        co2: null,
        soil: null,
        soil_ec: null,
        soil_temp: null,
        ppfd: null,
        device_id: null,
        csvVendor: null,
      },
    },
}));

vi.mock("@/hooks/useEnvironmentTrends", () => ({
  useEnvironmentTrends: () => ({
    status: "idle",
    trends: {
      status: "empty",
      headline: "No trend data yet",
      count: 0,
      latestTs: null,
      source: "unavailable",
      temp: { avg: null, min: null, max: null, count: 0 },
      rh: { avg: null, min: null, max: null, count: 0 },
      vpd: { avg: null, min: null, max: null, count: 0 },
    },
  }),
}));

vi.mock("@/hooks/useGrowTargets", () => ({
  useGrowTargets: () => ({ status: "ok", targets: null, reload: vi.fn() }),
}));

vi.mock("@/hooks/usePersistEnvironmentAlerts", () => ({
  usePersistEnvironmentAlerts: () => undefined,
}));

vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({
    status: "ok",
    alerts: H.alertRows,
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));
vi.mock("@/hooks/useNowTick", () => ({
  useNowTick: () => Date.parse("2026-10-15T12:05:00.000Z"),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "QA Grow", stage: "veg" }],
    activeGrowId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/VpdStageMissingBadge", () => ({ default: () => null }));
vi.mock("@/components/EcowittLatestSnapshotCard", () => ({ default: () => null }));
vi.mock("@/components/StabilityChipDrilldown", () => ({ default: () => null }));
vi.mock("@/components/ScopedGrowBanner", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/DashboardDataSourceDisclosure", () => ({ default: () => null }));
vi.mock("@/components/OnboardingChecklistCard", () => ({ default: () => null }));
vi.mock("@/components/PublicQuickLogHandoffCard", () => ({ default: () => null }));
vi.mock("@/components/OnboardingProgressPill", () => ({ default: () => null }));
vi.mock("@/components/OperatorModeCallout", () => ({ default: () => null }));
vi.mock("@/components/DashboardOperatorAccountReadModels", () => ({ default: () => null }));
vi.mock("@/components/ReleaseReadinessOperatorCard", () => ({ default: () => null }));
vi.mock("@/components/LineageRepairCta", () => ({ default: () => null }));
vi.mock("@/components/DashboardPendingOutcomeReviewsCard", () => ({ default: () => null }));
vi.mock("@/components/SafeByDesignNotice", () => ({ default: () => null }));
vi.mock("@/components/DashboardSensorHealthSummary", () => ({ default: () => null }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
vi.mock("@/components/DailyGrowCheckStatusCard", () => ({ default: () => null }));
vi.mock("@/components/DashboardDailyGrowCheckPanel", () => ({ default: () => null }));
vi.mock("@/components/GuidedActionChecklistPanel", () => ({ default: () => null }));
vi.mock("@/components/GrowRecoveryPrompt", () => ({ default: () => null }));
vi.mock("@/components/TonightTentHomeCard", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentRibbon", () => ({ default: () => null }));

import Dashboard from "@/pages/Dashboard";

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  clearTemperatureUnitPreference();
  vi.mocked(downloadTextFile).mockClear();
  H.scoped = true;
  H.aggregateRows = [];
  H.perTentRows = [];
  H.sensorReadingsFetching = false;
  H.quickLogManuals = [];
  H.quickLogManualsPending = false;
  H.quickLogManualsError = false;
  H.quickLogManualsFetching = false;
  H.alertRows = [];
  H.snapshotState = null;
});

afterEach(() => {
  cleanup();
  clearTemperatureUnitPreference();
});

describe("PR #2195 exact-head review fixes", () => {
  it("P1 #1: validates Celsius values before displaying a Timeline chip even when validateManualCompatibility is omitted", () => {
    const outOfRangeC = buildTimelineSensorSnapshotViewModel({ temp_c: 100 }, { preferUnit: "C" });
    expect(outOfRangeC.kind).toBe("invalid");

    const mismatchDual = buildTimelineSensorSnapshotViewModel(
      { temp_f: 75, temp_c: 100 },
      { preferUnit: "C" },
    );
    expect(mismatchDual.kind).toBe("invalid");

    const outOfRangeFWithValidC = buildTimelineSensorSnapshotViewModel(
      { temp_f: 200, temp_c: 24, source: "manual" },
      { preferUnit: "C", validateManualCompatibility: true },
    );
    expect(outOfRangeFWithValidC.kind).toBe("invalid");
    if (outOfRangeFWithValidC.kind === "invalid") {
      expect(outOfRangeFWithValidC.errors).toContain(
        "Air temperature is outside the realistic 40–110°F grow-room range.",
      );
    }
  });

  it("P1 #2: includes the tent on each reading in the aggregate CSV export", () => {
    const readingA: SensorReading = {
      ts: "2026-10-15T10:00:00.000Z",
      capturedAt: "2026-10-15T10:00:00.000Z",
      tentId: "tent-alpha",
      temp: 24,
      rh: 55,
      vpd: 1.1,
      co2: 800,
      soil: 42,
      observedMetrics: ["temp", "rh", "vpd", "co2", "soil"],
      source: "manual",
      status: "usable",
    };

    render(<SensorChart data={[readingA]} exportData={[readingA]} metric="temp" />);
    fireEvent.click(screen.getByTestId("sensor-chart-export-btn"));
    const exportedCsv = vi.mocked(downloadTextFile).mock.calls[0]?.[0] ?? "";
    const exportedLines = exportedCsv.trim().split("\n");
    expect(exportedLines[0]?.endsWith(",Tent")).toBe(true);
    expect(exportedLines[1]?.endsWith(",tent-alpha")).toBe(true);

    // Blank tent name in tentNamesById must fall back to tentId rather than emitting whitespace
    const blankNameCsv = buildSensorReadingsCsv([readingA], undefined, "celsius", {
      tentNamesById: { "tent-alpha": "   " },
    });
    const blankNameLines = blankNameCsv.trim().split("\n");
    expect(blankNameLines[0]?.endsWith(",Tent")).toBe(true);
    expect(blankNameLines[1]?.endsWith(",tent-alpha")).toBe(true);
  });

  it("P1 #3: disables Dashboard CSV export while sensor history is refreshing", () => {
    const r1 = {
      id: "sr-1",
      tent_id: H.tentId,
      ts: "2026-10-15T08:00:00.000Z",
      captured_at: "2026-10-15T08:00:00.000Z",
      metric: "temperature_c",
      value: 24,
      source: "manual",
      quality: "ok",
      raw_payload: null,
    };
    H.aggregateRows = [r1];
    H.perTentRows = [r1];
    H.sensorReadingsFetching = true;

    renderDashboard();
    const exportBtn = screen.getByTestId("sensor-chart-export-btn") as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true);
    fireEvent.click(exportBtn);
    expect(downloadTextFile).not.toHaveBeenCalled();
  });

  it("P2 #1: keeps cached Quick Log manual readings visible on the Dashboard chart during a refetch while disabling export", () => {
    H.quickLogManuals = [
      {
        ts: "2026-10-15T10:00:00.000Z",
        capturedAt: "2026-10-15T10:00:00.000Z",
        tentId: H.tentId,
        temp: 24.5,
        rh: 58,
        vpd: 1.15,
        co2: 0,
        soil: 0,
        observedMetrics: ["temp", "rh", "vpd"],
        source: "manual",
        status: "usable",
      },
    ];
    H.quickLogManualsFetching = true;

    renderDashboard();
    expect(screen.queryByTestId("dashboard-tent-chart-empty")).not.toBeInTheDocument();
    const exportBtn = screen.getByTestId("sensor-chart-export-btn") as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true);
  });

  it("P2 #2: keeps manualSensorSnapshotChangeContextRules and manualSensorSnapshotHistoryListRules pure when temperatureUnit is omitted", () => {
    saveTemperatureUnitPreference("celsius");

    const ctx = buildManualSnapshotChangeContext({
      previous: { ts: "2026-10-15T10:00:00.000Z", metrics: { temperature_c: 24 } },
      latest: { ts: "2026-10-15T11:00:00.000Z", metrics: { temperature_c: 25 } },
    });
    expect(ctx.deltas[0]?.formatted).toBe("+1.8°F");

    const history = buildManualSnapshotHistoryList(
      [
        {
          tent_id: H.tentId,
          ts: "2026-10-15T10:00:00.000Z",
          metric: "temperature_c",
          value: 24,
          source: "manual",
        },
        {
          tent_id: H.tentId,
          ts: "2026-10-15T11:00:00.000Z",
          metric: "temperature_c",
          value: 25,
          source: "manual",
        },
      ],
      { tentId: H.tentId },
    );
    expect(history[0]?.metrics[0]?.formatted).toBe("77.0°F");
    expect(history[0]?.deltas[0]?.formatted).toBe("+1.8°F");
  });
});
