import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  now: 0,
  aggregateRows: [] as unknown[],
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
    data: H.aggregateRows,
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
vi.mock("@/hooks/useNowTick", () => ({ useNowTick: () => H.now }));
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
  return { ...view, client: queryClient, rerenderDashboard: () => view.rerender(tree()) };
}

afterEach(cleanup);
const CLOCK = Date.parse("2026-09-23T12:00:00Z");
beforeEach(() => {
  H.now = CLOCK;
  H.growStatus = "success";
  H.aggregateRows = [];
  H.snapshotState = null;
  H.persist.mockClear();
});

function setReading(source: string, ageMinutes: number) {
  H.aggregateRows = [
    {
      id: "synthetic-reading",
      tent_id: H.tentId,
      metric: "temperature_c",
      value: 24,
      source,
      quality: "ok",
      ts: new Date(CLOCK).toISOString(),
      captured_at: new Date(CLOCK - ageMinutes * 60_000).toISOString(),
    },
  ];
  H.perTentRows = H.aggregateRows;
}

function savedSnapshot(source: "manual" | "diary" = "manual", ageMinutes = 60): SnapshotState {
  return {
    status: "ok",
    snapshot: {
      source,
      tent_id: H.tentId,
      ts: new Date(CLOCK - ageMinutes * 60000).toISOString(),
      temp: 25,
      rh: 55,
      vpd: null,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
      diary_evidence_ref: {
        id: "saved-diary",
        entry_at: new Date(CLOCK - ageMinutes * 60000).toISOString(),
      },
    },
  };
}

beforeEach(() => {
  H.scoped = true;
  H.perTentRows = [];
  H.secondTentRows = [];
  H.perTentStatus = "success";
  H.aggregateStatus = "success";
  H.secondTentEnabled = false;
  H.tentQueryOverride = {};
  H.plantQueryOverride = {};
  H.snapshotState = savedSnapshot();
});

describe("Dashboard diary evidence and sensor-history empty states", () => {
  it.each(["manual", "diary"] as const)(
    "acknowledges saved %s evidence and links to its existing detail",
    (source) => {
      H.snapshotState = savedSnapshot(source);
      renderDashboard();
      const notice = screen.getByTestId("dashboard-environment-snapshot-evidence");
      expect(notice).toHaveTextContent("Saved environment evidence available");
      expect(notice).toHaveTextContent("Trust Tent");
      expect(screen.queryByText("No sensor snapshot yet")).not.toBeInTheDocument();
      const link = screen.getByRole("button", { name: "Review saved environment evidence" });
      const detail = screen.getByRole("region", { name: "Latest environment" });
      detail.scrollIntoView = vi.fn();
      fireEvent.click(link);
      expect(detail.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
      expect(detail).toHaveFocus();
      expect(screen.getByRole("region", { name: "Latest environment" })).toHaveAttribute(
        "id",
        "latest-environment",
      );
    },
  );

  it("keeps older saved evidence discoverable without calling it current or live", () => {
    H.snapshotState = savedSnapshot("manual", 48 * 60);
    renderDashboard();
    expect(screen.getByTestId("dashboard-environment-snapshot-evidence")).toHaveTextContent(
      "Saved environment evidence available",
    );
    expect(screen.getByText("Stale reading", { exact: true })).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-tent-chart-source-badge")).not.toBeInTheDocument();
  });

  it.each([
    ["loading", { status: "loading" }],
    ["refresh", { isFetching: true }],
    ["paused", { isPaused: true }],
  ])("does not claim empty or completed evidence during %s", (_name, override) => {
    H.snapshotState = { ...savedSnapshot(), ...override } as SnapshotState;
    renderDashboard();
    expect(
      screen.getByTestId("dashboard-environment-snapshot-evidence-pending"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No sensor snapshot yet")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review saved environment evidence" }),
    ).not.toBeInTheDocument();
  });

  it("shows a retry when the diary-inclusive evidence read fails", () => {
    H.snapshotState = { ...savedSnapshot(), status: "unavailable" };
    const { client } = renderDashboard();
    const current = [
      "latest-sensor-snapshot",
      "owner",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      H.tentId,
    ];
    const other = ["latest-sensor-snapshot", "owner", "other-grow", H.tentId];
    client.setQueryData(current, savedSnapshot().snapshot);
    client.setQueryData(other, savedSnapshot().snapshot);
    expect(screen.getByTestId("dashboard-environment-snapshot-evidence-error")).toHaveTextContent(
      "Environment evidence unavailable",
    );
    expect(screen.getByRole("button", { name: "Retry environment evidence" })).toBeInTheDocument();
    expect(screen.queryByText("No sensor snapshot yet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry environment evidence" }));
    expect(client.getQueryState(current)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  });

  it("limits completed empty copy to the sensor-history view", () => {
    H.snapshotState = {
      status: "ok",
      snapshot: {
        ...savedSnapshot().snapshot,
        source: "unavailable",
        ts: null,
        temp: null,
        rh: null,
      },
    };
    renderDashboard();
    expect(screen.getByTestId("dashboard-environment-snapshot-empty")).toHaveTextContent(
      "No sensor readings in this view",
    );
    expect(
      screen.queryByRole("button", { name: "Review saved environment evidence" }),
    ).not.toBeInTheDocument();
  });

  it("does not link grow-wide diary evidence from an unscoped Dashboard", () => {
    H.scoped = false;
    renderDashboard();
    expect(
      screen.queryByRole("button", { name: "Review saved environment evidence" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("dashboard-environment-snapshot-empty")).toHaveTextContent(
      "No sensor readings in this view",
    );
  });

  it("preserves sensor-history failure over the diary notice", () => {
    H.aggregateStatus = "error";
    renderDashboard();
    expect(screen.getByTestId("dashboard-sensor-history-error")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-environment-snapshot-evidence")).not.toBeInTheDocument();
  });

  it("preserves the sensor chart when both sensor and diary evidence exist", () => {
    setReading("manual", 30);
    renderDashboard();
    expect(screen.getByTestId("dashboard-tent-chart-source-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-environment-snapshot-evidence")).not.toBeInTheDocument();
  });
});
