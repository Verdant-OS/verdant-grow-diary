import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

interface FixtureRow {
  id: string;
  tent_id: string;
  source: string;
  metric: string;
  value: number;
  quality: string;
  ts: string;
  captured_at: string | null;
  created_at: string;
  raw_payload: Record<string, unknown> | null;
}

const queryState = vi.hoisted(() => ({
  rows: [] as FixtureRow[],
  calls: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => {
  type OrderSpec = {
    column: keyof FixtureRow;
    ascending: boolean;
    nullsFirst: boolean;
  };

  function createBuilder() {
    let tentId: string | null = null;
    let allowedSources: Set<string> | null = null;
    const orderSpecs: OrderSpec[] = [];

    const builder = {
      select(columns: string) {
        queryState.calls.push(`select:${columns}`);
        return builder;
      },
      eq(column: string, value: string) {
        queryState.calls.push(`eq:${column}:${value}`);
        if (column === "tent_id") tentId = value;
        return builder;
      },
      in(column: string, values: string[]) {
        queryState.calls.push(`in:${column}:${values.join("|")}`);
        if (column === "source") allowedSources = new Set(values);
        return builder;
      },
      order(column: keyof FixtureRow, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
        queryState.calls.push(`order:${column}:${options.ascending === true ? "asc" : "desc"}`);
        orderSpecs.push({
          column,
          ascending: options.ascending === true,
          nullsFirst: options.nullsFirst === true,
        });
        return builder;
      },
      limit(limit: number) {
        queryState.calls.push(`limit:${limit}`);
        const filtered = queryState.rows.filter(
          (row) =>
            (tentId === null || row.tent_id === tentId) &&
            (allowedSources === null || allowedSources.has(row.source)),
        );
        const sorted = [...filtered].sort((a, b) => {
          for (const spec of orderSpecs) {
            const av = a[spec.column];
            const bv = b[spec.column];
            if (av === bv) continue;
            if (av == null || bv == null) {
              const nullOrder = av == null ? -1 : 1;
              return spec.nullsFirst ? nullOrder : -nullOrder;
            }
            const order = String(av).localeCompare(String(bv));
            if (order !== 0) return spec.ascending ? order : -order;
          }
          return 0;
        });
        return Promise.resolve({ data: sorted.slice(0, limit), error: null });
      },
    };

    return builder;
  }

  return {
    supabase: {
      from(table: string) {
        queryState.calls.push(`from:${table}`);
        return createBuilder();
      },
    },
  };
});

import {
  IMPORTED_SENSOR_HISTORY_QUERY_LIMIT,
  useImportedSensorHistory,
} from "@/hooks/useImportedSensorHistory";
import { AI_DOCTOR_CSV_HISTORY_SOURCES } from "@/lib/aiDoctorCsvHistoryContextRules";

const TENT_ID = "11111111-1111-4111-8111-111111111111";

function row(overrides: Partial<FixtureRow> = {}): FixtureRow {
  return {
    id: "csv-1",
    tent_id: TENT_ID,
    source: "csv",
    metric: "temperature_c",
    value: 24,
    quality: "ok",
    ts: "2026-07-18T12:00:00.000Z",
    captured_at: "2025-01-01T00:00:00.000Z",
    created_at: "2026-07-18T12:00:00.000Z",
    raw_payload: null,
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  queryState.rows = [];
  queryState.calls = [];
});

describe("useImportedSensorHistory", () => {
  it("filters permitted CSV sources before the cap so 205 newer live rows cannot hide history", async () => {
    queryState.rows = [
      ...Array.from({ length: 205 }, (_, index) =>
        row({
          id: `live-${index}`,
          source: "live",
          captured_at: new Date(Date.UTC(2026, 6, 18, 0, index)).toISOString(),
          ts: new Date(Date.UTC(2026, 6, 18, 0, index)).toISOString(),
        }),
      ),
      row({ id: "csv-new", captured_at: "2025-03-01T00:00:00.000Z" }),
      row({
        id: "csv-legacy",
        source: "csv_import_ac_infinity",
        captured_at: "2025-02-01T00:00:00.000Z",
      }),
    ];

    const { result } = renderHook(
      () => useImportedSensorHistory(TENT_ID, IMPORTED_SENSOR_HISTORY_QUERY_LIMIT),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((reading) => reading.id)).toEqual(["csv-new", "csv-legacy"]);
    const sourceCall = `in:source:${AI_DOCTOR_CSV_HISTORY_SOURCES.join("|")}`;
    expect(queryState.calls).toContain(sourceCall);
    expect(queryState.calls.indexOf(sourceCall)).toBeLessThan(
      queryState.calls.indexOf(`limit:${IMPORTED_SENSOR_HISTORY_QUERY_LIMIT}`),
    );
  });

  it("orders imported rows by captured_at rather than the newer ingestion ts", async () => {
    queryState.rows = [
      row({
        id: "historically-newest",
        captured_at: "2025-06-01T00:00:00.000Z",
        ts: "2026-01-01T00:00:00.000Z",
      }),
      row({
        id: "newest-import-but-older-history",
        captured_at: "2025-05-01T00:00:00.000Z",
        ts: "2026-12-01T00:00:00.000Z",
      }),
    ];

    const { result } = renderHook(() => useImportedSensorHistory(TENT_ID), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((reading) => reading.id)).toEqual([
      "historically-newest",
      "newest-import-but-older-history",
    ]);
    expect(queryState.calls.filter((call) => call.startsWith("order:"))).toEqual([
      "order:captured_at:desc",
      "order:created_at:desc",
      "order:metric:asc",
      "order:id:asc",
    ]);
  });

  it("selects the newest 200 of more than 200 CSV observations with deterministic ties", async () => {
    const chronological = Array.from({ length: 202 }, (_, index) =>
      row({
        id: `csv-${String(index).padStart(3, "0")}`,
        captured_at: new Date(Date.UTC(2025, 0, 1) + index * 60_000).toISOString(),
        created_at: "2026-07-18T12:00:00.000Z",
      }),
    );
    const tied = [
      row({
        id: "tie-b",
        metric: "humidity_pct",
        captured_at: "2025-12-31T00:00:00.000Z",
        created_at: "2026-07-18T13:00:00.000Z",
      }),
      row({
        id: "tie-a",
        metric: "humidity_pct",
        captured_at: "2025-12-31T00:00:00.000Z",
        created_at: "2026-07-18T13:00:00.000Z",
      }),
      row({
        id: "tie-z",
        metric: "temperature_c",
        captured_at: "2025-12-31T00:00:00.000Z",
        created_at: "2026-07-18T13:00:00.000Z",
      }),
    ];
    queryState.rows = [...chronological, ...tied];

    const { result } = renderHook(() => useImportedSensorHistory(TENT_ID, 999), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const ids = result.current.data?.map((reading) => reading.id) ?? [];
    expect(ids).toHaveLength(200);
    expect(ids.slice(0, 3)).toEqual(["tie-a", "tie-b", "tie-z"]);
    expect(ids.at(-1)).toBe("csv-005");
    expect(ids).not.toContain("csv-004");
    expect(ids).not.toContain("csv-000");
  });
});
