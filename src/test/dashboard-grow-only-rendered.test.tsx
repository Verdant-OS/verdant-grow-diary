/**
 * Rendered Dashboard: a saved grow with no tents must agree with that fact,
 * and a failed or in-flight grow read must not look like "add a tent".
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const H = vi.hoisted(() => ({
  grows: [] as { id: string; name: string; stage: string }[],
  growsLoading: false,
  growsError: null as string | null,
  refreshGrows: vi.fn(),
  tentIsError: false,
  tentData: [] as unknown[],
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data: H.tentIsError ? undefined : H.tentData,
    isLoading: false,
    isPending: false,
    isError: H.tentIsError,
    status: H.tentIsError ? "error" : "success",
    fetchStatus: "idle",
    refetch: vi.fn(),
  }),
  useGrowPlants: () => ({
    data: [],
    isLoading: false,
    isPending: false,
    isError: false,
    status: "success",
    fetchStatus: "idle",
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
  getGrowDataMeta: () => ({
    isDemoData: false,
    dataSource: "unavailable",
    sourceReason: "no-rows",
  }),
  combineGrowDataMeta: (
    metas: { dataSource: string; sourceReason: string; isDemoData: boolean }[],
  ) => metas[0] ?? { isDemoData: false, dataSource: "unavailable", sourceReason: "no-data" },
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-1" } }),
}));

vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: H.grows,
    activeGrowId: H.grows[0]?.id ?? null,
    loading: H.growsLoading,
    error: H.growsError,
    refresh: H.refreshGrows,
  }),
}));

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useSensorReadingsByTents: () => ({
    byTent: {},
    statusByTent: {},
    isLoading: false,
    isError: false,
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
  useEnvironmentTrends: () => ({ status: "idle", trends: { status: "empty", count: 0 } }),
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
vi.mock("@/components/GuidedActionChecklistPanel", () => ({ default: () => null }));
vi.mock("@/components/SensorSourceBadge", () => ({ default: () => null }));
vi.mock("@/components/DashboardOperatorAccountReadModels", () => ({ default: () => null }));
vi.mock("@/components/GrowRecoveryPrompt", () => ({ default: () => null }));
vi.mock("@/components/TonightTentHomeCard", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentRibbon", () => ({ default: () => null }));
vi.mock("@/components/KpiCard", () => ({
  default: ({ label, value }: { label: string; value: number }) => (
    <div data-testid="dashboard-kpi-card">
      {label}: {value}
    </div>
  ),
}));

import Dashboard from "@/pages/Dashboard";

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("rendered Dashboard grow-only disclosure", () => {
  beforeEach(() => {
    H.grows = [];
    H.growsLoading = false;
    H.growsError = null;
    H.refreshGrows.mockClear();
    H.tentIsError = false;
    H.tentData = [];
  });

  it("shows the grow-ready next step when a grow exists and tents are empty", () => {
    H.grows = [{ id: GROW_ID, name: "Only Grow", stage: "veg" }];
    renderDashboard();

    expect(screen.getByTestId("dashboard-data-source-disclosure")).toHaveTextContent(
      "Your grow is set up. Add a tent to start tracking.",
    );
    expect(screen.queryByText(/No real grow/i)).toBeNull();
    expect(screen.queryByText(/Create your first grow/i)).toBeNull();
  });

  it("shows an error with retry when the grow read fails instead of add-a-tent", () => {
    H.growsError = "grows unavailable";
    H.grows = [{ id: GROW_ID, name: "Stale Grow", stage: "veg" }];
    renderDashboard();

    expect(screen.getByTestId("dashboard-grow-data-error")).toHaveTextContent(/unavailable/i);
    expect(screen.queryByText(/Add a tent/i)).toBeNull();
    expect(screen.queryByText(/Set up your first tent/i)).toBeNull();
    expect(screen.queryByText(/No real grow/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(H.refreshGrows).toHaveBeenCalledTimes(1);
  });

  it("shows an error with retry when the tent read fails instead of add-a-tent", () => {
    H.grows = [{ id: GROW_ID, name: "Only Grow", stage: "veg" }];
    H.tentIsError = true;
    renderDashboard();

    expect(screen.getByTestId("dashboard-grow-data-error")).toHaveTextContent(/unavailable/i);
    expect(screen.queryByText(/Add a tent/i)).toBeNull();
    expect(screen.queryByText(/Set up your first tent/i)).toBeNull();
  });

  it("does not flash add-a-tent while grows are still loading", () => {
    H.growsLoading = true;
    renderDashboard();

    expect(screen.getByTestId("dashboard-grow-data-loading")).toBeTruthy();
    expect(screen.queryByText(/Add a tent/i)).toBeNull();
    expect(screen.queryByText(/Set up your first tent/i)).toBeNull();
    expect(screen.queryByText(/No real grow/i)).toBeNull();
  });
});
