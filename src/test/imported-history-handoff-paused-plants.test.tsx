import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import type { Plant } from "@/mock";

const server = vi.hoisted(() => ({
  activeRead: vi.fn<() => Promise<Plant[]>>(),
  csvRows: [] as unknown[],
  user: { id: "owner-A" },
}));

// Control repository I/O, not the query states being classified by Tent Detail.
vi.mock("@/lib/growRepo", () => ({
  fetchPlants: (
    _tentId: string,
    _growId: string | undefined,
    opts: { includeArchived: boolean },
  ) => (opts.includeArchived ? Promise.resolve([]) : server.activeRead()),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "sensor_readings") throw new Error(`Unexpected table: ${table}`);
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        limit: async () => ({ data: server.csvRows, error: null }),
      };
      return query;
    },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: server.user }) }));
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/hooks/useGrowData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGrowData")>()),
  useGrowTent: () => ({
    data: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "CSV tent",
      growId: "grow-A",
      light: { on: true, schedule: "18/6", wattage: 400 },
      ventilation: { fanOn: true, exhaustOn: true, intakeOn: true },
      currentStage: "seedling",
    },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], status: "success", isFetching: false }),
}));
vi.mock("@/hooks/useCsvHistoryWindow", () => ({
  useCsvHistoryWindow: () => ({ window: { status: "ready", days: null } }),
}));
vi.mock("@/hooks/useTentPlantRosterActivity", () => ({
  useTentPlantRosterActivity: () => ({ byPlantId: {}, isLoading: false, isError: false }),
}));

// Unrelated panels/write controls are omitted. Tent Detail, both history and
// plant query hooks, QueryClient, handoff rules and both presenters stay real.
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/TentPendingOutcomeNotice", () => ({ default: () => null }));
vi.mock("@/components/EcowittTentSnapshotV0Card", () => ({ default: () => null }));
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
vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));
vi.mock("@/components/AddExistingPlantDialog", () => ({ default: () => null }));
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/TentCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));

import TentDetail from "@/pages/TentDetail";
import { AI_DOCTOR_CSV_HISTORY_SOURCES } from "@/lib/aiDoctorCsvHistoryContextRules";
import { buildPrivateGrowQueryKey, buildPrivateSensorQueryKey } from "@/lib/growDataQueryKeyRules";
import {
  buildImportedSensorHistoryAiDoctorHandoff,
  resolveImportedHistoryHandoffReadStatus,
} from "@/lib/importedSensorHistoryAiDoctorHandoffRules";

const TENT_ID = "11111111-1111-4111-8111-111111111111";
const PLANT_ID = "22222222-2222-4222-8222-222222222222";
const PLANT: Plant = {
  id: PLANT_ID,
  name: "North Star",
  strain: "Test cultivar",
  stage: "seedling",
  health: "watch",
  photo: "",
  tentId: TENT_ID,
  growId: "grow-A",
  startedAt: "2026-09-01T00:00:00.000Z",
  isArchived: false,
  lastNote: "",
};
const ACTIVE_KEY = buildPrivateGrowQueryKey("owner-A", ["plants", TENT_ID, "all"]);
const HISTORY_KEY = buildPrivateSensorQueryKey("owner-A", [
  "imported_history",
  TENT_ID,
  200,
  AI_DOCTOR_CSV_HISTORY_SOURCES.join("|"),
]);
const CSV_ROWS = ["2026-09-15T06:00:00.000Z", "2026-09-16T06:00:00.000Z"].map((ts, index) => ({
  id: `csv-${index}`,
  tent_id: TENT_ID,
  source: "csv",
  metric: "temperature_c",
  value: 24 + index,
  quality: "ok",
  captured_at: ts,
  ts,
  created_at: ts,
  raw_payload: null,
}));
const clients: QueryClient[] = [];

function renderTent(cachedPlants?: Plant[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(HISTORY_KEY, CSV_ROWS);
  if (cachedPlants) client.setQueryData(ACTIVE_KEY, cachedPlants);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/tents/${TENT_ID}`]}>
        <Routes>
          <Route path="/tents/:id" element={<TentDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

function handoff() {
  return screen.getByTestId("imported-history-ai-doctor-handoff");
}

function expectWaiting() {
  expect(handoff()).not.toHaveTextContent("No active plant to review");
  expect(handoff()).toHaveTextContent(/waiting for a connection/i);
  expect(within(handoff()).queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByTestId("imported-history-total")).toHaveTextContent(/^2$/);
  expect(screen.getByTestId("imported-history-not-live-badge")).toHaveTextContent("Not live data");
}

beforeEach(() => {
  onlineManager.setOnline(true);
  server.activeRead.mockReset().mockResolvedValue([PLANT]);
  server.csvRows = CSV_ROWS;
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  onlineManager.setOnline(true);
});

describe("Tent Detail CSV handoff with unresolved active plants", () => {
  it("keeps the first paused plant read unresolved, then links the returned plant and exact tent", async () => {
    onlineManager.setOnline(false);
    const client = renderTent();
    expect(client.getQueryState(ACTIVE_KEY)).toMatchObject({
      status: "pending",
      fetchStatus: "paused",
      data: undefined,
    });
    expectWaiting();
    expect(server.activeRead).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));
    const link = await within(handoff()).findByRole("link", { name: "Review North Star" });
    expect(link).toHaveAttribute(
      "href",
      `/plants/${PLANT_ID}?tentId=${TENT_ID}#plant-ai-doctor-review`,
    );
    expect(handoff()).not.toHaveTextContent(/waiting for a connection/i);
  });

  it("reserves no-active-plant copy for a successfully completed empty plant read", async () => {
    let finishRead!: (plants: Plant[]) => void;
    server.activeRead.mockReturnValue(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    onlineManager.setOnline(false);
    renderTent();
    expectWaiting();
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(handoff()).toHaveAttribute("data-state", "plants_loading"));
    expect(handoff()).not.toHaveTextContent("No active plant to review");
    await act(async () => finishRead([]));
    await waitFor(() => expect(handoff()).toHaveAttribute("data-state", "no_active_plants"));
    expect(handoff()).toHaveTextContent("No active plant to review");
    expect(within(handoff()).queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps a failed resumed plant read unavailable until a successful retry", async () => {
    server.activeRead.mockRejectedValue(new Error("Plant read unavailable"));
    onlineManager.setOnline(false);
    const client = renderTent();
    expectWaiting();
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(handoff()).toHaveAttribute("data-state", "plants_error"));
    expect(handoff()).toHaveTextContent("Plants unavailable");
    expect(within(handoff()).queryByRole("link")).not.toBeInTheDocument();

    server.activeRead.mockResolvedValue([PLANT]);
    await act(async () => {
      await client.refetchQueries({ queryKey: ACTIVE_KEY, exact: true });
    });
    expect(
      await within(handoff()).findByRole("link", { name: "Review North Star" }),
    ).toBeInTheDocument();
  });

  it("keeps cached-empty plants unresolved during a paused refresh", async () => {
    onlineManager.setOnline(false);
    renderTent([]);
    expectWaiting();
    act(() => onlineManager.setOnline(true));
    expect(
      await within(handoff()).findByRole("link", { name: "Review North Star" }),
    ).toBeInTheDocument();
  });

  it("preserves explicit choices from non-empty cached plants during a paused refresh", () => {
    onlineManager.setOnline(false);
    renderTent([
      PLANT,
      { ...PLANT, id: "33333333-3333-4333-8333-333333333333", name: "South Star" },
    ]);
    expect(handoff()).toHaveTextContent("Choose a plant for review");
    expect(within(handoff()).getAllByRole("link")).toHaveLength(2);
    expect(within(handoff()).getByRole("link", { name: "Review North Star" })).toHaveAttribute(
      "href",
      `/plants/${PLANT_ID}?tentId=${TENT_ID}#plant-ai-doctor-review`,
    );
    expect(server.activeRead).not.toHaveBeenCalled();
  });

  it("keeps a failed cached plant read unavailable while its retry is paused", async () => {
    const client = renderTent();
    expect(
      await within(handoff()).findByRole("link", { name: "Review North Star" }),
    ).toBeInTheDocument();
    server.activeRead.mockRejectedValue(new Error("Plant read unavailable"));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ACTIVE_KEY, exact: true });
    });
    await waitFor(() => expect(handoff()).toHaveAttribute("data-state", "plants_error"));
    act(() => {
      onlineManager.setOnline(false);
      void client.refetchQueries({ queryKey: ACTIVE_KEY, exact: true });
    });
    await waitFor(() =>
      expect(client.getQueryState(ACTIVE_KEY)).toMatchObject({
        status: "error",
        fetchStatus: "paused",
        data: [PLANT],
      }),
    );
    expect(handoff()).toHaveTextContent("Plants unavailable");
    expect(within(handoff()).queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not classify an unresolved idle first plant read as successful empty", () => {
    const pending = {
      isError: false,
      isFetching: false,
      hasRows: false,
      isPending: true,
      isPaused: false,
    };
    expect(resolveImportedHistoryHandoffReadStatus(pending)).toBe("loading");
  });

  it("does not offer a plant review when the shared read-status contract reports paused history", () => {
    const result = buildImportedSensorHistoryAiDoctorHandoff({
      tentId: TENT_ID,
      historyStatus: "paused",
      readings: CSV_ROWS,
      plantStatus: "success",
      plants: [PLANT],
    });
    expect(result.state).toBe("history_loading");
    expect(result.choices).toEqual([]);
  });
});
