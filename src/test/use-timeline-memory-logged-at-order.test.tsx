/**
 * useTimelineMemory — Captured-time (logged_at) pagination cutoff.
 *
 * PR #442 remediation: the Top-N cutoff for Timeline Memory's diary and
 * quick-log-parent fetches must be computed against `logged_at` (the
 * grower-perceived "Captured" moment), not `entry_at` (diary_entries'
 * row save-time) or `occurred_at` (grow_events' true-occurrence time).
 * Ordering by the wrong column silently drops/admits rows whose Captured
 * time and save/occurrence time disagree. This test pins the Supabase
 * query builder's `.order(...)` column argument for every fetch this hook
 * issues against diary_entries and grow_events.
 */
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useTimelineMemory } from "@/hooks/useTimelineMemory";

const scope = { kind: "plant", plantId: "plant-1", tentId: "tent-1" } as const;

const companion = {
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
  id: "water-1",
  plant_id: "plant-1",
  tent_id: "tent-1",
  occurred_at: "2026-07-19T12:00:00.000Z",
  event_type: "watering",
  source: "manual",
  note: null,
  is_deleted: false,
};

type OrderCall = { table: string; column: string };
const recorded = vi.hoisted(() => ({ orderCalls: [] as OrderCall[] }));

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery(table: string) {
    // A fresh closure per `.from(table)` call, so the primary diary_entries
    // fetch (fetchRows) and the companion diary_entries fetch
    // (fetchQuickLogCompanionRows) are tracked independently even though
    // they share a table name.
    let isCompanionLookup = false;
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.or = () => q;
    q.in = () => q;
    q.not = () => {
      if (table === "diary_entries") isCompanionLookup = true;
      return q;
    };
    q.order = (column: string) => {
      recorded.orderCalls.push({
        table: table === "diary_entries" && isCompanionLookup ? "diary_entries:companion" : table,
        column,
      });
      return q;
    };
    q.limit = () => {
      if (table === "grow_events") return Promise.resolve({ data: [parentRow], error: null });
      if (table === "ai_doctor_sessions") return Promise.resolve({ data: [], error: null });
      if (table === "diary_entries") {
        return Promise.resolve({ data: isCompanionLookup ? [companion] : [], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    };
    return q;
  }
  return { supabase: { from: (table: string) => makeQuery(table) } };
});

function wrapper(client: QueryClient) {
  return function TestQueryProvider({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  recorded.orderCalls = [];
});

describe("useTimelineMemory — Captured-time (logged_at) pagination cutoff", () => {
  it("orders every diary_entries and grow_events fetch by logged_at, never entry_at/occurred_at", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTimelineMemory(scope), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const diaryPrimary = recorded.orderCalls.filter((c) => c.table === "diary_entries");
    const diaryCompanion = recorded.orderCalls.filter((c) => c.table === "diary_entries:companion");
    const growEvents = recorded.orderCalls.filter((c) => c.table === "grow_events");

    // Sanity: all three fetch sites actually ran.
    expect(diaryPrimary.length).toBeGreaterThan(0);
    expect(diaryCompanion.length).toBeGreaterThan(0);
    expect(growEvents.length).toBeGreaterThan(0);

    for (const call of [...diaryPrimary, ...diaryCompanion, ...growEvents]) {
      expect(call.column).toBe("logged_at");
      expect(call.column).not.toBe("entry_at");
      expect(call.column).not.toBe("occurred_at");
    }
  });
});
