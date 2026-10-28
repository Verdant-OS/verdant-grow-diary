/** VER-278: event-only manual captures reach both real page presenters. */
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  scoped: false,
  now: Date.parse("2026-10-24T13:25:00Z"),
  sensorStatus: "success",
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

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "cc7a3a69-1111-4000-8000-000000000001" }, loading: false }),
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

vi.mock("@/hooks/useGrowData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGrowData")>()),
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
    byTent: {
      [TENT]: H.perTentRows,
      [TENT_B]: [
        {
          id: "neighbor-temp",
          tent_id: TENT_B,
          metric: "temperature_c",
          value: 23.3,
          source: "manual",
          ts: "2026-10-24T05:09:00Z",
          captured_at: "2026-10-24T05:09:00Z",
        },
      ],
    },
    statusByTent: { [TENT]: H.sensorStatus, [TENT_B]: "success" },
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
      ts: "2026-10-24T05:09:00Z",
      temp: 23.3,
      rh: 55,
      vpd: 1.29,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
      device_id: null,
      csvVendor: null,
      tent_id: TENT_B,
    },
  }),
  useLatestSensorSnapshotsByTent: () => ({}),
}));
vi.mock("@/hooks/useManualSnapshotTimelineCards", () => ({
  useTentManualSnapshotBatch: (_owner: unknown, ids: string[]) => ({
    byTent: Object.fromEntries(ids.map((id) => [id, { cards: [], status: "success" }])),
    error: null,
  }),
}));
vi.mock("@/components/CreateTentDialog", () => ({ default: () => null }));
vi.mock("@/components/TentCardActionsMenu", () => ({ default: () => null }));
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
vi.mock("@/hooks/useNowTick", () => ({ useNowTick: () => H.now }));
vi.mock("@/store/grows", () => ({ useGrows: () => ({ grows: [] }) }));

vi.mock("@/components/VpdStageMissingBadge", () => ({ default: () => null }));
vi.mock("@/components/EcowittLatestSnapshotCard", () => ({ default: () => null }));
vi.mock("@/components/StabilityChipDrilldown", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
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

import Tents from "@/pages/Tents";
import { collectSensorsQuickLogManualReadings } from "@/lib/sensorsQuickLogManualSeriesRules";

// External reads are stubbed; both pages, selectors, source labels and chips are real.
const CAPTURED = "2026-10-24T06:25:00Z";
const NOW = Date.parse("2026-10-24T13:25:00Z");
function manual(at = CAPTURED, vpd: number | null = 1.1) {
  return collectSensorsQuickLogManualReadings({
    tentId: TENT,
    growEvents: [
      {
        id: "manual-event",
        tent_id: TENT,
        plant_id: null,
        note: null,
        occurred_at: at,
        event_type: "environment",
        source: "manual",
        is_deleted: false,
        environment_events: { temperature_c: null, humidity_pct: null, vpd_kpa: vpd },
      },
    ],
    now: new Date(H.now),
  });
}
function mount(Page: typeof Dashboard | typeof Tents) {
  H.scoped = Page === Dashboard;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  H.now = NOW;
  H.scoped = false;
  H.growStatus = "success";
  H.perTentRows = [];
  H.sensorStatus = "success";
  H.plantsQuery = { data: [], isError: false, isFetched: true };
  H.tentsPatch = {};
  H.secondTent = true;
  M.data = manual();
  M.pending = false;
  M.error = false;
  M.args = [];
});
afterEach(cleanup);

for (const [name, Page, prefix, sourcePrefix, emptyPrefix] of [
  ["Tents list", Tents, "tents-list-metric", "tents-list-sensor-source", "tents-list-sensor-empty"],
  [
    "Dashboard Environment strip",
    Dashboard,
    "dashboard-env-snapshot-metric",
    "dashboard-env-snapshot-source",
    "dashboard-env-snapshot-no-data",
  ],
] as const) {
  describe(`VER-278 ${name}`, () => {
    // Removing the manual-history display input must make this fail.
    it("renders the event-only 1.10 kPa observation as Manual, with missing siblings unknown", () => {
      expect(M.data).toHaveLength(1);
      mount(Page);
      expect(screen.getByTestId(`${prefix}-${TENT}-vpd`)).toHaveTextContent("1.10");
      expect(screen.getByTestId(`${sourcePrefix}-${TENT}`)).toHaveTextContent("Manual");
      expect(screen.getByTestId(`${sourcePrefix}-${TENT}`)).not.toHaveTextContent("Live");
      expect(screen.getByTestId(`${prefix}-${TENT}-temp`)).toHaveAttribute(
        "data-status",
        "unknown",
      );
      expect(screen.getByTestId(`${prefix}-${TENT}-rh`)).toHaveAttribute("data-status", "unknown");
      expect(screen.queryByTestId(`${emptyPrefix}-${TENT}`)).toBeNull();
    });
    it("ages the manual using its 24-hour window, retaining its source and value", () => {
      H.now = Date.parse(CAPTURED) + 24 * 60 * 60 * 1000 + 1;
      mount(Page);
      expect(screen.getByTestId(`${prefix}-${TENT}-vpd`)).toHaveTextContent("1.10");
      expect(screen.getByTestId(`${prefix}-${TENT}-vpd`)).toHaveAttribute("data-status", "stale");
      expect(screen.getByTestId(`${sourcePrefix}-${TENT}`)).toHaveTextContent("Manual");
    });
    it("does not borrow another tent's manual observation", () => {
      H.secondTent = true;
      mount(Page);
      expect(screen.getByTestId(`${prefix}-${TENT_B}-vpd`)).toHaveAttribute(
        "data-status",
        "unknown",
      );
      expect(screen.getByTestId(`${prefix}-${TENT_B}-vpd`)).not.toHaveTextContent("1.10");
    });
    it("reports confirmed absence only after manual history settles empty", () => {
      M.data = [];
      mount(Page);
      expect(screen.getByTestId(`${emptyPrefix}-${TENT}`)).toHaveTextContent("No sensor data yet");
    });
    it.each(["pending", "error"] as const)(
      "does not report absence when manual history is %s",
      (state) => {
        M.data = [];
        M[state] = true;
        mount(Page);
        expect(screen.queryByTestId(`${emptyPrefix}-${TENT}`)).toBeNull();
        expect(
          screen.getAllByText(/manual history.*(load|check)|checking.*manual|manual.*unavailable/i)
            .length,
        ).toBeGreaterThan(0);
      },
    );
    it("never restores an older manual over a newer quality-rejected sensor VPD", () => {
      H.perTentRows = [
        {
          id: "bad-sensor",
          tent_id: TENT,
          ts: "2026-10-24T07:25:00Z",
          captured_at: "2026-10-24T07:25:00Z",
          metric: "vpd_kpa",
          value: 1.25,
          quality: "invalid",
          source: "live",
        },
      ];
      mount(Page);
      expect(screen.queryByTestId(`${prefix}-${TENT}-vpd`)?.textContent ?? "").not.toContain(
        "1.10",
      );
      expect(screen.queryByTestId(`${prefix}-${TENT}-vpd`)?.textContent ?? "").not.toContain(
        "1.25",
      );
    });
    it("allows a strictly newer valid manual after a rejected sensor capture", () => {
      H.perTentRows = [
        {
          id: "bad-sensor",
          tent_id: TENT,
          ts: "2026-10-24T05:25:00Z",
          captured_at: "2026-10-24T05:25:00Z",
          metric: "vpd_kpa",
          value: 1.25,
          quality: "invalid",
          source: "live",
        },
      ];
      mount(Page);
      expect(screen.getByTestId(`${prefix}-${TENT}-vpd`)).toHaveTextContent("1.10");
      expect(screen.getByTestId(`${prefix}-${TENT}-vpd`)).not.toHaveAttribute(
        "data-status",
        "invalid",
      );
    });
    it("rejects a nonphysical manual VPD instead of inventing zero", () => {
      M.data = manual(CAPTURED, -1);
      mount(Page);
      expect(screen.queryByTestId(`${prefix}-${TENT}-vpd`)).toBeNull();
      expect(screen.getByTestId(`${emptyPrefix}-${TENT}`)).toBeVisible();
    });
  });
}

it("VER-278 keeps the manual capture time when the raw sensor refresh fails", () => {
  H.sensorStatus = "refresh_error";
  H.perTentRows = [
    {
      id: "bad-sensor",
      tent_id: TENT,
      ts: "2026-10-24T05:25:00Z",
      captured_at: "2026-10-24T05:25:00Z",
      metric: "vpd_kpa",
      value: 1.25,
      quality: "invalid",
      source: "live",
    },
  ];
  mount(Tents);
  expect(screen.getByTestId(`tents-list-metric-${TENT}-vpd`)).toHaveTextContent("1.10");
  expect(screen.getByTestId(`tents-list-sensor-last-updated-${TENT}`)).toHaveAttribute(
    "data-captured-at",
    CAPTURED,
  );
  expect(screen.getByTestId(`tents-list-sensor-refresh-stale-${TENT}`)).toBeVisible();
});
