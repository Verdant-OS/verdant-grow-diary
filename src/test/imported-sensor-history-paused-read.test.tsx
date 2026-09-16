import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";

const server = vi.hoisted(() => ({
  read: vi.fn<() => Promise<{ data: unknown; error: Error | null }>>(),
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
        limit: () => server.read(),
      };
      return query;
    },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-A" } }) }));
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
  useGrowPlants: () => ({
    data: [],
    status: "success",
    fetchStatus: "idle",
    isFetching: false,
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

// Isolate unrelated panels and write controls. Tent Detail, its imported-history
// hook, QueryClient, resolver, presenter and read/retry wiring remain real.
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
import { resolveImportedSensorHistoryReadStatus } from "@/lib/importedSensorHistoryViewModel";

const TENT_ID = "11111111-1111-4111-8111-111111111111";
const CSV_ROW = {
  id: "csv-temperature",
  tent_id: TENT_ID,
  source: "csv",
  metric: "temperature_c",
  value: 24.5,
  quality: "ok",
  captured_at: "2026-09-16T06:00:00.000Z",
  ts: "2026-09-16T06:00:00.000Z",
  created_at: "2026-09-16T06:01:00.000Z",
  raw_payload: null,
};
const clients: QueryClient[] = [];

function renderTent() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
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

function panel() {
  return within(screen.getByTestId("imported-sensor-history-panel"));
}

beforeEach(() => {
  onlineManager.setOnline(true);
  server.read.mockReset().mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  onlineManager.setOnline(true);
});

describe("Tent Detail imported-history paused reads", () => {
  it("waits for a connection on its first read and resumes into labeled CSV history", async () => {
    server.read.mockResolvedValue({ data: [CSV_ROW], error: null });
    onlineManager.setOnline(false);
    const client = renderTent();

    expect(
      client.getQueryCache().find({ queryKey: ["sensor_readings"], exact: false })?.state,
    ).toMatchObject({
      status: "pending",
      fetchStatus: "paused",
      data: undefined,
    });
    expect(panel().queryByTestId("imported-history-empty")).not.toBeInTheDocument();
    expect(panel().getByTestId("imported-history-paused")).toHaveTextContent(
      /waiting for a connection/i,
    );
    expect(panel().queryByTestId("imported-history-empty")).not.toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(server.read).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));
    expect(await panel().findByTestId("imported-history-total")).toHaveTextContent(/^1$/);
    expect(panel().getByRole("cell", { name: "24.5" })).toBeInTheDocument();
    expect(panel().getByTestId("imported-history-source-badge")).toHaveTextContent("Source: CSV");
    expect(panel().getByTestId("imported-history-not-live-badge")).toHaveTextContent(
      "Not live data",
    );
    expect(panel().queryByTestId("imported-history-empty")).not.toBeInTheDocument();
    expect(panel().queryByTestId("imported-history-paused")).not.toBeInTheDocument();
    expect(server.read).toHaveBeenCalledTimes(1);
  });

  it("shows empty only after reconnect has completed a successful empty read", async () => {
    let finishRead!: (reply: { data: unknown; error: Error | null }) => void;
    server.read.mockReturnValue(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    onlineManager.setOnline(false);
    renderTent();
    expect(panel().getByTestId("imported-history-paused")).toBeInTheDocument();
    expect(panel().queryByTestId("imported-history-empty")).not.toBeInTheDocument();

    act(() => onlineManager.setOnline(true));
    expect(await panel().findByTestId("imported-history-loading")).toBeInTheDocument();
    expect(panel().queryByTestId("imported-history-empty")).not.toBeInTheDocument();

    await act(async () => finishRead({ data: [], error: null }));
    expect(await panel().findByTestId("imported-history-empty")).toHaveTextContent(
      "No CSV readings are available for this tent in the current history view.",
    );
    expect(panel().queryByTestId("imported-history-loading")).not.toBeInTheDocument();
    expect(panel().queryByTestId("imported-history-paused")).not.toBeInTheDocument();
  });

  it("keeps a failed resumed read unavailable with Retry, then accepts the retry result", async () => {
    server.read.mockResolvedValue({ data: [], error: new Error("Connection failed") });
    onlineManager.setOnline(false);
    renderTent();
    expect(panel().getByTestId("imported-history-paused")).toBeInTheDocument();

    act(() => onlineManager.setOnline(true));
    expect(await panel().findByRole("alert")).toHaveTextContent(
      "Couldn't load imported CSV history",
    );
    expect(panel().queryByTestId("imported-history-empty")).not.toBeInTheDocument();
    server.read.mockResolvedValue({ data: [CSV_ROW], error: null });
    fireEvent.click(panel().getByRole("button", { name: "Try again" }));
    expect(await panel().findByTestId("imported-history-total")).toHaveTextContent(/^1$/);
    expect(panel().queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retains existing CSV rows during a paused background refresh", async () => {
    server.read.mockResolvedValue({ data: [CSV_ROW], error: null });
    const client = renderTent();
    expect(await panel().findByTestId("imported-history-total")).toHaveTextContent(/^1$/);

    act(() => {
      onlineManager.setOnline(false);
      void client.invalidateQueries({ queryKey: ["sensor_readings"] });
    });
    await waitFor(() =>
      expect(
        client.getQueryCache().find({ queryKey: ["sensor_readings"], exact: false })?.state
          .fetchStatus,
      ).toBe("paused"),
    );
    expect(panel().getByRole("cell", { name: "24.5" })).toBeInTheDocument();
    expect(panel().queryByTestId("imported-history-empty")).not.toBeInTheDocument();
    expect(panel().queryByTestId("imported-history-loading")).not.toBeInTheDocument();
    expect(server.read).toHaveBeenCalledTimes(1);
  });

  it("keeps cached-empty history unresolved while its refresh waits for a connection", async () => {
    const client = renderTent();
    expect(await panel().findByTestId("imported-history-empty")).toBeInTheDocument();
    act(() => {
      onlineManager.setOnline(false);
      void client.invalidateQueries({ queryKey: ["sensor_readings"] });
    });
    expect(await panel().findByTestId("imported-history-paused")).toBeInTheDocument();
    expect(panel().queryByTestId("imported-history-empty")).not.toBeInTheDocument();

    server.read.mockResolvedValue({ data: [CSV_ROW], error: null });
    act(() => onlineManager.setOnline(true));
    expect(await panel().findByTestId("imported-history-total")).toHaveTextContent(/^1$/);
  });

  it("keeps a failed cached read unavailable when its retry pauses, without erasing the cache", async () => {
    server.read.mockResolvedValue({ data: [CSV_ROW], error: null });
    const client = renderTent();
    expect(await panel().findByTestId("imported-history-total")).toHaveTextContent(/^1$/);
    server.read.mockResolvedValue({ data: null, error: null });
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["sensor_readings"] });
    });
    expect(await panel().findByRole("alert")).toHaveTextContent(
      "Couldn't load imported CSV history",
    );

    act(() => onlineManager.setOnline(false));
    fireEvent.click(panel().getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(
        client.getQueryCache().find({ queryKey: ["sensor_readings"], exact: false })?.state,
      ).toMatchObject({ status: "error", fetchStatus: "paused", data: [CSV_ROW] }),
    );
    expect(panel().getByRole("alert")).toHaveTextContent("Couldn't load imported CSV history");
    expect(panel().queryByTestId("imported-history-empty")).not.toBeInTheDocument();
    expect(panel().queryByTestId("imported-history-summary")).not.toBeInTheDocument();

    server.read.mockResolvedValue({ data: [CSV_ROW], error: null });
    act(() => onlineManager.setOnline(true));
    expect(await panel().findByTestId("imported-history-total")).toHaveTextContent(/^1$/);
    expect(panel().queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not classify an unresolved idle first read as successful empty history", () => {
    // Pending can also be idle before a read is enabled. It is never successful empty.
    const firstRead = {
      isPending: true,
      isPaused: false,
      isError: false,
      isFetching: false,
      hasRows: false,
    };
    expect(resolveImportedSensorHistoryReadStatus(firstRead)).toBe("loading");
  });
});
