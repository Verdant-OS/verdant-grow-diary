/**
 * Codex review on #1683: which plants may move the scoped Dashboard's alert
 * stage, and when that stage may be persisted.
 *
 * - The grow-scoped plant read also returns plants by tent, so a plant whose
 *   own grow_id names another grow can sit in this grow's tent. The canonical
 *   attribution (own grow_id first, else the tent's grow) leaves it out.
 * - Persistence needs a current, successful plant read. `isFetched` is also
 *   true after a failed read, when `plants` is `[]` or stale cached rows.
 *
 * Renders the real Dashboard; data hooks and heavy presenters are mocked.
 */
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROW = "4cad3cae-1111-4000-8000-000000000001";
const OTHER_GROW = "4cad3cae-2222-4000-8000-000000000002";
const TENT = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";

type PersistArgs = { growId: string | null; enabled?: boolean; stage?: string | null };
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
  persistCalls: [] as PersistArgs[],
}));

function plant(id: string, growId: string | null, stage: string) {
  return {
    id,
    name: id,
    strain: "",
    tentId: TENT,
    stage,
    startedAt: "2026-09-01T00:00:00Z",
    health: "unknown",
    photo: "",
    lastNote: "",
    growId,
    isArchived: false,
  };
}

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
    byTent: { [TENT]: H.perTentRows },
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
  usePersistEnvironmentAlerts: (input: unknown) => {
    H.persistCalls.push(input as PersistArgs);
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
  const last = H.persistCalls.at(-1);
  expect(last?.growId).toBe(GROW);
  return last as PersistArgs;
}

beforeEach(() => {
  H.scoped = true;
  H.growStatus = "success";
  H.perTentRows = [];
  H.plantsQuery = { data: [], isError: false, isFetched: true };
  H.tentsPatch = {};
  H.persistCalls.length = 0;
});

describe("scoped Dashboard alert stage: canonical plant attribution", () => {
  it("a plant naming another grow does not move this grow's stage", () => {
    H.plantsQuery = {
      data: [plant("p-other", OTHER_GROW, "flower")],
      isError: false,
      isFetched: true,
    };
    const args = renderDashboard();
    expect(args.enabled).toBe(true);
    expect(args.stage).toBe("veg");
  });

  it("a grow-less Flower plant in this grow's tent counts through the tent", () => {
    H.plantsQuery = { data: [plant("p-legacy", null, "flower")], isError: false, isFetched: true };
    const args = renderDashboard();
    expect(args.enabled).toBe(true);
    expect(args.stage).toBe("flower");
  });
});

describe("scoped Dashboard alert persistence waits for a current plant read", () => {
  it("holds while the plant read is pending", () => {
    H.plantsQuery = { data: undefined, isError: false, isFetched: false };
    expect(renderDashboard().enabled).toBe(false);
  });

  it("holds when the first plant read failed", () => {
    H.plantsQuery = { data: undefined, isError: true, isFetched: true };
    expect(renderDashboard().enabled).toBe(false);
  });

  it("holds when a refresh failed over cached plants", () => {
    H.plantsQuery = { data: [plant("p-own", GROW, "flower")], isError: true, isFetched: true };
    expect(renderDashboard().enabled).toBe(false);
  });

  it("holds on placeholder plant data", () => {
    H.plantsQuery = {
      data: [plant("p-own", GROW, "flower")],
      isError: false,
      isFetched: true,
      isPlaceholderData: true,
    };
    expect(renderDashboard().enabled).toBe(false);
  });
});

describe("scoped Dashboard alert persistence waits for current reads (Codex review on #1683)", () => {
  it("holds while a plant refetch is in flight over cached rows", () => {
    H.plantsQuery = {
      data: [plant("p-own", GROW, "flower")],
      isError: false,
      isFetched: true,
      isFetching: true,
    };
    expect(renderDashboard().enabled).toBe(false);
  });

  it("holds when the tent read failed although it counts as fetched", () => {
    H.tentsPatch = { data: [], isError: true, isFetched: true };
    expect(renderDashboard().enabled).toBe(false);
  });

  it("holds while a tent refetch is in flight", () => {
    H.tentsPatch = { isFetching: true };
    expect(renderDashboard().enabled).toBe(false);
  });
});
