import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  operations: [] as Array<{ name: string; args: unknown[] }>,
  response: { data: [] as unknown[], error: null as unknown },
  queryOptions: null as Record<string, unknown> | null,
  abortSignals: [] as AbortSignal[],
  queryResult: {
    data: undefined as unknown,
    isLoading: true,
    isError: false,
    error: null as unknown,
  },
}));

function record(name: string, ...args: unknown[]) {
  H.operations.push({ name, args });
}

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    H.queryOptions = options;
    return H.queryResult;
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      record("from", table);
      const query: Record<string, unknown> = {};
      for (const name of ["select", "in", "not", "eq", "is", "lte", "order", "range"] as const) {
        query[name] = (...args: unknown[]) => {
          record(name, ...args);
          return query;
        };
      }
      query.abortSignal = (signal: AbortSignal) => {
        H.abortSignals.push(signal);
        return query;
      };
      query.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(H.response).then(resolve);
      return query;
    },
  },
}));

import {
  fetchTentManualSnapshotBatchPage,
  tentManualSnapshotBatchQueryKey,
  useTentManualSnapshotBatch,
} from "@/hooks/useManualSnapshotTimelineCards";
import type { TentManualSnapshotBatchData } from "@/lib/tentManualSnapshotBatchRules";

const OWNER_ID = "owner-123";
const TENT_A = "00000000-0000-4000-8000-000000000001";
const TENT_B = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  H.operations = [];
  H.response = { data: [], error: null };
  H.queryOptions = null;
  H.abortSignals = [];
  H.queryResult = { data: undefined, isLoading: true, isError: false, error: null };
});

describe("tent manual snapshot batch query", () => {
  it("applies owner-keyed sorted ids, server JSON predicates, stable order, and range", async () => {
    await fetchTentManualSnapshotBatchPage({
      chunkIndex: 0,
      pageIndex: 0,
      tentIds: [TENT_A, TENT_B],
      from: 0,
      to: 199,
      upperBoundEntryAt: null,
      expectedBoundaryRowId: null,
    });

    expect(H.operations).toEqual([
      { name: "from", args: ["diary_entries"] },
      { name: "select", args: ["id, plant_id, tent_id, entry_at, note, details"] },
      { name: "in", args: ["tent_id", [TENT_A, TENT_B]] },
      { name: "not", args: ["details->manual_sensor_snapshot", "is", null] },
      { name: "eq", args: ["details->manual_sensor_snapshot->>source", "manual"] },
      { name: "is", args: ["retracted_at", null] },
      { name: "order", args: ["entry_at", { ascending: false }] },
      { name: "order", args: ["id", { ascending: true }] },
      { name: "range", args: [0, 199] },
    ]);
    expect(tentManualSnapshotBatchQueryKey(OWNER_ID, [TENT_B, TENT_A, TENT_B])).toEqual([
      "manual_snapshot_timeline_cards",
      "tents-batch",
      OWNER_ID,
      [TENT_A, TENT_B],
    ]);
  });

  it("pins later pages to the first-page timestamp before deterministic ordering", async () => {
    await fetchTentManualSnapshotBatchPage({
      chunkIndex: 0,
      pageIndex: 1,
      tentIds: [TENT_A],
      from: 199,
      to: 398,
      upperBoundEntryAt: "2026-08-20T12:00:00.000Z",
      expectedBoundaryRowId: "00000000-0000-4000-8000-000000000199",
    });

    const lteIndex = H.operations.findIndex((operation) => operation.name === "lte");
    const orderIndex = H.operations.findIndex((operation) => operation.name === "order");
    expect(H.operations[lteIndex]).toEqual({
      name: "lte",
      args: ["entry_at", "2026-08-20T12:00:00.000Z"],
    });
    expect(lteIndex).toBeLessThan(orderIndex);
    expect(H.operations.at(-1)).toEqual({ name: "range", args: [199, 398] });
  });

  it("forwards the owning React Query AbortSignal to the PostgREST builder", async () => {
    const controller = new AbortController();
    await fetchTentManualSnapshotBatchPage(
      {
        chunkIndex: 0,
        pageIndex: 0,
        tentIds: [TENT_A],
        from: 0,
        to: 199,
        upperBoundEntryAt: null,
        expectedBoundaryRowId: null,
      },
      controller.signal,
    );

    expect(H.abortSignals).toEqual([controller.signal]);
  });

  it("uses one disabled-retry owner-scoped query for the exact normalized tent set", () => {
    renderHook(() => useTentManualSnapshotBatch(OWNER_ID, [TENT_B, TENT_A, TENT_B]));

    expect(H.queryOptions).toMatchObject({
      enabled: true,
      retry: false,
      queryKey: ["manual_snapshot_timeline_cards", "tents-batch", OWNER_ID, [TENT_A, TENT_B]],
    });
  });

  it("passes the React Query context signal through the scanner to PostgREST", async () => {
    const controller = new AbortController();
    renderHook(() => useTentManualSnapshotBatch(OWNER_ID, [TENT_A]));

    const queryFn = H.queryOptions?.queryFn as
      ((context: { signal: AbortSignal }) => Promise<unknown>) | undefined;
    await queryFn?.({ signal: controller.signal });

    expect(H.abortSignals).toEqual([controller.signal]);
  });

  it("stays under the existing Quick Log/removal invalidation prefix", () => {
    expect(tentManualSnapshotBatchQueryKey(OWNER_ID, [TENT_A]).slice(0, 2)).toEqual([
      "manual_snapshot_timeline_cards",
      "tents-batch",
    ]);
  });

  it("keeps a cached card visible as refresh_error and does not call a provider retry", () => {
    const data: TentManualSnapshotBatchData = {
      byTent: {
        [TENT_A]: {
          kind: "found",
          card: {
            id: "manual-a",
            title: "Manual sensor snapshot",
            capturedAt: "2026-08-20T12:00:00.000Z",
            sourceLabel: "Manual",
            source: "manual",
            tentId: TENT_A,
            plantId: null,
            isTentLevel: true,
            notes: null,
            readings: [{ field: "air_temp_c", value: 22, unit: "°C", derived: false }],
            severity: "ok",
            warnings: [],
            errors: [],
          },
        },
      },
      pageRequests: 1,
    };
    H.queryResult = {
      data,
      isLoading: false,
      isError: true,
      error: new Error("refresh failed"),
    };

    const { result } = renderHook(() => useTentManualSnapshotBatch(OWNER_ID, [TENT_A]));

    expect(result.current.byTent[TENT_A]).toMatchObject({
      status: "refresh_error",
      cards: [{ id: "manual-a" }],
    });
    expect(H.queryOptions).toMatchObject({ retry: false });
  });

  it("never turns a capped or concurrency-ambiguous result into established empty", () => {
    H.queryResult = {
      data: {
        byTent: {
          [TENT_A]: { kind: "unavailable", reason: "cap_exhausted" },
          [TENT_B]: { kind: "unavailable", reason: "concurrency_ambiguous" },
        },
        pageRequests: 10,
      } satisfies TentManualSnapshotBatchData,
      isLoading: false,
      isError: false,
      error: null,
    };

    const { result } = renderHook(() => useTentManualSnapshotBatch(OWNER_ID, [TENT_A, TENT_B]));

    expect(result.current.byTent[TENT_A]).toEqual({
      cards: [],
      status: "error",
      unavailableReason: "cap_exhausted",
    });
    expect(result.current.byTent[TENT_B]).toEqual({
      cards: [],
      status: "error",
      unavailableReason: "concurrency_ambiguous",
    });
  });

  it("turns cached empty plus provider failure into unavailable, not empty", () => {
    H.queryResult = {
      data: {
        byTent: { [TENT_A]: { kind: "empty" } },
        pageRequests: 1,
      } satisfies TentManualSnapshotBatchData,
      isLoading: false,
      isError: true,
      error: new Error("refresh failed"),
    };

    const { result } = renderHook(() => useTentManualSnapshotBatch(OWNER_ID, [TENT_A]));

    expect(result.current.byTent[TENT_A]).toEqual({
      cards: [],
      status: "error",
      unavailableReason: null,
    });
  });

  it("throws provider failures from the query function so cached data is retained", async () => {
    H.response = { data: [], error: { code: "PGRST301", message: "provider unavailable" } };
    renderHook(() => useTentManualSnapshotBatch(OWNER_ID, [TENT_A]));

    const queryFn = H.queryOptions?.queryFn as
      ((context: { signal: AbortSignal }) => Promise<unknown>) | undefined;
    await expect(queryFn?.({ signal: new AbortController().signal })).rejects.toMatchObject({
      code: "PGRST301",
    });
  });
});
