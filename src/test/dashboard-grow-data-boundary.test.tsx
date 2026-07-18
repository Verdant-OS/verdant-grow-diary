import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  growStatus: "loading" as "loading" | "error" | "success",
  aggregateStatus: "success" as "loading" | "error" | "success",
  perTentStatus: "success" as "loading" | "error" | "refresh_error" | "success",
  perTentRows: [] as unknown[],
  secondTentEnabled: false,
  secondTentStatus: "success" as "loading" | "error" | "refresh_error" | "success",
  secondTentRows: [] as unknown[],
  refetch: vi.fn(),
  tentId: "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f",
  secondTentId: "6b2d7f10-3c4e-4d6f-9a01-2b3c4d5e6f70",
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
  }),
  useGrowPlants: () => ({
    data: [],
    isLoading: H.growStatus === "loading",
    isError: H.growStatus === "error",
    refetch: H.refetch,
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
    urlGrowId: null,
    scopedGrow: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: null,
  }),
}));
vi.mock("@/hooks/useDashboardScopedData", () => ({
  useDashboardScopedData: () => ({
    recent: { status: "ok", items: [] },
    pending: { status: "ok", items: [] },
  }),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => ({
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
  usePersistEnvironmentAlerts: () => undefined,
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
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard private-read honesty boundary", () => {
  beforeEach(() => {
    H.growStatus = "loading";
    H.aggregateStatus = "success";
    H.perTentStatus = "success";
    H.perTentRows = [];
    H.secondTentEnabled = false;
    H.secondTentStatus = "success";
    H.secondTentRows = [];
    H.refetch.mockClear();
  });

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
