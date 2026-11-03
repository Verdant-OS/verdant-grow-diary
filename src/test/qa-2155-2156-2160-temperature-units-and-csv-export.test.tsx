/**
 * Regression suite for GitHub issues #2155, #2156, and #2160:
 *  - #2155: Dashboard CSV export follows the user's °C/°F preference (header + values).
 *  - #2156: Dashboard CSV export includes all readings (Quick Log manual readings + all tents in scope).
 *  - #2160: °C/°F setting is applied consistently across the Dashboard environment strip,
 *    Timeline entries/chips/deltas, and Dashboard alert text.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
import { manualSensorReadingsToTimelineEntries } from "@/lib/timelineManualSensorMeasurementRules";
import {
  buildTimelineCardSensorSnapshotViewModel,
  resolveTimelineCardSensorResolution,
} from "@/lib/timelineSensorSnapshotViewModel";
import SensorChart from "@/components/SensorChart";
import TentManualSnapshotChangeContext from "@/components/TentManualSnapshotChangeContext";
import TentManualSnapshotHistoryList from "@/components/TentManualSnapshotHistoryList";

const H = vi.hoisted(() => ({
  scoped: true,
  tentId: "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f",
  secondTentId: "6b2d7f10-3c4e-4d6f-9a01-2b3c4d5e6f70",
  secondTentEnabled: false,
  aggregateRows: [] as unknown[],
  perTentRows: [] as unknown[],
  secondTentRows: [] as unknown[],
  quickLogManuals: [] as SensorReading[],
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
      ...(H.secondTentEnabled
        ? [
            {
              id: H.secondTentId,
              name: "Second Tent",
              brand: "",
              size: "",
              stage: "veg",
              light: { on: false, schedule: "", wattage: 0 },
              alertCount: 0,
              growId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            },
          ]
        : []),
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
    isError: false,
    refetch: vi.fn(),
  }),
  useSensorReadingsByTents: () => ({
    byTent: {
      [H.tentId]: H.perTentRows,
      [H.secondTentId]: H.secondTentRows,
    },
    statusByTent: {
      [H.tentId]: "success",
      [H.secondTentId]: "success",
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useSensorsQuickLogManualReadings", () => ({
  useSensorsQuickLogManualReadings: () => ({
    data: H.quickLogManuals,
    isPending: false,
    isLoading: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
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
        temp: 35,
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
  H.secondTentEnabled = false;
  H.aggregateRows = [];
  H.perTentRows = [];
  H.secondTentRows = [];
  H.quickLogManuals = [];
  H.alertRows = [];
  H.snapshotState = null;
});

afterEach(() => {
  cleanup();
  clearTemperatureUnitPreference();
});

describe("Issue #2155 — CSV export follows °C/°F preference", () => {
  const sampleReadings: SensorReading[] = [
    {
      ts: "2026-10-15T10:00:00.000Z",
      capturedAt: "2026-10-15T10:00:00.000Z",
      tentId: "t1",
      temp: 23.89,
      rh: 55,
      vpd: 1.1,
      co2: 0,
      soil: 0,
      observedMetrics: ["temp", "rh", "vpd"],
      source: "manual",
      status: "usable",
    },
    {
      ts: "2026-10-15T11:00:00.000Z",
      capturedAt: "2026-10-15T11:00:00.000Z",
      tentId: "t1",
      temp: 23.33,
      rh: 56,
      vpd: 1.05,
      co2: 0,
      soil: 0,
      observedMetrics: ["temp", "rh", "vpd"],
      source: "manual",
      status: "usable",
    },
  ];

  it("exports Temperature (°F) header and converted °F values when preference is fahrenheit", () => {
    saveTemperatureUnitPreference("fahrenheit");
    const csv = buildSensorReadingsCsv(sampleReadings, Date.parse("2026-10-15T12:00:00.000Z"));
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Temperature (°F)");
    expect(lines[0]).not.toContain("Temperature (°C)");
    expect(lines[1].split(",")[1]).toBe("75");
    expect(lines[2].split(",")[1]).toBe("74");
  });

  it("SensorChart Export CSV button honors fahrenheit and celsius preferences", () => {
    saveTemperatureUnitPreference("fahrenheit");
    const { unmount } = render(<SensorChart data={sampleReadings} metric="temp" />);
    fireEvent.click(screen.getByTestId("sensor-chart-export-btn"));
    const csvF = vi.mocked(downloadTextFile).mock.calls[0]?.[0] ?? "";
    expect(csvF.split("\n")[0]).toContain("Temperature (°F)");
    expect(csvF.split("\n")[1].split(",")[1]).toBe("75");
    expect(csvF.split("\n")[2].split(",")[1]).toBe("74");
    unmount();

    vi.mocked(downloadTextFile).mockClear();
    saveTemperatureUnitPreference("celsius");
    render(<SensorChart data={sampleReadings} metric="temp" />);
    fireEvent.click(screen.getByTestId("sensor-chart-export-btn"));
    const csvC = vi.mocked(downloadTextFile).mock.calls[0]?.[0] ?? "";
    expect(csvC.split("\n")[0]).toContain("Temperature (°C)");
    expect(csvC.split("\n")[1].split(",")[1]).toBe("23.89");
    expect(csvC.split("\n")[2].split(",")[1]).toBe("23.33");
  });
});

describe("Issue #2156 — Dashboard CSV export includes all 4 readings", () => {
  it("exports all 4 manual readings when 2 are in sensor_readings and 2 are Quick Log manuals", () => {
    saveTemperatureUnitPreference("fahrenheit");
    const r1 = {
      id: "sr-1",
      tent_id: H.tentId,
      ts: "2026-10-15T08:00:00.000Z",
      captured_at: "2026-10-15T08:00:00.000Z",
      metric: "temperature_c",
      value: 23.89,
      source: "manual",
      quality: "ok",
      raw_payload: null,
    };
    const r2 = {
      id: "sr-2",
      tent_id: H.tentId,
      ts: "2026-10-15T09:00:00.000Z",
      captured_at: "2026-10-15T09:00:00.000Z",
      metric: "temperature_c",
      value: 23.33,
      source: "manual",
      quality: "ok",
      raw_payload: null,
    };
    H.aggregateRows = [r1, r2];
    H.perTentRows = [r1, r2];
    H.quickLogManuals = [
      {
        ts: "2026-10-15T10:00:00.000Z",
        capturedAt: "2026-10-15T10:00:00.000Z",
        tentId: H.tentId,
        temp: 24.44,
        rh: 58,
        vpd: 1.15,
        co2: 0,
        soil: 0,
        observedMetrics: ["temp", "rh", "vpd"],
        source: "manual",
        status: "usable",
      },
      {
        ts: "2026-10-15T11:00:00.000Z",
        capturedAt: "2026-10-15T11:00:00.000Z",
        tentId: H.tentId,
        temp: 25.0,
        rh: 60,
        vpd: 1.2,
        co2: 0,
        soil: 0,
        observedMetrics: ["temp", "rh", "vpd"],
        source: "manual",
        status: "usable",
      },
    ];

    renderDashboard();
    fireEvent.click(screen.getByTestId("sensor-chart-export-btn"));
    const csv = vi.mocked(downloadTextFile).mock.calls[0]?.[0] ?? "";
    const lines = csv.trim().split("\n");
    // 1 header + 4 data rows = 5 lines
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain("Temperature (°F)");
    expect(lines.slice(1).map((line) => line.split(",")[1])).toEqual(["75", "74", "76", "77"]);
  });
});

describe("Issue #2160 — °C/°F setting applied across Dashboard strip, Timeline, and alert text", () => {
  it("Dashboard environment strip renders 35.0°C (not 95.0°F) when preference is celsius", () => {
    saveTemperatureUnitPreference("celsius");
    const row35C = {
      id: "sr-35c",
      tent_id: H.tentId,
      ts: "2026-10-15T12:00:00.000Z",
      captured_at: "2026-10-15T12:00:00.000Z",
      metric: "temperature_c",
      value: 35,
      source: "manual",
      quality: "ok",
      raw_payload: null,
    };
    H.aggregateRows = [row35C];
    H.perTentRows = [row35C];

    renderDashboard();
    const tentStripCard = screen.getByTestId(`dashboard-env-snapshot-tent-${H.tentId}`);
    expect(tentStripCard.getAttribute("aria-label")).toContain("Temperature 35.0°C");
    expect(tentStripCard.getAttribute("aria-label")).not.toContain("95.0°F");
    const tempChip = within(tentStripCard).getByTestId(
      `dashboard-env-snapshot-metric-${H.tentId}-temp`,
    );
    expect(tempChip.textContent).toContain("35.0°C");
    expect(tempChip.textContent).not.toContain("95.0°F");
  });

  it("Dashboard Needs attention and Environment Alerts format alert text in °F when preference is fahrenheit", () => {
    saveTemperatureUnitPreference("fahrenheit");
    const row35C = {
      id: "sr-35c",
      tent_id: H.tentId,
      ts: "2026-10-15T12:00:00.000Z",
      captured_at: "2026-10-15T12:00:00.000Z",
      metric: "temperature_c",
      value: 35,
      source: "manual",
      quality: "ok",
      raw_payload: null,
    };
    H.aggregateRows = [row35C];
    H.perTentRows = [row35C];
    H.alertRows = [
      {
        id: "alert-1",
        grow_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        tent_id: H.tentId,
        plant_id: null,
        status: "open",
        severity: "warning",
        metric: "temp",
        title: "Temperature above stage range",
        reason:
          "Temperature is above the veg target range. Observed 35°C (veg range 22°C–28°C). Reading at 2026-10-15T12:00:00.000Z. Recommendation: Review airflow.",
        source: "default_thresholds",
        first_seen_at: "2026-10-15T12:00:00.000Z",
        last_seen_at: "2026-10-15T12:00:00.000Z",
        acknowledged_at: null,
        resolved_at: null,
        created_at: "2026-10-15T12:00:00.000Z",
        updated_at: "2026-10-15T12:00:00.000Z",
      },
    ];

    renderDashboard();
    const activeAlertItem = screen.getByTestId("dashboard-active-alert-item");
    expect(activeAlertItem.textContent).toContain("95°F");
    expect(activeAlertItem.textContent).not.toContain("35°C");

    const envAlertsSection = screen.getByLabelText("Environment Alerts");
    expect(envAlertsSection.textContent).toContain("95°F");
    expect(envAlertsSection.textContent).not.toContain("35°C");
  });

  it("Timeline manual sensor receipts and snapshot chips follow celsius preference", () => {
    saveTemperatureUnitPreference("celsius");
    const [receipt] = manualSensorReadingsToTimelineEntries(
      [
        {
          id: "m1",
          tent_id: H.tentId,
          metric: "temperature_c",
          value: 23.33,
          source: "manual",
          ts: "2026-10-15T12:00:00.000Z",
          captured_at: "2026-10-15T12:00:00.000Z",
          quality: "ok",
        },
      ],
      new Date("2026-10-15T12:05:00.000Z"),
    );
    expect(receipt.note).toContain("23.3°C");
    expect(receipt.note).not.toContain("°F");

    const resolution = resolveTimelineCardSensorResolution({
      manual_sensor_snapshot: { source: "manual", ts: "2026-10-15T12:00:00.000Z", temp_f: 74 },
    });
    const cardVm = buildTimelineCardSensorSnapshotViewModel(resolution);
    expect(cardVm.sensorViewModel.kind).toBe("chips");
    if (cardVm.sensorViewModel.kind === "chips") {
      expect(cardVm.sensorViewModel.chips[0]?.display).toBe("23.3°C");
      expect(cardVm.sensorViewModel.chips[0]?.unit).toBe("°C");
    }
  });

  it("Tent manual snapshot history and change context follow celsius preference", () => {
    saveTemperatureUnitPreference("celsius");
    const readings = [
      {
        id: "r1",
        tent_id: H.tentId,
        ts: "2026-10-15T10:00:00.000Z",
        captured_at: "2026-10-15T10:00:00.000Z",
        created_at: "2026-10-15T10:00:00.000Z",
        metric: "temperature_c",
        value: 23.89,
        source: "manual",
        quality: "ok",
        user_id: "u1",
        device_id: null,
        raw_payload: null,
        notes: null,
        unit_unconfirmed: false,
      },
      {
        id: "r2",
        tent_id: H.tentId,
        ts: "2026-10-15T11:00:00.000Z",
        captured_at: "2026-10-15T11:00:00.000Z",
        created_at: "2026-10-15T11:00:00.000Z",
        metric: "temperature_c",
        value: 23.33,
        source: "manual",
        quality: "ok",
        user_id: "u1",
        device_id: null,
        raw_payload: null,
        notes: null,
        unit_unconfirmed: false,
      },
    ];

    render(
      <>
        <TentManualSnapshotChangeContext tentId={H.tentId} readings={readings} />
        <TentManualSnapshotHistoryList
          tentId={H.tentId}
          readings={readings}
          readStatus="success"
          onRetry={() => {}}
        />
      </>,
    );

    const changeDelta = screen.getByTestId("tent-manual-snapshot-change-context-delta");
    expect(changeDelta.textContent).toContain("-0.6°C");
    expect(changeDelta.textContent).not.toContain("°F");

    const historyMetrics = screen.getAllByTestId("tent-manual-snapshot-history-metric");
    expect(historyMetrics[0]?.textContent).toContain("23.3°C");
    expect(historyMetrics[0]?.textContent).not.toContain("°F");
  });
});
