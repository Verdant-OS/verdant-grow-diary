/**
 * The Timeline header's scoped stage read: owner- and grow-scoped, and a
 * scope's result never reappears while its fresh read is pending.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  data: Array<Record<string, unknown>>;
  error: null | { message: string };
};

const supabaseState = vi.hoisted(() => ({
  queries: new Map<string, Promise<QueryResult>>(),
  calls: [] as Array<{ table: string; columns: string; filters: Record<string, string> }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => {
        const filters: Record<string, string> = {};
        const builder = {
          eq(column: string, value: string) {
            filters[column] = value;
            return builder;
          },
          then(
            onFulfilled: (value: QueryResult) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) {
            supabaseState.calls.push({ table, columns, filters: { ...filters } });
            const pending =
              supabaseState.queries.get(`${table}:${filters.id}`) ??
              Promise.resolve({ data: [], error: null });
            return pending.then(onFulfilled, onRejected);
          },
        };
        return builder;
      },
    }),
  },
}));

import { useTimelineHeaderStageFacts } from "@/hooks/useTimelineHeaderStageFacts";

function deferredQuery() {
  let resolve!: (value: QueryResult) => void;
  const promise = new Promise<QueryResult>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const USER = "owner-1";
const GROW_A = "grow-a";
const GROW_B = "grow-b";

type Props = {
  userId: string | null;
  growId: string | null;
  plantId: string | null;
  tentId: string | null;
};

function renderFacts(initialProps: Props) {
  return renderHook(
    ({ userId, growId, plantId, tentId }: Props) =>
      useTimelineHeaderStageFacts(userId, growId, plantId, tentId),
    { initialProps },
  );
}

describe("useTimelineHeaderStageFacts", () => {
  beforeEach(() => {
    supabaseState.queries.clear();
    supabaseState.calls.length = 0;
  });

  it("reads nothing while unscoped or before grow ownership is proven", async () => {
    const { result, rerender } = renderFacts({
      userId: USER,
      growId: GROW_A,
      plantId: null,
      tentId: null,
    });
    rerender({ userId: USER, growId: null, plantId: "plant-a", tentId: "tent-a" });
    await act(async () => {});
    expect(result.current).toEqual({ plant: null, tent: null });
    expect(supabaseState.calls).toHaveLength(0);
  });

  it("returns the owner's plant and tent stage in the active grow", async () => {
    supabaseState.queries.set(
      "plants:plant-a",
      Promise.resolve({
        data: [{ stage: "flower", started_at: "2026-10-01", grow_id: GROW_A, tent_id: "tent-a" }],
        error: null,
      }),
    );
    supabaseState.queries.set(
      "tents:tent-a",
      Promise.resolve({ data: [{ stage: "veg", grow_id: GROW_A }], error: null }),
    );
    const { result } = renderFacts({
      userId: USER,
      growId: GROW_A,
      plantId: "plant-a",
      tentId: "tent-a",
    });
    await waitFor(() =>
      expect(result.current).toEqual({
        plant: { stage: "flower", started_at: "2026-10-01" },
        tent: { stage: "veg" },
      }),
    );
    expect(supabaseState.calls).toContainEqual({
      table: "plants",
      columns: "stage,started_at,grow_id,tent_id",
      filters: { id: "plant-a", user_id: USER },
    });
    expect(supabaseState.calls).toContainEqual({
      table: "tents",
      columns: "stage,grow_id",
      filters: { id: "tent-a", user_id: USER },
    });
  });

  it("ignores another grow's plant and tent", async () => {
    supabaseState.queries.set(
      "plants:plant-b",
      Promise.resolve({
        data: [{ stage: "flower", started_at: "2026-10-01", grow_id: GROW_B, tent_id: "tent-b" }],
        error: null,
      }),
    );
    supabaseState.queries.set(
      "tents:tent-b",
      Promise.resolve({ data: [{ stage: "flower", grow_id: GROW_B }], error: null }),
    );
    const { result } = renderFacts({
      userId: USER,
      growId: GROW_A,
      plantId: "plant-b",
      tentId: "tent-b",
    });
    await waitFor(() =>
      expect(supabaseState.calls.filter((call) => call.table === "tents")).toHaveLength(1),
    );
    await act(async () => {});
    expect(result.current).toEqual({ plant: null, tent: null });
  });

  it("accepts a legacy null-grow plant through its tent in the active grow", async () => {
    supabaseState.queries.set(
      "plants:plant-legacy",
      Promise.resolve({
        data: [{ stage: "flower", started_at: null, grow_id: null, tent_id: "tent-a" }],
        error: null,
      }),
    );
    supabaseState.queries.set(
      "tents:tent-a",
      Promise.resolve({ data: [{ grow_id: GROW_A }], error: null }),
    );
    const { result } = renderFacts({
      userId: USER,
      growId: GROW_A,
      plantId: "plant-legacy",
      tentId: null,
    });
    await waitFor(() =>
      expect(result.current.plant).toEqual({ stage: "flower", started_at: null }),
    );
    expect(supabaseState.calls).toContainEqual({
      table: "tents",
      columns: "grow_id",
      filters: { id: "tent-a", user_id: USER },
    });
  });

  it("does not show a scope's old facts again while its fresh read is pending", async () => {
    supabaseState.queries.set(
      "plants:plant-a",
      Promise.resolve({
        data: [{ stage: "flower", started_at: "2026-10-01", grow_id: GROW_A, tent_id: null }],
        error: null,
      }),
    );
    const { result, rerender } = renderFacts({
      userId: USER,
      growId: GROW_A,
      plantId: "plant-a",
      tentId: null,
    });
    await waitFor(() => expect(result.current.plant?.stage).toBe("flower"));

    const plantB = deferredQuery();
    supabaseState.queries.set("plants:plant-b", plantB.promise);
    rerender({ userId: USER, growId: GROW_A, plantId: "plant-b", tentId: null });
    expect(result.current).toEqual({ plant: null, tent: null });

    const plantAAgain = deferredQuery();
    supabaseState.queries.set("plants:plant-a", plantAAgain.promise);
    rerender({ userId: USER, growId: GROW_A, plantId: "plant-a", tentId: null });
    await act(async () => {});
    expect(result.current).toEqual({ plant: null, tent: null });

    await act(async () => {
      plantB.resolve({
        data: [{ stage: "veg", started_at: null, grow_id: GROW_A, tent_id: null }],
        error: null,
      });
    });
    expect(result.current).toEqual({ plant: null, tent: null });

    await act(async () => {
      plantAAgain.resolve({
        data: [{ stage: "harvest", started_at: null, grow_id: GROW_A, tent_id: null }],
        error: null,
      });
    });
    await waitFor(() => expect(result.current.plant?.stage).toBe("harvest"));
  });
});
