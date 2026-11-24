/**
 * Rendered wiring for the Dashboard tent card's latest reading (Codex P2 on
 * #3049): with an older sensor reading and a newer Quick Log reading for one
 * tent, the rendered card must show the Quick Log reading's source and
 * capture time, as the plant page's Current Environment card does.
 *
 * Mock set copied from dashboard-strip-manual-history-read-state.test.tsx;
 * buildTentSnapshotView is wrapped (not replaced) to record what the card
 * rendered from.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROW = "4cad3cae-1111-4000-8000-000000000001";
const TENT = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";
const TENT_B = "6b2d7f1a-3c4e-4d6f-9a01-2b3c4d5e6f70";

type PlantsQuery = {
  data: Array<Record<string, unknown>> | undefined;
  isError: boolean;
  isFetched: boolean;
  isPlaceholderData?: boolean;
  isFetching?: boolean;
};

const H = vi.hoisted(() => ({
  scoped: true,
  growStatus: "success" as "loading" | "error" | "success",
  perTentRows: [] as Array<Record<string, unknown>>,
  plantsQuery: { data: [], isError: false, isFetched: true } as PlantsQuery,
  tentsPatch: {} as Record<string, unknown>,
  persistCalls: [] as unknown[],
  stabilityStages: [] as unknown[],
  stabilityInputs: [] as unknown[][],
  secondTent: false,
  stripStages: [] as unknown[],
  snapCalls: [] as Array<{ rows: Array<Record<string, unknown>>; view: Record<string, unknown> }>,
  saveAlert: vi.fn(async () => ({ id: "alert-1" })),
}));

vi.mock("@/lib/environmentAlerts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/environmentAlerts")>()),
  buildEnvironmentAlerts: () => [
    {
      id: "rh:high",
      severity: "warning",
      metric: "rh",
      title: "RH above target",
      reason: "RH 70% is above the stage target.",
      source: "sensor_snapshot",
      createdAt: new Date().toISOString(),
    },
  ],
}));
vi.mock("@/lib/alertFreshnessContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/alertFreshnessContext")>()),
  describeAlertSaveBlock: () => null,
}));
vi.mock("@/lib/alerts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/alerts")>()),
  saveAlert: H.saveAlert,
  logAlertEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/environmentStabilityRules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/environmentStabilityRules")>();
  return {
    ...actual,
    computeEnvironmentStability: (
      ...args: Parameters<typeof actual.computeEnvironmentStability>
    ) => {
      H.stabilityStages.push(args[1]?.stage);
      H.stabilityInputs.push([...(args[0] ?? [])]);
      return actual.computeEnvironmentStability(...args);
    },
  };
});
vi.mock("@/lib/dashboardEnvironmentSnapshotViewModel", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/dashboardEnvironmentSnapshotViewModel")>();
  return {
    ...actual,
    buildTentSnapshotView: (...args: Parameters<typeof actual.buildTentSnapshotView>) => {
      H.stripStages.push(args[1]);
      const view = actual.buildTentSnapshotView(...args);
      H.snapCalls.push({
        rows: [...(args[0] ?? [])] as unknown as Array<Record<string, unknown>>,
        view: view as unknown as Record<string, unknown>,
      });
      return view;
    },
  };
});

vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/hooks/use-tents", () => ({
  useTents: () => ({ data: [] }),
}));

vi.mock("@/hooks/use-plants", () => ({
  usePlants: () => ({ data: [] }),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data:
      H.growStatus === "success"
        ? [
            {
              id: TENT,
              name: "Render Tent",
              brand: "",
              size: "",
              stage: "veg",
              light: { on: false, schedule: "", wattage: 0 },
              alertCount: 0,
              growId: GROW,
            },
            ...(H.secondTent
              ? [
                  {
                    id: TENT_B,
                    name: "Second Tent",
                    brand: "",
                    size: "",
                    stage: "veg",
                    light: { on: false, schedule: "", wattage: 0 },
                    alertCount: 0,
                    growId: GROW,
                  },
                ]
              : []),
          ]
        : [],
    isLoading: H.growStatus === "loading",
    isError: H.growStatus === "error",
    isFetched: H.growStatus === "success",
    refetch: vi.fn(),
    ...H.tentsPatch,
  }),
  useGrowPlants: () => ({ ...H.plantsQuery, isLoading: false, refetch: vi.fn() }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: H.perTentRows,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSensorReadingsByTents: () => ({
    byTent: { [TENT]: H.perTentRows, [TENT_B]: [] },
    statusByTent: { [TENT]: "success", [TENT_B]: "success" },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: H.scoped ? GROW : null,
    scopedGrow: H.scoped ? { id: GROW, name: "Render Grow", stage: "veg" } : null,
    scopedGrowName: H.scoped ? "Render Grow" : null,
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
  useLatestSensorSnapshot: () => ({
    status: "ok",
    snapshot: {
      source: "manual",
      ts: new Date().toISOString(),
      temp: 24,
      rh: 70,
      vpd: 0.9,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
      device_id: null,
      csvVendor: null,
      tent_id: TENT,
    },
  }),
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
  useGrowTargets: () => ({ status: "idle", targets: null, reload: vi.fn() }),
}));
vi.mock("@/hooks/usePersistEnvironmentAlerts", () => ({
  usePersistEnvironmentAlerts: (input: unknown) => {
    H.persistCalls.push(input);
    return undefined;
  },
}));
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ status: "ok", alerts: [], error: null, reload: vi.fn() }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));
vi.mock("@/hooks/useNowTick", () => ({ useNowTick: () => Date.now() }));
vi.mock("@/store/grows", () => ({ useGrows: () => ({ grows: [] }) }));

vi.mock("@/components/VpdStageMissingBadge", () => ({ default: () => null }));
vi.mock("@/components/EcowittLatestSnapshotCard", () => ({ default: () => null }));
vi.mock("@/components/StabilityChipDrilldown", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/MetricChip", () => ({ default: () => null }));
vi.mock("@/components/SeverityBadge", () => ({ default: () => null }));
vi.mock("@/components/StageBadge", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/ScopedGrowBanner", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/DashboardDataSourceDisclosure", () => ({ default: () => null }));
vi.mock("@/components/OnboardingChecklistCard", () => ({ default: () => null }));
vi.mock("@/components/PublicQuickLogHandoffCard", () => ({ default: () => null }));
vi.mock("@/components/OnboardingProgressPill", () => ({ default: () => null }));
vi.mock("@/components/OperatorModeCallout", () => ({ default: () => null }));
vi.mock("@/components/ReleaseReadinessOperatorCard", () => ({ default: () => null }));
vi.mock("@/components/LineageRepairCta", () => ({ default: () => null }));
vi.mock("@/components/DashboardPendingOutcomeReviewsCard", () => ({ default: () => null }));
vi.mock("@/components/SafeByDesignNotice", () => ({ default: () => null }));
vi.mock("@/components/DashboardSensorHealthSummary", () => ({ default: () => null }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
vi.mock("@/components/DashboardDailyGrowCheckPanel", () => ({ default: () => null }));
vi.mock("@/components/GuidedActionChecklistPanel", () => ({ default: () => null }));
vi.mock("@/components/SensorSourceBadge", () => ({ default: () => null }));
vi.mock("@/components/DashboardOperatorAccountReadModels", () => ({ default: () => null }));
vi.mock("@/components/KpiCard", () => ({
  default: ({ label, value }: { label: string; value: number }) => (
    <div data-testid="dashboard-kpi-card">
      {label}: {value}
    </div>
  ),
}));
vi.mock("@/components/DashboardZeroTentEmptyState", () => ({
  default: () => <div data-testid="dashboard-zero-tent-empty-state">No tents</div>,
}));

const M = vi.hoisted(() => ({
  args: [] as unknown[],
  data: [] as unknown[],
  pending: false,
  error: false,
  refetch: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/hooks/useSensorsQuickLogManualReadings", () => ({
  useSensorsQuickLogManualReadings: (tentId: unknown) => {
    M.args.push(tentId);
    return {
      data: M.data,
      isPending: M.pending,
      isLoading: M.pending,
      isError: M.error,
      isSuccess: !M.pending && !M.error,
      fetchStatus: M.pending ? "fetching" : "idle",
      refetch: M.refetch,
    };
  },
}));

import Dashboard from "@/pages/Dashboard";

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

function sensorRows(at: string) {
  return [
    { id: "t-old", tent_id: TENT, ts: at, captured_at: at, metric: "temperature_c", value: 25 },
    { id: "rh-old", tent_id: TENT, ts: at, captured_at: at, metric: "humidity_pct", value: 55 },
  ].map((row) => ({ ...row, source: "live", quality: "ok", raw_payload: null }));
}

function quickLogReading(at: string, temp: number, rh: number, tentId = TENT) {
  return {
    ts: at,
    capturedAt: at,
    tentId,
    temp,
    rh,
    vpd: 0,
    co2: 0,
    soil: 0,
    observedMetrics: ["temp", "rh"],
    source: "manual",
    status: "usable",
  };
}

function lastTentCardCall() {
  const calls = H.snapCalls.filter((call) => call.rows.some((row) => row.tent_id === TENT));
  return calls[calls.length - 1];
}

beforeEach(() => {
  H.scoped = true;
  H.growStatus = "success";
  H.plantsQuery = { data: [], isError: false, isFetched: true };
  H.tentsPatch = {};
  H.persistCalls.length = 0;
  H.stabilityStages.length = 0;
  H.stabilityInputs.length = 0;
  H.secondTent = false;
  H.stripStages.length = 0;
  H.snapCalls.length = 0;
  M.args = [];
  M.data = [];
  M.pending = false;
  M.error = false;
  M.refetch.mockClear();
});

describe("Dashboard tent card latest reading, rendered (Codex P2 on #3049)", () => {
  it("shows a newer Quick Log reading over an older sensor reading", () => {
    const sensorAt = new Date(Date.now() - 20 * DAY_MS).toISOString();
    const manualAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    H.perTentRows = sensorRows(sensorAt);
    M.data = [quickLogReading(manualAt, 23.9, 52)];

    renderDashboard();

    const call = lastTentCardCall();
    expect(call).toBeDefined();
    // The card rendered from the Quick Log values, not the older sensor ones.
    const temps = call!.rows.filter((row) => row.metric === "temperature_c");
    expect(temps[0]?.value).toBe(23.9);
    expect(temps[0]?.source).toBe("manual");
    // Its capture time is the Quick Log reading's, and a 2-hour-old manual
    // reading is not stale.
    expect(Date.parse(String(call!.view.lastUpdatedIso))).toBe(Date.parse(manualAt));
    expect(call!.view.stale).toBe(false);
    // The rendered source badge names what the view model resolved.
    const badge = screen.getByTestId(`dashboard-env-snapshot-source-${TENT}`);
    expect(badge).toHaveAttribute("data-source-label", String(call!.view.sourceLabel));
    expect(badge.getAttribute("data-source-label")).not.toBe("Stale");
  });

  it("keeps the sensor reading when it is the newest observation", () => {
    const sensorAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const manualAt = new Date(Date.now() - 3 * DAY_MS).toISOString();
    H.perTentRows = sensorRows(sensorAt);
    M.data = [quickLogReading(manualAt, 23.9, 52)];

    renderDashboard();

    const call = lastTentCardCall();
    expect(Date.parse(String(call!.view.lastUpdatedIso))).toBe(Date.parse(sensorAt));
    const temps = call!.rows.filter((row) => row.metric === "temperature_c");
    expect(temps[0]?.value).toBe(25);
  });

  it("ignores a Quick Log reading from another tent", () => {
    const sensorAt = new Date(Date.now() - 20 * DAY_MS).toISOString();
    H.perTentRows = sensorRows(sensorAt);
    M.data = [quickLogReading(new Date().toISOString(), 30, 70, TENT_B)];

    renderDashboard();

    const call = lastTentCardCall();
    expect(Date.parse(String(call!.view.lastUpdatedIso))).toBe(Date.parse(sensorAt));
    expect(call!.rows.some((row) => row.value === 30)).toBe(false);
  });
});
