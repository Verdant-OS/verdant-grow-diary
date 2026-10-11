import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useLocation, useNavigate } from "@/lib/react-router-compat";
import type { AlertEventRow, AlertRow } from "@/lib/alerts";
import AlertDetail from "@/pages/AlertDetail";

const io = vi.hoisted(() => ({
  getAlert: vi.fn<(id: string) => Promise<AlertRow | null>>(),
  listEvents: vi.fn<(id: string) => Promise<AlertEventRow[]>>(),
  writes: vi.fn(),
}));

// Use the production adapter and a real route tree. The history hook itself
// remains real; only its I/O and unrelated page dependencies are mocked.
vi.mock("@/lib/react-router-compat", async () => await import("../lib/react-router-compat"));
vi.mock("@/lib/alerts", () => ({
  getAlertById: io.getAlert,
  listAlertEvents: io.listEvents,
  acknowledgeAlert: io.writes,
  dismissAlert: io.writes,
  logAlertEvent: io.writes,
  reopenAlert: io.writes,
  resolveAlert: io.writes,
}));
vi.mock("@/lib/actionQueueCreateService", () => ({ createActionQueueItem: io.writes }));
vi.mock("@/hooks/useAlertTargetNames", () => ({
  useAlertTargetNames: () => ({
    status: "ok",
    tentNameById: new Map(),
    plantNameById: new Map(),
    singleTentIdByGrowId: new Map(),
  }),
}));
vi.mock("@/hooks/useAlertLinkedTargetEvidence", () => ({
  useAlertLinkedTargetEvidence: () => ({
    status: "ok",
    evidenceByAlertId: new Map(),
    idsLoading: false,
  }),
}));
vi.mock("@/hooks/useAlertsLinkedActionCounts", () => ({
  useAlertsLinkedActionCounts: () => new Map(),
}));
vi.mock("@/integrations/supabase/client", () => {
  const makeChain = () => {
    const result = { data: [], error: null };
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      like: () => chain,
      contains: () => chain,
      order: () => chain,
      limit: () => Promise.resolve(result),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
      insert: io.writes,
      update: io.writes,
      delete: io.writes,
      upsert: io.writes,
    };
    return chain;
  };
  return { supabase: { from: () => makeChain(), rpc: io.writes } };
});
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/store/grows", () => ({
  useGrows: () => ({
    grows: [{ id: "grow-1", name: "Grow One" }],
    activeGrowId: "grow-1",
    activeGrow: { id: "grow-1", name: "Grow One" },
  }),
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function alertRow(id: string): AlertRow {
  return {
    id,
    user_id: "user-1",
    grow_id: "grow-1",
    tent_id: null,
    plant_id: null,
    source: "environment_alerts",
    severity: "warning",
    status: "open",
    metric: "vpd",
    title: `Title ${id}`,
    reason: `Persisted reason for ${id}`,
    first_seen_at: "2026-09-14T10:00:00Z",
    last_seen_at: "2026-09-14T10:00:00Z",
    created_at: "2026-09-14T10:00:00Z",
    updated_at: "2026-09-14T10:00:00Z",
    acknowledged_at: null,
    resolved_at: null,
    originating_timeline_events: [],
  };
}

function historyRows(id: string): AlertEventRow[] {
  return ["Latest", "Earlier"].map((label, index) => ({
    id: `${id}-event-${index}`,
    user_id: "user-1",
    alert_id: id,
    grow_id: "grow-1",
    event_type: "created",
    previous_status: null,
    new_status: "open",
    created_at: `2026-09-14T${index === 0 ? "10" : "09"}:00:00Z`,
    note: `${label} history for ${id}`,
  }));
}

function RouteControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <output data-testid="current-route">{location.pathname}</output>
      <button type="button" onClick={() => navigate("/alerts/alert-b")}>
        Navigate B
      </button>
    </>
  );
}

async function renderDetail() {
  const root = createRootRoute({
    component: () => (
      <>
        <RouteControls />
        <Outlet />
      </>
    ),
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/alerts/$alertId",
    component: AlertDetail,
  });
  const router = createRouter({
    routeTree: root.addChildren([detail]),
    history: createMemoryHistory({ initialEntries: ["/alerts/alert-a"] }),
    defaultPendingMinMs: 0,
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Title alert-a" });
  await waitFor(() => expect(io.listEvents).toHaveBeenCalledWith("alert-a"));
}

function historyRegion() {
  return within(screen.getByRole("region", { name: "Alert history" }));
}

function expectNoHistoryResult() {
  const history = historyRegion();
  expect(history.getByRole("heading", { name: /^History/ })).not.toHaveTextContent(/\d/);
  expect(history.queryByText("No events yet.")).not.toBeInTheDocument();
  expect(history.queryAllByRole("listitem")).toHaveLength(0);
}

function expectLoadingHistory() {
  expectNoHistoryResult();
  expect(historyRegion().getByText("Loading history…")).toBeInTheDocument();
}

function expectUnavailableHistory() {
  expectNoHistoryResult();
  expect(historyRegion().getByText(/Alert history unavailable/i)).toBeInTheDocument();
  expect(
    historyRegion().getByRole("button", { name: "Retry loading alert history" }),
  ).toBeEnabled();
}

function expectAlertIntact(id = "alert-a") {
  expect(screen.getByRole("heading", { name: `Title ${id}` })).toBeInTheDocument();
  expect(screen.getByText(`Persisted reason for ${id}`)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Resolve alert: Title ${id}` })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Dismiss alert: Title ${id}` })).toBeInTheDocument();
}

async function beginHistoryRetry() {
  const retryRead = deferred<AlertEventRow[]>();
  io.listEvents
    .mockRejectedValueOnce(new Error("History transport failed"))
    .mockReturnValue(retryRead.promise);
  await renderDetail();
  await waitFor(expectUnavailableHistory);
  expectAlertIntact();
  expect(io.getAlert).toHaveBeenCalledTimes(1);
  const retry = historyRegion().getByRole("button", { name: "Retry loading alert history" });
  fireEvent.click(retry);
  await waitFor(() => expect(io.listEvents).toHaveBeenCalledTimes(2));
  expectLoadingHistory();

  const pendingRetry = historyRegion().queryByRole("button", {
    name: "Retry loading alert history",
  });
  if (pendingRetry) expect(pendingRetry).toBeDisabled();
  // The original node is now detached or disabled; repeated clicks cannot
  // enqueue another request while the retry is pending.
  fireEvent.click(retry);
  fireEvent.click(retry);
  expect(io.listEvents).toHaveBeenCalledTimes(2);
  expect(io.getAlert).toHaveBeenCalledTimes(1);
  expect(io.listEvents.mock.calls.map(([id]) => id)).toEqual(["alert-a", "alert-a"]);
  return retryRead;
}

beforeEach(() => {
  io.getAlert.mockReset().mockImplementation(async (id) => alertRow(id));
  io.listEvents.mockReset();
  io.writes.mockReset().mockImplementation(() => {
    throw new Error("Mutations are forbidden in alert-history read-state tests");
  });
});

afterEach(() => {
  expect(io.writes).not.toHaveBeenCalled();
});

describe("AlertDetail history read states", () => {
  it("shows loading without a zero count or empty-history claim while the read is pending", async () => {
    io.listEvents.mockReturnValue(deferred<AlertEventRow[]>().promise);
    await renderDetail();

    expectLoadingHistory();
    expectAlertIntact();
    expect(io.listEvents).toHaveBeenCalledTimes(1);
    expect(io.getAlert).toHaveBeenCalledTimes(1);
  });

  it("shows unavailable with history-only Retry after rejection, keeping the alert visible", async () => {
    const read = deferred<AlertEventRow[]>();
    io.listEvents.mockReturnValue(read.promise);
    await renderDetail();
    await act(async () => read.reject(new Error("History transport failed")));

    expectUnavailableHistory();
    expectAlertIntact();
    expect(screen.queryByRole("button", { name: "Retry loading alert" })).not.toBeInTheDocument();
    expect(io.getAlert).toHaveBeenCalledTimes(1);
  });

  it("retries only history, suppresses pending repeat clicks, and accepts successful empty history", async () => {
    const retryRead = await beginHistoryRetry();
    await act(async () => retryRead.resolve([]));

    const history = historyRegion();
    expect(history.getByRole("heading", { name: /^History/ })).toHaveTextContent(/^History\s*0$/);
    expect(history.getByText("No events yet.")).toBeInTheDocument();
    expect(history.queryByRole("button", { name: "Retry loading alert history" })).toBeNull();
    expectAlertIntact();
    expect(io.getAlert).toHaveBeenCalledTimes(1);
    expect(io.listEvents).toHaveBeenCalledTimes(2);
  });

  it("retries history into populated rows with the correct successful count", async () => {
    const retryRead = await beginHistoryRetry();
    await act(async () => retryRead.resolve(historyRows("alert-a")));

    const history = historyRegion();
    expect(history.getByRole("heading", { name: /^History/ })).toHaveTextContent(/^History\s*2$/);
    expect(history.getAllByRole("listitem")).toHaveLength(2);
    expect(history.getByText("Latest history for alert-a")).toBeInTheDocument();
    expect(history.getByText("Earlier history for alert-a")).toBeInTheDocument();
    expect(history.queryByText("No events yet.")).not.toBeInTheDocument();
    expectAlertIntact();
    expect(io.getAlert).toHaveBeenCalledTimes(1);
    expect(io.listEvents).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed retry unavailable without manufacturing a zero count", async () => {
    const retryRead = await beginHistoryRetry();
    await act(async () => retryRead.reject(new Error("History retry failed")));

    expectUnavailableHistory();
    expectAlertIntact();
    expect(io.getAlert).toHaveBeenCalledTimes(1);
    expect(io.listEvents).toHaveBeenCalledTimes(2);
  });

  it("preserves an initially successful empty history as zero events", async () => {
    io.listEvents.mockResolvedValue([]);
    await renderDetail();

    const history = historyRegion();
    expect(history.getByRole("heading", { name: /^History/ })).toHaveTextContent(/^History\s*0$/);
    expect(history.getByText("No events yet.")).toBeInTheDocument();
    expect(io.listEvents).toHaveBeenCalledTimes(1);
  });

  it("preserves initially successful populated history and its count", async () => {
    io.listEvents.mockResolvedValue(historyRows("alert-a"));
    await renderDetail();

    const history = historyRegion();
    expect(history.getByRole("heading", { name: /^History/ })).toHaveTextContent(/^History\s*2$/);
    expect(history.getAllByRole("listitem")).toHaveLength(2);
    expect(history.getByText("Latest history for alert-a")).toBeInTheDocument();
    expect(history.getByText("Earlier history for alert-a")).toBeInTheDocument();
    expect(io.listEvents).toHaveBeenCalledTimes(1);
  });

  it.each(["empty", "populated"] as const)(
    "hides A's previous rows and count while B history loads, then shows B's %s result",
    async (resultKind) => {
      const bHistory = deferred<AlertEventRow[]>();
      io.listEvents.mockImplementation((id) =>
        id === "alert-a" ? Promise.resolve(historyRows("alert-a")) : bHistory.promise,
      );
      await renderDetail();
      expect(historyRegion().getByText("Latest history for alert-a")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Navigate B" }));
      await screen.findByRole("heading", { name: "Title alert-b" });
      await waitFor(() => expect(io.listEvents).toHaveBeenCalledWith("alert-b"));
      expect(screen.getByTestId("current-route")).toHaveTextContent("/alerts/alert-b");
      expectLoadingHistory();
      expect(historyRegion().queryByText("Latest history for alert-a")).not.toBeInTheDocument();
      expect(historyRegion().queryByText("Earlier history for alert-a")).not.toBeInTheDocument();
      expectAlertIntact("alert-b");

      await act(async () => bHistory.resolve(resultKind === "empty" ? [] : historyRows("alert-b")));
      const history = historyRegion();
      if (resultKind === "empty") {
        expect(history.getByRole("heading", { name: /^History/ })).toHaveTextContent(
          /^History\s*0$/,
        );
        expect(history.getByText("No events yet.")).toBeInTheDocument();
      } else {
        expect(history.getByRole("heading", { name: /^History/ })).toHaveTextContent(
          /^History\s*2$/,
        );
        expect(history.getByText("Latest history for alert-b")).toBeInTheDocument();
        expect(history.getByText("Earlier history for alert-b")).toBeInTheDocument();
      }
      expect(history.queryByText("Latest history for alert-a")).not.toBeInTheDocument();
      expect(io.getAlert).toHaveBeenCalledTimes(2);
      expect(io.listEvents.mock.calls.map(([id]) => id)).toEqual(["alert-a", "alert-b"]);
    },
  );
});
