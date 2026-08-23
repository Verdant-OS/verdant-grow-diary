import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = {
  data: Array<Record<string, unknown>>;
  error: null | { message: string };
};

const supabaseState = vi.hoisted(() => ({
  queries: new Map<string, Promise<QueryResult>>(),
  calls: [] as Array<{ table: string; columns: string; column: string; value: string }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => {
          supabaseState.calls.push({ table, columns, column, value });
          return (
            supabaseState.queries.get(`${table}:${value}`) ??
            Promise.resolve({ data: [], error: null })
          );
        },
      }),
    }),
  },
}));

import { useTimelineNameDirectory } from "@/hooks/useTimelineNameDirectory";

function deferredQuery() {
  let resolve!: (value: QueryResult) => void;
  const promise = new Promise<QueryResult>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("useTimelineNameDirectory", () => {
  const PLANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const PLANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const TENT_A = "11111111-1111-4111-8111-111111111111";
  const TENT_B = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    supabaseState.queries.clear();
    supabaseState.calls.length = 0;
  });

  it("loads tent relationships in the owner-scoped plant read and never leaks the prior owner", async () => {
    supabaseState.queries.set(
      "plants:user-a",
      Promise.resolve({
        data: [{ id: PLANT_A, name: "Alpha", tent_id: TENT_A }],
        error: null,
      }),
    );
    supabaseState.queries.set(
      "tents:user-a",
      Promise.resolve({ data: [{ id: TENT_A, name: "Tent A" }], error: null }),
    );

    const plantB = deferredQuery();
    const tentB = deferredQuery();
    supabaseState.queries.set("plants:user-b", plantB.promise);
    supabaseState.queries.set("tents:user-b", tentB.promise);

    const { result, rerender } = renderHook(
      ({ userId }: { userId: string | null }) => useTimelineNameDirectory(userId),
      { initialProps: { userId: "user-a" } },
    );

    await waitFor(() => expect(result.current.plantNamesById?.get(PLANT_A)).toBe("Alpha"));
    expect(result.current.plantTentIdsById?.get(PLANT_A)).toBe(TENT_A);
    expect(supabaseState.calls).toContainEqual({
      table: "plants",
      columns: "id,name,tent_id",
      column: "user_id",
      value: "user-a",
    });

    rerender({ userId: "user-b" });

    // The new read is unresolved. Prior-owner names and relationships must be
    // unavailable synchronously, before the replacement promises settle.
    expect(result.current).toEqual({
      plantNamesById: null,
      plantTentIdsById: null,
      tentNamesById: null,
    });

    await act(async () => {
      plantB.resolve({ data: [{ id: PLANT_B, name: "Beta", tent_id: TENT_B }], error: null });
      tentB.resolve({ data: [{ id: TENT_B, name: "Tent B" }], error: null });
      await Promise.all([plantB.promise, tentB.promise]);
    });

    await waitFor(() => expect(result.current.plantNamesById?.get(PLANT_B)).toBe("Beta"));
    expect(result.current.plantNamesById?.has(PLANT_A)).toBe(false);
    expect(result.current.plantTentIdsById?.get(PLANT_B)).toBe(TENT_B);
    expect(result.current.plantTentIdsById?.has(PLANT_A)).toBe(false);
  });

  it("keeps the relationship directory unavailable when the owner tent read fails", async () => {
    supabaseState.queries.set(
      "plants:user-c",
      Promise.resolve({
        data: [{ id: PLANT_A, name: "Alpha", tent_id: TENT_A }],
        error: null,
      }),
    );
    supabaseState.queries.set(
      "tents:user-c",
      Promise.resolve({ data: [], error: { message: "tent read failed" } }),
    );

    const { result } = renderHook(() => useTimelineNameDirectory("user-c"));

    await waitFor(() => expect(result.current.plantNamesById?.get(PLANT_A)).toBe("Alpha"));
    expect(result.current.plantTentIdsById).toBeNull();
    expect(result.current.tentNamesById).toBeNull();
  });
});
