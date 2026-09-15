/**
 * Assigned-tent pending-actions — initial pending / fail / offline must not
 * collapse to a false empty Action Queue.
 *
 * Mirrors Soft F3/F4: never treat pending or error as empty success.
 * Read-only. No action_queue writes, approve/reject/execute, or device control.
 */
import { act, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

configure({ asyncUtilTimeout: 10_000 });

type ReadResult = { data: unknown; error: unknown };

const actionRead = vi.hoisted(() => ({
  result: { data: [] as unknown, error: null as unknown },
  pending: null as Promise<ReadResult> | null,
  queries: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  writes: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query = { table, filters: [] as Array<[string, unknown]> };
      actionRead.queries.push(query);
      const result = actionRead.pending ?? Promise.resolve(actionRead.result);
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          query.filters.push([column, value]);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        then: (resolve: (value: ReadResult) => unknown, reject?: (reason: unknown) => unknown) =>
          result.then(resolve, reject),
        insert: actionRead.writes,
        update: actionRead.writes,
        delete: actionRead.writes,
        upsert: actionRead.writes,
      };
      return chain;
    },
    rpc: actionRead.writes,
  },
}));

import PlantAssignedTentActionsPanel from "@/components/PlantAssignedTentActionsPanel";

const TENT_ID = "tent-assigned-1";
const GROW_ID = "grow-assigned-1";

const savedPendingAction = {
  id: "act-retry-1",
  grow_id: GROW_ID,
  tent_id: TENT_ID,
  plant_id: null,
  status: "pending_approval",
  source: "environment_alert",
  action_type: "advisory",
  target_metric: "humidity_pct",
  suggested_change: "Lower humidity target gradually.",
  reason: "Humidity is high",
  risk_level: "high",
  target_device: null,
  created_at: "2026-09-14T10:00:00Z",
};

beforeEach(() => {
  actionRead.result = { data: [], error: null };
  actionRead.pending = null;
  actionRead.queries.length = 0;
  actionRead.writes.mockReset().mockImplementation(() => {
    throw new Error("Assigned-tent pending-actions recovery must not write");
  });
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
  expect(actionRead.writes).not.toHaveBeenCalled();
});

function deferredRead() {
  let resolve!: (value: ReadResult) => void;
  const promise = new Promise<ReadResult>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderPanel(tentId: string | null = TENT_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PlantAssignedTentActionsPanel tentId={tentId} growId={GROW_ID} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

function expectEmptySuccessHidden() {
  expect(screen.queryByTestId("plant-assigned-tent-actions-empty")).not.toBeInTheDocument();
  expect(screen.queryByTestId("plant-assigned-tent-actions-list")).not.toBeInTheDocument();
}

function expectUnavailable() {
  expect(screen.getByTestId("plant-assigned-tent-actions-unavailable")).toHaveTextContent(
    "Pending actions are temporarily unavailable.",
  );
  expect(screen.getByRole("button", { name: "Retry pending actions" })).toBeEnabled();
  expectEmptySuccessHidden();
  expect(screen.queryByTestId("plant-assigned-tent-actions-loading")).not.toBeInTheDocument();
}

function expectScopedReads(count: number) {
  expect(actionRead.queries).toHaveLength(count);
  for (const query of actionRead.queries) {
    expect(query.table).toBe("action_queue");
    expect(query.filters).toContainEqual(["tent_id", TENT_ID]);
    expect(query.filters).toContainEqual(["status", "pending_approval"]);
  }
}

describe("assigned-tent pending-actions fail-closed read states", () => {
  it(
    "keeps Loading while the first pending-actions read has not settled",
    { timeout: 15_000 },
    async () => {
      const initialRead = deferredRead();
      actionRead.pending = initialRead.promise;
      renderPanel();

      expect(await screen.findByTestId("plant-assigned-tent-actions-loading")).toHaveTextContent(
        "Loading pending actions…",
      );
      expectEmptySuccessHidden();
      expect(
        screen.queryByRole("button", { name: "Retry pending actions" }),
      ).not.toBeInTheDocument();
      expect(actionRead.queries).toHaveLength(1);

      await act(async () => initialRead.resolve({ data: [], error: null }));
      expect(await screen.findByTestId("plant-assigned-tent-actions-empty")).toBeInTheDocument();
    },
  );

  it(
    "shows Unavailable and Retry after a failed pending-actions read",
    { timeout: 15_000 },
    async () => {
      actionRead.result = { data: null, error: new Error("action_queue read failed") };
      const queryClient = renderPanel();
      await waitFor(() => {
        expect(
          queryClient.getQueryState(["plant_assigned_tent_actions", TENT_ID, GROW_ID, 5])?.status,
        ).toBe("error");
      });

      const unavailable = screen.getByTestId("plant-assigned-tent-actions-unavailable");
      expect(unavailable).toHaveTextContent("Pending actions are temporarily unavailable.");
      expect(screen.getByRole("button", { name: "Retry pending actions" })).toBeEnabled();
      expectEmptySuccessHidden();
      expect(screen.queryByTestId("plant-assigned-tent-actions-loading")).not.toBeInTheDocument();
    },
  );

  it(
    "shows Unavailable and Retry on an initial offline pause instead of a false empty queue",
    { timeout: 15_000 },
    async () => {
      onlineManager.setOnline(false);
      const queryClient = renderPanel();
      await waitFor(() => {
        expect(
          queryClient.getQueryState(["plant_assigned_tent_actions", TENT_ID, GROW_ID, 5])
            ?.fetchStatus,
        ).toBe("paused");
      });

      expect(screen.getByTestId("plant-assigned-tent-actions-unavailable")).toHaveTextContent(
        "Pending actions are temporarily unavailable.",
      );
      expect(screen.getByRole("button", { name: "Retry pending actions" })).toBeInTheDocument();
      expectEmptySuccessHidden();
      expect(screen.queryByTestId("plant-assigned-tent-actions-loading")).not.toBeInTheDocument();
      expect(actionRead.queries).toHaveLength(0);
    },
  );

  it(
    "preserves a true empty success as the assigned-tent empty copy",
    { timeout: 15_000 },
    async () => {
      actionRead.result = { data: [], error: null };
      const queryClient = renderPanel();
      await waitFor(() => {
        expect(
          queryClient.getQueryState(["plant_assigned_tent_actions", TENT_ID, GROW_ID, 5])?.status,
        ).toBe("success");
      });

      expect(screen.getByTestId("plant-assigned-tent-actions-empty")).toHaveTextContent(
        "No pending actions for this assigned tent.",
      );
      expect(
        screen.queryByRole("button", { name: "Retry pending actions" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("plant-assigned-tent-actions-unavailable"),
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId("plant-assigned-tent-actions-loading")).not.toBeInTheDocument();
    },
  );

  it("keeps the no-tent copy without starting a read or exposing Retry", () => {
    renderPanel(null);
    expect(screen.getByTestId("plant-assigned-tent-actions-empty-no-tent")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry pending actions" })).not.toBeInTheDocument();
    expect(actionRead.queries).toHaveLength(0);
  });
});

describe("assigned-tent pending-actions malformed payloads", () => {
  it.each([
    { label: "successful null payload", result: { data: null, error: null } },
    { label: "non-array object payload", result: { data: { id: "not-an-array" }, error: null } },
  ])("shows Unavailable after a $label", async ({ result }) => {
    actionRead.result = result;
    const queryClient = renderPanel();
    await waitFor(() => {
      expect(
        queryClient.getQueryState(["plant_assigned_tent_actions", TENT_ID, GROW_ID, 5])?.status,
      ).toBe("error");
    });

    expectUnavailable();
    expectScopedReads(1);
  });
});

describe("assigned-tent pending-actions error recovery", () => {
  it.each([
    { initial: "null", initialResult: { data: null, error: null }, recovered: "empty" },
    { initial: "null", initialResult: { data: null, error: null }, recovered: "populated" },
    {
      initial: "error",
      initialResult: { data: null, error: new Error("Read failed") },
      recovered: "empty",
    },
    {
      initial: "error",
      initialResult: { data: null, error: new Error("Read failed") },
      recovered: "populated",
    },
  ])(
    "retries $initial into $recovered pending actions without writes or concurrent retries",
    async ({ initialResult, recovered }) => {
      actionRead.result = initialResult;
      renderPanel();
      await waitFor(expectUnavailable);
      expectScopedReads(1);

      const retryRead = deferredRead();
      actionRead.pending = retryRead.promise;
      const retry = screen.getByRole("button", { name: "Retry pending actions" });
      fireEvent.click(retry);
      await waitFor(() => {
        expectScopedReads(2);
        const pendingRetry = screen.queryByRole("button", { name: "Retry pending actions" });
        if (pendingRetry) expect(pendingRetry).toBeDisabled();
        else expect(screen.getByTestId("plant-assigned-tent-actions-loading")).toBeInTheDocument();
      });
      fireEvent.click(retry);
      fireEvent.click(retry);
      expectScopedReads(2);
      expectEmptySuccessHidden();

      await act(async () =>
        retryRead.resolve({
          data: recovered === "empty" ? [] : [savedPendingAction],
          error: null,
        }),
      );
      if (recovered === "empty") {
        expect(await screen.findByTestId("plant-assigned-tent-actions-empty")).toHaveTextContent(
          "No pending actions for this assigned tent.",
        );
      } else {
        expect(await screen.findByText("Lower humidity target gradually.")).toBeInTheDocument();
        expect(screen.getAllByTestId("plant-assigned-tent-action-row")).toHaveLength(1);
        expect(screen.queryByTestId("plant-assigned-tent-actions-empty")).not.toBeInTheDocument();
      }
      expect(
        screen.queryByRole("button", { name: "Retry pending actions" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("plant-assigned-tent-actions-unavailable"),
      ).not.toBeInTheDocument();
      expectScopedReads(2);
    },
  );

  it("keeps a failed retry unavailable and offers another explicit retry", async () => {
    actionRead.result = { data: null, error: null };
    renderPanel();
    await waitFor(expectUnavailable);
    actionRead.result = { data: null, error: new Error("Retry also failed") };
    fireEvent.click(screen.getByRole("button", { name: "Retry pending actions" }));

    await waitFor(() => {
      expectScopedReads(2);
      expectUnavailable();
    });
  });

  it.each(["empty", "populated"] as const)(
    "hides cached %s pending actions after a background refetch error",
    async (cached) => {
      actionRead.result = { data: cached === "empty" ? [] : [savedPendingAction], error: null };
      const queryClient = renderPanel();
      if (cached === "empty") {
        await screen.findByTestId("plant-assigned-tent-actions-empty");
      } else {
        await screen.findByText("Lower humidity target gradually.");
      }
      const retainedData = queryClient.getQueryData([
        "plant_assigned_tent_actions",
        TENT_ID,
        GROW_ID,
        5,
      ]);
      actionRead.result = { data: null, error: new Error("Refresh failed") };

      await act(async () => {
        await queryClient.refetchQueries({
          queryKey: ["plant_assigned_tent_actions", TENT_ID, GROW_ID, 5],
        });
      });
      await waitFor(expectUnavailable);
      expect(queryClient.getQueryData(["plant_assigned_tent_actions", TENT_ID, GROW_ID, 5])).toBe(
        retainedData,
      );
      expect(screen.queryByText("Lower humidity target gradually.")).not.toBeInTheDocument();
      expectScopedReads(2);
    },
  );
});
