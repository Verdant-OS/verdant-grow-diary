import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";

type DiaryRow = {
  id: string;
  grow_id: string;
  tent_id: string | null;
  entry_at: string;
  retracted_at: string | null;
  details: Record<string, unknown>;
};

const io = vi.hoisted(() => ({
  rows: [] as DiaryRow[],
  missingRetractionColumn: false,
  diaryError: null as { code: string; message: string } | null,
  sensorError: false,
  diaryReads: 0,
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-a" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      // Model database selection, ordering and LIMIT together. A static array
      // response would conceal the original grow-wide truncation bug.
      const predicates: Array<(row: DiaryRow) => boolean> = [];
      let retractionFilter = false;
      let descending = false;
      const query = {
        select: () => query,
        eq: (column: keyof DiaryRow, value: unknown) => {
          predicates.push((row) => row[column] === value);
          return query;
        },
        in: (column: keyof DiaryRow, values: unknown[]) => {
          predicates.push((row) => values.includes(row[column]));
          return query;
        },
        is: (column: keyof DiaryRow, value: unknown) => {
          retractionFilter ||= column === "retracted_at";
          predicates.push((row) => row[column] === value);
          return query;
        },
        order: (column: string, options: { ascending: boolean }) => {
          if (column === "entry_at") descending = !options.ascending;
          return query;
        },
        limit: async (count: number) => {
          if (table !== "diary_entries") {
            return { data: [], error: io.sensorError ? { message: "read failed" } : null };
          }
          io.diaryReads += 1;
          if (io.diaryError) return { data: null, error: io.diaryError };
          if (retractionFilter && io.missingRetractionColumn) {
            return {
              data: null,
              error: { code: "42703", message: "column diary_entries.retracted_at does not exist" },
            };
          }
          const data = io.rows
            .filter((row) => predicates.every((predicate) => predicate(row)))
            .sort((a, b) =>
              descending
                ? b.entry_at.localeCompare(a.entry_at)
                : a.entry_at.localeCompare(b.entry_at),
            )
            .slice(0, count);
          return { data, error: null };
        },
      };
      return query;
    },
  },
}));

const savedAt = "2026-09-23T10:00:00.000Z";
function diary(overrides: Partial<DiaryRow> = {}): DiaryRow {
  return {
    id: "saved-manual",
    grow_id: "grow-a",
    tent_id: "tent-a",
    entry_at: savedAt,
    retracted_at: null,
    details: { manual_sensor_snapshot: { source: "manual", temp_f: 77, humidity_percent: 55 } },
    ...overrides,
  };
}
function busyOtherTent(): DiaryRow[] {
  return Array.from({ length: 25 }, (_, index) =>
    diary({
      id: `other-${index}`,
      tent_id: "tent-b",
      entry_at: new Date(Date.parse(savedAt) + (index + 1) * 60_000).toISOString(),
    }),
  );
}
const clients: QueryClient[] = [];
function mount(tentIds = ["tent-a"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return renderHook(() => useLatestSensorSnapshot("grow-a", tentIds), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
beforeEach(() => {
  io.rows = [];
  io.missingRetractionColumn = false;
  io.diaryError = null;
  io.sensorError = false;
  io.diaryReads = 0;
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe("latest snapshot diary query scope before bounded selection", () => {
  it.each([
    [
      "manual envelope",
      { manual_sensor_snapshot: { source: "manual", temp_f: 77, humidity_percent: 55 } },
      "manual",
    ],
    ["environment check", { environment_check: { temp_c: 25, humidity_pct: 55 } }, "manual"],
    ["diary snapshot", { sensor_snapshot: { temp: 25, rh: 55 } }, "diary"],
  ] as const)(
    "retrieves saved %s after 25 newer other-tent entries",
    async (_label, details, source) => {
      io.rows = [diary({ details }), ...busyOtherTent()];
      const { result } = mount();
      await waitFor(() => expect(result.current.status).toBe("ok"));
      expect(result.current.snapshot).toMatchObject({
        source,
        tent_id: "tent-a",
        ts: savedAt,
        temp: 25,
        rh: 55,
      });
      if (source === "manual") {
        expect(result.current.snapshot.diary_evidence_ref).toEqual({
          id: "saved-manual",
          entry_at: savedAt,
        });
      }
    },
  );

  it("selects the newest evidence across every requested tent", async () => {
    io.rows = [
      diary(),
      diary({ id: "second-selected", tent_id: "tent-c", entry_at: "2026-09-23T10:01:00.000Z" }),
      ...busyOtherTent(),
    ];
    const { result } = mount(["tent-a", "tent-c"]);
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.snapshot).toMatchObject({
      tent_id: "tent-c",
      diary_evidence_ref: { id: "second-selected" },
    });
  });

  it("does not let null attribution, another grow, or retracted rows crowd out scoped evidence", async () => {
    io.rows = [
      diary(),
      ...busyOtherTent().map((row, index) => ({
        ...row,
        tent_id: index % 3 === 0 ? null : "tent-a",
        grow_id: index % 3 === 1 ? "grow-b" : "grow-a",
        retracted_at: index % 3 === 2 ? savedAt : null,
      })),
    ];
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.snapshot.diary_evidence_ref?.id).toBe("saved-manual");
  });

  it("preserves intentional grow-wide selection for an empty tent scope", async () => {
    io.rows = [
      diary(),
      ...busyOtherTent(),
      diary({ id: "wrong-grow", grow_id: "grow-b", entry_at: "2026-09-23T12:00:00.000Z" }),
    ];
    const { result } = mount([]);
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.snapshot).toMatchObject({
      tent_id: "tent-b",
      diary_evidence_ref: { id: "other-24" },
    });
  });

  it("retains grow and tent scope on the missing-retracted-column compatibility retry", async () => {
    io.missingRetractionColumn = true;
    io.rows = [
      diary(),
      ...busyOtherTent(),
      ...busyOtherTent().map((row) => ({ ...row, grow_id: "grow-b", tent_id: "tent-a" })),
    ];
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(io.diaryReads).toBe(2);
    expect(result.current.snapshot.diary_evidence_ref?.id).toBe("saved-manual");
  });

  it("accepts the scoped manual survivor when the sensor read fails", async () => {
    io.sensorError = true;
    io.rows = [diary(), ...busyOtherTent()];
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.snapshot).toMatchObject({
      source: "manual",
      temp: 25,
      tent_id: "tent-a",
    });
  });

  it("keeps a failed diary read unavailable without a compatibility retry", async () => {
    io.rows = [diary()];
    io.diaryError = { code: "42501", message: "permission denied" };
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(io.diaryReads).toBe(1);
  });

  it("keeps a successful scoped empty read empty", async () => {
    io.rows = busyOtherTent();
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.snapshot.temp).toBeNull();
    expect(result.current.snapshot.ts).toBeNull();
  });

  it("does not call a failed sensor read plus scoped empty diary a successful empty result", async () => {
    io.sensorError = true;
    io.rows = busyOtherTent();
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });
});
