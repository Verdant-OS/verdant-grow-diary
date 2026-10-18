/**
 * Regression suite for PR #2195 review findings (Codex P1s at b45acd5d):
 *  1. Fetch Quick Log manuals for every exported tent in a multi-tent Dashboard scope.
 *  2. Prevent exporting a silently incomplete CSV while Quick Log manual readings are pending or errored.
 *  3. Validate the Celsius value before displaying it in Timeline sensor snapshot chips
 *     (reject inconsistent dual-unit payloads such as `{ temp_f: 75, temp_c: 100 }`).
 *  4. Include tent identity (`Tent` column) in multi-tent Dashboard CSV exports.
 *  5. Preserve provenance when merging same-time readings across sources (`live`/`csv` vs `manual`).
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
import { downloadTextFile } from "@/lib/sensorChartExport";
import { mergeDashboardChartReadingsWithQuickLogManuals } from "@/lib/sensorsQuickLogManualSeriesRules";
import {
  buildTimelineCardSensorSnapshotViewModel,
  resolveTimelineCardSensorResolution,
} from "@/lib/timelineSensorSnapshotViewModel";

const H = vi.hoisted(() => ({
  scoped: true,
  tentId: "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f",
  secondTentId: "6b2d7f10-3c4e-4d6f-9a01-2b3c4d5e6f70",
  secondTentEnabled: false,
  aggregateRows: [] as unknown[],
  perTentRows: [] as unknown[],
  secondTentRows: [] as unknown[],
  quickLogManuals: [] as SensorReading[],
  quickLogManualsPending: false,
  quickLogManualsError: false,
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
  useSensorsQuickLogManualReadings: (
    tentScope?: string | readonly (string | null | undefined)[] | null,
  ) => {
    const allowedTents = Array.isArray(tentScope)
      ? new Set(tentScope.filter((id): id is string => typeof id === "string"))
      : typeof tentScope === "string"
        ? new Set([tentScope])
        : new Set<string>();
    return {
      data: H.quickLogManuals.filter((r) => allowedTents.has(r.tentId)),
      isPending: H.quickLogManualsPending,
      isLoading: H.quickLogManualsPending,
      isError: H.quickLogManualsError,
      isSuccess: !H.quickLogManualsPending && !H.quickLogManualsError,
      fetchStatus: H.quickLogManualsPending ? "fetching" : "idle",
      refetch: () => Promise.resolve([]),
    };
  },
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
  H.quickLogManualsPending = false;
  H.quickLogManualsError = false;
  H.alertRows = [];
  H.snapshotState = null;
});

afterEach(() => {
  cleanup();
  clearTemperatureUnitPreference();
});

describe("PR #2195 review follow-ups", () => {
  it("fetches Quick Log manuals for every scoped tent and includes a Tent column in multi-tent CSV export", () => {
    saveTemperatureUnitPreference("fahrenheit");
    H.secondTentEnabled = true;
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
      tent_id: H.secondTentId,
      ts: "2026-10-15T09:00:00.000Z",
      captured_at: "2026-10-15T09:00:00.000Z",
      metric: "temperature_c",
      value: 23.33,
      source: "manual",
      quality: "ok",
      raw_payload: null,
    };
    H.aggregateRows = [r1, r2];
    H.perTentRows = [r1];
    H.secondTentRows = [r2];
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
        tentId: H.secondTentId,
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
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain("Tent");
    expect(lines.slice(1).map((line) => line.split(",")[1])).toEqual(["75", "74", "76", "77"]);
    expect(lines.slice(1).map((line) => line.split(",")[10])).toEqual([
      "Main Tent",
      "Second Tent",
      "Main Tent",
      "Second Tent",
    ]);
  });

  it("disables Dashboard CSV export while Quick Log manual readings are pending or errored", () => {
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
    H.aggregateRows = [r1];
    H.perTentRows = [r1];
    H.quickLogManualsPending = true;

    const { unmount } = renderDashboard();
    const exportBtnPending = screen.getByTestId("sensor-chart-export-btn") as HTMLButtonElement;
    expect(exportBtnPending.disabled).toBe(true);
    fireEvent.click(exportBtnPending);
    expect(downloadTextFile).not.toHaveBeenCalled();
    unmount();

    H.quickLogManualsPending = false;
    H.quickLogManualsError = true;
    renderDashboard();
    const exportBtnError = screen.getByTestId("sensor-chart-export-btn") as HTMLButtonElement;
    expect(exportBtnError.disabled).toBe(true);
    fireEvent.click(exportBtnError);
    expect(downloadTextFile).not.toHaveBeenCalled();
  });

  it("rejects inconsistent dual-unit snapshot payloads ({ temp_f: 75, temp_c: 100 }) in Celsius mode", () => {
    saveTemperatureUnitPreference("celsius");
    const resolution = resolveTimelineCardSensorResolution({
      manual_sensor_snapshot: {
        source: "manual",
        ts: "2026-10-15T12:00:00.000Z",
        temp_f: 75,
        temp_c: 100,
      },
    });
    const cardVm = buildTimelineCardSensorSnapshotViewModel(resolution, {
      validateManualCompatibility: true,
      temperatureUnit: "celsius",
    });
    expect(cardVm.sensorViewModel.kind).toBe("invalid");
  });

  it("preserves live/csv provenance when a Quick Log manual reading shares the same timestamp", () => {
    const stamp = "2026-10-15T10:00:00.000Z";
    const livePoint: SensorReading = {
      ts: stamp,
      capturedAt: stamp,
      tentId: H.tentId,
      temp: 24,
      rh: 55,
      vpd: 1.1,
      co2: 850,
      soil: 42,
      observedMetrics: ["temp", "rh", "vpd", "co2", "soil"],
      source: "live",
      status: "stale",
    };
    const manualPoint: SensorReading = {
      ts: stamp,
      capturedAt: stamp,
      tentId: H.tentId,
      temp: 25,
      rh: 60,
      vpd: 1.2,
      co2: 0,
      soil: 0,
      observedMetrics: ["temp", "rh", "vpd"],
      source: "manual",
      status: "usable",
    };

    const merged = mergeDashboardChartReadingsWithQuickLogManuals([livePoint], [manualPoint]);
    expect(merged).toHaveLength(2);
    const liveOut = merged.find((r) => r.source === "live");
    const manualOut = merged.find((r) => r.source === "manual");
    expect(liveOut).toBeDefined();
    expect(liveOut?.status).toBe("stale");
    expect(liveOut?.co2).toBe(850);
    expect(manualOut).toBeDefined();
    expect(manualOut?.status).toBe("usable");
    expect(manualOut?.observedMetrics).toEqual(["temp", "rh", "vpd"]);
  });
});
