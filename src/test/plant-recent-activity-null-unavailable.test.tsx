import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ReadResult = { data: unknown; error: unknown };

const activityRead = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  pending: null as Promise<ReadResult> | null,
  queries: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  writes: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query = { table, filters: [] as Array<[string, unknown]> };
      activityRead.queries.push(query);
      const result = activityRead.pending ?? Promise.resolve(activityRead.result);
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          query.filters.push([column, value]);
          return chain;
        },
        is: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: (value: ReadResult) => unknown, reject?: (reason: unknown) => unknown) =>
          result.then(resolve, reject),
        insert: activityRead.writes,
        update: activityRead.writes,
        delete: activityRead.writes,
        upsert: activityRead.writes,
      };
      return chain;
    },
    rpc: activityRead.writes,
  },
}));
vi.mock("@/lib/quick-log/retractionFilterCompat", () => ({
  selectWithRetractionCompat: vi.fn(
    (build: (withRetractionFilter: boolean) => PromiseLike<ReadResult>) => build(true),
  ),
}));

import PlantDetailWhatsMissing from "@/components/PlantDetailWhatsMissing";
import PlantRecentActivityPanel from "@/components/PlantRecentActivityPanel";
import { fetchPlantRecentActivityRows } from "@/hooks/usePlantRecentActivity";

beforeEach(() => {
  activityRead.result = { data: null, error: null };
  activityRead.pending = null;
  activityRead.queries.length = 0;
  activityRead.writes.mockReset().mockImplementation(() => {
    throw new Error("Activity recovery must not write");
  });
});

afterEach(() => {
  expect(activityRead.writes).not.toHaveBeenCalled();
});

function renderGuidance() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PlantDetailWhatsMissing plantId="plant-1" growId="grow-1" stage="veg" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("plant recent activity null response", () => {
  it("treats a successful null payload as unavailable at the guidance boundary", async () => {
    renderGuidance();

    await waitFor(() => {
      expect(screen.getByTestId("plant-detail-whats-missing-unavailable")).toBeInTheDocument();
    });
    expect(screen.queryByText("No timeline entries yet")).not.toBeInTheDocument();
    await expect(fetchPlantRecentActivityRows("plant-1")).rejects.toThrow(/unavailable/i);
  });

  it("preserves a true empty array as successful empty history", async () => {
    activityRead.result = { data: [], error: null };
    await expect(fetchPlantRecentActivityRows("plant-1")).resolves.toEqual([]);

    renderGuidance();

    await waitFor(() => {
      expect(screen.getByText("No timeline entries yet")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("plant-detail-whats-missing-unavailable")).not.toBeInTheDocument();
  });

  it("treats a returned read error as unavailable at the guidance boundary", async () => {
    activityRead.result = { data: null, error: new Error("Activity read failed") };
    renderGuidance();

    await screen.findByTestId("plant-detail-whats-missing-unavailable");
    expect(screen.queryByText("No timeline entries yet")).not.toBeInTheDocument();
  });
});

describe("Recent Plant Activity error recovery", () => {
  const savedRow = {
    id: "saved-entry-1",
    plant_id: "plant-1",
    tent_id: null,
    event_type: "quick_log",
    note: "Previously saved activity",
    entry_at: "2026-09-14T10:00:00Z",
    details: { event_type: "watering", watering_amount_ml: 500 },
  };

  function deferredRead() {
    let resolve!: (value: ReadResult) => void;
    const promise = new Promise<ReadResult>((resolvePromise) => {
      resolve = resolvePromise;
    });
    return { promise, resolve };
  }

  function renderActivity(plantId: string | null = "plant-1") {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PlantRecentActivityPanel plantId={plantId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return queryClient;
  }

  function expectUnavailable() {
    expect(screen.getByText("Recent plant activity is unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry recent activity" })).toBeEnabled();
    expect(screen.queryByText("No activity logged for this plant yet.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("plant-recent-activity-list")).not.toBeInTheDocument();
  }

  function expectScopedReads(count: number) {
    expect(activityRead.queries).toHaveLength(count);
    for (const query of activityRead.queries) {
      expect(query.table).toBe("diary_entries");
      expect(query.filters).toContainEqual(["plant_id", "plant-1"]);
    }
  }

  it.each([
    { label: "successful null payload", result: { data: null, error: null } },
    { label: "returned read error", result: { data: null, error: new Error("Read unavailable") } },
  ])("shows unavailable and Retry after a $label", async ({ result }) => {
    activityRead.result = result;
    const queryClient = renderActivity();
    await waitFor(() => {
      expect(queryClient.getQueryState(["plant_recent_activity", "plant-1"])?.status).toBe("error");
    });

    expect(screen.queryByText("No activity logged for this plant yet.")).not.toBeInTheDocument();
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("preserves a successful empty array in the actual activity panel", async () => {
    activityRead.result = { data: [], error: null };
    const queryClient = renderActivity();
    await waitFor(() => {
      expect(queryClient.getQueryState(["plant_recent_activity", "plant-1"])?.status).toBe(
        "success",
      );
    });
    expect(screen.getByText("No activity logged for this plant yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

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
    "retries $initial into $recovered history without writes or concurrent retries",
    async ({ initialResult, recovered }) => {
      activityRead.result = initialResult;
      renderActivity();
      await waitFor(expectUnavailable);
      expectScopedReads(1);

      const retryRead = deferredRead();
      activityRead.pending = retryRead.promise;
      const retry = screen.getByRole("button", { name: "Retry recent activity" });
      fireEvent.click(retry);
      await waitFor(() => {
        expectScopedReads(2);
        const pendingRetry = screen.queryByRole("button", { name: "Retry recent activity" });
        if (pendingRetry) expect(pendingRetry).toBeDisabled();
        else expect(screen.getByText("Loading recent activity…")).toBeInTheDocument();
      });
      fireEvent.click(retry);
      fireEvent.click(retry);
      expectScopedReads(2);
      expect(screen.queryByText("No activity logged for this plant yet.")).not.toBeInTheDocument();

      await act(async () =>
        retryRead.resolve({ data: recovered === "empty" ? [] : [savedRow], error: null }),
      );
      if (recovered === "empty") {
        expect(
          await screen.findByText("No activity logged for this plant yet."),
        ).toBeInTheDocument();
      } else {
        expect(await screen.findByText("Previously saved activity")).toBeInTheDocument();
        expect(screen.getAllByTestId("plant-recent-activity-row")).toHaveLength(1);
        expect(
          screen.queryByText("No activity logged for this plant yet."),
        ).not.toBeInTheDocument();
      }
      expect(
        screen.queryByRole("button", { name: "Retry recent activity" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Recent plant activity is unavailable.")).not.toBeInTheDocument();
      expectScopedReads(2);
    },
  );

  it("keeps a failed retry unavailable and offers another explicit retry", async () => {
    renderActivity();
    await waitFor(expectUnavailable);
    activityRead.result = { data: null, error: new Error("Retry also failed") };
    fireEvent.click(screen.getByRole("button", { name: "Retry recent activity" }));

    await waitFor(() => {
      expectScopedReads(2);
      expectUnavailable();
    });
  });

  it.each(["empty", "populated"] as const)(
    "hides cached %s history after a background refetch error",
    async (cached) => {
      activityRead.result = { data: cached === "empty" ? [] : [savedRow], error: null };
      const queryClient = renderActivity();
      if (cached === "empty") {
        await screen.findByText("No activity logged for this plant yet.");
      } else {
        await screen.findByText("Previously saved activity");
      }
      const retainedData = queryClient.getQueryData(["plant_recent_activity", "plant-1"]);
      activityRead.result = { data: null, error: new Error("Refresh failed") };

      await act(async () => {
        await queryClient.refetchQueries({ queryKey: ["plant_recent_activity", "plant-1"] });
      });
      await waitFor(expectUnavailable);
      // React Query retains successful data; the failed read must take
      // precedence over that cached result in the presenter.
      expect(queryClient.getQueryData(["plant_recent_activity", "plant-1"])).toBe(retainedData);
      expect(screen.queryByText("Previously saved activity")).not.toBeInTheDocument();
      expectScopedReads(2);
    },
  );

  it("keeps initial loading until the first activity read settles", async () => {
    const initialRead = deferredRead();
    activityRead.pending = initialRead.promise;
    renderActivity();

    expect(await screen.findByText("Loading recent activity…")).toBeInTheDocument();
    expect(screen.queryByText("No activity logged for this plant yet.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry recent activity" })).not.toBeInTheDocument();
    expectScopedReads(1);
    await act(async () => initialRead.resolve({ data: [], error: null }));
    expect(await screen.findByText("No activity logged for this plant yet.")).toBeInTheDocument();
  });

  it("keeps no-plant messaging without starting a read or exposing Retry", () => {
    renderActivity(null);

    expect(screen.getByText("No plant selected.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry recent activity" })).not.toBeInTheDocument();
    expectScopedReads(0);
  });
});
