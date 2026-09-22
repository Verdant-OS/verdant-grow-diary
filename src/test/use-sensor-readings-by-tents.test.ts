import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// Per-tent query mock: each `.eq("tent_id", id)` resolves with that tent's
// rows from FIXTURES. This proves that one tent's rows cannot starve out
// another's, which was the production "unavailable" bug.
const FIXTURES: Record<string, Array<Record<string, unknown>>> = {
  "00000000-0000-4000-8000-000000000001": [
    {
      id: "00000000-0000-4000-8000-000000000005",
      tent_id: "00000000-0000-4000-8000-000000000001",
      metric: "vpd_kpa",
      value: 1.0,
      ts: "2025-01-01T00:00:00Z",
      created_at: "2025-01-01T00:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000006",
      tent_id: "00000000-0000-4000-8000-000000000001",
      metric: "vpd_kpa",
      value: 1.1,
      ts: "2025-01-01T01:00:00Z",
      created_at: "2025-01-01T01:00:00Z",
    },
  ],
  "00000000-0000-4000-8000-000000000002": [
    {
      id: "00000000-0000-4000-8000-000000000007",
      tent_id: "00000000-0000-4000-8000-000000000002",
      metric: "vpd_kpa",
      value: 1.4,
      ts: "2025-01-01T02:00:00Z",
      created_at: "2025-01-01T02:00:00Z",
    },
  ],
  "00000000-0000-4000-8000-000000000003": [],
  "00000000-0000-4000-8000-000000000004": [
    ...Array.from({ length: 205 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 100).padStart(12, "0")}`,
      tent_id: "00000000-0000-4000-8000-000000000004",
      metric: "temperature_c",
      value: 24,
      source: "live",
      ts: new Date(Date.UTC(2026, 6, 16, 12, i)).toISOString(),
      created_at: new Date(Date.UTC(2026, 6, 16, 12, i)).toISOString(),
    })),
    {
      id: "00000000-0000-4000-8000-000000000008",
      tent_id: "00000000-0000-4000-8000-000000000004",
      metric: "temperature_c",
      value: 22,
      source: "csv",
      ts: "2025-01-01T00:00:00Z",
      created_at: "2026-07-16T00:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000009",
      tent_id: "00000000-0000-4000-8000-000000000004",
      metric: "humidity_pct",
      value: 55,
      source: "csv_import_ac_infinity",
      ts: "2025-01-01T00:05:00Z",
      created_at: "2026-07-16T00:00:01Z",
    },
  ],
};

// Fixtures now model the complete, validated effective-view response.
for (const rows of Object.values(FIXTURES))
  for (const row of rows) {
    Object.assign(row, {
      user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      quality: "ok",
      captured_at: row.ts,
      device_id: null,
      raw_payload: null,
      correction_valid: true,
      source: row.source ?? "manual",
    });
  }

const REQUESTED_TENT_IDS = vi.hoisted(() => [] as string[]);
const FAILED_TENT_IDS = vi.hoisted(() => new Set<string>());
const INVALID_EVIDENCE_TENT_IDS = vi.hoisted(() => new Set<string>());
const MALFORMED_RESPONSE_TENT_IDS = vi.hoisted(() => new Set<string>());
const PENDING_TENT_IDS = vi.hoisted(() => new Set<string>());
const PENDING_REQUESTS = vi.hoisted(
  () =>
    [] as Array<{
      tentId: string;
      rows: Array<Record<string, unknown>>;
      resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void;
    }>,
);

vi.mock("@/integrations/supabase/client", () => {
  const builder = (tentId: string | null, sourceFilter: ReadonlySet<string> | null = null) => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.order = () => b;
    b.limit = (limit: number) => {
      if (tentId) REQUESTED_TENT_IDS.push(tentId);
      if (tentId && FAILED_TENT_IDS.has(tentId)) {
        return Promise.resolve({ data: null, error: new Error("fixture refresh failure") });
      }
      if (tentId && MALFORMED_RESPONSE_TENT_IDS.has(tentId)) {
        return Promise.resolve({ data: null, error: null });
      }
      if (tentId && INVALID_EVIDENCE_TENT_IDS.has(tentId)) {
        return Promise.resolve({
          data: [
            {
              id: "00000000-0000-4000-8000-000000000099",
              user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              tent_id: tentId,
              metric: "vpd_kpa",
              value: 1.2,
              source: "manual",
              quality: "ok",
              ts: "2025-01-01T00:00:00Z",
              created_at: "2025-01-01T00:00:00Z",
              captured_at: "2025-01-01T00:00:00Z",
              device_id: null,
              raw_payload: null,
              correction_valid: false,
            },
          ],
          error: null,
        });
      }
      const tentRows = tentId ? (FIXTURES[tentId] ?? []) : [];
      const scopedRows = sourceFilter
        ? tentRows.filter((row) => sourceFilter.has(String(row.source ?? "")))
        : tentRows;
      if (tentId && PENDING_TENT_IDS.has(tentId)) {
        return new Promise<{
          data: Array<Record<string, unknown>>;
          error: null;
        }>((resolve) => {
          PENDING_REQUESTS.push({ tentId, rows: scopedRows.slice(0, limit), resolve });
        });
      }
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
  REQUESTED_TENT_IDS.length = 0;
  FAILED_TENT_IDS.clear();
  INVALID_EVIDENCE_TENT_IDS.clear();
  MALFORMED_RESPONSE_TENT_IDS.clear();
  PENDING_TENT_IDS.clear();
  PENDING_REQUESTS.length = 0;
});

describe("useSensorReadingsByTents", () => {
  it("returns each tent's own rows, isolated from other tents", async () => {
    const { result } = renderHook(
      () =>
        useSensorReadingsByTents([
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
          "00000000-0000-4000-8000-000000000003",
        ]),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.byTent["00000000-0000-4000-8000-000000000001"].map((r) => r.id)).toEqual([
      "00000000-0000-4000-8000-000000000005",
      "00000000-0000-4000-8000-000000000006",
    ]);
    expect(result.current.byTent["00000000-0000-4000-8000-000000000002"].map((r) => r.id)).toEqual([
      "00000000-0000-4000-8000-000000000007",
    ]);
    expect(result.current.byTent["00000000-0000-4000-8000-000000000003"]).toEqual([]);
  });

  it("does not leak tent-a rows into tent-b's window (no global cap starvation)", async () => {
    const { result } = renderHook(
      () =>
        useSensorReadingsByTents([
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ]),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    for (const row of result.current.byTent["00000000-0000-4000-8000-000000000002"]) {
      expect(row.tent_id).toBe("00000000-0000-4000-8000-000000000002");
    }
    for (const row of result.current.byTent["00000000-0000-4000-8000-000000000001"]) {
      expect(row.tent_id).toBe("00000000-0000-4000-8000-000000000001");
    }
  });

  it("returns empty arrays for tents with no readings (not undefined)", async () => {
    const { result } = renderHook(
      () => useSensorReadingsByTents(["00000000-0000-4000-8000-000000000003"]),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.byTent["00000000-0000-4000-8000-000000000003"]).toEqual([]);
  });

  it("statusByTent distinguishes an established empty result from a pending read", async () => {
    const { result } = renderHook(
      () => useSensorReadingsByTents(["00000000-0000-4000-8000-000000000003"]),
      { wrapper },
    );
    // While pending, the slot must not claim success — absence is not
    // established yet (SENSOR TRUTH: no false "No sensor data yet").
    expect(result.current.statusByTent["00000000-0000-4000-8000-000000000003"]).toBe("loading");
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.statusByTent["00000000-0000-4000-8000-000000000003"]).toBe("success");
    expect(result.current.byTent["00000000-0000-4000-8000-000000000003"]).toEqual([]);
  });

  it("reports a cached-empty background refetch without hiding other cached sensor rows", async () => {
    const { result } = renderHook(
      () =>
        useSensorReadingsByTents([
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000003",
        ]),
      {
        wrapper,
      },
    );
    await waitFor(() =>
      expect(result.current.statusByTent["00000000-0000-4000-8000-000000000003"]).toBe("success"),
    );
    expect(result.current.refreshingByTent["00000000-0000-4000-8000-000000000003"]).toBe(false);

    PENDING_TENT_IDS.add("00000000-0000-4000-8000-000000000003");
    let retryPromise: Promise<void> | undefined;
    act(() => {
      retryPromise = result.current.retryTent("00000000-0000-4000-8000-000000000003");
    });

    await waitFor(() =>
      expect(result.current.refreshingByTent["00000000-0000-4000-8000-000000000003"]).toBe(true),
    );
    expect(result.current.statusByTent["00000000-0000-4000-8000-000000000003"]).toBe("success");
    expect(result.current.byTent["00000000-0000-4000-8000-000000000003"]).toEqual([]);
    expect(result.current.refreshingByTent["00000000-0000-4000-8000-000000000001"]).toBe(false);
    expect(
      result.current.byTent["00000000-0000-4000-8000-000000000001"].map((row) => row.id),
    ).toEqual(["00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000006"]);

    const pending = PENDING_REQUESTS.find(
      (request) => request.tentId === "00000000-0000-4000-8000-000000000003",
    );
    expect(pending).toBeDefined();
    PENDING_TENT_IDS.delete("00000000-0000-4000-8000-000000000003");
    await act(async () => {
      pending?.resolve({ data: pending.rows, error: null });
      await retryPromise;
    });

    await waitFor(() =>
      expect(result.current.refreshingByTent["00000000-0000-4000-8000-000000000003"]).toBe(false),
    );
    expect(result.current.statusByTent["00000000-0000-4000-8000-000000000003"]).toBe("success");
  });

  it("retries exactly the requested tent window and ignores unknown ids", async () => {
    const { result } = renderHook(
      () =>
        useSensorReadingsByTents([
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ]),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(
      REQUESTED_TENT_IDS.filter((id) => id === "00000000-0000-4000-8000-000000000001"),
    ).toHaveLength(1);
    expect(
      REQUESTED_TENT_IDS.filter((id) => id === "00000000-0000-4000-8000-000000000002"),
    ).toHaveLength(1);

    await act(async () => {
      await result.current.retryTent("00000000-0000-4000-8000-000000000002");
      await result.current.retryTent("not-requested");
    });

    expect(
      REQUESTED_TENT_IDS.filter((id) => id === "00000000-0000-4000-8000-000000000001"),
    ).toHaveLength(1);
    expect(
      REQUESTED_TENT_IDS.filter((id) => id === "00000000-0000-4000-8000-000000000002"),
    ).toHaveLength(2);
  });

  it("retains cached rows and distinguishes a failed refresh from an uncached error", async () => {
    const { result } = renderHook(
      () => useSensorReadingsByTents(["00000000-0000-4000-8000-000000000001"]),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.statusByTent["00000000-0000-4000-8000-000000000001"]).toBe("success"),
    );
    expect(
      result.current.byTent["00000000-0000-4000-8000-000000000001"].map((row) => row.id),
    ).toEqual(["00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000006"]);

    FAILED_TENT_IDS.add("00000000-0000-4000-8000-000000000001");
    await act(async () => {
      await result.current.retryTent("00000000-0000-4000-8000-000000000001");
    });

    await waitFor(() =>
      expect(result.current.statusByTent["00000000-0000-4000-8000-000000000001"]).toBe(
        "refresh_error",
      ),
    );
    expect(
      result.current.byTent["00000000-0000-4000-8000-000000000001"].map((row) => row.id),
    ).toEqual(["00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000006"]);
  });

  it("marks only the tent with invalid correction evidence as error while siblings succeed", async () => {
    INVALID_EVIDENCE_TENT_IDS.add("00000000-0000-4000-8000-000000000002");
    const { result } = renderHook(
      () =>
        useSensorReadingsByTents([
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ]),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.statusByTent["00000000-0000-4000-8000-000000000001"]).toBe("success");
    expect(
      result.current.byTent["00000000-0000-4000-8000-000000000001"].map((row) => row.id),
    ).toEqual(["00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000006"]);
    expect(result.current.statusByTent["00000000-0000-4000-8000-000000000002"]).toBe("error");
    expect(result.current.byTent["00000000-0000-4000-8000-000000000002"]).toEqual([]);
    expect(result.current.isError).toBe(true);
  });

  it("reports an uncached invalid effective payload as error, not refresh_error", async () => {
    INVALID_EVIDENCE_TENT_IDS.add("00000000-0000-4000-8000-000000000002");
    const { result } = renderHook(
      () => useSensorReadingsByTents(["00000000-0000-4000-8000-000000000002"]),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.statusByTent["00000000-0000-4000-8000-000000000002"]).toBe("error");
    expect(result.current.byTent["00000000-0000-4000-8000-000000000002"]).toEqual([]);
  });

  it("fail-closes a tent that returns a non-array effective payload without affecting siblings", async () => {
    MALFORMED_RESPONSE_TENT_IDS.add("00000000-0000-4000-8000-000000000003");
    const { result } = renderHook(
      () =>
        useSensorReadingsByTents([
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000003",
        ]),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.statusByTent["00000000-0000-4000-8000-000000000001"]).toBe("success");
    expect(result.current.statusByTent["00000000-0000-4000-8000-000000000003"]).toBe("error");
    expect(result.current.byTent["00000000-0000-4000-8000-000000000003"]).toEqual([]);
  });

  it("filters CSV sources before the cap so newer live rows cannot starve imported history", async () => {
    const { result } = renderHook(
      () =>
        useSensorReadingsByTents(
          ["00000000-0000-4000-8000-000000000004"],
          200,
          AI_DOCTOR_CSV_HISTORY_SOURCES,
        ),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(
      result.current.byTent["00000000-0000-4000-8000-000000000004"].map((row) => row.id),
    ).toEqual(["00000000-0000-4000-8000-000000000008", "00000000-0000-4000-8000-000000000009"]);
  });
});
