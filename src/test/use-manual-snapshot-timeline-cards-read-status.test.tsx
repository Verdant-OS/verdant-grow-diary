import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  queryOptions: null as Record<string, unknown> | null,
  queryResult: {
    data: undefined as unknown,
    isPending: true,
    isFetching: true,
    isError: false,
    isLoading: true,
    fetchStatus: "fetching" as "fetching" | "paused" | "idle",
    error: null as unknown,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    H.queryOptions = options;
    return H.queryResult;
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({}) },
}));

import { useManualSnapshotTimelineCards } from "@/hooks/useManualSnapshotTimelineCards";

const PLANT_SCOPE = { kind: "plant" as const, plantId: "plant-1" };
const SAMPLE_CARD = {
  id: "snap-a",
  title: "Manual sensor snapshot",
  capturedAt: "2026-01-01T10:00:00.000Z",
  sourceLabel: "Manual",
  source: "manual" as const,
  tentId: "tent-1",
  plantId: "plant-1",
  isTentLevel: false,
  notes: null,
  readings: [],
  severity: "ok" as const,
  warnings: [],
  errors: [],
};

function setQueryResult(overrides: Partial<typeof H.queryResult>) {
  H.queryResult = { ...H.queryResult, ...overrides };
}

beforeEach(() => {
  H.queryOptions = null;
  H.queryResult = {
    data: undefined,
    isPending: true,
    isFetching: true,
    isError: false,
    isLoading: true,
    fetchStatus: "fetching",
    error: null,
    refetch: vi.fn(),
  };
});

describe("useManualSnapshotTimelineCards — readStatus honesty", () => {
  it("disables the query when scope is null", () => {
    renderHook(() => useManualSnapshotTimelineCards(null));
    expect(H.queryOptions).toMatchObject({ enabled: false });
  });

  it("keys plant scope reads by kind and plant id", () => {
    renderHook(() => useManualSnapshotTimelineCards(PLANT_SCOPE));
    expect(H.queryOptions?.queryKey).toEqual([
      "manual_snapshot_timeline_cards",
      "plant",
      "plant-1",
      null,
      50,
    ]);
  });

  it.each([
    {
      label: "paused offline fetch",
      query: { fetchStatus: "paused" as const, isPending: true, isFetching: false, isError: false },
      readStatus: "paused",
    },
    {
      label: "first unresolved fetch",
      query: {
        fetchStatus: "fetching" as const,
        isPending: true,
        isFetching: true,
        isError: false,
      },
      readStatus: "loading",
    },
    {
      label: "background refresh with cached cards",
      query: {
        fetchStatus: "fetching" as const,
        isPending: false,
        isFetching: true,
        isError: false,
        data: [SAMPLE_CARD],
      },
      readStatus: "refreshing",
    },
    {
      label: "failed first read",
      query: {
        fetchStatus: "idle" as const,
        isPending: false,
        isFetching: false,
        isError: true,
        error: new Error("unavailable"),
      },
      readStatus: "error",
    },
    {
      label: "confirmed empty read",
      query: {
        fetchStatus: "idle" as const,
        isPending: false,
        isFetching: false,
        isError: false,
        data: [],
      },
      readStatus: "success",
    },
    {
      label: "confirmed cards read",
      query: {
        fetchStatus: "idle" as const,
        isPending: false,
        isFetching: false,
        isError: false,
        data: [SAMPLE_CARD],
      },
      readStatus: "success",
    },
  ])("maps $label to readStatus=$readStatus", ({ query, readStatus }) => {
    setQueryResult(query);
    const { result } = renderHook(() => useManualSnapshotTimelineCards(PLANT_SCOPE));
    expect(result.current.readStatus).toBe(readStatus);
  });

  it("prefers refreshing over error while a retry is in flight", () => {
    setQueryResult({
      fetchStatus: "fetching",
      isPending: false,
      isFetching: true,
      isError: true,
      error: new Error("refresh failed"),
      data: [SAMPLE_CARD],
    });
    const { result } = renderHook(() => useManualSnapshotTimelineCards(PLANT_SCOPE));
    expect(result.current.readStatus).toBe("refreshing");
    expect(result.current.cards).toEqual([SAMPLE_CARD]);
  });

  it("exposes refetch for manual retries", () => {
    const refetch = vi.fn();
    setQueryResult({ refetch, isPending: false, isFetching: false, isError: true });
    const { result } = renderHook(() => useManualSnapshotTimelineCards(PLANT_SCOPE));
    expect(result.current.refetch).toBe(refetch);
  });
});
