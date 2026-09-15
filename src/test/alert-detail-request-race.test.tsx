import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLayoutEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useLocation, useNavigate, useParams } from "@/lib/react-router-compat";
import type { AlertEventRow, AlertRow } from "@/lib/alerts";
import AlertDetail from "@/pages/AlertDetail";

const io = vi.hoisted(() => ({
  getAlert: vi.fn<(id: string) => Promise<AlertRow | null>>(),
  listEvents: vi.fn<(id: string) => Promise<AlertEventRow[]>>(),
  writes: vi.fn(),
  routeFrames: [] as Array<{
    path: string;
    title: string | null;
    error: string | null;
    notFound: boolean;
    statusControls: number;
  }>,
}));

// Exercise the production adapter over a real TanStack route tree, bypassing
// the Vitest-only MemoryRouter shim configured for legacy component tests.
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

function alertRow(id: string, title = `Title ${id}`): AlertRow {
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
    title,
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

function RouteControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <output data-testid="current-route">{location.pathname}</output>
      <button type="button" onClick={() => navigate("/alerts/alert-a")}>
        Navigate A
      </button>
      <button type="button" onClick={() => navigate("/alerts/alert-b")}>
        Navigate B
      </button>
    </>
  );
}

function DetailRoute() {
  const { alertId } = useParams<{ alertId: string }>();
  // Observe the committed route's first DOM frame before passive load effects
  // can clear the previous route's content. Reading the same route params as
  // AlertDetail keeps the observer aligned with the rendered detail child.
  useLayoutEffect(() => {
    io.routeFrames.push({
      path: `/alerts/${alertId}`,
      title: document.getElementById("alert-detail-title")?.textContent ?? null,
      error: document.querySelector('[role="alert"]')?.textContent ?? null,
      notFound: document.body.textContent?.includes("Alert not found.") ?? false,
      statusControls: document.querySelectorAll(
        '[data-testid="alert-detail-resolve"], [data-testid="alert-detail-dismiss"]',
      ).length,
    });
  }, [alertId]);
  return <AlertDetail />;
}

function renderDetail() {
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
    component: DetailRoute,
  });
  const router = createRouter({
    routeTree: root.addChildren([detail]),
    history: createMemoryHistory({ initialEntries: ["/alerts/alert-a"] }),
    defaultPendingMinMs: 0,
  });
  return render(<RouterProvider router={router} />);
}

async function navigateTo(id: "a" | "b", requestCount: number) {
  fireEvent.click(screen.getByRole("button", { name: `Navigate ${id.toUpperCase()}` }));
  await waitFor(() => expect(io.getAlert).toHaveBeenCalledTimes(requestCount));
  expect(io.getAlert).toHaveBeenLastCalledWith(`alert-${id}`);
}

async function beginAToB() {
  const a = deferred<AlertRow | null>();
  const b = deferred<AlertRow | null>();
  io.getAlert.mockImplementation((id) => (id === "alert-a" ? a.promise : b.promise));
  renderDetail();
  await waitFor(() => expect(io.getAlert).toHaveBeenCalledWith("alert-a"));
  await navigateTo("b", 2);
  return { a, b };
}

function expectCurrentAlert(id: string, title = `Title ${id}`) {
  expect(screen.getByTestId("current-route")).toHaveTextContent(`/alerts/${id}`);
  expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  expect(screen.getByText(`Persisted reason for ${id}`)).toBeInTheDocument();
  expect(screen.getByText(`History for ${id}`)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Resolve alert: ${title}` })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Dismiss alert: ${title}` })).toBeInTheDocument();
  expect(screen.queryByText("Alert not found.")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
}

type StaleOutcome = "success" | "not_found" | "error";
async function settleStaleRead(
  read: ReturnType<typeof deferred<AlertRow | null>>,
  outcome: StaleOutcome,
) {
  await act(async () => {
    if (outcome === "error") read.reject(new Error("Stale A read failed"));
    else read.resolve(outcome === "not_found" ? null : alertRow("alert-a"));
  });
}

beforeEach(() => {
  io.getAlert.mockReset();
  io.routeFrames.length = 0;
  io.listEvents.mockReset().mockImplementation(async (id) => [
    {
      id: `event-${id}`,
      user_id: "user-1",
      alert_id: id,
      grow_id: "grow-1",
      event_type: "created",
      previous_status: null,
      new_status: "open",
      created_at: "2026-09-14T10:00:00Z",
      note: `History for ${id}`,
    },
  ]);
  io.writes.mockReset().mockImplementation(() => {
    throw new Error("Mutations are forbidden in alert-detail request-race tests");
  });
});

afterEach(() => {
  // Only navigation and the read-only Retry control are clicked in this suite.
  expect(io.writes).not.toHaveBeenCalled();
});

describe("AlertDetail current-route request authority", () => {
  it.each(["success", "not_found", "error"] as const)(
    "hides previous A %s in B's first committed frame before its load effect",
    async (outcome) => {
      const b = deferred<AlertRow | null>();
      io.getAlert.mockImplementation((id) => {
        if (id === "alert-b") return b.promise;
        if (outcome === "error") return Promise.reject(new Error("Previous A read failed"));
        return Promise.resolve(outcome === "not_found" ? null : alertRow("alert-a"));
      });
      renderDetail();
      if (outcome === "success") {
        await screen.findByRole("heading", { name: "Title alert-a" });
      } else if (outcome === "not_found") {
        await screen.findByText("Alert not found.");
      } else {
        await screen.findByRole("alert");
      }

      await navigateTo("b", 2);

      expect(io.routeFrames.find((frame) => frame.path === "/alerts/alert-b")).toEqual({
        path: "/alerts/alert-b",
        title: null,
        error: null,
        notFound: false,
        statusControls: 0,
      });
      await act(async () => b.resolve(alertRow("alert-b")));
      expectCurrentAlert("alert-b");
    },
  );

  it.each(["success", "not_found", "error"] as const)(
    "ignores stale A %s after B succeeds, keeping B's status controls and history",
    async (outcome) => {
      const { a, b } = await beginAToB();
      await act(async () => b.resolve(alertRow("alert-b")));
      expectCurrentAlert("alert-b");

      await settleStaleRead(a, outcome);

      expectCurrentAlert("alert-b");
      expect(screen.queryByRole("heading", { name: "Title alert-a" })).not.toBeInTheDocument();
      expect(io.getAlert).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["success", "not_found", "error"] as const)(
    "keeps B loading when stale A settles as %s before B finishes",
    async (outcome) => {
      const { a, b } = await beginAToB();
      await settleStaleRead(a, outcome);

      expect(screen.getByTestId("current-route")).toHaveTextContent("/alerts/alert-b");
      expect(screen.getByText("Loading…")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Title alert-a" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^(Resolve|Dismiss) alert:/ })).toBeNull();
      expect(screen.queryByText("Alert not found.")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      await act(async () => b.resolve(alertRow("alert-b")));
      expectCurrentAlert("alert-b");
    },
  );

  it("keeps the newest A request authoritative through A → B → A navigation", async () => {
    const firstA = deferred<AlertRow | null>();
    const b = deferred<AlertRow | null>();
    const latestA = deferred<AlertRow | null>();
    let aReads = 0;
    io.getAlert.mockImplementation((id) => {
      if (id === "alert-b") return b.promise;
      aReads += 1;
      return aReads === 1 ? firstA.promise : latestA.promise;
    });
    renderDetail();
    await waitFor(() => expect(io.getAlert).toHaveBeenCalledTimes(1));
    await navigateTo("b", 2);
    await navigateTo("a", 3);

    await act(async () => latestA.resolve(alertRow("alert-a", "Newest A title")));
    expectCurrentAlert("alert-a", "Newest A title");
    await act(async () => firstA.resolve(alertRow("alert-a", "Obsolete A title")));
    expectCurrentAlert("alert-a", "Newest A title");
    await act(async () => b.resolve(alertRow("alert-b")));
    expectCurrentAlert("alert-a", "Newest A title");
    expect(io.getAlert).toHaveBeenCalledTimes(3);
  });

  it("retries only the current B route and recovers without a late A overwrite", async () => {
    const a = deferred<AlertRow | null>();
    const retryB = deferred<AlertRow | null>();
    let bReads = 0;
    io.getAlert.mockImplementation((id) => {
      if (id === "alert-a") return a.promise;
      bReads += 1;
      return bReads === 1 ? Promise.reject(new Error("Current B read failed")) : retryB.promise;
    });
    renderDetail();
    await waitFor(() => expect(io.getAlert).toHaveBeenCalledTimes(1));
    await navigateTo("b", 2);
    expect(await screen.findByRole("alert")).toHaveTextContent("Current B read failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading alert" }));
    await waitFor(() => expect(io.getAlert).toHaveBeenCalledTimes(3));
    expect(io.getAlert.mock.calls.map(([id]) => id)).toEqual(["alert-a", "alert-b", "alert-b"]);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    await act(async () => retryB.resolve(alertRow("alert-b")));
    expectCurrentAlert("alert-b");
    await settleStaleRead(a, "success");
    expectCurrentAlert("alert-b");
  });

  it("preserves a current-route error and read-only Retry control", async () => {
    io.getAlert.mockRejectedValue(new Error("Current A read failed"));
    renderDetail();

    expect(await screen.findByRole("alert")).toHaveTextContent("Current A read failed");
    expect(screen.getByRole("button", { name: "Retry loading alert" })).toBeInTheDocument();
    expect(screen.queryByText("Alert not found.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Resolve|Dismiss) alert:/ })).toBeNull();
    expect(io.getAlert).toHaveBeenCalledTimes(1);
  });

  it("preserves a current-route not-found response without status controls", async () => {
    io.getAlert.mockResolvedValue(null);
    renderDetail();

    expect(await screen.findByText("Alert not found.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Resolve|Dismiss) alert:/ })).toBeNull();
    expect(io.getAlert).toHaveBeenCalledTimes(1);
  });
});
