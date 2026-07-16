import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// Per-tent query mock: each `.eq("tent_id", id)` resolves with that tent's
// rows from FIXTURES. This proves that one tent's rows cannot starve out
// another's, which was the production "unavailable" bug.
const FIXTURES: Record<string, Array<Record<string, unknown>>> = {
  "tent-a": [
    {
      id: "ra1",
      tent_id: "tent-a",
      metric: "vpd_kpa",
      value: 1.0,
      ts: "2025-01-01T00:00:00Z",
      created_at: "2025-01-01T00:00:00Z",
    },
    {
      id: "ra2",
      tent_id: "tent-a",
      metric: "vpd_kpa",
      value: 1.1,
      ts: "2025-01-01T01:00:00Z",
      created_at: "2025-01-01T01:00:00Z",
    },
  ],
  "tent-b": [
    {
      id: "rb1",
      tent_id: "tent-b",
      metric: "vpd_kpa",
      value: 1.4,
      ts: "2025-01-01T02:00:00Z",
      created_at: "2025-01-01T02:00:00Z",
    },
  ],
  "tent-c": [],
  "tent-history": [
    ...Array.from({ length: 205 }, (_, i) => ({
      id: `live-${i}`,
      tent_id: "tent-history",
      metric: "temperature_c",
      value: 24,
      source: "live",
      ts: new Date(Date.UTC(2026, 6, 16, 12, i)).toISOString(),
      created_at: new Date(Date.UTC(2026, 6, 16, 12, i)).toISOString(),
    })),
    {
      id: "csv-canonical",
      tent_id: "tent-history",
      metric: "temperature_c",
      value: 22,
      source: "csv",
      ts: "2025-01-01T00:00:00Z",
      created_at: "2026-07-16T00:00:00Z",
    },
    {
      id: "csv-legacy",
      tent_id: "tent-history",
      metric: "humidity_pct",
      value: 55,
      source: "csv_import_ac_infinity",
      ts: "2025-01-01T00:05:00Z",
      created_at: "2026-07-16T00:00:01Z",
    },
  ],
};

vi.mock("@/integrations/supabase/client", () => {
  const builder = (tentId: string | null, sourceFilter: ReadonlySet<string> | null = null) => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.order = () => b;
    b.limit = (limit: number) => {
      const tentRows = tentId ? (FIXTURES[tentId] ?? []) : [];
      const scopedRows = sourceFilter
        ? tentRows.filter((row) => sourceFilter.has(String(row.source ?? "")))
        : tentRows;
      return Promise.resolve({ data: scopedRows.slice(0, limit), error: null });
    };
    b.eq = (_col: string, id: string) => builder(id, sourceFilter);
    b.in = (column: string, values: string[]) =>
      column === "source" ? builder(tentId, new Set(values)) : builder(tentId, sourceFilter);
    return b;
  };
  return {
    supabase: {
      from: () => builder(null),
    },
  };
});

import { useSensorReadingsByTents } from "@/hooks/use-sensor-readings";
import { AI_DOCTOR_CSV_HISTORY_SOURCES } from "@/lib/aiDoctorCsvHistoryContextRules";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSensorReadingsByTents", () => {
  it("returns each tent's own rows, isolated from other tents", async () => {
    const { result } = renderHook(() => useSensorReadingsByTents(["tent-a", "tent-b", "tent-c"]), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.byTent["tent-a"].map((r) => r.id)).toEqual(["ra1", "ra2"]);
    expect(result.current.byTent["tent-b"].map((r) => r.id)).toEqual(["rb1"]);
    expect(result.current.byTent["tent-c"]).toEqual([]);
  });

  it("does not leak tent-a rows into tent-b's window (no global cap starvation)", async () => {
    const { result } = renderHook(() => useSensorReadingsByTents(["tent-a", "tent-b"]), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    for (const row of result.current.byTent["tent-b"]) {
      expect(row.tent_id).toBe("tent-b");
    }
    for (const row of result.current.byTent["tent-a"]) {
      expect(row.tent_id).toBe("tent-a");
    }
  });

  it("returns empty arrays for tents with no readings (not undefined)", async () => {
    const { result } = renderHook(() => useSensorReadingsByTents(["tent-c"]), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.byTent["tent-c"]).toEqual([]);
  });

  it("statusByTent distinguishes an established empty result from a pending read", async () => {
    const { result } = renderHook(() => useSensorReadingsByTents(["tent-c"]), { wrapper });
    // While pending, the slot must not claim success — absence is not
    // established yet (SENSOR TRUTH: no false "No sensor data yet").
    expect(result.current.statusByTent["tent-c"]).toBe("loading");
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.statusByTent["tent-c"]).toBe("success");
    expect(result.current.byTent["tent-c"]).toEqual([]);
  });

  it("filters CSV sources before the cap so newer live rows cannot starve imported history", async () => {
    const { result } = renderHook(
      () => useSensorReadingsByTents(["tent-history"], 200, AI_DOCTOR_CSV_HISTORY_SOURCES),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.byTent["tent-history"].map((row) => row.id)).toEqual([
      "csv-canonical",
      "csv-legacy",
    ]);
  });
});
