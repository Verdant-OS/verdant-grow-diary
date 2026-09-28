import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedEnvironmentRow } from "@/lib/csvParser";
import type { SensorReadingInsert } from "@/lib/environmentCsvImportPersistence";
import EnvironmentCsvImportLauncher from "@/components/EnvironmentCsvImportLauncher";
import { filterCsvPresenceTimestampsForScope } from "@/lib/csvSensorPresenceScopeRules";

const io = vi.hoisted(() => ({
  confirm: null as null | ((rows: readonly ParsedEnvironmentRow[]) => Promise<unknown>),
  reads: [] as Array<{ timestamps: string[]; min: string; max: string; recovery: boolean }>,
  inserts: [] as SensorReadingInsert[][],
  conflict: [] as SensorReadingInsert[],
  inRecovery: false,
  counts: true,
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "owner" } }),
}));
vi.mock("@/hooks/useCsvHistoryWindow", () => ({
  useCsvHistoryWindow: () => ({ window: { status: "unknown" }, refetch: vi.fn() }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/components/EnvironmentCsvImportModal", () => ({
  EnvironmentCsvImportModal: (props: { onConfirm: typeof io.confirm }) => {
    io.confirm = props.onConfirm;
    return null;
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => {
        let timestamps: string[] = [];
        let min = "";
        let max = "~";
        let start = 0;
        let end = 499;
        const query = {
          in: (key: string, values: string[]) => {
            if (key === "captured_at") timestamps = values;
            return query;
          },
          gte: (_key: string, value: string) => {
            min = value;
            return query;
          },
          lte: (_key: string, value: string) => {
            max = value;
            return query;
          },
          order: () => query,
          range: (from: number, to: number) => {
            start = from;
            end = to;
            return query;
          },
          then: (resolve: (value: unknown) => unknown) => {
            io.reads.push({ timestamps, min, max, recovery: io.inRecovery });
            const present = io.conflict.filter(
              (row) =>
                timestamps.includes(row.captured_at) &&
                row.captured_at >= min &&
                row.captured_at <= max,
            );
            return Promise.resolve({
              data: present.slice(start, end + 1),
              count: io.counts ? present.length : null,
              error: null,
            }).then(resolve);
          },
        };
        return query;
      },
      insert: (rows: SensorReadingInsert[]) => {
        io.inserts.push(rows);
        if (io.inserts.length === 2) {
          io.conflict = [rows[0]];
          io.inRecovery = true;
          return Promise.resolve({
            error: { code: "23505", message: "sensor_readings_dedupe_uidx conflict" },
          });
        }
        io.inRecovery = false;
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

const clients: QueryClient[] = [];
beforeEach(() => {
  io.confirm = null;
  io.reads = [];
  io.inserts = [];
  io.conflict = [];
  io.inRecovery = false;
  io.counts = true;
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

function denseRows(): ParsedEnvironmentRow[] {
  const start = Date.parse("2026-01-01T00:00:00Z");
  return Array.from({ length: 50_000 }, (_, index) => ({
    rowNumber: index + 2,
    captured_at: new Date(start + index * 60_000).toISOString(),
    temperature_c: 25,
    humidity_pct: null,
    vpd_kpa: null,
    co2_ppm: null,
    ppfd: null,
    raw_temperature: 25,
    raw_temp_unit: "C",
    raw_payload: {},
    vpd_source: null,
    source_tag: "csv",
  }));
}

describe("CSV duplicate-race recovery uses the failed batch's timestamp scope", () => {
  it.each([true, false])("bounds recovery reads with exact-count metadata=%s", async (counts) => {
    io.counts = counts;
    const rows = denseRows();
    const original = structuredClone(rows);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    render(
      <QueryClientProvider client={client}>
        <EnvironmentCsvImportLauncher growId="grow" tentId="tent" testIdPrefix="race" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("race-button"));
    if (!io.confirm) throw new Error("CSV confirm callback missing");
    let result: unknown;
    await act(async () => {
      result = await io.confirm!(rows);
    });
    expect(result).toMatchObject({ insertedCount: 49_999, duplicateCount: 1, error: null });
    expect(io.inserts).toHaveLength(101);
    const retry = io.inserts[2];
    expect(retry).toHaveLength(499);
    expect(retry).toEqual(io.inserts[1].slice(1));
    const recovery = io.reads.filter((read) => read.recovery);
    expect(io.reads.filter((read) => !read.recovery)).toHaveLength(500);
    expect(recovery).toHaveLength(counts ? 5 : 6);
    const failedTimes = new Set(io.inserts[1].map((row) => row.captured_at));
    expect(recovery.every((read) => read.timestamps.every((time) => failedTimes.has(time)))).toBe(
      true,
    );
    expect(new Set(recovery.flatMap((read) => read.timestamps))).toEqual(failedTimes);
    expect(rows).toEqual(original);
    expect(io.inserts.flat().every((row) => row.source === "csv" && row.tent_id === "tent")).toBe(
      true,
    );
  });
});

describe("CSV presence timestamp scope rules", () => {
  const scope = {
    minCapturedAt: "2026-01-01T01:00:00.000Z",
    maxCapturedAt: "2026-01-01T02:00:00.000Z",
  };

  it("normalizes inclusive boundaries, drops outside/invalid values and does not mutate input", () => {
    const values = Object.freeze([
      "2026-01-01T00:59:59.999Z",
      "2026-01-01T02:00:00+01:00",
      "2026-01-01T01:30:00Z",
      "2026-01-01T02:00:00Z",
      "2026-01-01T02:00:00.001Z",
      "invalid",
      null,
      undefined,
    ]);
    const expected = [
      "2026-01-01T01:00:00.000Z",
      "2026-01-01T01:30:00.000Z",
      "2026-01-01T02:00:00.000Z",
    ];
    expect(filterCsvPresenceTimestampsForScope(values, scope)).toEqual(expected);
    expect(filterCsvPresenceTimestampsForScope(values, scope)).toEqual(expected);
  });

  it("keeps a single-timestamp range including equivalent timezone notation", () => {
    expect(
      filterCsvPresenceTimestampsForScope(
        ["2026-01-01T00:00:00-01:00", "2026-01-01T01:00:00Z", "2026-01-01T01:00:00.001Z"],
        { minCapturedAt: scope.minCapturedAt, maxCapturedAt: scope.minCapturedAt },
      ),
    ).toEqual([scope.minCapturedAt, scope.minCapturedAt]);
  });

  it.each([null, undefined])("returns no candidates for missing timestamps=%s", (values) => {
    expect(filterCsvPresenceTimestampsForScope(values, scope)).toEqual([]);
  });

  it.each([
    null,
    undefined,
    { minCapturedAt: "invalid", maxCapturedAt: scope.maxCapturedAt },
    { minCapturedAt: scope.minCapturedAt, maxCapturedAt: "invalid" },
    { minCapturedAt: scope.maxCapturedAt, maxCapturedAt: scope.minCapturedAt },
  ])("returns no candidates for an absent or invalid scope %#", (value) => {
    expect(filterCsvPresenceTimestampsForScope([scope.minCapturedAt], value)).toEqual([]);
  });
});
