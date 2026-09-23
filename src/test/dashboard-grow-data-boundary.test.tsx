import { fireEvent, render, screen, within } from "@testing-library/react";
import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  snapshotState: null as SnapshotState | null,
  scoped: false,
  persist: vi.fn(),
  growStatus: "loading" as "loading" | "error" | "success",
  aggregateStatus: "success" as "loading" | "error" | "success",
  perTentStatus: "success" as "loading" | "error" | "refresh_error" | "success",
  perTentRows: [] as unknown[],
  secondTentEnabled: false,
  secondTentStatus: "success" as "loading" | "error" | "refresh_error" | "success",
  secondTentRows: [] as unknown[],
  tentQueryOverride: {} as Record<string, unknown>,
  plantQueryOverride: {} as Record<string, unknown>,
  refetch: vi.fn(),
  tentId: "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f",
  secondTentId: "6b2d7f10-3c4e-4d6f-9a01-2b3c4d5e6f70",
  targetsStatus: "idle" as "idle" | "ok",
  targets: null as Record<string, { min: number | null; max: number | null }> | null,
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data:
      H.growStatus === "success"
        ? [
            {
              id: H.tentId,
              name: "Trust Tent",
              brand: "",
              size: "",
              stage: "veg",
              light: { on: false, schedule: "", wattage: 0 },
              alertCount: 0,
              growId: null,
            },
            ...(H.secondTentEnabled
              ? [
                  {
                    id: H.secondTentId,
                    name: "Failed Refresh Tent",
                    brand: "",
                    size: "",
                    stage: "veg",
                    light: { on: false, schedule: "", wattage: 0 },
                    alertCount: 0,
                    growId: null,
                  },
                ]
              : []),
          ]
        : [],
    isLoading: H.growStatus === "loading",
    isError: H.growStatus === "error",
    refetch: H.refetch,
    ...H.tentQueryOverride,
  }),
  useGrowPlants: () => ({
    data: [],
    isLoading: H.growStatus === "loading",
    isError: H.growStatus === "error",
    refetch: H.refetch,
    ...H.plantQueryOverride,
  }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: [],
    isLoading: H.aggregateStatus === "loading",
    isError: H.aggregateStatus === "error",
    refetch: H.refetch,
  }),
  useSensorReadingsByTents: () => ({
    byTent: {
      [H.tentId]: H.perTentRows,
      [H.secondTentId]: H.secondTentRows,
    },
    statusByTent: {
      [H.tentId]: H.perTentStatus,
      [H.secondTentId]: H.secondTentStatus,
    },
    isLoading: H.perTentStatus === "loading",
    isError: H.perTentStatus === "error" || H.perTentStatus === "refresh_error",
  }),
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: H.scoped ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : null,
    scopedGrow: H.scoped
      ? { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Trust Grow", stage: "veg" }
      : null,
    scopedGrowName: null,
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
      status: "idle",
      snapshot: {
        source: "unavailable",
        ts: null,
        temp: null,
        rh: null,
        vpd: null,
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
  useGrowTargets: () => ({ status: H.targetsStatus, targets: H.targets, reload: vi.fn() }),
}));
vi.mock("@/hooks/usePersistEnvironmentAlerts", () => ({
  usePersistEnvironmentAlerts: (input: unknown) => H.persist(input),
}));
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ status: "ok", alerts: [], error: null, reload: vi.fn() }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));
vi.mock("@/hooks/useNowTick", () => ({ useNowTick: () => Date.now() }));
vi.mock("@/store/grows", () => ({ useGrows: () => ({ grows: [] }) }));

// Keep this boundary suite focused on Dashboard-owned states. These children
// have their own tests and some perform unrelated reads when mounted.
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
vi.mock("@/components/FirstRunChecklist", () => ({ default: () => null }));
vi.mock("@/components/OnboardingProgressPill", () => ({ default: () => null }));
vi.mock("@/components/OperatorModeCallout", () => ({ default: () => null }));
vi.mock("@/components/ReleaseReadinessOperatorCard", () => ({ default: () => null }));
vi.mock("@/components/LineageRepairCta", () => ({ default: () => null }));
vi.mock("@/components/DashboardPendingOutcomeReviewsCard", () => ({ default: () => null }));
vi.mock("@/components/SafeByDesignNotice", () => ({ default: () => null }));
vi.mock("@/components/DashboardSensorHealthSummary", () => ({ default: () => null }));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
vi.mock("@/components/DailyGrowCheckStatusCard", () => ({ default: () => null }));
vi.mock("@/components/DashboardDailyGrowCheckPanel", () => ({ default: () => null }));
vi.mock("@/components/SensorSourceBadge", () => ({ default: () => null }));

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

import Dashboard from "@/pages/Dashboard";

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, rerenderDashboard: () => view.rerender(tree()) };
}

function pendingFirstRead(fetchStatus: "paused" | "idle") {
  return {
    data: undefined,
    status: "pending",
    fetchStatus,
    isPending: true,
    isLoading: false,
    isError: false,
  };
}

describe("Dashboard private-read honesty boundary", () => {
  beforeEach(() => {
    H.snapshotState = null;
    H.scoped = false;
    H.persist.mockClear();
    H.growStatus = "loading";
    H.aggregateStatus = "success";
    H.perTentStatus = "success";
    H.perTentRows = [];
    H.secondTentEnabled = false;
    H.secondTentStatus = "success";
    H.secondTentRows = [];
    H.tentQueryOverride = {};
    H.plantQueryOverride = {};
    H.refetch.mockClear();
    H.targetsStatus = "idle";
    H.targets = null;
  });

  it("withholds Target Comparison range badges while isFetching even when Last loaded values are visible", () => {
    H.growStatus = "success";
    H.scoped = true;
    H.targetsStatus = "ok";
    H.targets = {
      temp: { min: 20, max: 22 },
      rh: { min: 40, max: 60 },
    };
    H.perTentRows = [
      {
        id: "reading-a",
        tent_id: H.tentId,
        metric: "temperature_c",
        value: 24,
        source: "manual",
        quality: "ok",
        ts: new Date().toISOString(),
        captured_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ];
    H.snapshotState = {
      status: "ok",
      isFetching: true,
      snapshot: {
        source: "manual",
        ts: new Date().toISOString(),
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
        tent_id: H.tentId,
      },
    };
    renderDashboard();
    const environment = screen.getByRole("region", { name: "Latest environment" });
    expect(environment).toHaveTextContent(/Last loaded/);
    const targetComparison = screen.getByRole("region", { name: "Target Comparison" });
    expect(within(targetComparison).getByText("Unavailable")).toBeInTheDocument();
    expect(within(targetComparison).queryByText("Needs review")).toBeNull();
    expect(within(targetComparison).queryByText("Within configured targets")).toBeNull();
  });

  it.each(["isPaused", "isFetching"] as const)(
    "retains cached values but withholds quality and persistence while %s, then confirms on completion",
    (flag) => {
      H.growStatus = "success";
      H.scoped = true;
      H.perTentRows = [
        {
          id: "reading-a",
          tent_id: H.tentId,
          metric: "temperature_c",
          value: 24,
          source: "manual",
          quality: "ok",
          ts: new Date().toISOString(),
          captured_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];
      H.snapshotState = {
        status: "ok",
        [flag]: true,
        snapshot: {
          source: "manual",
          ts: new Date().toISOString(),
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
          tent_id: H.tentId,
        },
      };
      const view = renderDashboard();
      const environment = screen.getByRole("region", { name: "Latest environment" });
      expect(within(environment).getByTestId("latest-env-read-status")).toHaveTextContent(
        flag === "isPaused" ? /Waiting for connection/ : /Refreshing sensor data/,
      );
      expect(environment).toHaveTextContent(/Last loaded/);
      expect(environment).toHaveTextContent(/24\.0°C|75\.2°F/);
      expect(screen.queryByRole("region", { name: "Sensor Data Quality" })).toBeNull();
      expect(screen.queryByTestId("dashboard-environment-snapshot-status-banner")).toBeNull();
      const alerts = screen.getByRole("region", { name: "Environment Alerts" });
      expect(alerts).toHaveTextContent(
        flag === "isPaused" ? /Waiting for connection/ : /Refreshing sensor data/,
      );
      expect(within(alerts).queryByRole("button", { name: /Save alert/i })).toBeNull();
      expect(H.persist).toHaveBeenLastCalledWith(expect.objectContaining({ snapshot: null }));

      H.snapshotState = { ...H.snapshotState, [flag]: false };
      view.rerenderDashboard();
      expect(screen.queryByTestId("latest-env-read-status")).toBeNull();
      expect(screen.getByRole("region", { name: "Sensor Data Quality" })).toBeInTheDocument();
      expect(H.persist).toHaveBeenLastCalledWith(
        expect.objectContaining({
          snapshot: expect.objectContaining({ temp: 24, source: "manual" }),
        }),
      );
    },
  );

  it.each([
    ["tent", "paused"],
    ["plant", "paused"],
    ["tent", "idle"],
    ["plant", "idle"],
  ] as const)(
    "withholds zero counts and setup claims for a first %s read that is %s",
    (source, fetchStatus) => {
      H.growStatus = "success";
      if (source === "tent") H.tentQueryOverride = pendingFirstRead(fetchStatus);
      else H.plantQueryOverride = pendingFirstRead(fetchStatus);
      renderDashboard();

      expect(screen.getByTestId("dashboard-grow-data-loading")).toHaveTextContent(
        fetchStatus === "paused" ? /Waiting for connection/ : /Loading dashboard grow data/,
      );
      expect(screen.queryAllByTestId("dashboard-kpi-card")).toHaveLength(0);
      expect(screen.queryByTestId("dashboard-zero-tent-empty-state")).toBeNull();
      expect(screen.queryByTestId("dashboard-environment-snapshot-empty")).toBeNull();
    },
  );

  it("exposes the paused waiting state as a live status region", () => {
    H.growStatus = "success";
    H.tentQueryOverride = pendingFirstRead("paused");
    renderDashboard();

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Waiting for connection");
    expect(status).toHaveTextContent(
      "Your tents and plants haven't loaded yet. They'll appear when the connection returns.",
    );
  });

  it("exposes an idle first-read load as a live status region", () => {
    H.growStatus = "success";
    H.plantQueryOverride = pendingFirstRead("idle");
    renderDashboard();

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading dashboard grow data");
    expect(status).not.toHaveTextContent("Waiting for connection");
  });

  it("does not offer retry while waiting for connection on a paused first read", () => {
    H.growStatus = "success";
    H.plantQueryOverride = pendingFirstRead("paused");
    renderDashboard();

    expect(screen.getByTestId("dashboard-grow-data-loading")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByTestId("dashboard-grow-data-error")).toBeNull();
  });

  it.each([
    ["tent", "plant"],
    ["plant", "tent"],
  ] as const)(
    "withholds counts when %s reads settle but %s remains on a paused first read",
    (settled, pending) => {
      H.growStatus = "success";
      const settledPlantRead = {
        data: [],
        status: "success",
        isPending: false,
        isLoading: false,
        isError: false,
        fetchStatus: "idle",
      };
      if (settled === "tent") {
        H.tentQueryOverride = {};
        H.plantQueryOverride = pendingFirstRead("paused");
      } else {
        H.tentQueryOverride = pendingFirstRead("paused");
        H.plantQueryOverride = settledPlantRead;
      }
      renderDashboard();

      expect(screen.getByTestId("dashboard-grow-data-loading")).toHaveTextContent(
        /Waiting for connection/,
      );
      expect(screen.queryAllByTestId("dashboard-kpi-card")).toHaveLength(0);
      expect(screen.queryByTestId("dashboard-zero-tent-empty-state")).toBeNull();
    },
  );

  it.each([
    ["tent", "plant"],
    ["plant", "tent"],
  ] as const)(
    "withholds counts when %s reads settle but %s remains on an idle first read",
    (settled, pending) => {
      H.growStatus = "success";
      const settledPlantRead = {
        data: [],
        status: "success",
        isPending: false,
        isLoading: false,
        isError: false,
        fetchStatus: "idle",
      };
      if (settled === "tent") {
        H.tentQueryOverride = {};
        H.plantQueryOverride = pendingFirstRead("idle");
      } else {
        H.tentQueryOverride = pendingFirstRead("idle");
        H.plantQueryOverride = settledPlantRead;
      }
      renderDashboard();

      expect(screen.getByTestId("dashboard-grow-data-loading")).toHaveTextContent(
        /Loading dashboard grow data/,
      );
      expect(screen.queryAllByTestId("dashboard-kpi-card")).toHaveLength(0);
      expect(screen.queryByTestId("dashboard-zero-tent-empty-state")).toBeNull();
    },
  );

  it("shows confirmed counts after both first paused reads settle", () => {
    H.growStatus = "success";
    H.tentQueryOverride = pendingFirstRead("paused");
    H.plantQueryOverride = pendingFirstRead("paused");
    const view = renderDashboard();
    expect(screen.queryAllByTestId("dashboard-kpi-card")).toHaveLength(0);

    H.tentQueryOverride = {};
    view.rerenderDashboard();
    expect(screen.queryAllByTestId("dashboard-kpi-card")).toHaveLength(0);

    H.plantQueryOverride = {};
    view.rerenderDashboard();
    expect(screen.getAllByTestId("dashboard-kpi-card")[0]).toHaveTextContent("Active tents: 1");
    expect(screen.queryByTestId("dashboard-grow-data-loading")).toBeNull();
  });

  it("preserves successful empty reads and their zero counts", () => {
    H.growStatus = "success";
    H.tentQueryOverride = { data: [], status: "success", isPending: false, fetchStatus: "idle" };
    H.plantQueryOverride = { data: [], status: "success", isPending: false, fetchStatus: "idle" };
    renderDashboard();

    expect(screen.getByTestId("dashboard-zero-tent-empty-state")).toBeVisible();
    expect(screen.getAllByTestId("dashboard-kpi-card")[0]).toHaveTextContent("Active tents: 0");
    expect(screen.queryByTestId("dashboard-grow-data-loading")).toBeNull();
  });

  it("keeps resolved cached rows visible during a paused background refresh", () => {
    H.growStatus = "success";
    H.tentQueryOverride = { status: "success", isPending: false, fetchStatus: "paused" };
    H.plantQueryOverride = { status: "success", isPending: false, fetchStatus: "paused" };
    renderDashboard();

    expect(screen.getAllByTestId("dashboard-kpi-card")[0]).toHaveTextContent("Active tents: 1");
    expect(screen.queryByText("Waiting for connection")).toBeNull();
    expect(screen.queryByTestId("dashboard-zero-tent-empty-state")).toBeNull();
  });

  it.each(["tent", "plant"] as const)(
    "keeps a failed %s read unavailable and retries both queries",
    (source) => {
      H.growStatus = "success";
      const retryTent = vi.fn();
      const retryPlant = vi.fn();
      const failedRead = {
        data: undefined,
        status: "error",
        isError: true,
        isPending: false,
        fetchStatus: "idle",
      };
      H.tentQueryOverride = {
        ...(source === "tent" ? failedRead : pendingFirstRead("paused")),
        refetch: retryTent,
      };
      H.plantQueryOverride = {
        ...(source === "plant" ? failedRead : pendingFirstRead("paused")),
        refetch: retryPlant,
      };
      renderDashboard();

      expect(screen.getByTestId("dashboard-grow-data-error")).toHaveTextContent("unavailable");
      expect(screen.queryByTestId("dashboard-kpi-card")).toBeNull();
      expect(screen.queryByTestId("dashboard-zero-tent-empty-state")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(retryTent).toHaveBeenCalledTimes(1);
      expect(retryPlant).toHaveBeenCalledTimes(1);
    },
  );

  it("shows no zero KPI, onboarding, or empty-sensor conclusion while grow reads load", () => {
    renderDashboard();

    expect(screen.getByTestId("dashboard-grow-data-loading")).toHaveTextContent(
      /Loading dashboard grow data/,
    );
    expect(screen.queryByTestId("dashboard-kpi-card")).toBeNull();
    expect(screen.queryByTestId("dashboard-zero-tent-empty-state")).toBeNull();
    expect(screen.queryByTestId("dashboard-environment-snapshot-empty")).toBeNull();
  });

  it("surfaces failed per-tent reads before claiming there is no sensor snapshot", () => {
    H.growStatus = "success";
    H.perTentStatus = "error";
    renderDashboard();

    expect(screen.getByTestId("dashboard-environment-snapshot-error")).toHaveTextContent(
      /can't confirm that sensor history is empty/,
    );
    expect(screen.queryByTestId("dashboard-environment-snapshot-empty")).toBeNull();
  });

  it("does not turn a cached-empty failed refresh into an established empty snapshot", () => {
    H.growStatus = "success";
    H.perTentStatus = "refresh_error";
    renderDashboard();

    expect(screen.getByTestId("dashboard-environment-snapshot-error")).toHaveTextContent(
      /can't confirm that sensor history is empty/,
    );
    expect(screen.queryByTestId("dashboard-environment-snapshot-empty")).toBeNull();
  });

  it("labels cached readings as last loaded when their refresh fails", () => {
    H.growStatus = "success";
    H.perTentStatus = "refresh_error";
    H.perTentRows = [
      {
        id: "reading-a",
        tent_id: H.tentId,
        metric: "temperature_c",
        value: 24,
        source: "live",
        quality: "ok",
        captured_at: new Date(Date.now() - 60_000).toISOString(),
        ts: new Date(Date.now() - 60_000).toISOString(),
        created_at: new Date(Date.now() - 60_000).toISOString(),
      },
    ];
    renderDashboard();

    expect(
      screen.getByTestId(`dashboard-env-snapshot-refresh-error-${H.tentId}`),
    ).toHaveTextContent("last loaded readings");
    expect(screen.getByTestId(`dashboard-env-snapshot-tent-${H.tentId}`)).toHaveAccessibleName(
      /sensor refresh unavailable, last loaded readings shown/i,
    );
    expect(screen.queryByTestId("dashboard-environment-snapshot-error")).toBeNull();
  });

  it("does not call a failed-refresh tent empty when another tent has current readings", () => {
    H.growStatus = "success";
    H.perTentRows = [
      {
        id: "reading-a",
        tent_id: H.tentId,
        metric: "temperature_c",
        value: 24,
        source: "live",
        quality: "ok",
        captured_at: new Date(Date.now() - 60_000).toISOString(),
        ts: new Date(Date.now() - 60_000).toISOString(),
        created_at: new Date(Date.now() - 60_000).toISOString(),
      },
    ];
    H.secondTentEnabled = true;
    H.secondTentStatus = "refresh_error";
    renderDashboard();

    expect(
      screen.getByTestId(`dashboard-env-snapshot-refresh-unavailable-${H.secondTentId}`),
    ).toHaveTextContent(/no last loaded readings/i);
    expect(screen.queryByTestId(`dashboard-env-snapshot-no-data-${H.secondTentId}`)).toBeNull();
    expect(
      screen.getByTestId(`dashboard-env-snapshot-tent-${H.secondTentId}`),
    ).toHaveAccessibleName(/sensor refresh unavailable, no last loaded readings/i);
  });

  it("surfaces aggregate sensor-history failures instead of an empty chart state", () => {
    H.growStatus = "success";
    H.aggregateStatus = "error";
    renderDashboard();

    expect(screen.getByTestId("dashboard-sensor-history-error")).toHaveTextContent(
      /No empty-state or environment conclusion is shown/,
    );
    expect(screen.queryByTestId("dashboard-environment-snapshot-empty")).toBeNull();
  });
});
