import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TimelineCsvContextPanel } from "@/components/TimelineCsvContextPanel";
import { TimelineBoundedRead } from "@/lib/timelineBoundedRead";

const queries = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query: Record<string, unknown> = { table };
      queries.push(query);
      const chain = {
        select: (columns: string) => {
          query.select = columns;
          return chain;
        },
        eq: (...args: unknown[]) => {
          query.eq = args;
          return chain;
        },
        in: (...args: unknown[]) => {
          query.in = args;
          return chain;
        },
        order: (...args: unknown[]) => {
          query.order = args;
          return chain;
        },
        lt: (...args: unknown[]) => {
          query.lt = args;
          return chain;
        },
        limit: (limit: number) => {
          query.limit = limit;
          const count = limit;
          const older = Boolean(query.lt);
          const start = older ? count : 0;
          const data = Array.from({ length: count }, (_, index) => {
            const n = start + index;
            return {
              id: `row-${n}`,
              tent_id: "tA",
              source: "csv",
              metric: "temperature_c",
              value: 20,
              captured_at: new Date(Date.UTC(2026, 5, 1) - n * 60_000).toISOString(),
              grow_scope: "g1",
              vpd_source: null,
            };
          });
          return Promise.resolve({ data, error: null });
        },
      };
      return chain;
    },
  },
}));

function selectedColumns(select: string): string[] {
  return select.split(",").map((part) => part.trim().split(":")[0]);
}

describe("TimelineBoundedRead", () => {
  afterEach(() => {
    cleanup();
    queries.length = 0;
  });

  it("list selects omit the raw_payload column and keep an explicit limit", () => {
    expect(selectedColumns(TimelineBoundedRead.csvSelect)).not.toContain("raw_payload");
    expect(selectedColumns(TimelineBoundedRead.sensorListSelect)).not.toContain("raw_payload");
    expect(TimelineBoundedRead.csvSelect).toContain("raw_payload->>grow_id");
    expect(TimelineBoundedRead.csvPageSize).toBeGreaterThan(0);
    expect(TimelineBoundedRead.idLookupLimit(["a", "b"])).toBe(2);
  });

  it("accepts sensor list rows that do not carry raw_payload", () => {
    const rows = TimelineBoundedRead.acceptSensorList([
      {
        id: "11111111-1111-4111-8111-111111111111",
        user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        tent_id: "22222222-2222-4222-8222-222222222222",
        metric: "temperature_c",
        value: 24,
        source: "manual",
        quality: "ok",
        ts: "2026-06-01T00:00:00.000Z",
        captured_at: "2026-06-01T00:00:00.000Z",
        created_at: "2026-06-01T00:00:00.000Z",
        device_id: null,
        correction_valid: true,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.raw_payload).toBeNull();
  });

  it("loads the next CSV page with a keyset bound when the first page is full", async () => {
    render(
      <TimelineCsvContextPanel
        growId="g1"
        entries={[{ id: "d1", tent_id: "tA", entry_at: "2026-06-01T12:00:00.000Z" }]}
      />,
    );
    const older = await screen.findByTestId("timeline-csv-load-older");
    expect(queries[0]?.limit).toBe(TimelineBoundedRead.csvPageSize);
    expect(queries[0]?.lt).toBeUndefined();
    expect(selectedColumns(String(queries[0]?.select))).not.toContain("raw_payload");
    fireEvent.click(older);
    await waitFor(() => expect(queries).toHaveLength(2));
    expect(queries[1]?.lt).toEqual(["captured_at", expect.any(String)]);
    expect(queries[1]?.limit).toBe(TimelineBoundedRead.csvPageSize);
  });
});
