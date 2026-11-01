import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface Row {
  id: string; tent_id: string; source: string; metric: string; value: number;
  quality: string; captured_at: string | null; ts: string; created_at: string;
}
const fixture = vi.hoisted(() => ({
  rows: [] as Row[], calls: [] as string[], ranges: [] as number[][],
  userId: "owner-A" as string | null,
  error: null as Error | null,
  invalidData: undefined as unknown,
  invalidCount: undefined as unknown,
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: fixture.userId ? { id: fixture.userId } : null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from(table: string) {
    fixture.calls.push(`from:${table}`);
    const filters: Array<(row: Row) => boolean> = [];
    const order: Array<{ column: keyof Row; ascending: boolean; nullsFirst: boolean }> = [];
    const query = {
      select(columns: string, options: { count: string }) { fixture.calls.push(`select:${columns}:${options.count}`); return query; },
      eq(column: keyof Row, value: string) { filters.push((row) => row[column] === value); fixture.calls.push(`eq:${column}:${value}`); return query; },
      in(column: keyof Row, values: string[]) { filters.push((row) => values.includes(String(row[column]))); fixture.calls.push(`in:${column}:${values.join("|")}`); return query; },
      gte(column: keyof Row, value: string) { filters.push((row) => row[column] !== null && String(row[column]) >= value); return query; },
      lt(column: keyof Row, value: string) { filters.push((row) => row[column] !== null && String(row[column]) < value); return query; },
      order(column: keyof Row, options: { ascending: boolean; nullsFirst?: boolean }) {
        order.push({ column, ascending: options.ascending, nullsFirst: options.nullsFirst === true });
        fixture.calls.push(`order:${column}:${options.ascending}`); return query;
      },
      async range(from: number, to: number) {
        fixture.ranges.push([from, to]);
        const rows = fixture.rows.filter((row) => filters.every((filter) => filter(row))).sort((a, b) => {
          for (const spec of order) {
            const av = a[spec.column], bv = b[spec.column];
            if (av === bv) continue;
            if (av === null || bv === null) return (av === null ? -1 : 1) * (spec.nullsFirst ? 1 : -1);
            const compared = String(av).localeCompare(String(bv));
            if (compared) return compared * (spec.ascending ? 1 : -1);
          }
          return 0;
        });
        return { data: fixture.invalidData !== undefined ? fixture.invalidData : rows.slice(from, to + 1), count: fixture.invalidCount !== undefined ? fixture.invalidCount : rows.length, error: fixture.error };
      },
    };
    return query;
  },
} }));

import { fetchImportedSensorHistoryPage, useImportedSensorHistoryPage, IMPORTED_SENSOR_HISTORY_PAGE_SELECT } from "@/hooks/useImportedSensorHistoryPage";
import { IMPORTED_SENSOR_HISTORY_PAGE_SIZE } from "@/lib/importedSensorHistoryPageRules";

const TENT = "tent-A";
function row(index: number, overrides: Partial<Row> = {}): Row {
  const captured = new Date(Date.UTC(2026, 8, 23) + index * 300_000).toISOString();
  return { id: `row-${String(index).padStart(6, "0")}`, tent_id: TENT, source: "csv", metric: "temperature_c", value: 24, quality: "ok", captured_at: captured, ts: "2026-10-24T12:00:00.000Z", created_at: "2026-10-24T12:00:00.000Z", ...overrides };
}
function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) }, children);
}

beforeEach(() => {
  fixture.rows = []; fixture.calls = []; fixture.ranges = [];
  fixture.userId = "owner-A"; fixture.error = null; fixture.invalidData = undefined; fixture.invalidCount = undefined;
});

describe("bounded imported history page reads", () => {
  it("reaches beginning and middle observations in a 33,655-metric-row import without scanning pages in the browser", async () => {
    const metrics = ["temperature_c", "humidity_pct", "vpd_kpa", "co2_ppm", "ppfd"];
    fixture.rows = Array.from({ length: 6731 }, (_, observation) => metrics.map((metric, m) => row(observation, { id: `obs-${observation}-${m}`, metric }))).flat();
    const newest = await fetchImportedSensorHistoryPage(TENT);
    const middle = await fetchImportedSensorHistoryPage(TENT, { page: 336 });
    const oldest = await fetchImportedSensorHistoryPage(TENT, { page: 673 });
    expect(newest.rows).toHaveLength(50); expect(newest.total).toBe(33655);
    expect(middle.rows).toHaveLength(50); expect(middle.rows.some((r) => r.id.startsWith("obs-3365-"))).toBe(true);
    expect(oldest.rows).toHaveLength(5); expect(oldest.rows.every((r) => r.id.startsWith("obs-0-"))).toBe(true);
    expect(fixture.ranges).toEqual([[0, 49], [16800, 16849], [33650, 33699]]);
  });

  it("finds older and middle dates before applying the page bound, with an inclusive Through day", async () => {
    fixture.rows = Array.from({ length: 10000 }, (_, i) => row(i));
    const beginning = await fetchImportedSensorHistoryPage(TENT, { fromDate: "2026-09-23", throughDate: "2026-09-23" });
    const middle = await fetchImportedSensorHistoryPage(TENT, { fromDate: "2026-10-08", throughDate: "2026-10-08" });
    expect(beginning.total).toBe(288); expect(middle.total).toBe(288);
    expect(beginning.rows.every((r) => r.captured_at?.startsWith("2026-09-23"))).toBe(true);
    expect(middle.rows.every((r) => r.captured_at?.startsWith("2026-10-08"))).toBe(true);
    expect(fixture.ranges.every(([a, b]) => b - a + 1 === IMPORTED_SENSOR_HISTORY_PAGE_SIZE)).toBe(true);
  });

  it("keeps every tied observation metric reachable exactly once with repeatable ordering", async () => {
    fixture.rows = Array.from({ length: 127 }, (_, i) => row(i, { captured_at: "2026-09-23T00:00:00.000Z", created_at: `2026-10-24T12:${i % 2 ? "01" : "00"}:00.000Z`, metric: i % 3 ? "temperature_c" : "humidity_pct" })).reverse();
    const pages = await Promise.all([0, 1, 2].map((page) => fetchImportedSensorHistoryPage(TENT, { page })));
    const ids = pages.flatMap((p) => p.rows.map((r) => r.id));
    expect(ids).toHaveLength(127); expect(new Set(ids).size).toBe(127);
    expect(await fetchImportedSensorHistoryPage(TENT, { page: 1 })).toEqual(pages[1]);
    expect(fixture.calls.filter((c) => c.startsWith("order:")).slice(0, 4)).toEqual(["order:captured_at:false", "order:created_at:false", "order:metric:true", "order:id:true"]);
  });

  it("scopes rows and the exact count to the selected tent and explicit CSV source allowlist", async () => {
    fixture.rows = [row(0), row(1, { source: "csv_import_ac_infinity" }), row(2, { tent_id: "tent-B" }), ...["live", "manual", "demo", "csv_forged"].map((source, i) => row(3 + i, { source }))];
    const page = await fetchImportedSensorHistoryPage(TENT);
    expect(page.total).toBe(2); expect(page.rows.map((r) => r.id)).toEqual(["row-000001", "row-000000"]);
    expect(fixture.calls).toContain(`select:${IMPORTED_SENSOR_HISTORY_PAGE_SELECT}:exact`);
    expect(IMPORTED_SENSOR_HISTORY_PAGE_SELECT).not.toContain("raw_payload");
  });

  it("puts legacy null observation times last while preserving their rows", async () => {
    fixture.rows = [row(1, { captured_at: null }), row(0)];
    const page = await fetchImportedSensorHistoryPage(TENT);
    expect(page.rows.map((r) => r.id)).toEqual(["row-000000", "row-000001"]);
  });

  it.each([null, {}, "unavailable", 4])("rejects malformed data %s without an empty-history claim", async (data) => {
    fixture.invalidData = data;
    await expect(fetchImportedSensorHistoryPage(TENT)).rejects.toThrow(/unavailable/i);
  });
  it.each([null, -1, NaN, 1.5])("rejects an unverified count %s", async (count) => {
    fixture.invalidCount = count;
    await expect(fetchImportedSensorHistoryPage(TENT)).rejects.toThrow(/unavailable/i);
  });
  it("rejects oversized, foreign-tent and non-CSV responses even if transport succeeds", async () => {
    fixture.invalidData = Array.from({ length: 51 }, (_, i) => row(i)); fixture.invalidCount = 51;
    await expect(fetchImportedSensorHistoryPage(TENT)).rejects.toThrow(/unavailable/i);
    fixture.invalidData = [row(0, { tent_id: "tent-B" })]; fixture.invalidCount = 1;
    await expect(fetchImportedSensorHistoryPage(TENT)).rejects.toThrow(/unavailable/i);
    fixture.invalidData = [row(0, { source: "manual" })];
    await expect(fetchImportedSensorHistoryPage(TENT)).rejects.toThrow(/unavailable/i);
  });
  it("propagates database errors and accepts a real empty result", async () => {
    fixture.error = new Error("network failed");
    await expect(fetchImportedSensorHistoryPage(TENT)).rejects.toThrow("network failed");
    fixture.error = null;
    expect(await fetchImportedSensorHistoryPage(TENT)).toEqual({ rows: [], total: 0 });
  });
  it("does not query missing tents or invalid/reversed date ranges", async () => {
    await expect(fetchImportedSensorHistoryPage("  ")).rejects.toThrow();
    await expect(fetchImportedSensorHistoryPage(TENT, { fromDate: "2026-02-30" })).rejects.toThrow();
    await expect(fetchImportedSensorHistoryPage(TENT, { fromDate: "2026-10-24", throughDate: "2026-09-23" })).rejects.toThrow();
    expect(fixture.calls).toEqual([]);
  });
  it("separates page, date, tent and owner query caches", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrap = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    fixture.rows = Array.from({ length: 60 }, (_, i) => row(i));
    const { result, rerender, unmount } = renderHook(({ tent, page, fromDate }) => useImportedSensorHistoryPage(tent, { page, fromDate }), { wrapper: wrap, initialProps: { tent: TENT, page: 0, fromDate: "" } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const newest = result.current.data?.rows[0].id;
    rerender({ tent: TENT, page: 1, fromDate: "" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(10));
    expect(result.current.data?.rows[0].id).not.toBe(newest);
    rerender({ tent: "tent-B", page: 0, fromDate: "2026-09-23" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.total).toBe(0));
    fixture.userId = "owner-B";
    rerender({ tent: "tent-B", page: 0, fromDate: "2026-09-23" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    unmount(); client.clear();
  });
  it("does not start authenticated history browsing when signed out", () => {
    fixture.userId = null;
    const { result, unmount } = renderHook(() => useImportedSensorHistoryPage(TENT, {}), { wrapper });
    expect(result.current.fetchStatus).toBe("idle"); expect(fixture.calls).toEqual([]); unmount();
  });
});
