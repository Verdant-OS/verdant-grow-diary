/**
 * Resolved tent stage badge and tent-or-grow-event feeding cadence.
 *
 * The badge used to render raw tents.stage. The cadence card used to count
 * only diary rows whose plant id matched. These tests cover the new behavior.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import {
  buildGuidedActionChecklist,
  type BuildGuidedActionChecklistInput,
  type GuidedChecklistGrowEvent,
  type GuidedChecklistPlant,
} from "@/lib/guidedActionChecklistRules";
import type { NormalizedDiaryEntry } from "@/lib/diaryEntryRules";

const NOW = Date.parse("2026-07-23T12:00:00Z");
const GROW = "grow-1";
const TENT = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const OTHER_TENT = "8d2e3f4a-5b6c-4d7e-9f0a-1b2c3d4e5f6a";
const NULL_COPY = "No watering or feeding logged for this plant yet.";
const RECENT = new Date(NOW - 60 * 60_000).toISOString();
const STALE = new Date(NOW - 10 * 24 * 60 * 60_000).toISOString();

const H = vi.hoisted(() => ({
  plants: [] as Array<Record<string, unknown>> | undefined,
  grows: [{ id: "grow-1", stage: "seedling" }] as Array<{ id: string; stage: string }>,
  growsLoading: false,
  growsError: null as string | null,
  diary: [] as unknown[],
  growEvents: [] as Array<Record<string, unknown>>,
  growEventError: null as { message: string } | null,
  requests: [] as string[],
  filters: [] as Array<{ table: string; op: "eq" | "in"; column: string; value: unknown }>,
  returnedRows: null as Array<Record<string, unknown>> | null,
  tentStage: "seedling",
}));

function rowMatchesQuery(
  row: Record<string, unknown>,
  filters: Array<{ op: "eq" | "in"; column: string; value: unknown }>,
): boolean {
  for (const filter of filters) {
    if (!Object.prototype.hasOwnProperty.call(row, filter.column)) continue;
    const cell = row[filter.column];
    if (filter.op === "eq") {
      if (cell !== filter.value) return false;
      continue;
    }
    if (!Array.isArray(filter.value) || !filter.value.includes(cell)) return false;
  }
  return true;
}

function chain(table: string) {
  const filters: Array<{ op: "eq" | "in"; column: string; value: unknown }> = [];
  const finish = () => {
    if (table === "grow_events") {
      H.requests.push(table);
      for (const filter of filters) H.filters.push({ table, ...filter });
      const data = H.growEventError
        ? null
        : H.growEvents.filter((row) => rowMatchesQuery(row, filters));
      H.returnedRows = data;
      return Promise.resolve({ data, error: H.growEventError });
    }
    return Promise.resolve({ data: [], error: null });
  };
  const query: Record<string, unknown> = {};
  const proxy = new Proxy(query, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          finish().then(resolve, reject);
      }
      if (prop === "catch") {
        return (reject: (reason: unknown) => unknown) => finish().catch(reject);
      }
      if (prop === "eq") {
        return (column: string, value: unknown) => {
          filters.push({ op: "eq", column, value });
          return proxy;
        };
      }
      if (prop === "in") {
        return (column: string, value: unknown) => {
          filters.push({ op: "in", column, value });
          return proxy;
        };
      }
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => chain(table) },
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner-1" }, loading: false, signOut: async () => {} }),
}));
vi.mock("@/hooks/useNowTick", () => ({ useNowTick: () => NOW }));
vi.mock("@/hooks/use-diary-entries", () => ({
  useDiaryEntries: () => ({
    data: H.diary,
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useAlertsList", () => ({
  useAlertsList: () => ({ alerts: [], status: "ok", error: null, reload: vi.fn() }),
}));
vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: GROW,
    scopedGrow: { id: GROW, name: "Trust Grow", stage: "seedling" },
    scopedGrowName: "Trust Grow",
    isValidScopedGrow: true,
    backHref: null,
  }),
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: H.grows,
    activeGrowId: GROW,
    loading: H.growsLoading,
    error: H.growsError,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/hooks/useGrowData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGrowData")>()),
  getGrowDataMeta: () => ({ isDemoData: false, dataSource: "supabase", sourceReason: "live" }),
  useGrowTents: () => ({
    data: [
      {
        id: TENT,
        name: "Veg Tent",
        brand: "Gorilla",
        size: "4x4",
        stage: H.tentStage,
        light: { on: true, schedule: "18/6", wattage: 240 },
        alertCount: 0,
        growId: GROW,
      },
    ],
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useGrowTent: () => ({
    data: {
      id: TENT,
      name: "Veg Tent",
      brand: "Gorilla",
      size: "4x4",
      stage: H.tentStage,
      growId: GROW,
      light: { on: true, schedule: "18/6", wattage: 400 },
      alertCount: 0,
    },
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    fetchStatus: "idle",
    refetch: vi.fn(),
  }),
  useGrowPlants: () => ({
    data: H.plants,
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({
    data: [],
    isLoading: false,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useSensorReadingsByTents: () => ({
    byTent: {
      [TENT]: [
        {
          id: "reading-1",
          tent_id: TENT,
          ts: new Date(NOW - 5 * 60_000).toISOString(),
          captured_at: new Date(NOW - 5 * 60_000).toISOString(),
          metric: "temperature_c",
          value: 24,
          source: "manual",
          quality: "ok",
        },
      ],
    },
    statusByTent: { [TENT]: "success" },
    refreshingByTent: { [TENT]: false },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useManualSnapshotTimelineCards", () => ({
  useTentManualSnapshotBatch: () => ({ byTent: {}, error: null }),
  useManualSnapshotTimelineCards: () => ({ cards: [], readStatus: "empty", refetch: vi.fn() }),
}));
vi.mock("@/hooks/useImportedSensorHistory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useImportedSensorHistory")>()),
  useImportedSensorHistory: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useTentPlantRosterActivity", () => ({
  useTentPlantRosterActivity: () => ({ byPlantId: {}, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useCsvHistoryWindow", () => ({
  useCsvHistoryWindow: () => ({ readings: [], status: "empty" }),
}));
vi.mock("@/context/TentQuickLogTargetContext", () => ({
  useTentQuickLogTargetEvidence: () => ({ status: "idle", plantId: null }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => undefined }));
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
vi.mock("@/components/CreateTentDialog", () => ({ default: () => null }));
vi.mock("@/components/TentCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/DailyGrowCheckStatusCard", () => ({ default: () => null }));
vi.mock("@/components/DashboardDailyGrowCheckPanel", () => ({ default: () => null }));
vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));
vi.mock("@/components/AddExistingPlantDialog", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/EcowittTentSnapshotV0Card", () => ({ default: () => null }));
vi.mock("@/components/EcowittLatestSnapshotCard", () => ({ default: () => null }));
vi.mock("@/components/WateringCadenceHistoryStrip", () => ({ default: () => null }));
vi.mock("@/components/DrybackMonitoringStrip", () => ({ default: () => null }));
vi.mock("@/components/TentAiDoctorSessionsPanel", () => ({ default: () => null }));
vi.mock("@/components/TentManualSnapshotHistoryList", () => ({ default: () => null }));
vi.mock("@/components/ManualSnapshotTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TimelineMemorySection", () => ({ default: () => null }));
vi.mock("@/components/QuickLogGroupedTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TentSensorWebhookSettingsCard", () => ({ default: () => null }));
vi.mock("@/components/TentBridgeTokensCard", () => ({ default: () => null }));
vi.mock("@/components/TentSensorSourceHealthCard", () => ({ default: () => null }));
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/TentManualSnapshotChangeContext", () => ({ default: () => null }));
vi.mock("@/components/ImportedSensorHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/SensorSnapshotTruthStrip", () => ({ default: () => null }));
vi.mock("@/components/FirstPlantMemoryCta", () => ({ default: () => null }));
vi.mock("@/components/TentPlantRosterPanel", () => ({ default: () => null }));
vi.mock("@/components/TentPlantTabs", () => ({ default: () => null }));
vi.mock("@/components/TentPlantActivityPanels", () => ({ default: () => null }));
vi.mock("@/components/TentPendingOutcomeNotice", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/VpdStageMissingBadge", () => ({ default: () => null }));
vi.mock("@/components/StabilityChipDrilldown", () => ({ default: () => null }));
vi.mock("@/components/OnboardingChecklistCard", () => ({ default: () => null }));
vi.mock("@/components/PublicQuickLogHandoffCard", () => ({ default: () => null }));
vi.mock("@/components/OnboardingProgressPill", () => ({ default: () => null }));
vi.mock("@/components/OperatorModeCallout", () => ({ default: () => null }));
vi.mock("@/components/ReleaseReadinessOperatorCard", () => ({ default: () => null }));
vi.mock("@/components/LineageRepairCta", () => ({ default: () => null }));
vi.mock("@/components/DashboardPendingOutcomeReviewsCard", () => ({ default: () => null }));
vi.mock("@/components/SafeByDesignNotice", () => ({ default: () => null }));
vi.mock("@/components/DashboardSensorHealthSummary", () => ({ default: () => null }));
vi.mock("@/components/DashboardOperatorAccountReadModels", () => ({ default: () => null }));

import Tents from "@/pages/Tents";
import Dashboard from "@/pages/Dashboard";
import TentDetail from "@/pages/TentDetail";
import GuidedActionChecklistPanel from "@/components/GuidedActionChecklistPanel";

function flowerPlant(tentId = TENT): Record<string, unknown> {
  return {
    id: "plant-1",
    name: "Aurora",
    strain: "Test cultivar",
    tentId,
    growId: GROW,
    stage: "flower",
    isArchived: false,
  };
}

function mount(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function headerNamed(name: string): HTMLElement {
  const header = screen.getAllByRole("banner").find((el) => within(el).queryByText(name));
  if (!header) throw new Error(`missing header ${name}`);
  return header;
}

beforeEach(() => {
  H.plants = [];
  H.grows = [{ id: GROW, stage: "seedling" }];
  H.growsLoading = false;
  H.growsError = null;
  H.diary = [];
  H.growEvents = [];
  H.growEventError = null;
  H.requests = [];
  H.filters = [];
  H.returnedRows = null;
  H.tentStage = "seedling";
});

describe("resolved tent stage badge", () => {
  it("shows the plant-consensus stage when the stored tent stage is seedling", () => {
    H.plants = [flowerPlant()];
    mount(
      <MemoryRouter>
        <Tents />
      </MemoryRouter>,
    );
    const card = screen.getByTestId(`tents-card-${TENT}`);
    expect(within(card).getByText("Flower")).toBeTruthy();
    expect(within(card).queryByText("Seedling")).toBeNull();
  });

  it("hides the tents badge while the stage is unresolved", () => {
    H.plants = undefined;
    mount(
      <MemoryRouter>
        <Tents />
      </MemoryRouter>,
    );
    const card = screen.getByTestId(`tents-card-${TENT}`);
    expect(within(card).queryByText("Flower")).toBeNull();
    expect(within(card).queryByText("Seedling")).toBeNull();
    expect(within(card).queryByText("Veg")).toBeNull();
  });

  it("shows the plant-consensus stage on the dashboard environment snapshot", async () => {
    H.plants = [flowerPlant()];
    mount(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(H.requests).toContain("grow_events");
    });
    const card = screen.getByTestId(`dashboard-env-snapshot-tent-${TENT}`);
    expect(within(card).getByText("Flower")).toBeTruthy();
    expect(within(card).queryByText("Seedling")).toBeNull();
  });

  it("hides the dashboard badge while the stage is unresolved", async () => {
    H.plants = undefined;
    mount(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(H.requests).toContain("grow_events");
    });
    const card = screen.getByTestId(`dashboard-env-snapshot-tent-${TENT}`);
    expect(within(card).queryByText("Flower")).toBeNull();
    expect(within(card).queryByText("Seedling")).toBeNull();
  });

  it("shows the plant-consensus stage in the tent detail header", () => {
    H.plants = [flowerPlant()];
    mount(
      <MemoryRouter initialEntries={[`/tents/${TENT}`]}>
        <Routes>
          <Route path="/tents/:id" element={<TentDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    const header = headerNamed("Veg Tent");
    expect(within(header).getByText("Flower")).toBeTruthy();
    expect(within(header).queryByText("Seedling")).toBeNull();
  });

  it("hides the tent detail header badge while the stage is unresolved", () => {
    H.plants = undefined;
    mount(
      <MemoryRouter initialEntries={[`/tents/${TENT}`]}>
        <Routes>
          <Route path="/tents/:id" element={<TentDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    const header = headerNamed("Veg Tent");
    expect(within(header).queryByText("Flower")).toBeNull();
    expect(within(header).queryByText("Seedling")).toBeNull();
    expect(within(header).queryByText("Veg")).toBeNull();
  });
});

const PLANT_A: GuidedChecklistPlant = {
  id: "p1",
  name: "Alpha",
  growId: GROW,
  tentId: TENT,
  stage: "veg",
};
const PLANT_B: GuidedChecklistPlant = {
  id: "p2",
  name: "Bravo",
  growId: GROW,
  tentId: OTHER_TENT,
  stage: "veg",
};

function entry(
  partial: Partial<NormalizedDiaryEntry> & {
    id: string;
    plantId: string | null;
    eventType: string;
    createdAt: string | null;
    tentId?: string | null;
  },
): NormalizedDiaryEntry {
  return {
    growId: GROW,
    tentId: partial.tentId ?? null,
    stage: null,
    note: "",
    photoUrl: null,
    createdAtLabel: partial.createdAt ?? "",
    dayOfGrow: null,
    weekOfGrow: null,
    details: {},
    warnings: [],
    isValidForAiContext: true,
    ...partial,
  } as NormalizedDiaryEntry;
}

function waterItems(input: Partial<BuildGuidedActionChecklistInput> = {}) {
  return buildGuidedActionChecklist({
    now: NOW,
    scopedGrowId: GROW,
    plants: [PLANT_A, PLANT_B],
    tents: [
      { id: TENT, name: "Tent A" },
      { id: OTHER_TENT, name: "Tent B" },
    ],
    diaryEntries: [],
    latestReadingByTent: {},
    openAlerts: [],
    dismissedIds: [],
    ...input,
  }).filter((item) => item.id.startsWith("cadence:water:"));
}

function reasonFor(plantId: string, items: ReturnType<typeof waterItems>): string | undefined {
  return items.find((item) => item.plantId === plantId)?.reason;
}

describe("feeding cadence tent scope and grow events", () => {
  it("clears the null copy when a plant-scoped diary feeding is recent", () => {
    const items = waterItems({
      diaryEntries: [
        entry({ id: "d1", plantId: "p1", tentId: TENT, eventType: "watering", createdAt: RECENT }),
      ],
    });
    expect(reasonFor("p1", items)).toBeUndefined();
    expect(reasonFor("p2", items)).toBe(NULL_COPY);
  });

  it("counts a tent-scoped feeding for every plant in that tent and not another tent", () => {
    const items = waterItems({
      diaryEntries: [
        entry({
          id: "d-tent",
          plantId: null,
          tentId: TENT,
          eventType: "feeding",
          createdAt: RECENT,
        }),
      ],
    });
    expect(reasonFor("p1", items)).toBeUndefined();
    expect(reasonFor("p2", items)).toBe(NULL_COPY);
  });

  it("counts a water alias and a details feed alias", () => {
    const items = waterItems({
      plants: [PLANT_A],
      diaryEntries: [
        entry({
          id: "d-alias",
          plantId: null,
          tentId: TENT,
          eventType: "note",
          createdAt: RECENT,
          details: { declaredEventType: "feed" },
        }),
      ],
    });
    expect(items.filter((item) => item.plantId === "p1")).toHaveLength(0);
  });

  it("counts a grow_events feeding that has no diary companion", () => {
    const event: GuidedChecklistGrowEvent = {
      id: "ge-1",
      eventType: "feeding",
      plantId: null,
      tentId: TENT,
      occurredAt: RECENT,
    };
    const items = waterItems({ growEvents: [event] });
    expect(reasonFor("p1", items)).toBeUndefined();
    expect(reasonFor("p2", items)).toBe(NULL_COPY);
  });

  it("does not count a note row", () => {
    const items = waterItems({
      diaryEntries: [
        entry({
          id: "note-1",
          plantId: "p1",
          tentId: TENT,
          eventType: "note",
          createdAt: RECENT,
          note: "looking fine",
        }),
      ],
      growEvents: [
        {
          id: "ge-note",
          eventType: "note",
          plantId: "p1",
          tentId: TENT,
          occurredAt: RECENT,
        },
      ],
    });
    expect(reasonFor("p1", items)).toBe(NULL_COPY);
  });

  it("counts a linked diary row and grow_event once", () => {
    const linked = entry({
      id: "d-linked",
      plantId: "p1",
      tentId: TENT,
      eventType: "watering",
      createdAt: STALE,
      details: { extras: { linked_grow_event_id: "ge-linked" } },
    });
    const event: GuidedChecklistGrowEvent = {
      id: "ge-linked",
      eventType: "watering",
      plantId: "p1",
      tentId: TENT,
      occurredAt: RECENT,
    };
    const cleared = waterItems({
      plants: [PLANT_A],
      diaryEntries: [linked],
      growEvents: [event],
    });
    expect(cleared.filter((item) => item.id === "cadence:water:p1")).toHaveLength(0);

    const aged = waterItems({
      plants: [PLANT_A],
      diaryEntries: [linked],
      growEvents: [{ ...event, occurredAt: STALE }],
    });
    expect(aged.filter((item) => item.id === "cadence:water:p1")).toHaveLength(1);
    expect(aged[0]?.reason).not.toBe(NULL_COPY);
  });
});

function expectFeedingQueryFilters() {
  expect(H.filters).toEqual(
    expect.arrayContaining([
      { table: "grow_events", op: "eq", column: "grow_id", value: GROW },
      { table: "grow_events", op: "eq", column: "is_deleted", value: false },
      { table: "grow_events", op: "in", column: "event_type", value: ["watering", "feeding"] },
    ]),
  );
}

describe("checklist panel passes grow_events into the cadence", () => {
  function mountFeeding(row: Record<string, unknown>) {
    H.plants = [
      {
        id: "p1",
        name: "Alpha",
        tentId: TENT,
        growId: GROW,
        stage: "veg",
      },
    ];
    H.growEvents = [row];
    mount(
      <MemoryRouter>
        <GuidedActionChecklistPanel scopedGrowId={GROW} />
      </MemoryRouter>,
    );
  }

  it("clears the null copy from a grow-scoped grow_events feeding", async () => {
    mountFeeding({
      id: "ge-panel",
      event_type: "watering",
      plant_id: "p1",
      tent_id: TENT,
      occurred_at: RECENT,
      grow_id: GROW,
      is_deleted: false,
    });
    await waitFor(() => {
      expect(H.requests).toContain("grow_events");
      expect(screen.queryByText(NULL_COPY)).toBeNull();
    });
    expectFeedingQueryFilters();
    expect(H.returnedRows).toEqual([
      expect.objectContaining({ id: "ge-panel", grow_id: GROW, is_deleted: false }),
    ]);
  });

  it("does not count a grow_events feeding from another grow_id", async () => {
    mountFeeding({
      id: "ge-other-grow",
      event_type: "watering",
      plant_id: "p1",
      tent_id: TENT,
      occurred_at: RECENT,
      grow_id: "other-grow",
      is_deleted: false,
    });
    await waitFor(() => {
      expect(H.returnedRows).toEqual([]);
    });
    expect(screen.getByText(NULL_COPY)).toBeTruthy();
    expectFeedingQueryFilters();
  });

  it("does not count a soft-deleted grow_events feeding", async () => {
    mountFeeding({
      id: "ge-deleted",
      event_type: "feeding",
      plant_id: null,
      tent_id: TENT,
      occurred_at: RECENT,
      grow_id: GROW,
      is_deleted: true,
    });
    await waitFor(() => {
      expect(H.returnedRows).toEqual([]);
    });
    expect(screen.getByText(NULL_COPY)).toBeTruthy();
    expectFeedingQueryFilters();
  });
});
