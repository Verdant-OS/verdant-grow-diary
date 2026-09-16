import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { buildPrivateGrowQueryKey } from "@/lib/growDataQueryKeyRules";
import { clearGrowDataMeta } from "@/hooks/useGrowData";
import type { Tent, Plant } from "@/mock";

const fixture = vi.hoisted(() => ({ fetchTent: vi.fn(), fetchPlants: vi.fn() }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/lib/growRepo", () => ({
  fetchTent: fixture.fetchTent,
  fetchPlants: fixture.fetchPlants,
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/hooks/useImportedSensorHistory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useImportedSensorHistory")>()),
  useImportedSensorHistory: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/hooks/useCsvHistoryWindow", () => ({ useCsvHistoryWindow: () => ({}) }));
vi.mock("@/hooks/useTentPlantRosterActivity", () => ({
  useTentPlantRosterActivity: () => ({ byPlantId: {}, isLoading: false, isError: false }),
}));

// Keep real tent/plant queries, roster, tabs, grid and routing; isolate unrelated card IO.
vi.mock("@/components/VpdStageMissingBadge", () => ({ default: () => null }));
vi.mock("@/components/EcowittTentSnapshotV0Card", () => ({ default: () => null }));
vi.mock("@/components/EnvironmentStabilityCard", () => ({ default: () => null }));
vi.mock("@/components/WateringCadenceHistoryStrip", () => ({ default: () => null }));
vi.mock("@/components/DrybackMonitoringStrip", () => ({ default: () => null }));
vi.mock("@/components/TentAiDoctorSessionsPanel", () => ({ default: () => null }));
vi.mock("@/components/StageBadge", () => ({ default: () => null }));
vi.mock("@/components/MetricChip", () => ({ default: () => null }));
vi.mock("@/components/SensorChart", () => ({ default: () => null }));
vi.mock("@/components/QuickLogV2Fab", () => ({ default: () => null }));
vi.mock("@/components/CreatePlantDialog", () => ({ default: () => null }));
vi.mock("@/components/AddExistingPlantDialog", () => ({ default: () => null }));
vi.mock("@/components/PlantCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/OneTentLoopNextStepCard", () => ({ default: () => null }));
vi.mock("@/components/TentCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/PlantPhoto", () => ({ default: () => null }));
vi.mock("@/components/TentManualSnapshotChangeContext", () => ({ default: () => null }));
vi.mock("@/components/TentManualSnapshotHistoryList", () => ({ default: () => null }));
vi.mock("@/components/ManualSnapshotTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/TimelineMemorySection", () => ({ default: () => null }));
vi.mock("@/components/QuickLogGroupedTimelineSection", () => ({ default: () => null }));
vi.mock("@/components/ImportedSensorHistoryPanel", () => ({ default: () => null }));
vi.mock("@/components/TentSensorWebhookSettingsCard", () => ({ default: () => null }));
vi.mock("@/components/TentBridgeTokensCard", () => ({ default: () => null }));
vi.mock("@/components/TentSensorSourceHealthCard", () => ({ default: () => null }));
vi.mock("@/components/SensorSnapshotTruthStrip", () => ({ default: () => null }));
vi.mock("@/components/FirstPlantMemoryCta", () => ({ default: () => null }));
vi.mock("@/components/DiaryEntryRemoveButton", () => ({ default: () => null }));
vi.mock("@/components/StartPhenoHuntButton", () => ({ default: () => null }));
vi.mock("@/components/TentPendingOutcomeNotice", () => ({ default: () => null }));

import TentDetail from "@/pages/TentDetail";

const tent: Tent = {
  id: "tent-1",
  name: "Existing tent",
  brand: "",
  size: "2x2",
  stage: "veg",
  light: { on: false, schedule: "", wattage: 0 },
  alertCount: 0,
  growId: "grow-1",
};
const plant: Plant = {
  id: "plant-1",
  name: "Saved plant",
  strain: "",
  tentId: tent.id,
  growId: tent.growId,
  stage: "veg",
  startedAt: "2026-09-01",
  health: "healthy",
  photo: "",
  lastNote: "",
};
const clients: QueryClient[] = [];
const plantKey = (id = tent.id, archived = false) =>
  buildPrivateGrowQueryKey("owner-1", [
    "plants",
    id,
    "all",
    ...(archived ? ["with-archived"] : []),
  ]);
function renderPage(cached = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(buildPrivateGrowQueryKey("owner-1", ["tent", tent.id]), tent);
  if (cached)
    for (const archived of [false, true]) client.setQueryData(plantKey(tent.id, archived), [plant]);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/tents/" + tent.id]}>
        <Link to="/tents/tent-2">Other tent</Link>
        <Routes>
          <Route path="/tents/:id" element={<TentDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
function expectNoEmpty() {
  expect(screen.queryByTestId("tent-detail-plants-empty")).not.toBeInTheDocument();
  expect(screen.queryAllByText("No plants assigned to this tent yet.")).toHaveLength(0);
  expect(
    screen.queryByRole("heading", { name: "Plants in this tent (0)" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Active plants: 0 · Archived plants: 0")).not.toBeInTheDocument();
}
function deferredPlants() {
  let resolve!: (rows: Plant[]) => void;
  const promise = new Promise<Plant[]>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  clearGrowDataMeta();
  onlineManager.setOnline(true);
  fixture.fetchTent.mockReset().mockResolvedValue(tent);
  fixture.fetchPlants.mockReset().mockResolvedValue([plant]);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  onlineManager.setOnline(true);
  clearGrowDataMeta();
});
describe("Tent plant list reads using real queries", () => {
  it("does not declare no active plants from an archived-only cache after a failed read", async () => {
    fixture.fetchPlants.mockRejectedValue(new Error("unavailable"));
    const client = renderPage();
    act(() => {
      client.setQueryData(plantKey(), []);
      client.setQueryData(plantKey(tent.id, true), [{ ...plant, isArchived: true }]);
    });
    await waitFor(() =>
      expect(screen.getByTestId("tent-plant-list-read-status")).toHaveTextContent("unavailable"),
    );
    expectNoEmpty();
    fireEvent.click(screen.getByTestId("tent-detail-show-archived-toggle"));
    expect(screen.getByTestId("tent-detail-plant-name")).toHaveTextContent(plant.name);
  });
  it("does not reuse prior-tent plants during an offline target change", async () => {
    const client = renderPage();
    expect(await screen.findByTestId("tent-detail-plant-name")).toHaveTextContent(plant.name);
    const otherTent = { ...tent, id: "tent-2", name: "Other tent" };
    const otherPlant = { ...plant, id: "plant-2", tentId: otherTent.id, name: "Other plant" };
    client.setQueryData(buildPrivateGrowQueryKey("owner-1", ["tent", otherTent.id]), otherTent);
    fixture.fetchTent.mockResolvedValue(otherTent);
    fixture.fetchPlants.mockImplementation(async (id) =>
      id === otherTent.id ? [otherPlant] : [plant],
    );
    act(() => onlineManager.setOnline(false));
    fireEvent.click(screen.getByRole("link", { name: "Other tent" }));
    await waitFor(() =>
      expect(screen.getByTestId("tent-plant-list-read-status")).toHaveTextContent(
        "Waiting for connection",
      ),
    );
    expect(screen.queryByTestId("tent-detail-plant-name")).not.toBeInTheDocument();
    expectNoEmpty();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByTestId("tent-detail-plant-name")).toHaveTextContent(otherPlant.name);
    expect(screen.queryByText(plant.name)).not.toBeInTheDocument();
  });
  it("preserves completed active/archived counts and the archived toggle", async () => {
    const archived = { ...plant, isArchived: true };
    fixture.fetchPlants.mockImplementation(async (_id, _grow, opts) =>
      opts.includeArchived ? [archived] : [],
    );
    renderPage();
    expect(await screen.findByTestId("tent-detail-plants-empty")).toHaveTextContent(
      "No active plants in this tent.",
    );
    expect(
      screen.getByRole("heading", { name: "Plants in this tent (0 active · 1 archived)" }),
    ).toBeVisible();
    fireEvent.click(screen.getByTestId("tent-detail-show-archived-toggle"));
    expect(screen.getByTestId("tent-detail-plant-name")).toHaveTextContent(plant.name);
    expect(screen.getByTestId("tent-detail-plant-archived-badge")).toHaveTextContent("Archived");
  });
  it("keeps pending reads unresolved and reveals the same plant after completion", async () => {
    const read = deferredPlants();
    fixture.fetchPlants.mockReturnValue(read.promise);
    renderPage();
    expect(screen.getByTestId("tent-plant-list-read-status")).toHaveTextContent("Loading plants");
    expectNoEmpty();
    await act(async () => read.resolve([plant]));
    expect(await screen.findByTestId("tent-detail-plant-name")).toHaveTextContent(plant.name);
    expect(screen.getByRole("heading", { name: "Plants in this tent (1)" })).toBeVisible();
  });
  it("waits while first plant reads are paused then reconnects to the same tent", async () => {
    onlineManager.setOnline(false);
    renderPage();
    expect(screen.getByTestId("tent-plant-list-read-status")).toHaveTextContent(
      "Waiting for connection",
    );
    expect(fixture.fetchPlants).not.toHaveBeenCalled();
    expectNoEmpty();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByTestId("tent-detail-plant-name")).toHaveTextContent(plant.name);
    expect(fixture.fetchPlants.mock.calls).toEqual([
      [tent.id, undefined, { includeArchived: false }],
      [tent.id, undefined, { includeArchived: true }],
    ]);
  });
  it("shows unavailable after both fail and retries both exact list queries", async () => {
    fixture.fetchPlants.mockRejectedValue(new Error("private failure detail"));
    renderPage();
    await waitFor(() =>
      expect(screen.getByTestId("tent-plant-list-read-status")).toHaveTextContent("unavailable"),
    );
    expectNoEmpty();
    expect(screen.queryByText("private failure detail")).not.toBeInTheDocument();
    fixture.fetchPlants.mockResolvedValue([plant]);
    fireEvent.click(screen.getByRole("button", { name: "Retry plant list" }));
    expect(await screen.findByTestId("tent-detail-plant-name")).toHaveTextContent(plant.name);
    expect(
      fixture.fetchPlants.mock.calls.filter((c) => c[2].includeArchived === false),
    ).toHaveLength(2);
    expect(
      fixture.fetchPlants.mock.calls.filter((c) => c[2].includeArchived === true),
    ).toHaveLength(2);
  });
  it.each([false, true])(
    "retains the survivor when includeArchived=%s fails",
    async (failedArchived) => {
      fixture.fetchPlants.mockImplementation(async (_id, _grow, opts) => {
        if (opts.includeArchived === failedArchived) throw new Error("unavailable");
        return [plant];
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId("tent-plant-list-read-status")).toHaveTextContent("unavailable"),
      );
      expect(screen.getByTestId("tent-detail-plant-name")).toHaveTextContent(plant.name);
      expectNoEmpty();
      expect(
        screen.queryByRole("heading", { name: "Plants in this tent (1)" }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("tent-plant-roster-header-counts")).toHaveTextContent(
        "Plant counts not verified",
      );
    },
  );
  it("retains cached plants with a warning after failed refresh", async () => {
    fixture.fetchPlants.mockRejectedValue(new Error("unavailable"));
    renderPage(true);
    await waitFor(() =>
      expect(screen.getByTestId("tent-plant-list-read-status")).toHaveTextContent("unavailable"),
    );
    expect(screen.getByTestId("tent-detail-plant-name")).toHaveTextContent(plant.name);
    expectNoEmpty();
    expect(screen.getByTestId("tent-plant-list-read-status")).toHaveTextContent(
      "Available plants are shown",
    );
  });
  it("qualifies cached rows while refreshing instead of asserting current counts", async () => {
    const read = deferredPlants();
    fixture.fetchPlants.mockReturnValue(read.promise);
    renderPage(true);
    expect(screen.getByTestId("tent-plant-list-read-status")).toHaveTextContent(
      "Refreshing plants",
    );
    expect(screen.getByTestId("tent-detail-plant-name")).toHaveTextContent(plant.name);
    expectNoEmpty();
    await act(async () => read.resolve([plant]));
    await waitFor(() =>
      expect(screen.queryByTestId("tent-plant-list-read-status")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "Plants in this tent (1)" })).toBeVisible();
  });
  it("reserves zero counts and empty guidance for two completed successful reads", async () => {
    fixture.fetchPlants.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByTestId("tent-detail-plants-empty")).toHaveTextContent(
      "No plants in this tent yet.",
    );
    expect(screen.getByRole("heading", { name: "Plants in this tent (0)" })).toBeVisible();
    expect(screen.getByTestId("tent-plant-roster-header-counts")).toHaveTextContent(
      "Active plants: 0 · Archived plants: 0",
    );
  });
  it("does not turn cached empty into confirmed empty after the refresh fails", async () => {
    fixture.fetchPlants.mockRejectedValue(new Error("unavailable"));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    clients.push(client);
    client.setQueryData(buildPrivateGrowQueryKey("owner-1", ["tent", tent.id]), tent);
    for (const archived of [false, true]) client.setQueryData(plantKey(tent.id, archived), []);
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/tents/" + tent.id]}>
          <Routes>
            <Route path="/tents/:id" element={<TentDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(client.getQueryState(plantKey())?.status).toBe("error"));
    expectNoEmpty();
  });
});
