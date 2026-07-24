/**
 * useQuickLogGroupedTimeline — Top-N cutoff column regression.
 *
 * The hook backs its grouped Plant/Tent Timeline with four bounded
 * (`.order(...).limit(limit)`) reads: the action-row spine and its
 * exactly-linked companion snapshot rows/parents from `grow_events` and
 * `diary_entries`, plus a best-effort diary evidence-enrichment read. All
 * four must cut their Top-N window on the real, indexed `logged_at`
 * column — the grower-perceived "Captured" time — not `occurred_at` /
 * `entry_at`. Those columns are what Supabase actually filters/orders by
 * for other purposes, but a row whose Captured time sits inside the
 * visible window while its occurred_at/entry_at sits outside it (or vice
 * versa) must not be silently dropped from the Top-N cutoff.
 */
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useQuickLogGroupedTimeline } from "@/hooks/useQuickLogGroupedTimeline";

type OrderCall = {
  table: string;
  select: string;
  usedIn: boolean;
  usedNot: boolean;
  column: string;
  ascending: boolean | undefined;
};

const mocks = vi.hoisted(() => ({
  orderCalls: [] as OrderCall[],
}));

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery(table: string) {
    let selectCols = "";
    let usedIn = false;
    let usedNot = false;
    const q: Record<string, unknown> = {};
    q.select = (cols: string) => {
      selectCols = cols;
      return q;
    };
    q.eq = () => q;
    q.or = () => q;
    q.in = () => {
      usedIn = true;
      return q;
    };
    q.not = () => {
      usedNot = true;
      return q;
    };
    q.order = (column: string, opts?: { ascending?: boolean }) => {
      mocks.orderCalls.push({
        table,
        select: selectCols,
        usedIn,
        usedNot,
        column,
        ascending: opts?.ascending,
      });
      return q;
    };
    q.limit = () => Promise.resolve({ data: [], error: null });
    return q;
  }
  return { supabase: { from: (table: string) => makeQuery(table) } };
});

beforeEach(() => {
  mocks.orderCalls.length = 0;
});

function wrapper(client: QueryClient) {
  return function TestQueryProvider({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useQuickLogGroupedTimeline — Top-N cutoff orders by logged_at", () => {
  it("orders all four bounded reads (grow_events + diary_entries) by logged_at, descending", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const scope = { kind: "plant" as const, plantId: "plant-1", tentId: "tent-1" };

    renderHook(() => useQuickLogGroupedTimeline(scope, 50), { wrapper: wrapper(client) });

    await waitFor(() => expect(mocks.orderCalls.length).toBe(4));

    for (const call of mocks.orderCalls) {
      expect(call.column).toBe("logged_at");
      expect(call.ascending).toBe(false);
    }

    // The action-row spine: grow_events, full SELECT (carries the joined
    // watering_events / environment_events columns), filtered by event_type.
    const actionSpine = mocks.orderCalls.find(
      (c) => c.table === "grow_events" && c.select.includes("watering_events"),
    );
    expect(actionSpine, "action-row spine query").toBeTruthy();
    expect(actionSpine?.usedIn).toBe(true);

    // The companion parent verification read: grow_events, narrow SELECT
    // (no joined snapshot columns).
    const companionParent = mocks.orderCalls.find(
      (c) => c.table === "grow_events" && !c.select.includes("watering_events"),
    );
    expect(companionParent, "companion parent query").toBeTruthy();
    expect(companionParent?.usedIn).toBe(true);

    // The diary evidence-enrichment read: diary_entries, filtered via
    // `.in("details->>kind", ...)`.
    const evidenceRead = mocks.orderCalls.find((c) => c.table === "diary_entries" && c.usedIn);
    expect(evidenceRead, "diary evidence-enrichment query").toBeTruthy();

    // The exactly-linked companion snapshot read: diary_entries, filtered
    // via `.not("details->>linked_grow_event_id", "is", null)`.
    const companionSnapshot = mocks.orderCalls.find(
      (c) => c.table === "diary_entries" && c.usedNot,
    );
    expect(companionSnapshot, "companion snapshot query").toBeTruthy();
  });

  it("orders all bounded reads by logged_at for tent scope too", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const scope = { kind: "tent" as const, tentId: "tent-1" };

    renderHook(() => useQuickLogGroupedTimeline(scope, 50), { wrapper: wrapper(client) });

    await waitFor(() => expect(mocks.orderCalls.length).toBe(4));
    for (const call of mocks.orderCalls) {
      expect(call.column).toBe("logged_at");
      expect(call.ascending).toBe(false);
    }
  });
});
