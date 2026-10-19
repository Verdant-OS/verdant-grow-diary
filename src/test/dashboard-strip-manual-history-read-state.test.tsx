/**
 * Repair of #2148 (Copilot 4286153585): the Dashboard environment strip
 * merges Quick Log manual history into the single tent's VPD stability. A
 * pending or failed manual-history read must be disclosed with a retry while
 * the available stored readings stay graded, and the tent's read state must
 * name it.
 *
 * Mock set copied from dashboard-strip-stage-and-manual-save-gate.test.tsx;
 * the manual-history hook is replaced with a configurable stub.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
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
      return actual.buildTentSnapshotView(...args);
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

beforeEach(() => {
  H.scoped = true;
  H.growStatus = "success";
  const at = new Date(Date.now() - 5 * 60_000).toISOString();
  H.perTentRows = [
    {
      id: "vpd-1",
      tent_id: TENT,
      ts: at,
      captured_at: at,
      metric: "vpd_kpa",
      value: 0.85,
      source: "manual",
    },
  ];
  H.plantsQuery = { data: [], isError: false, isFetched: true };
  H.tentsPatch = {};
  H.persistCalls.length = 0;
  H.stabilityStages.length = 0;
  H.stabilityInputs.length = 0;
  H.secondTent = false;
  M.data = [];
  H.stripStages.length = 0;
  M.args = [];
  M.pending = false;
  M.error = false;
  M.refetch.mockClear();
});

describe("Dashboard strip discloses the Quick Log manual-history read (#2148 repair)", () => {
  it("control: a settled read shows no manual-history notice", () => {
    renderDashboard();
    expect(M.args.some((arg) => Array.isArray(arg) && arg.includes(TENT))).toBe(true);
    expect(screen.queryByTestId("dashboard-manual-history-pending")).toBeNull();
    expect(screen.queryByTestId("dashboard-manual-history-error")).toBeNull();
  });

  it("discloses a pending read and keeps grading the stored readings", () => {
    M.pending = true;
    renderDashboard();
    expect(screen.getByTestId("dashboard-manual-history-pending")).toBeVisible();
    expect(H.stabilityStages.length).toBeGreaterThan(0);
    expect(screen.getByTestId(`dashboard-env-snapshot-tent-${TENT}`)).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Quick Log manual history loading"),
    );
  });

  it("discloses a failed read with a retry and names it in the tent read state", () => {
    M.error = true;
    renderDashboard();
    const notice = screen.getByTestId("dashboard-manual-history-error");
    expect(notice).toBeVisible();
    fireEvent.click(within(notice).getByRole("button", { name: /retry/i }));
    expect(M.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(`dashboard-env-snapshot-tent-${TENT}`)).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Quick Log manual history unavailable"),
    );
  });

  it("grades every tent with its own Quick Log manual VPD when the grow has two tents (Codex P1 at 1936029e)", () => {
    H.secondTent = true;
    const at = new Date(Date.now() - 2 * 60_000).toISOString();
    M.data = [
      {
        ts: at,
        capturedAt: at,
        tentId: TENT_B,
        temp: 24,
        rh: 55,
        vpd: 2.6,
        co2: 0,
        soil: 0,
        observedMetrics: ["vpd"],
        source: "manual",
        status: "usable",
      },
    ];
    renderDashboard();
    const graded = H.stabilityInputs.flat() as Array<{ vpd?: number; source?: string }>;
    expect(graded.some((r) => r.vpd === 2.6 && r.source === "manual")).toBe(true);
    // The manual belongs to the second tent only; the first tent never grades it.
    expect(
      H.stabilityInputs.filter((inputs) =>
        (inputs as Array<{ vpd?: number }>).some((r) => r.vpd === 2.6),
      ).length,
    ).toBeLessThanOrEqual(H.stabilityInputs.length / 2);
  });

  it("discloses a pending manual read for a multi-tent grow too", () => {
    H.secondTent = true;
    M.pending = true;
    renderDashboard();
    expect(screen.getByTestId("dashboard-manual-history-pending")).toBeVisible();
    expect(screen.getByTestId(`dashboard-env-snapshot-tent-${TENT_B}`)).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Quick Log manual history loading"),
    );
  });
});
