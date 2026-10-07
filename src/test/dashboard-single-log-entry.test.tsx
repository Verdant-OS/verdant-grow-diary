/**
 * Dashboard — one Log entry and a stable readiness marker.
 *
 * Spec: docs/specs/dashboard-single-log-entry-readiness-marker.md (§5.4).
 * GDP decision D1.1-A (2026-10-06): the Dashboard does not render its own
 * QuickLogV2Fab; the One-Tent Home card's `Log` is the page body's single
 * Log control. AppShell's chrome triggers sit outside `dashboard-root` and
 * are counted by the browser-level e2e checks instead (D1.2-A).
 *
 * `dashboard-ready` is the e2e readiness marker. It renders exactly once in
 * the loaded branch whatever the tent selection, and never while the grow
 * data is loading or failed.
 */
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROW = "4cad3cae-1111-4000-8000-000000000001";
const TENT = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";

const H = vi.hoisted(() => ({
  tentCount: 1,
  growStatus: "success" as "loading" | "error" | "success",
}));

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
        ? Array.from({ length: H.tentCount }, (_, i) => ({
            id: i === 0 ? TENT : `${TENT}-${i}`,
            name: `Render Tent ${i + 1}`,
            brand: "",
            size: "",
            stage: "veg",
            light: { on: false, schedule: "", wattage: 0 },
            alertCount: 0,
            growId: GROW,
          }))
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
    status: "ok",
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
// Stand-in with the real FAB's accessible name, so a Dashboard render of
// QuickLogV2Fab is counted as a Log control (jsdom applies no md: CSS).
vi.mock("@/components/QuickLogV2Fab", () => ({
  default: () => (
    <button type="button" aria-label="Quick Log">
      Quick Log
    </button>
  ),
}));
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

import Dashboard from "@/pages/Dashboard";

const LOG_NAME = /^(Quick )?Log$/;

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
  return screen.getByTestId("dashboard-root");
}

/** Visible-by-role Log controls (links and buttons) inside the page body. */
function logControls(root: HTMLElement): HTMLElement[] {
  const body = within(root);
  return [
    ...body.queryAllByRole("link", { name: LOG_NAME }),
    ...body.queryAllByRole("button", { name: LOG_NAME }),
  ];
}

describe("Dashboard single Log entry and readiness marker", () => {
  beforeEach(() => {
    H.tentCount = 1;
    H.growStatus = "success";
  });

  it("one tent: the home card's Log is the only Log control in the page body", () => {
    const root = renderDashboard();

    const controls = logControls(root);
    expect(controls).toHaveLength(1);
    expect(controls[0]).toBe(screen.getByTestId("tonight-tent-home-log"));
    expect(screen.getByTestId("tonight-tent-home-log").getAttribute("href")).toBe(
      `/daily-check?growId=${GROW}`,
    );
    expect(screen.queryByTestId("dashboard-daily-grow-check-entry")).toBeNull();
    expect(screen.getAllByTestId("dashboard-ready")).toHaveLength(1);
  });

  it("no tent: readiness marker renders, with no home card and no header Log", () => {
    H.tentCount = 0;
    const root = renderDashboard();

    expect(screen.getAllByTestId("dashboard-ready")).toHaveLength(1);
    expect(root.querySelector('[data-testid^="tonight-tent-home"]')).toBeNull();
    expect(screen.queryByTestId("dashboard-daily-grow-check-entry")).toBeNull();
    expect(logControls(root)).toHaveLength(0);
  });

  it("choose a tent: readiness marker renders, the card offers tents and no Log", () => {
    H.tentCount = 2;
    const root = renderDashboard();

    expect(screen.getAllByTestId("dashboard-ready")).toHaveLength(1);
    expect(screen.getByTestId("tonight-tent-home-choose")).toBeInTheDocument();
    expect(screen.queryByTestId("tonight-tent-home-log")).toBeNull();
    expect(screen.queryByTestId("dashboard-daily-grow-check-entry")).toBeNull();
    expect(logControls(root)).toHaveLength(0);
  });

  it("loading: no readiness marker", () => {
    H.growStatus = "loading";
    renderDashboard();

    expect(screen.getByTestId("dashboard-grow-data-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-ready")).toBeNull();
  });

  it("error: no readiness marker", () => {
    H.growStatus = "error";
    renderDashboard();

    expect(screen.getByTestId("dashboard-grow-data-error")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-ready")).toBeNull();
  });
});
