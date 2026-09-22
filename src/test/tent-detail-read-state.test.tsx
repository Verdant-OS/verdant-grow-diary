import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { buildPrivateGrowQueryKey } from "@/lib/growDataQueryKeyRules";
import { clearGrowDataMeta } from "@/hooks/useGrowData";
import type { Tent } from "@/mock";

const fixture = vi.hoisted(() => ({ fetchTent: vi.fn(), plants: [] }));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
vi.mock("@/lib/growRepo", () => ({ fetchTent: fixture.fetchTent }));
vi.mock("@/hooks/useGrowData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useGrowData")>()),
  useGrowPlants: () => ({
    data: fixture.plants,
    isPending: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
    fetchStatus: "idle",
  }),
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

// Keep the real tent query, routes, source disclosure, header and blocked
// presenter. Unrelated cards and their IO are outside this read-state proof.
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
vi.mock("@/components/TentPlantRosterPanel", () => ({ default: () => null }));
vi.mock("@/components/TentPlantTabs", () => ({ default: () => null }));
vi.mock("@/components/TentPlantActivityPanels", () => ({ default: () => null }));
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
const tentKey = buildPrivateGrowQueryKey("owner-1", ["tent", tent.id]);
const clients: QueryClient[] = [];
function deferredTent() {
  let resolve!: (value: Tent | null) => void;
  const promise = new Promise<Tent | null>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function renderPage(options: { cached?: Tent; path?: string } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  if (options.cached) client.setQueryData(tentKey, options.cached);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[options.path ?? "/tents/tent-1"]}>
        <Link to="/tents/tent-2">Other tent</Link>
        <Routes>
          <Route path="/tents/:id" element={<TentDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
function expectNoFalseAbsence() {
  expect(screen.queryByText("Tent not found")).not.toBeInTheDocument();
  expect(screen.queryByText("No real tents yet")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Add your first tent to start tracking real data."),
  ).not.toBeInTheDocument();
}
function expectWaiting() {
  expect(screen.getByTestId("tent-detail-paused")).toHaveAttribute("role", "status");
  expect(screen.getByRole("status")).toHaveTextContent("Waiting for connection");
  expectNoFalseAbsence();
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
}
beforeEach(() => {
  clearGrowDataMeta();
  fixture.fetchTent.mockReset().mockResolvedValue(tent);
  onlineManager.setOnline(true);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  onlineManager.setOnline(true);
  clearGrowDataMeta();
});

describe("Tent Detail read honesty with the real query", () => {
  it("waits for the first paused read and reconnects to the exact tent", async () => {
    onlineManager.setOnline(false);
    const client = renderPage();
    expect(client.getQueryState(tentKey)).toMatchObject({
      status: "pending",
      fetchStatus: "paused",
    });
    expect(fixture.fetchTent).not.toHaveBeenCalled();
    expectWaiting();
    expect(screen.getByRole("link", { name: "Back to tents" })).toHaveAttribute("href", "/tents");
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByRole("heading", { name: tent.name })).toBeVisible();
    expect(fixture.fetchTent).toHaveBeenCalledExactlyOnceWith(tent.id);
    expectNoFalseAbsence();
  });
  it("keeps an online unresolved read loading until it resolves", async () => {
    const read = deferredTent();
    fixture.fetchTent.mockReturnValue(read.promise);
    renderPage();
    expect(screen.getByTestId("tent-detail-loading")).toHaveAttribute("aria-busy", "true");
    expectNoFalseAbsence();
    await act(async () => read.resolve(tent));
    expect(await screen.findByRole("heading", { name: tent.name })).toBeVisible();
  });
  it("shows empty copy only when the resumed read successfully returns no row", async () => {
    fixture.fetchTent.mockResolvedValue(null);
    onlineManager.setOnline(false);
    renderPage();
    expectWaiting();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByText("Tent not found")).toBeVisible();
    expect(screen.getByText("No real tents yet")).toBeVisible();
    expect(fixture.fetchTent).toHaveBeenCalledExactlyOnceWith(tent.id);
  });
  it("moves from waiting to loading while the resumed read remains unresolved", async () => {
    const read = deferredTent();
    fixture.fetchTent.mockReturnValue(read.promise);
    onlineManager.setOnline(false);
    renderPage();
    expectWaiting();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByTestId("tent-detail-loading")).toHaveAttribute("aria-busy", "true");
    expectNoFalseAbsence();
    await act(async () => read.resolve(tent));
    expect(await screen.findByRole("heading", { name: tent.name })).toBeVisible();
  });
  it("shows unavailable and same-target Retry after a failed first read without empty guidance", async () => {
    fixture.fetchTent
      .mockRejectedValueOnce(new Error("private read detail"))
      .mockResolvedValue(tent);
    renderPage();
    expect(await screen.findByText("Couldn't load this tent")).toBeVisible();
    expect(screen.getByTestId("tent-detail-error")).toHaveAttribute("role", "alert");
    expect(screen.getByText("Unavailable", { exact: true })).toBeVisible();
    expectNoFalseAbsence();
    expect(screen.queryByText("private read detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("tent-detail-error-retry"));
    expect(await screen.findByRole("heading", { name: tent.name })).toBeVisible();
    expect(fixture.fetchTent.mock.calls).toEqual([[tent.id], [tent.id]]);
  });
  it("shows a failed read with Retry after reconnect and retries the same tent", async () => {
    fixture.fetchTent
      .mockRejectedValueOnce(new Error("private read detail"))
      .mockResolvedValue(tent);
    onlineManager.setOnline(false);
    renderPage();
    expectWaiting();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByText("Couldn't load this tent")).toBeVisible();
    expect(screen.getByTestId("tent-detail-error")).toBeInTheDocument();
    expectNoFalseAbsence();
    expect(screen.queryByText("private read detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("tent-detail-error-retry"));
    expect(await screen.findByRole("heading", { name: tent.name })).toBeVisible();
    expect(fixture.fetchTent.mock.calls).toEqual([[tent.id], [tent.id]]);
  });
  it("keeps the existing error/Retry branch for failed cached refresh without claiming no tents exist", async () => {
    fixture.fetchTent.mockRejectedValue(new Error("refresh unavailable"));
    renderPage({ cached: tent });
    expect(await screen.findByText("Couldn't load this tent")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expectNoFalseAbsence();
  });
  it("keeps a previously resolved tent visible while its refresh is paused", async () => {
    onlineManager.setOnline(false);
    const client = renderPage({ cached: tent });
    await waitFor(() => expect(client.getQueryState(tentKey)?.fetchStatus).toBe("paused"));
    expect(screen.getByRole("heading", { name: tent.name })).toBeVisible();
    expectNoFalseAbsence();
    expect(fixture.fetchTent).not.toHaveBeenCalled();
  });
  it("does not borrow the prior tent when navigating offline to an unresolved target", async () => {
    const nextTent = { ...tent, id: "tent-2", name: "Other canopy" };
    fixture.fetchTent.mockImplementation(async (id) => (id === nextTent.id ? nextTent : tent));
    onlineManager.setOnline(false);
    renderPage({ cached: tent });
    expect(screen.getByRole("heading", { name: tent.name })).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "Other tent" }));
    expectWaiting();
    expect(screen.queryByRole("heading", { name: tent.name })).not.toBeInTheDocument();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByRole("heading", { name: nextTent.name })).toBeVisible();
    expect(fixture.fetchTent).toHaveBeenCalledWith(nextTent.id);
    expect(screen.queryByRole("heading", { name: tent.name })).not.toBeInTheDocument();
  });
  it("preserves the grow-scope guard after the resumed tent read completes", async () => {
    onlineManager.setOnline(false);
    renderPage({ path: "/tents/tent-1?growId=other-grow" });
    expectWaiting();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByText("Tent not found")).toBeVisible();
    expect(screen.queryByRole("heading", { name: tent.name })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to tents" })).toHaveAttribute("href", "/tents");
  });
});
