/**
 * usePlantAssignedTentActions — proof-only selected-plant AI Coach lookup.
 *
 * The normal assigned-tent panel deliberately reads a small, newest-first
 * window. Live Proof has a stricter identity requirement for AI Coach rows:
 * the selected plant's persisted row must remain reachable even when many
 * newer rows for other plants fill that normal window.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import type { AssignedTentActionInputRow } from "@/lib/plantAssignedTentActionRules";

type QueryRecord = {
  table: string;
  filters: Array<[string, unknown]>;
  limit: number | null;
};

const supabaseState = vi.hoisted(() => ({
  queries: [] as QueryRecord[],
  genericRows: [] as AssignedTentActionInputRow[],
  proofRows: [] as AssignedTentActionInputRow[],
  proofError: null as { message: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => {
  const hasFilter = (record: QueryRecord, key: string, value: unknown) =>
    record.filters.some(([filterKey, filterValue]) => filterKey === key && filterValue === value);

  const responseFor = (record: QueryRecord) => {
    const isProofLookup = hasFilter(record, "source", "ai_coach");
    if (isProofLookup) {
      return {
        data: supabaseState.proofRows.slice(0, record.limit ?? 0),
        error: supabaseState.proofError,
      };
    }
    return { data: supabaseState.genericRows.slice(0, record.limit ?? 0), error: null };
  };

  const makeChain = (record: QueryRecord) => {
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => {
        record.filters.push([key, value]);
        return chain;
      },
      order: () => chain,
      limit: (value: number) => {
        record.limit = value;
        return chain;
      },
      then: <TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => Promise.resolve(responseFor(record)).then(onfulfilled, onrejected),
    };
    return chain;
  };

  return {
    supabase: {
      from: (table: string) => {
        const record: QueryRecord = { table, filters: [], limit: null };
        supabaseState.queries.push(record);
        return makeChain(record);
      },
    },
  };
});

import { usePlantAssignedTentActions } from "@/hooks/usePlantAssignedTentActions";

const TENT_ID = "tent-current";
const GROW_ID = "grow-current";
const SELECTED_PLANT_ID = "plant-current";

function action(overrides: Partial<AssignedTentActionInputRow> = {}): AssignedTentActionInputRow {
  return {
    id: "action-1",
    grow_id: GROW_ID,
    tent_id: TENT_ID,
    plant_id: "plant-other",
    status: "pending_approval",
    source: "ai_coach",
    action_type: "advisory",
    target_metric: null,
    suggested_change: null,
    reason: "Observe the plant.",
    risk_level: "low",
    target_device: null,
    created_at: "2026-08-22T10:00:00.000Z",
    ...overrides,
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

function findQuery(predicate: (query: QueryRecord) => boolean): QueryRecord {
  const query = supabaseState.queries.find(predicate);
  if (!query) throw new Error("expected query was not issued");
  return query;
}

beforeEach(() => {
  supabaseState.queries.length = 0;
  supabaseState.genericRows = [];
  supabaseState.proofRows = [];
  supabaseState.proofError = null;
});

describe("usePlantAssignedTentActions — proof-only AI Coach lookup", () => {
  it("finds the exact selected-plant coach row beyond eleven newer other-plant rows with two bounded reads", async () => {
    const newerOtherPlantRows = Array.from({ length: 11 }, (_, index) =>
      action({
        id: `other-plant-coach-${index + 1}`,
        plant_id: "plant-other",
        created_at: `2026-08-22T10:${String(20 + index).padStart(2, "0")}:00.000Z`,
      }),
    );
    const selectedPlantCoach = action({
      id: "selected-plant-coach",
      plant_id: SELECTED_PLANT_ID,
      created_at: "2026-08-22T09:00:00.000Z",
    });
    // The normal read represents the server-side cap: only its ten newest
    // rows return, so the selected row is not in this response at all.
    supabaseState.genericRows = newerOtherPlantRows;
    supabaseState.proofRows = [selectedPlantCoach];

    const { result } = renderHook(
      () =>
        usePlantAssignedTentActions(TENT_ID, GROW_ID, {
          selectedPlantIdForAiCoach: SELECTED_PLANT_ID,
        }),
      { wrapper: wrapper(makeClient()) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The generic proof rows preserve the shared display cap/filtering; the
    // exact selected-plant candidate has its own validated proof-only slot.
    expect(result.current.rows).toEqual([]);
    expect(result.current.proofSelectedPlantAiCoachRow?.id).toBe("selected-plant-coach");
    expect(supabaseState.queries).toHaveLength(2);

    const genericRead = findQuery((query) => !query.filters.some(([key]) => key === "source"));
    expect(genericRead).toMatchObject({ table: "action_queue", limit: 10 });
    expect(genericRead.filters).toEqual(
      expect.arrayContaining([
        ["status", "pending_approval"],
        ["tent_id", TENT_ID],
        ["grow_id", GROW_ID],
      ]),
    );

    const proofRead = findQuery((query) => query.filters.some(([key]) => key === "source"));
    expect(proofRead).toMatchObject({ table: "action_queue", limit: 1 });
    expect(proofRead.filters).toEqual(
      expect.arrayContaining([
        ["status", "pending_approval"],
        ["tent_id", TENT_ID],
        ["grow_id", GROW_ID],
        ["plant_id", SELECTED_PLANT_ID],
        ["source", "ai_coach"],
      ]),
    );
  });

  it("keeps the generic panel on its original single capped read", async () => {
    supabaseState.genericRows = Array.from({ length: 11 }, (_, index) =>
      action({
        id: `generic-${index + 1}`,
        created_at: `2026-08-22T10:${String(20 + index).padStart(2, "0")}:00.000Z`,
      }),
    );

    const { result } = renderHook(() => usePlantAssignedTentActions(TENT_ID, GROW_ID), {
      wrapper: wrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(supabaseState.queries).toHaveLength(1);
    expect(supabaseState.queries[0]).toMatchObject({ table: "action_queue", limit: 10 });
    expect(result.current.rows).toHaveLength(5);
    expect(result.current.proofSelectedPlantAiCoachRow).toBeNull();
  });

  it("keeps the exact selected-plant coach row inside the proof display cap ahead of newer non-Coach rows", async () => {
    supabaseState.genericRows = Array.from({ length: 6 }, (_, index) =>
      action({
        id: `newer-alert-${index + 1}`,
        source: "environment_alert",
        plant_id: null,
        created_at: `2026-08-22T10:${String(20 + index).padStart(2, "0")}:00.000Z`,
      }),
    );
    supabaseState.proofRows = [
      action({
        id: "selected-coach-below-display-cap",
        plant_id: SELECTED_PLANT_ID,
        created_at: "2026-08-22T09:00:00.000Z",
      }),
    ];

    const { result } = renderHook(
      () =>
        usePlantAssignedTentActions(TENT_ID, GROW_ID, {
          selectedPlantIdForAiCoach: SELECTED_PLANT_ID,
        }),
      { wrapper: wrapper(makeClient()) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows).toHaveLength(5);
    expect(result.current.rows.map((row) => row.id)).not.toContain(
      "selected-coach-below-display-cap",
    );
    expect(result.current.proofSelectedPlantAiCoachRow?.id).toBe(
      "selected-coach-below-display-cap",
    );
  });

  it("fails closed in proof mode when the bounded selected-plant lookup errors", async () => {
    supabaseState.genericRows = [
      action({ id: "generic-alert", source: "environment_alert", plant_id: null }),
    ];
    supabaseState.proofError = { message: "selected coach lookup failed" };

    const { result } = renderHook(
      () =>
        usePlantAssignedTentActions(TENT_ID, GROW_ID, {
          selectedPlantIdForAiCoach: SELECTED_PLANT_ID,
        }),
      { wrapper: wrapper(makeClient()) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.rows).toEqual([]);
    expect(result.current.proofSelectedPlantAiCoachRow).toBeNull();
  });
});
