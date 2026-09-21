/**
 * GDP-GROW-SCOPED-CTA-GROWID-001 — Dashboard presenter render pins.
 *
 * Source scans can pass while rendered hrefs regress to bare /sensors or
 * /daily-check. These tests assert resolved Link targets in the DOM for the
 * Dashboard surfaces #1595 fixed alongside DailyGrowCheckStatusCard.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROW = "4cad3cae-1111-4000-8000-000000000001";
const TENT = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";

const H = vi.hoisted(() => ({
  scoped: false,
  growStatus: "success" as "loading" | "error" | "success",
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
          ]
        : [],
    isLoading: H.growStatus === "loading",
    isError: H.growStatus === "error",
    isFetched: H.growStatus === "success",
    refetch: vi.fn(),
  }),
  useGrowPlants: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSensorReadingsByTents: () => ({
    byTent: { [TENT]: [] },
    statusByTent: { [TENT]: "success" },
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
vi.mock("@/components/DailyGrowCheckStatusCard", () => ({ default: () => null }));
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

import Dashboard from "@/pages/Dashboard";

function hrefForTestId(testId: string): string | null {
  const node = screen.getByTestId(testId);
  const anchor = node.tagName === "A" ? node : node.querySelector("a");
  return anchor?.getAttribute("href") ?? null;
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Dashboard grow-scoped CTA render", () => {
  beforeEach(() => {
    H.scoped = false;
    H.growStatus = "success";
  });

  it("carries growId on PageHeader Quick Log when grow scope is active", () => {
    H.scoped = true;
    renderDashboard();

    expect(hrefForTestId("dashboard-daily-grow-check-entry")).toBe(`/daily-check?growId=${GROW}`);
  });

  it("keeps global /daily-check on PageHeader Quick Log without grow scope", () => {
    renderDashboard();

    expect(hrefForTestId("dashboard-daily-grow-check-entry")).toBe("/daily-check");
  });

  it("carries growId on Environment Snapshot sensor CTAs when grow scope is active", () => {
    H.scoped = true;
    renderDashboard();

    expect(screen.getByTestId("dashboard-environment-snapshot-empty")).toBeInTheDocument();
    expect(hrefForTestId("dashboard-environment-snapshot-go-to-sensors")).toBe(
      `/sensors?growId=${GROW}`,
    );
    expect(hrefForTestId("dashboard-environment-snapshot-add-manual-reading")).toBe(
      `/sensors?growId=${GROW}#manual-reading`,
    );
    expect(hrefForTestId("dashboard-environment-snapshot-import-sensor-data")).toBe(
      `/sensors?growId=${GROW}#csv-import`,
    );
    expect(hrefForTestId("dashboard-environment-snapshot-empty-sensors-link")).toBe(
      `/sensors?growId=${GROW}`,
    );
  });

  it("keeps bare /sensors paths on Environment Snapshot CTAs without grow scope", () => {
    renderDashboard();

    expect(hrefForTestId("dashboard-environment-snapshot-go-to-sensors")).toBe("/sensors");
    expect(hrefForTestId("dashboard-environment-snapshot-add-manual-reading")).toBe(
      "/sensors#manual-reading",
    );
    expect(hrefForTestId("dashboard-environment-snapshot-import-sensor-data")).toBe(
      "/sensors#csv-import",
    );
    expect(hrefForTestId("dashboard-environment-snapshot-empty-sensors-link")).toBe("/sensors");
  });
});
