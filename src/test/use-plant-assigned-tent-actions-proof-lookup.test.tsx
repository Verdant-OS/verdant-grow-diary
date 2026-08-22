/**
 * usePlantAssignedTentActions — proof-only exact causal lookups.
 *
 * The normal assigned-tent panel deliberately reads a small, newest-first
 * window. Live Proof has stricter identity requirements for its separately
 * scoped evidence rows, including a selected plant's persisted AI Coach row
 * when many newer rows for other plants fill that normal window.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  proofAlertRows: [] as AssignedTentActionInputRow[],
  proofAlertError: null as { message: string } | null,
  proofAiDoctorRows: [] as AssignedTentActionInputRow[],
  proofAiDoctorError: null as { message: string } | null,
  fetchGate: null as Promise<void> | null,
}));

vi.mock("@/integrations/supabase/client", () => {
  const hasFilter = (record: QueryRecord, key: string, value: unknown) =>
    record.filters.some(([filterKey, filterValue]) => filterKey === key && filterValue === value);

  const escapeRegexLiteral = (value: string) => value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

  // Minimal PostgreSQL LIKE behavior for the test double: `%` and `_` are
  // wildcards unless escaped by a backslash. This makes the regression
  // exercise the exact pattern sent to PostgREST before row shaping.
  const matchesLike = (value: string, pattern: string): boolean => {
    let source = "^";
    for (let index = 0; index < pattern.length; index += 1) {
      const character = pattern[index];
      if (character === "\\" && index + 1 < pattern.length) {
        source += escapeRegexLiteral(pattern[index + 1]);
        index += 1;
      } else if (character === "%") {
        source += ".*";
      } else if (character === "_") {
        source += ".";
      } else {
        source += escapeRegexLiteral(character);
      }
    }
    return new RegExp(`${source}$`, "u").test(value);
  };

  const scopedProofRows = (record: QueryRecord, rows: AssignedTentActionInputRow[]) => {
    const likePattern = record.filters.find(([key]) => key === "reason.like")?.[1];
    const matchingRows =
      typeof likePattern === "string"
        ? rows.filter(
            (row) => typeof row.reason === "string" && matchesLike(row.reason, likePattern),
          )
        : rows;
    return record.limit === null ? matchingRows : matchingRows.slice(0, record.limit);
  };

  const responseFor = (record: QueryRecord) => {
    if (hasFilter(record, "source", "ai_coach")) {
      return {
        data: supabaseState.proofRows.slice(0, record.limit ?? 0),
        error: supabaseState.proofError,
      };
    }
    if (hasFilter(record, "source", "environment_alert")) {
      return {
        data: scopedProofRows(record, supabaseState.proofAlertRows),
        error: supabaseState.proofAlertError,
      };
    }
    if (hasFilter(record, "source", "ai_doctor")) {
      return {
        data: scopedProofRows(record, supabaseState.proofAiDoctorRows),
        error: supabaseState.proofAiDoctorError,
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
      like: (key: string, value: unknown) => {
        record.filters.push([`${key}.like`, value]);
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
      ) =>
        Promise.resolve(supabaseState.fetchGate)
          .then(() => responseFor(record))
          .then(onfulfilled, onrejected),
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
const ALERT_ID = "alert-current";
const AI_DOCTOR_SESSION_ID = "session-current";
const UNDERSCORE_ALERT_ID = "alert_current";
const UNDERSCORE_AI_DOCTOR_SESSION_ID = "session_current";

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

function makeClient(staleTime = 0) {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime } },
  });
}

function createDeferred() {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: () => resolvePromise?.() };
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
  supabaseState.proofAlertRows = [];
  supabaseState.proofAlertError = null;
  supabaseState.proofAiDoctorRows = [];
  supabaseState.proofAiDoctorError = null;
  supabaseState.fetchGate = null;
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe("usePlantAssignedTentActions — proof-only scoped lookups", () => {
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

  it.each([
    ["generic assigned-tent", ["plant_assigned_tent_actions", TENT_ID, GROW_ID, 5]],
    [
      "selected-plant coach",
      [
        "plant_assigned_tent_actions",
        "proof_selected_plant_ai_coach",
        TENT_ID,
        GROW_ID,
        SELECTED_PLANT_ID,
      ],
    ],
    [
      "selected alert",
      ["plant_assigned_tent_actions", "proof_selected_alert", TENT_ID, GROW_ID, ALERT_ID],
    ],
    [
      "selected AI Doctor session",
      [
        "plant_assigned_tent_actions",
        "proof_selected_ai_doctor",
        TENT_ID,
        GROW_ID,
        AI_DOCTOR_SESSION_ID,
      ],
    ],
  ])("fails closed while cached %s proof data is being refetched", async (_label, queryKey) => {
    const cachedGenericRow = action({
      id: "cached-generic-alert",
      source: "environment_alert",
      plant_id: null,
      reason: `Review humidity [alert:${ALERT_ID}]`,
    });
    const cachedCoachRow = action({
      id: "cached-selected-coach",
      plant_id: SELECTED_PLANT_ID,
    });
    const cachedAlertRow = action({
      id: "cached-selected-alert",
      source: "environment_alert",
      plant_id: null,
      reason: `Review humidity [alert:${ALERT_ID}]`,
    });
    const cachedAiDoctorRow = action({
      id: "cached-selected-ai-doctor",
      source: "ai_doctor",
      plant_id: null,
      reason: `Review leaves [session:${AI_DOCTOR_SESSION_ID}]`,
    });
    const client = makeClient(Infinity);
    client.setQueryData(["plant_assigned_tent_actions", TENT_ID, GROW_ID, 5], [cachedGenericRow]);
    client.setQueryData(
      [
        "plant_assigned_tent_actions",
        "proof_selected_plant_ai_coach",
        TENT_ID,
        GROW_ID,
        SELECTED_PLANT_ID,
      ],
      [cachedCoachRow],
    );
    client.setQueryData(
      ["plant_assigned_tent_actions", "proof_selected_alert", TENT_ID, GROW_ID, ALERT_ID],
      [cachedAlertRow],
    );
    client.setQueryData(
      [
        "plant_assigned_tent_actions",
        "proof_selected_ai_doctor",
        TENT_ID,
        GROW_ID,
        AI_DOCTOR_SESSION_ID,
      ],
      [cachedAiDoctorRow],
    );

    const { result } = renderHook(
      () =>
        usePlantAssignedTentActions(TENT_ID, GROW_ID, {
          selectedPlantIdForAiCoach: SELECTED_PLANT_ID,
          selectedAlertIdForProof: ALERT_ID,
          selectedAiDoctorSessionIdForProof: AI_DOCTOR_SESSION_ID,
        }),
      { wrapper: wrapper(client) },
    );

    expect(supabaseState.queries).toHaveLength(0);
    const fetchGate = createDeferred();
    supabaseState.fetchGate = fetchGate.promise;
    act(() => {
      void client.invalidateQueries({ queryKey, exact: true });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(true));

    // Cached rows are not authoritative while each proof-scope query is
    // refetching. Neither the generic candidate nor a direct exact lookup may
    // certify the Live Proof in that window.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.rows).toEqual([]);
    expect(result.current.proofSelectedPlantAiCoachRow).toBeNull();
    expect(result.current.proofSelectedAlertActionRow).toBeNull();
    expect(result.current.proofSelectedAiDoctorActionRow).toBeNull();

    await act(async () => {
      fetchGate.resolve();
      await Promise.resolve();
    });
  });

  it.each([
    ["generic assigned-tent", ["plant_assigned_tent_actions", TENT_ID, GROW_ID, 5]],
    [
      "selected-plant coach",
      [
        "plant_assigned_tent_actions",
        "proof_selected_plant_ai_coach",
        TENT_ID,
        GROW_ID,
        SELECTED_PLANT_ID,
      ],
    ],
    [
      "selected alert",
      ["plant_assigned_tent_actions", "proof_selected_alert", TENT_ID, GROW_ID, ALERT_ID],
    ],
    [
      "selected AI Doctor session",
      [
        "plant_assigned_tent_actions",
        "proof_selected_ai_doctor",
        TENT_ID,
        GROW_ID,
        AI_DOCTOR_SESSION_ID,
      ],
    ],
  ])("fails closed while cached %s proof data is paused", async (_label, queryKey) => {
    const cachedGenericRow = action({
      id: "paused-cached-generic-alert",
      source: "environment_alert",
      plant_id: null,
      reason: `Review humidity [alert:${ALERT_ID}]`,
    });
    const cachedCoachRow = action({
      id: "paused-cached-selected-coach",
      plant_id: SELECTED_PLANT_ID,
    });
    const cachedAlertRow = action({
      id: "paused-cached-selected-alert",
      source: "environment_alert",
      plant_id: null,
      reason: `Review humidity [alert:${ALERT_ID}]`,
    });
    const cachedAiDoctorRow = action({
      id: "paused-cached-selected-ai-doctor",
      source: "ai_doctor",
      plant_id: null,
      reason: `Review leaves [session:${AI_DOCTOR_SESSION_ID}]`,
    });
    const client = makeClient(Infinity);
    client.setQueryData(["plant_assigned_tent_actions", TENT_ID, GROW_ID, 5], [cachedGenericRow]);
    client.setQueryData(
      [
        "plant_assigned_tent_actions",
        "proof_selected_plant_ai_coach",
        TENT_ID,
        GROW_ID,
        SELECTED_PLANT_ID,
      ],
      [cachedCoachRow],
    );
    client.setQueryData(
      ["plant_assigned_tent_actions", "proof_selected_alert", TENT_ID, GROW_ID, ALERT_ID],
      [cachedAlertRow],
    );
    client.setQueryData(
      [
        "plant_assigned_tent_actions",
        "proof_selected_ai_doctor",
        TENT_ID,
        GROW_ID,
        AI_DOCTOR_SESSION_ID,
      ],
      [cachedAiDoctorRow],
    );

    const { result } = renderHook(
      () =>
        usePlantAssignedTentActions(TENT_ID, GROW_ID, {
          selectedPlantIdForAiCoach: SELECTED_PLANT_ID,
          selectedAlertIdForProof: ALERT_ID,
          selectedAiDoctorSessionIdForProof: AI_DOCTOR_SESSION_ID,
        }),
      { wrapper: wrapper(client) },
    );

    expect(supabaseState.queries).toHaveLength(0);
    act(() => {
      onlineManager.setOnline(false);
      void client.invalidateQueries({ queryKey, exact: true });
    });

    await waitFor(() => expect(client.getQueryState(queryKey)?.fetchStatus).toBe("paused"));

    // `isFetching` is false during an offline/paused TanStack read even
    // though cached data remains in memory. Proof mode must withhold every
    // direct and causal slot until it can obtain a settled response.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.rows).toEqual([]);
    expect(result.current.proofSelectedPlantAiCoachRow).toBeNull();
    expect(result.current.proofSelectedAlertActionRow).toBeNull();
    expect(result.current.proofSelectedAiDoctorActionRow).toBeNull();
  });

  it("keeps cached generic-panel rows visible during a generic background refetch", async () => {
    const cachedGenericRow = action({ id: "cached-generic-panel-row" });
    const client = makeClient(Infinity);
    client.setQueryData(["plant_assigned_tent_actions", TENT_ID, GROW_ID, 5], [cachedGenericRow]);

    const { result } = renderHook(() => usePlantAssignedTentActions(TENT_ID, GROW_ID), {
      wrapper: wrapper(client),
    });

    expect(supabaseState.queries).toHaveLength(0);
    const fetchGate = createDeferred();
    supabaseState.fetchGate = fetchGate.promise;
    act(() => {
      void client.invalidateQueries({
        queryKey: ["plant_assigned_tent_actions", TENT_ID, GROW_ID, 5],
        exact: true,
      });
    });

    await waitFor(() => expect(supabaseState.queries).toHaveLength(1));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.rows.map((row) => row.id)).toEqual(["cached-generic-panel-row"]);
    expect(result.current.proofSelectedPlantAiCoachRow).toBeNull();

    await act(async () => {
      fetchGate.resolve();
      await Promise.resolve();
    });
  });

  it("keeps exact older current-alert and AI Doctor rows reachable beyond the generic cap", async () => {
    supabaseState.genericRows = Array.from({ length: 11 }, (_, index) =>
      action({
        id: `newer-unrelated-${index + 1}`,
        source: "manual",
        plant_id: null,
        created_at: `2026-08-22T10:${String(20 + index).padStart(2, "0")}:00.000Z`,
      }),
    );
    supabaseState.proofAlertRows = [
      action({
        id: "older-current-alert-action",
        source: "environment_alert",
        plant_id: null,
        reason: `Review humidity [alert:${ALERT_ID}]`,
        created_at: "2026-08-22T08:00:00.000Z",
      }),
    ];
    supabaseState.proofAiDoctorRows = [
      action({
        id: "older-current-ai-doctor-action",
        source: "ai_doctor",
        plant_id: null,
        reason: `Review leaf context [session:${AI_DOCTOR_SESSION_ID}]`,
        created_at: "2026-08-22T07:00:00.000Z",
      }),
    ];

    const { result } = renderHook(
      () =>
        usePlantAssignedTentActions(TENT_ID, GROW_ID, {
          selectedAlertIdForProof: ALERT_ID,
          selectedAiDoctorSessionIdForProof: AI_DOCTOR_SESSION_ID,
        }),
      { wrapper: wrapper(makeClient()) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // The generic panel remains capped independently; each causal source has
    // one exact, separately scoped Live Proof evidence slot.
    expect(result.current.rows).toHaveLength(5);
    expect(result.current.proofSelectedAlertActionRow?.id).toBe("older-current-alert-action");
    expect(result.current.proofSelectedAiDoctorActionRow?.id).toBe(
      "older-current-ai-doctor-action",
    );
    expect(supabaseState.queries).toHaveLength(3);

    const alertRead = findQuery((query) =>
      query.filters.some(([key, value]) => key === "source" && value === "environment_alert"),
    );
    expect(alertRead).toMatchObject({ table: "action_queue", limit: null });
    expect(alertRead.filters).toEqual(
      expect.arrayContaining([
        ["status", "pending_approval"],
        ["tent_id", TENT_ID],
        ["grow_id", GROW_ID],
        ["source", "environment_alert"],
        ["reason.like", `%[alert:${ALERT_ID}]%`],
      ]),
    );

    const aiDoctorRead = findQuery((query) =>
      query.filters.some(([key, value]) => key === "source" && value === "ai_doctor"),
    );
    expect(aiDoctorRead).toMatchObject({ table: "action_queue", limit: null });
    expect(aiDoctorRead.filters).toEqual(
      expect.arrayContaining([
        ["status", "pending_approval"],
        ["tent_id", TENT_ID],
        ["grow_id", GROW_ID],
        ["source", "ai_doctor"],
        ["reason.like", `%[session:${AI_DOCTOR_SESSION_ID}]%`],
      ]),
    );
  });

  it("escapes underscore back-pointers so newer causal lookalikes cannot crowd out exact rows", async () => {
    supabaseState.proofAlertRows = [
      action({
        id: "newer-alert-lookalike",
        source: "environment_alert",
        plant_id: null,
        reason: "Review humidity [alert:alertXcurrent]",
        created_at: "2026-08-22T10:00:00.000Z",
      }),
      action({
        id: "older-exact-alert",
        source: "environment_alert",
        plant_id: null,
        reason: `Review humidity [alert:${UNDERSCORE_ALERT_ID}]`,
        created_at: "2026-08-22T09:00:00.000Z",
      }),
    ];
    supabaseState.proofAiDoctorRows = [
      action({
        id: "newer-ai-doctor-lookalike",
        source: "ai_doctor",
        plant_id: null,
        reason: "Review leaves [session:sessionXcurrent]",
        created_at: "2026-08-22T10:00:00.000Z",
      }),
      action({
        id: "older-exact-ai-doctor",
        source: "ai_doctor",
        plant_id: null,
        reason: `Review leaves [session:${UNDERSCORE_AI_DOCTOR_SESSION_ID}]`,
        created_at: "2026-08-22T09:00:00.000Z",
      }),
    ];

    const { result } = renderHook(
      () =>
        usePlantAssignedTentActions(TENT_ID, GROW_ID, {
          selectedAlertIdForProof: UNDERSCORE_ALERT_ID,
          selectedAiDoctorSessionIdForProof: UNDERSCORE_AI_DOCTOR_SESSION_ID,
        }),
      { wrapper: wrapper(makeClient()) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.proofSelectedAlertActionRow?.id).toBe("older-exact-alert");
    expect(result.current.proofSelectedAiDoctorActionRow?.id).toBe("older-exact-ai-doctor");

    const alertRead = findQuery((query) =>
      query.filters.some(([key, value]) => key === "source" && value === "environment_alert"),
    );
    expect(alertRead.filters).toContainEqual(["reason.like", `%[alert:alert\\_current]%`]);
    const aiDoctorRead = findQuery((query) =>
      query.filters.some(([key, value]) => key === "source" && value === "ai_doctor"),
    );
    expect(aiDoctorRead.filters).toContainEqual(["reason.like", `%[session:session\\_current]%`]);
  });

  it("keeps the exact causal row after nine newer duplicate-token decoys", async () => {
    const newerAlertDecoys = Array.from({ length: 9 }, (_, index) =>
      action({
        id: `newer-alert-decoy-${index + 1}`,
        source: "environment_alert",
        plant_id: null,
        reason: `Review [alert:alert-other-${index + 1}] then [alert:${ALERT_ID}]`,
        created_at: `2026-08-22T10:${String(10 + index).padStart(2, "0")}:00.000Z`,
      }),
    );
    const newerAiDoctorDecoys = Array.from({ length: 9 }, (_, index) =>
      action({
        id: `newer-ai-doctor-decoy-${index + 1}`,
        source: "ai_doctor",
        plant_id: null,
        reason: `Review [session:session-other-${index + 1}] then [session:${AI_DOCTOR_SESSION_ID}]`,
        created_at: `2026-08-22T10:${String(10 + index).padStart(2, "0")}:00.000Z`,
      }),
    );
    supabaseState.proofAlertRows = [
      ...newerAlertDecoys,
      action({
        id: "older-exact-alert-after-decoy",
        source: "environment_alert",
        plant_id: null,
        reason: `Review [alert:${ALERT_ID}]`,
        created_at: "2026-08-22T09:00:00.000Z",
      }),
    ];
    supabaseState.proofAiDoctorRows = [
      ...newerAiDoctorDecoys,
      action({
        id: "older-exact-ai-doctor-after-decoy",
        source: "ai_doctor",
        plant_id: null,
        reason: `Review [session:${AI_DOCTOR_SESSION_ID}]`,
        created_at: "2026-08-22T09:00:00.000Z",
      }),
    ];

    const { result } = renderHook(
      () =>
        usePlantAssignedTentActions(TENT_ID, GROW_ID, {
          selectedAlertIdForProof: ALERT_ID,
          selectedAiDoctorSessionIdForProof: AI_DOCTOR_SESSION_ID,
        }),
      { wrapper: wrapper(makeClient()) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.proofSelectedAlertActionRow?.id).toBe("older-exact-alert-after-decoy");
    expect(result.current.proofSelectedAiDoctorActionRow?.id).toBe(
      "older-exact-ai-doctor-after-decoy",
    );
    const alertRead = findQuery((query) =>
      query.filters.some(([key, value]) => key === "source" && value === "environment_alert"),
    );
    const aiDoctorRead = findQuery((query) =>
      query.filters.some(([key, value]) => key === "source" && value === "ai_doctor"),
    );
    expect(alertRead).toMatchObject({ limit: null });
    expect(aiDoctorRead).toMatchObject({ limit: null });
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

  it("fails closed when an exact causal alert lookup errors", async () => {
    supabaseState.genericRows = [
      action({ id: "generic-alert", source: "environment_alert", plant_id: null }),
    ];
    supabaseState.proofAlertError = { message: "current alert lookup failed" };

    const { result } = renderHook(
      () =>
        usePlantAssignedTentActions(TENT_ID, GROW_ID, {
          selectedAlertIdForProof: ALERT_ID,
        }),
      { wrapper: wrapper(makeClient()) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.rows).toEqual([]);
    expect(result.current.proofSelectedAlertActionRow).toBeNull();
  });
});
