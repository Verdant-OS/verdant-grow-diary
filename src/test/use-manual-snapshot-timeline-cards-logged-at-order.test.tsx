/**
 * useManualSnapshotTimelineCards — Captured-time (logged_at) pagination
 * cutoff.
 *
 * PR #442 remediation: both the plant-scoped and tent-scoped diary_entries
 * fetch must order/limit by `logged_at` (the grower-perceived "Captured"
 * moment), not `entry_at` (row save-time). This test pins the Supabase
 * query builder's `.order(...)` column argument for both fetch paths.
 */
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useManualSnapshotTimelineCards } from "@/hooks/useManualSnapshotTimelineCards";

type OrderCall = { table: string; column: string };
const recorded = vi.hoisted(() => ({ orderCalls: [] as OrderCall[] }));

vi.mock("@/integrations/supabase/client", () => {
  function makeQuery(table: string) {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.order = (column: string) => {
      recorded.orderCalls.push({ table, column });
      return q;
    };
    q.limit = () => Promise.resolve({ data: [], error: null });
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

describe("useManualSnapshotTimelineCards — Captured-time (logged_at) pagination cutoff", () => {
  it("orders the plant-scoped fetch by logged_at, not entry_at", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useManualSnapshotTimelineCards({ kind: "plant", plantId: "plant-1" }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(recorded.orderCalls).toEqual([{ table: "diary_entries", column: "logged_at" }]);
  });

  it("orders the tent-scoped fetch by logged_at, not entry_at", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useManualSnapshotTimelineCards({ kind: "tent", tentId: "tent-1" }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(recorded.orderCalls).toEqual([{ table: "diary_entries", column: "logged_at" }]);
  });
});
