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
  const GROW_A = "33333333-3333-4333-8333-333333333333";
  const GROW_B = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    supabaseState.queries.clear();
    supabaseState.calls.length = 0;
  });

  it("issues no reads without both an owner and a verified grow", () => {
    const initialProps: { userId: string | null; growId: string | null } = {
      userId: null,
      growId: GROW_A,
    };
    const { result, rerender } = renderHook(
      ({ userId, growId }: { userId: string | null; growId: string | null }) =>
        useTimelineNameDirectory(userId, growId),
      { initialProps },
    );

    expect(result.current).toEqual({
      plantNamesById: null,
      plantTentIdsById: null,
      tentNamesById: null,
    });
    expect(supabaseState.calls).toHaveLength(0);

    rerender({ userId: "user-a", growId: null });
    expect(result.current).toEqual({
      plantNamesById: null,
      plantTentIdsById: null,
      tentNamesById: null,
    });
    expect(supabaseState.calls).toHaveLength(0);
  });

  it("loads tent relationships in the owner-scoped plant read and never leaks the prior owner", async () => {
    supabaseState.queries.set(
      "plants:user-a",
      Promise.resolve({
        data: [{ id: PLANT_A, name: "Alpha", tent_id: TENT_A, grow_id: GROW_A }],
        error: null,
      }),
    );
    supabaseState.queries.set(
      "tents:user-a",
      Promise.resolve({ data: [{ id: TENT_A, name: "Tent A", grow_id: GROW_A }], error: null }),
    );

    const plantB = deferredQuery();
    const tentB = deferredQuery();
    supabaseState.queries.set("plants:user-b", plantB.promise);
    supabaseState.queries.set("tents:user-b", tentB.promise);

    const { result, rerender } = renderHook(
      ({ userId, growId }: { userId: string | null; growId: string | null }) =>
        useTimelineNameDirectory(userId, growId),
      { initialProps: { userId: "user-a", growId: GROW_A } },
    );

    await waitFor(() => expect(result.current.plantNamesById?.get(PLANT_A)).toBe("Alpha"));
    expect(result.current.plantTentIdsById?.get(PLANT_A)).toBe(TENT_A);
    expect(supabaseState.calls).toContainEqual({
      table: "plants",
      columns: "id,name,tent_id,grow_id",
      column: "user_id",
      value: "user-a",
    });

    rerender({ userId: "user-b", growId: GROW_B });

    // The new read is unresolved. Prior-owner names and relationships must be
    // unavailable synchronously, before the replacement promises settle.
    expect(result.current).toEqual({
      plantNamesById: null,
      plantTentIdsById: null,
      tentNamesById: null,
    });

    await act(async () => {
      plantB.resolve({
        data: [{ id: PLANT_B, name: "Beta", tent_id: TENT_B, grow_id: GROW_B }],
        error: null,
      });
      tentB.resolve({ data: [{ id: TENT_B, name: "Tent B", grow_id: GROW_B }], error: null });
      await Promise.all([plantB.promise, tentB.promise]);
    });

    await waitFor(() => expect(result.current.plantNamesById?.get(PLANT_B)).toBe("Beta"));
    expect(result.current.plantNamesById?.has(PLANT_A)).toBe(false);
    expect(result.current.plantTentIdsById?.get(PLANT_B)).toBe(TENT_B);
    expect(result.current.plantTentIdsById?.has(PLANT_A)).toBe(false);
  });

  it("hides the prior grow and rebuilds relationships for a same-owner grow switch", async () => {
    supabaseState.queries.set(
      "plants:user-a",
      Promise.resolve({
        data: [
          { id: PLANT_A, name: "Alpha", tent_id: TENT_A, grow_id: GROW_A },
          { id: PLANT_B, name: "Beta", tent_id: TENT_B, grow_id: GROW_B },
        ],
        error: null,
      }),
    );
    supabaseState.queries.set(
      "tents:user-a",
      Promise.resolve({
        data: [
          { id: TENT_A, name: "Tent A", grow_id: GROW_A },
          { id: TENT_B, name: "Tent B", grow_id: GROW_B },
        ],
        error: null,
      }),
    );

    const { result, rerender } = renderHook(
      ({ growId }: { growId: string | null }) => useTimelineNameDirectory("user-a", growId),
      { initialProps: { growId: GROW_A } },
    );

    await waitFor(() => expect(result.current.plantTentIdsById?.get(PLANT_A)).toBe(TENT_A));
    expect(result.current.plantTentIdsById?.has(PLANT_B)).toBe(false);

    const plantsForGrowB = deferredQuery();
    const tentsForGrowB = deferredQuery();
    supabaseState.queries.set("plants:user-a", plantsForGrowB.promise);
    supabaseState.queries.set("tents:user-a", tentsForGrowB.promise);

    rerender({ growId: GROW_B });
    expect(result.current).toEqual({
      plantNamesById: null,
      plantTentIdsById: null,
      tentNamesById: null,
    });

    await act(async () => {
      plantsForGrowB.resolve({
        data: [
          { id: PLANT_A, name: "Alpha", tent_id: TENT_A, grow_id: GROW_A },
          { id: PLANT_B, name: "Beta", tent_id: TENT_B, grow_id: GROW_B },
        ],
        error: null,
      });
      tentsForGrowB.resolve({
        data: [
          { id: TENT_A, name: "Tent A", grow_id: GROW_A },
          { id: TENT_B, name: "Tent B", grow_id: GROW_B },
        ],
        error: null,
      });
      await Promise.all([plantsForGrowB.promise, tentsForGrowB.promise]);
    });

    await waitFor(() => expect(result.current.plantTentIdsById?.get(PLANT_B)).toBe(TENT_B));
    expect(result.current.plantTentIdsById?.has(PLANT_A)).toBe(false);
  });

  it("ignores a late prior-scope completion after publishing the replacement scope", async () => {
    const plantA = deferredQuery();
    const tentA = deferredQuery();
    supabaseState.queries.set("plants:user-a", plantA.promise);
    supabaseState.queries.set("tents:user-a", tentA.promise);

    const { result, rerender } = renderHook(
      ({ userId, growId }: { userId: string; growId: string }) =>
        useTimelineNameDirectory(userId, growId),
      { initialProps: { userId: "user-a", growId: GROW_A } },
    );

    const plantB = deferredQuery();
    const tentB = deferredQuery();
    supabaseState.queries.set("plants:user-b", plantB.promise);
    supabaseState.queries.set("tents:user-b", tentB.promise);
    rerender({ userId: "user-b", growId: GROW_B });

    await act(async () => {
      plantB.resolve({
        data: [{ id: PLANT_B, name: "Beta", tent_id: TENT_B, grow_id: GROW_B }],
        error: null,
      });
      tentB.resolve({ data: [{ id: TENT_B, name: "Tent B", grow_id: GROW_B }], error: null });
      await Promise.all([plantB.promise, tentB.promise]);
    });
    await waitFor(() => expect(result.current.plantTentIdsById?.get(PLANT_B)).toBe(TENT_B));

    await act(async () => {
      plantA.resolve({
        data: [{ id: PLANT_A, name: "Alpha", tent_id: TENT_A, grow_id: GROW_A }],
        error: null,
      });
      tentA.resolve({ data: [{ id: TENT_A, name: "Tent A", grow_id: GROW_A }], error: null });
      await Promise.all([plantA.promise, tentA.promise]);
    });

    expect(result.current.plantTentIdsById?.get(PLANT_B)).toBe(TENT_B);
    expect(result.current.plantTentIdsById?.has(PLANT_A)).toBe(false);
  });

  it("keeps the relationship directory unavailable when the owner tent read fails", async () => {
    supabaseState.queries.set(
      "plants:user-c",
      Promise.resolve({
        data: [{ id: PLANT_A, name: "Alpha", tent_id: TENT_A, grow_id: GROW_A }],
        error: null,
      }),
    );
    supabaseState.queries.set(
      "tents:user-c",
      Promise.resolve({ data: [], error: { message: "tent read failed" } }),
    );

    const { result } = renderHook(() => useTimelineNameDirectory("user-c", GROW_A));

    await waitFor(() => expect(result.current.plantNamesById?.get(PLANT_A)).toBe("Alpha"));
    expect(result.current.plantTentIdsById).toBeNull();
    expect(result.current.tentNamesById).toBeNull();
  });

  it("keeps relationship proof unavailable while preserving tent names when plants fail", async () => {
    supabaseState.queries.set(
      "plants:user-d",
      Promise.resolve({ data: [], error: { message: "plant read failed" } }),
    );
    supabaseState.queries.set(
      "tents:user-d",
      Promise.resolve({ data: [{ id: TENT_A, name: "Tent A", grow_id: GROW_A }], error: null }),
    );

    const { result } = renderHook(() => useTimelineNameDirectory("user-d", GROW_A));

    await waitFor(() => expect(result.current.tentNamesById?.get(TENT_A)).toBe("Tent A"));
    expect(result.current.plantNamesById).toBeNull();
    expect(result.current.plantTentIdsById).toBeNull();
  });
});
