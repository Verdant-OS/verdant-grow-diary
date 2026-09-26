/**
 * Codex review on #1683, round 15 (Dashboard).
 *
 * 1. The manual "Save alert" button must meet the same current-read gate as
 *    automatic persistence. During a background tent or plant refetch the
 *    cached rows still produce a stage, and an alert saved from it is not
 *    removed when the current rows arrive.
 * 2. The environment strip grades each tent by the stage Alerts use (grow
 *    row, tent and the active plants in it), not `tents.stage` alone, so a
 *    Flower plant in a Veg tent cannot read green on the strip while the
 *    alert section beside it judges Flower.
 *
 * Renders the real Dashboard; data hooks and heavy presenters are mocked.
 * The candidate alert and the snapshot gate are stubbed so only the stage
 * gate decides the button (the snapshot gate has its own suite).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const GROW = "4cad3cae-1111-4000-8000-000000000001";
const TENT = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";

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
  stripStages: [] as unknown[],
  saveAlert: vi.fn(async () => ({ id: "alert-1" })),
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

import Dashboard from "@/pages/Dashboard";
import { ALERT_SAVE_STAGE_UNCONFIRMED_MESSAGE } from "@/lib/alertFreshnessContext";

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

function saveButton() {
  return screen.getByRole("button", { name: "Save alert" });
}

beforeEach(() => {
  H.scoped = true;
  H.growStatus = "success";
  // One manual VPD reading so the tent's environment strip renders.
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
  H.stripStages.length = 0;
  H.saveAlert.mockClear();
});

describe("manual Save alert meets the current-read gate (Codex review on #1683)", () => {
  it("control: current tent and plant reads leave the button enabled, and it saves", async () => {
    H.plantsQuery = { data: [plant("p-own", GROW, "veg")], isError: false, isFetched: true };
    renderDashboard();
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(H.saveAlert).toHaveBeenCalledTimes(1));
  });

  it.each([
    [
      "a plant refetch is in flight over cached rows",
      () => {
        H.plantsQuery = {
          data: [plant("p-own", GROW, "flower")],
          isError: false,
          isFetched: true,
          isFetching: true,
        };
      },
    ],
    [
      "the plant read is pending",
      () => {
        H.plantsQuery = { data: undefined, isError: false, isFetched: false };
      },
    ],
    [
      "the plant rows are placeholder data",
      () => {
        H.plantsQuery = {
          data: [plant("p-own", GROW, "flower")],
          isError: false,
          isFetched: true,
          isPlaceholderData: true,
        };
      },
    ],
    [
      "a tent refetch is in flight",
      () => {
        H.tentsPatch = { isFetching: true };
      },
    ],
  ])("disables the button and never saves while %s", async (_s, arrange) => {
    arrange();
    renderDashboard();
    const button = saveButton();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", ALERT_SAVE_STAGE_UNCONFIRMED_MESSAGE);
    fireEvent.click(button);
    await Promise.resolve();
    expect(H.saveAlert).not.toHaveBeenCalled();
  });
});

describe("Dashboard environment strip grades by the resolved tent stage (Codex review on #1683)", () => {
  it("a Flower plant in a Veg tent: the strip and stability use Flower", () => {
    H.plantsQuery = { data: [plant("p-own", GROW, "flower")], isError: false, isFetched: true };
    renderDashboard();
    expect(H.stripStages.length).toBeGreaterThan(0);
    expect(new Set(H.stripStages)).toEqual(new Set(["flower"]));
    expect(new Set(H.stabilityStages)).toEqual(new Set(["flower"]));
  });

  it("without plants the tent decides, as before", () => {
    renderDashboard();
    expect(new Set(H.stripStages)).toEqual(new Set(["veg"]));
    expect(new Set(H.stabilityStages)).toEqual(new Set(["veg"]));
  });

  it("withholds the stage while the first plant read has no rows", () => {
    H.plantsQuery = { data: undefined, isError: false, isFetched: false };
    renderDashboard();
    expect(new Set(H.stripStages)).toEqual(new Set([null]));
    expect(new Set(H.stabilityStages)).toEqual(new Set([null]));
  });
});
