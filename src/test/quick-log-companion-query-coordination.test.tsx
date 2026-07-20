import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildQuickLogGroupedTimelineQueryKey,
  QUICK_LOG_GROUPED_TIMELINE_DEFAULT_LIMIT,
  useQuickLogGroupedTimeline,
} from "@/hooks/useQuickLogGroupedTimeline";
import { useTimelineMemory } from "@/hooks/useTimelineMemory";
import {
  attachQuickLogCompanionSnapshots,
  type QuickLogCompanionSnapshotDiaryRow,
} from "@/lib/quickLogCompanionSnapshotReadModel";
import {
  groupQuickLogTimelineEntries,
  type QuickLogActionEvent,
} from "@/lib/quickLogTimelineGroupingViewModel";

const scope = { kind: "plant", plantId: "plant-1", tentId: "tent-1" } as const;
const action: QuickLogActionEvent = {
  id: "water-1",
  kind: "water",
  source: "manual",
  plantId: "plant-1",
  tentId: "tent-1",
  occurredAt: "2026-07-19T12:00:00.000Z",
  volumeMl: 500,
  noteText: null,
};
const companion: QuickLogCompanionSnapshotDiaryRow & {
  note: string | null;
  photo_url: string | null;
} = {
  id: "diary-companion-1",
  plant_id: "plant-1",
  tent_id: "tent-1",
  entry_at: "2026-07-19T12:00:00.000Z",
  note: null,
  photo_url: null,
  details: {
    linked_grow_event_id: "water-1",
    sensor_snapshot: {
      source: "manual",
      captured_at: "2026-07-19T12:00:00.000Z",
      metrics: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.1 },
    },
  },
};
const parentRow = {
  id: action.id,
  plant_id: action.plantId,
  tent_id: action.tentId,
  occurred_at: action.occurredAt,
  event_type: "watering",
  source: "manual",
  note: null,
  is_deleted: false,
};
const supabaseReadState = vi.hoisted(() => ({
  companionError: false,
  parentError: false,
  omitParent: false,
  requestedParentIds: [] as string[],
  growEventLimitCalls: 0,
}));

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery(table: string) {
    let companionLookup = false;
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.or = () => q;
    q.in = (column: string, values: unknown[]) => {
      if (table === "grow_events" && column === "id") {
        supabaseReadState.requestedParentIds = values.map(String);
      }
      return q;
    };
    q.not = () => {
      if (table === "diary_entries") companionLookup = true;
      return q;
    };
    q.order = () => q;
    q.limit = () => {
      if (table === "grow_events") {
        supabaseReadState.growEventLimitCalls += 1;
        return Promise.resolve(
          supabaseReadState.parentError
            ? { data: null, error: new Error("parent lookup failed") }
            : { data: supabaseReadState.omitParent ? [] : [parentRow], error: null },
        );
      }
      if (table === "ai_doctor_sessions") return Promise.resolve({ data: [], error: null });
      if (table === "diary_entries") {
        if (companionLookup && supabaseReadState.companionError) {
          return Promise.resolve({ data: null, error: new Error("companion lookup failed") });
        }
        return Promise.resolve({ data: [companion], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    };
    return q;
  }
  return { supabase: { from: (table: string) => makeQuery(table) } };
});

beforeEach(() => {
  supabaseReadState.companionError = false;
  supabaseReadState.parentError = false;
  supabaseReadState.omitParent = false;
  supabaseReadState.requestedParentIds = [];
  supabaseReadState.growEventLimitCalls = 0;
});

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function wrapper(client: QueryClient) {
  return function TestQueryProvider({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function ownedGroupedEntries() {
  const baseEntries = groupQuickLogTimelineEntries({
    actions: [action],
    environmentRows: [],
    scope,
  });
  return attachQuickLogCompanionSnapshots(baseEntries, [companion], scope).entries;
}

describe("Quick Log companion query coordination", () => {
  it("keeps the canonical grouped query function during broad save invalidation", async () => {
    const client = makeClient();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const { result } = renderHook(
        () => ({
          grouped: useQuickLogGroupedTimeline(scope),
          memory: useTimelineMemory(scope),
        }),
        { wrapper: wrapper(client) },
      );
      await waitFor(() => {
        expect(result.current.grouped.isLoading).toBe(false);
        expect(result.current.memory.isLoading).toBe(false);
      });

      const groupedKey = buildQuickLogGroupedTimelineQueryKey(
        scope,
        QUICK_LOG_GROUPED_TIMELINE_DEFAULT_LIMIT,
      );
      const initialFetches = supabaseReadState.growEventLimitCalls;

      await client.invalidateQueries({
        queryKey: ["quick_log_grouped_timeline"],
        refetchType: "active",
      });

      expect(supabaseReadState.growEventLimitCalls).toBeGreaterThan(initialFetches);
      expect(client.getQueryState(groupedKey)?.status).toBe("success");
      expect(
        consoleError.mock.calls.some((call) =>
          call.some((value) =>
            String(value).includes("Attempted to invoke queryFn when set to skipToken"),
          ),
        ),
      ).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("hides the companion from Timeline Memory when grouped memory owns its exact card", async () => {
    const client = makeClient();
    client.setQueryData(
      buildQuickLogGroupedTimelineQueryKey(scope, QUICK_LOG_GROUPED_TIMELINE_DEFAULT_LIMIT),
      ownedGroupedEntries(),
    );

    const { result } = renderHook(() => useTimelineMemory(scope), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items.map((item) => item.key)).toContain("diary-companion-1");
    expect(result.current.companionItems?.map((item) => item.key)).toEqual(["diary-companion-1"]);
    expect(result.current.displayItems).toEqual([]);
    expect(supabaseReadState.requestedParentIds).toEqual(["water-1"]);
  });

  it("keeps the valid companion visible when the grouped reader independently fails", async () => {
    const client = makeClient();
    const groupedKey = buildQuickLogGroupedTimelineQueryKey(
      scope,
      QUICK_LOG_GROUPED_TIMELINE_DEFAULT_LIMIT,
    );
    await client
      .fetchQuery({
        queryKey: groupedKey,
        queryFn: async () => {
          throw new Error("grouped companion lookup failed");
        },
      })
      .catch(() => undefined);

    const { result } = renderHook(() => useTimelineMemory(scope), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(client.getQueryState(groupedKey)?.status).toBe("error");
    expect(result.current.items.map((item) => item.key)).toContain("diary-companion-1");
    expect(result.current.displayItems?.map((item) => item.key)).toEqual(["diary-companion-1"]);
  });

  it("uses an explicit unavailable state when exact parent verification fails", async () => {
    supabaseReadState.parentError = true;
    const client = makeClient();

    const { result } = renderHook(() => useTimelineMemory(scope), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(supabaseReadState.requestedParentIds).toEqual(["water-1"]);
    expect(result.current.items).toEqual([]);
    expect(result.current.displayItems).toEqual([]);
    expect(result.current.companionEvidenceUnavailable).toBe(true);
  });

  it("does not claim empty history when the dedicated companion read fails", async () => {
    supabaseReadState.companionError = true;
    const client = makeClient();

    const { result } = renderHook(() => useTimelineMemory(scope), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.items).toEqual([]);
    expect(result.current.companionEvidenceUnavailable).toBe(true);
    expect(supabaseReadState.requestedParentIds).toEqual([]);
  });

  it("marks an underfilled exact-parent result unverified instead of empty", async () => {
    supabaseReadState.omitParent = true;
    const client = makeClient();

    const { result } = renderHook(() => useTimelineMemory(scope), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(supabaseReadState.requestedParentIds).toEqual(["water-1"]);
    expect(result.current.items).toEqual([]);
    expect(result.current.companionEvidenceUnavailable).toBe(true);
  });
});
