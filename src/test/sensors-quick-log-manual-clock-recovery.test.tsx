import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSensorsQuickLogManualReadings } from "@/hooks/useSensorsQuickLogManualReadings";

const io = vi.hoisted(() => ({
  userId: "owner-a" as string | null,
  read: vi.fn(),
}));
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: io.userId ? { id: io.userId } : null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: () => query,
        limit: () => query,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve()
            .then(() => io.read(table))
            .then(resolve, reject),
      };
      return query;
    },
  },
}));

const TENT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENT = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-09-24T12:00:00.000Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const sources = ["grow_events", "diary_entries"] as const;
type Source = (typeof sources)[number];
const clients: QueryClient[] = [];
const ok = (data: unknown[] = []) => ({ data, error: null });

function rowFor(source: Source, capturedAt: string, invalidMetrics = false) {
  return source === "grow_events"
    ? {
        id: "event-a",
        tent_id: TENT,
        event_type: "environment",
        source: "manual",
        is_deleted: false,
        occurred_at: capturedAt,
        environment_events: {
          temperature_c: invalidMetrics ? 999 : 25,
          humidity_pct: invalidMetrics ? 999 : 55,
          vpd_kpa: null,
        },
      }
    : {
        id: "diary-a",
        tent_id: TENT,
        entry_at: capturedAt,
        details: {
          manual_sensor_snapshot: {
            source: "manual",
            temp_f: invalidMetrics ? 999 : 77,
            humidity_percent: invalidMetrics ? 999 : 55,
          },
        },
      };
}

function seed(source: Source, capturedAt: string, invalidMetrics = false) {
  const row = rowFor(source, capturedAt, invalidMetrics);
  const before = structuredClone(row);
  io.read.mockImplementation((table) => ok(table === source ? [row] : []));
  return { row, before };
}

function mount(tent: string | null = TENT) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    ...renderHook(({ selectedTent }) => useSensorsQuickLogManualReadings(selectedTent), {
      initialProps: { selectedTent: tent },
      wrapper,
    }),
    client,
  };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  io.userId = "owner-a";
  io.read.mockReset().mockImplementation(() => ok());
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
});

describe("Quick Log manual projection follows the clock without another read", () => {
  it.each(sources)("recovers future %s at the allowed skew boundary", async (source) => {
    const capturedAt = new Date(NOW + 10 * MINUTE).toISOString();
    const { row, before } = seed(source, capturedAt);
    const { result, client } = mount();
    await advance(1);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data[0]?.status).toBe("invalid");
    const cache = client.getQueriesData({ queryKey: ["grow_events", "sensors-ql-manuals"] });
    const cacheBefore = structuredClone(cache);
    const readingBefore = structuredClone(result.current.data[0]);
    expect(io.read).toHaveBeenCalledTimes(2);

    await advance(5 * MINUTE - 2);
    expect(result.current.data[0]?.status).toBe("invalid");
    await advance(1);
    expect(result.current.data[0]).toEqual({ ...readingBefore, status: "usable" });
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(io.read).toHaveBeenCalledTimes(2);
    expect(client.getQueriesData({ queryKey: ["grow_events", "sensors-ql-manuals"] })).toEqual(
      cacheBefore,
    );
    expect(row).toEqual(before);
  });

  it.each(sources)("ages cached %s after the manual window without refetching", async (source) => {
    const capturedAt = new Date(NOW - DAY + MINUTE).toISOString();
    seed(source, capturedAt);
    const { result } = mount();
    await advance(1);
    const readingBefore = structuredClone(result.current.data[0]);
    expect(readingBefore.status).toBe("usable");
    await advance(MINUTE - 1);
    expect(result.current.data[0]?.status).toBe("usable");
    await advance(MINUTE);
    expect(result.current.data[0]).toEqual({ ...readingBefore, status: "stale" });
    expect(result.current.data[0]?.source).toBe("manual");
    expect(io.read).toHaveBeenCalledTimes(2);
  });

  it.each(sources)("rechecks %s if the clock moves backwards", async (source) => {
    const capturedAt = new Date(NOW).toISOString();
    seed(source, capturedAt);
    const { result } = mount();
    await advance(1);
    expect(result.current.data[0]?.status).toBe("usable");
    vi.setSystemTime(NOW - 10 * MINUTE);
    await advance(MINUTE);
    expect(result.current.data[0]?.status).toBe("invalid");
    vi.setSystemTime(NOW);
    await advance(MINUTE);
    expect(result.current.data[0]?.status).toBe("usable");
    expect(io.read).toHaveBeenCalledTimes(2);
  });

  it.each(sources)("does not promote invalid %s values as time passes", async (source) => {
    seed(source, new Date(NOW + 10 * MINUTE).toISOString(), true);
    const { result } = mount();
    await advance(1);
    expect(result.current.data).toEqual([]);
    await advance(6 * MINUTE);
    expect(result.current.data).toEqual([]);
    expect(result.current.isSuccess).toBe(true);
    expect(io.read).toHaveBeenCalledTimes(2);
  });

  it.each(sources)(
    "ages the surviving %s cache without clearing failed-read state",
    async (source) => {
      seed(source, new Date(NOW + 10 * MINUTE).toISOString());
      const { result } = mount();
      await advance(1);
      expect(result.current.data[0]?.status).toBe("invalid");
      io.read.mockResolvedValue({ data: null, error: { message: "read unavailable" } });
      await act(async () => {
        await result.current.refetch();
      });
      await advance(1);
      expect(result.current.isError).toBe(true);
      expect(result.current.isSuccess).toBe(false);
      expect(io.read).toHaveBeenCalledTimes(4);
      await advance(6 * MINUTE);
      expect(result.current.data[0]?.status).toBe("usable");
      expect(result.current.isError).toBe(true);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
      expect(io.read).toHaveBeenCalledTimes(4);
    },
  );

  it.each(["owner", "tent"] as const)(
    "does not revive prior cached rows after the %s changes",
    async (changed) => {
      seed("grow_events", new Date(NOW + 10 * MINUTE).toISOString());
      const { result, rerender } = mount();
      await advance(1);
      expect(result.current.data).toHaveLength(1);
      io.read.mockImplementation(() => ok());
      if (changed === "owner") io.userId = "owner-b";
      rerender({ selectedTent: changed === "tent" ? OTHER_TENT : TENT });
      await advance(1);
      expect(result.current.data).toEqual([]);
      await advance(6 * MINUTE);
      expect(result.current.data).toEqual([]);
      expect(io.read).toHaveBeenCalledTimes(4);
    },
  );

  it.each([null, "invalid"])(
    "does not read a disabled tent %j when the clock ticks",
    async (tent) => {
      const { result } = mount(tent);
      await advance(6 * MINUTE);
      expect(result.current.data).toEqual([]);
      expect(io.read).not.toHaveBeenCalled();
    },
  );

  it("keeps signed-out history empty and removes its timer on unmount", async () => {
    io.userId = null;
    const { result, unmount, client } = mount();
    await advance(6 * MINUTE);
    expect(result.current.data).toEqual([]);
    expect(io.read).not.toHaveBeenCalled();
    unmount();
    client.clear();
    expect(vi.getTimerCount()).toBe(0);
  });
});
