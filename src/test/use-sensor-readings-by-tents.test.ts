import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// Per-tent query mock: each `.eq("tent_id", id)` resolves with that tent's
// rows from FIXTURES. This proves that one tent's rows cannot starve out
// another's, which was the production "unavailable" bug.
const FIXTURES: Record<string, Array<Record<string, unknown>>> = {
  "tent-a": [
    { id: "ra1", tent_id: "tent-a", metric: "vpd_kpa", value: 1.0, ts: "2025-01-01T00:00:00Z", created_at: "2025-01-01T00:00:00Z" },
    { id: "ra2", tent_id: "tent-a", metric: "vpd_kpa", value: 1.1, ts: "2025-01-01T01:00:00Z", created_at: "2025-01-01T01:00:00Z" },
  ],
  "tent-b": [
    { id: "rb1", tent_id: "tent-b", metric: "vpd_kpa", value: 1.4, ts: "2025-01-01T02:00:00Z", created_at: "2025-01-01T02:00:00Z" },
  ],
  "tent-c": [],
};

vi.mock("@/integrations/supabase/client", () => {
  const builder = (tentId: string | null) => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.order = () => b;
    b.limit = () => Promise.resolve({ data: tentId ? FIXTURES[tentId] ?? [] : [], error: null });
    b.eq = (_col: string, id: string) => builder(id);
    return b;
  };
  return {
    supabase: {
      from: () => builder(null),
    },
  };
});

import { useSensorReadingsByTents } from "@/hooks/use-sensor-readings";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSensorReadingsByTents", () => {
  it("returns each tent's own rows, isolated from other tents", async () => {
    const { result } = renderHook(
      () => useSensorReadingsByTents(["tent-a", "tent-b", "tent-c"]),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.byTent["tent-a"].map((r) => r.id)).toEqual(["ra1", "ra2"]);
    expect(result.current.byTent["tent-b"].map((r) => r.id)).toEqual(["rb1"]);
    expect(result.current.byTent["tent-c"]).toEqual([]);
  });

  it("does not leak tent-a rows into tent-b's window (no global cap starvation)", async () => {
    const { result } = renderHook(
      () => useSensorReadingsByTents(["tent-a", "tent-b"]),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    for (const row of result.current.byTent["tent-b"]) {
      expect(row.tent_id).toBe("tent-b");
    }
    for (const row of result.current.byTent["tent-a"]) {
      expect(row.tent_id).toBe("tent-a");
    }
  });

  it("returns empty arrays for tents with no readings (not undefined)", async () => {
    const { result } = renderHook(
      () => useSensorReadingsByTents(["tent-c"]),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.byTent["tent-c"]).toEqual([]);
  });
});
