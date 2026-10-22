/**
 * `useLatestSensorSnapshotsByTent` (Codex P2 on #2303 at 0c19a9e0 and d6ef3a20):
 * the tents list reads every tent's Dashboard snapshot at page level. Each
 * tent's entry is the same cache entry `useLatestSensorSnapshot(growId, [tentId])`
 * uses, so the Dashboard, Tent Detail and the list never read twice for one
 * tent; a cold load coalesces the uncached tents into one sensor window and one
 * diary window per grow, with the per-tent read's exact semantics; a tent
 * without a grow is idle and never queried.
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSnapshotBatcher,
  fetchLatestSensorSnapshot,
  fetchLatestSensorSnapshotsByTent,
  latestSensorSnapshotQueryKey,
  useLatestSensorSnapshot,
  useLatestSensorSnapshotsByTent,
} from "@/hooks/useLatestSensorSnapshot";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";

type Row = Record<string, unknown>;
const io = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    from: vi.fn(),
    sensorRows: [] as Row[],
    diaryRows: [] as Row[],
    failSensor: false,
    // A chainable, thenable PostgREST stand-in: fixtures are pre-sorted newest
    // first; `.in` filters by the named column and `.limit` slices.
    builder(table: string) {
      let rows: Row[] =
        table === "sensor_readings_effective"
          ? state.sensorRows
          : table === "diary_entries"
            ? state.diaryRows
            : [];
      let limit = Number.POSITIVE_INFINITY;
      const b = {
        select: () => b,
        order: () => b,
        is: () => b,
        eq: () => b,
        or: () => b,
        in: (column: string, ids: string[]) => {
          rows = rows.filter((row) => ids.includes(row[column] as string));
          return b;
        },
        limit: (n: number) => {
          limit = n;
          return b;
        },
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(
            table === "sensor_readings_effective" && state.failSensor
              ? { data: null, error: { message: "sensor read failed" } }
              : { data: rows.slice(0, limit), error: null },
          ).then(onFulfilled, onRejected),
      };
      return b;
    },
  };
  return state;
});
vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      io.from(table);
      return io.builder(table);
    },
  },
}));

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GROW = "11111111-1111-4111-8111-111111111111";
const TENT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const TENT_B = "aaaaaaaa-0000-4000-8000-000000000002";
const TENT_C = "aaaaaaaa-0000-4000-8000-000000000003";
const uuid = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`;
let seq = 0;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
/** A row that passes requireEffectiveSensorReadings and the Dashboard evidence fence. */
const sensorRow = (tentId: string, metric: string, value: number, iso: string): Row => ({
  id: uuid(++seq),
  user_id: OWNER,
  tent_id: tentId,
  grow_id: GROW,
  metric,
  value,
  source: "live",
  quality: "ok",
  ts: iso,
  captured_at: iso,
  created_at: iso,
  device_id: null,
  raw_payload: null,
  correction_valid: true,
});
const diaryRow = (tentId: string, iso: string, temp: number, rh: number): Row => ({
  id: uuid(++seq),
  entry_at: iso,
  tent_id: tentId,
  details: { sensor_snapshot: { temp, rh } },
});
const sensorCalls = () =>
  io.from.mock.calls.filter(([table]) => table === "sensor_readings_effective").length;
const diaryCalls = () => io.from.mock.calls.filter(([table]) => table === "diary_entries").length;

function snapshotFor(tentId: string, temp: number): SensorSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    source: "manual",
    ts: "2026-10-22T02:00:00.000Z",
    temp,
    tent_id: tentId,
  };
}

const clients: QueryClient[] = [];
function freshClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  clients.push(client);
  return client;
}
function seededClient(): QueryClient {
  // Fresh forever, so a seeded entry is served from cache and nothing fetches.
  const client = freshClient();
  client.setQueryData(latestSensorSnapshotQueryKey(OWNER, GROW, [TENT_A]), snapshotFor(TENT_A, 21));
  client.setQueryData(latestSensorSnapshotQueryKey(OWNER, GROW, [TENT_B]), snapshotFor(TENT_B, 25));
  return client;
}
const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };

beforeEach(() => {
  io.sensorRows = [];
  io.diaryRows = [];
  io.failSensor = false;
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  io.from.mockClear();
});

describe("useLatestSensorSnapshotsByTent (warm cache)", () => {
  it("returns one state per tent from the per-tent cache entries, with no extra read", () => {
    const client = seededClient();
    const { result } = renderHook(
      () =>
        useLatestSensorSnapshotsByTent([
          { tentId: TENT_A, growId: GROW },
          { tentId: TENT_B, growId: GROW },
        ]),
      { wrapper: wrapperFor(client) },
    );
    expect(result.current[TENT_A]).toMatchObject({ status: "ok", snapshot: { temp: 21 } });
    expect(result.current[TENT_B]).toMatchObject({ status: "ok", snapshot: { temp: 25 } });
    expect(io.from).not.toHaveBeenCalled();
  });

  it("shares each tent's cache entry with useLatestSensorSnapshot", () => {
    const client = seededClient();
    const wrapper = wrapperFor(client);
    const page = renderHook(
      () => useLatestSensorSnapshotsByTent([{ tentId: TENT_A, growId: GROW }]),
      { wrapper },
    );
    const single = renderHook(() => useLatestSensorSnapshot(GROW, [TENT_A]), { wrapper });
    expect(page.result.current[TENT_A].snapshot).toBe(single.result.current.snapshot);
    expect(io.from).not.toHaveBeenCalled();
  });

  it("is idle for a tent without a grow and never queries it", () => {
    const client = seededClient();
    const { result } = renderHook(
      () =>
        useLatestSensorSnapshotsByTent([
          { tentId: TENT_C, growId: null },
          { tentId: TENT_A, growId: GROW },
        ]),
      { wrapper: wrapperFor(client) },
    );
    expect(result.current[TENT_C]).toMatchObject({ status: "idle", snapshot: EMPTY_SNAPSHOT });
    expect(result.current[TENT_A].status).toBe("ok");
    expect(io.from).not.toHaveBeenCalled();
  });

  it("returns an empty record for no tents", () => {
    const client = seededClient();
    const { result } = renderHook(() => useLatestSensorSnapshotsByTent([]), {
      wrapper: wrapperFor(client),
    });
    expect(result.current).toEqual({});
  });
});

describe("useLatestSensorSnapshotsByTent (cold load, Codex P2 at d6ef3a20)", () => {
  // A: fresh live pair. B: a stale live row plus a newer diary capture. C: nothing.
  function threeTentFixture() {
    io.sensorRows = [
      sensorRow(TENT_A, "temperature_c", 24, minutesAgo(2)),
      sensorRow(TENT_A, "humidity_pct", 55, minutesAgo(2)),
      sensorRow(TENT_B, "temperature_c", 20, minutesAgo(180)),
    ];
    io.diaryRows = [diaryRow(TENT_B, minutesAgo(30), 26, 60)];
  }
  const THREE = [
    { tentId: TENT_A, growId: GROW },
    { tentId: TENT_B, growId: GROW },
    { tentId: TENT_C, growId: GROW },
  ];

  it("reads one sensor window and one diary window for three uncached tents", async () => {
    threeTentFixture();
    const client = freshClient();
    const { result } = renderHook(() => useLatestSensorSnapshotsByTent(THREE), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() =>
      expect(Object.values(result.current).map((s) => s.status)).toEqual(["ok", "ok", "ok"]),
    );
    expect(sensorCalls()).toBe(1);
    expect(diaryCalls()).toBe(1);
    expect(result.current[TENT_A].snapshot).toMatchObject({ source: "live", temp: 24, rh: 55 });
    expect(result.current[TENT_B].snapshot).toMatchObject({ source: "diary", temp: 26, rh: 60 });
    expect(result.current[TENT_C].snapshot).toEqual(EMPTY_SNAPSHOT);
  });

  it("gives every tent exactly what its own per-tent read gives on the same data", async () => {
    threeTentFixture();
    const bulk = await fetchLatestSensorSnapshotsByTent(GROW, [TENT_A, TENT_B, TENT_C]);
    for (const tentId of [TENT_A, TENT_B, TENT_C]) {
      expect(bulk[tentId]).toEqual(await fetchLatestSensorSnapshot(GROW, [tentId]));
    }
  });

  it("fills the per-tent cache entries the Dashboard and Tent Detail read", async () => {
    threeTentFixture();
    const client = freshClient();
    const wrapper = wrapperFor(client);
    const page = renderHook(() => useLatestSensorSnapshotsByTent(THREE), { wrapper });
    await waitFor(() => expect(page.result.current[TENT_B].status).toBe("ok"));
    const single = renderHook(() => useLatestSensorSnapshot(GROW, [TENT_B]), { wrapper });
    expect(single.result.current.status).toBe("ok");
    expect(single.result.current.snapshot).toBe(page.result.current[TENT_B].snapshot);
    expect(sensorCalls()).toBe(1);
    expect(diaryCalls()).toBe(1);
  });

  it("falls back to a per-tent read only for a tent a full window cut short", async () => {
    // Two tents: the window holds 100 rows. A has 100 newer rows, so B's single
    // row never makes the window; B alone is read again.
    io.sensorRows = [
      ...Array.from({ length: 100 }, (_, i) =>
        sensorRow(TENT_A, "temperature_c", 24, minutesAgo(1 + i * 0.01)),
      ),
      sensorRow(TENT_B, "temperature_c", 22, minutesAgo(5)),
    ];
    const bulk = await fetchLatestSensorSnapshotsByTent(GROW, [TENT_A, TENT_B]);
    expect(sensorCalls()).toBe(2);
    expect(bulk[TENT_A]).toMatchObject({ source: "live", temp: 24 });
    expect(bulk[TENT_B]).toMatchObject({ source: "live", temp: 22 });
    expect(bulk[TENT_B]).toEqual(await fetchLatestSensorSnapshot(GROW, [TENT_B]));
  });

  it("marks only the tents whose own read fails unavailable", async () => {
    threeTentFixture();
    io.failSensor = true;
    const bulk = await fetchLatestSensorSnapshotsByTent(GROW, [TENT_A, TENT_B]);
    // B still has diary evidence; A has no evidence and a failed sensor read.
    expect(bulk[TENT_B]).toMatchObject({ source: "diary", temp: 26 });
    expect(bulk[TENT_A]).toBeNull();
    await expect(fetchLatestSensorSnapshot(GROW, [TENT_A])).rejects.toThrow("unavailable");
  });
});

describe("createSnapshotBatcher", () => {
  it("coalesces loads issued in one tick into one bulk read per grow", async () => {
    const fetchBulk = vi.fn(
      async (_growId: string | null | undefined, tentIds: readonly string[]) =>
        Object.fromEntries(tentIds.map((id) => [id, snapshotFor(id, 20)])),
    );
    const batcher = createSnapshotBatcher(fetchBulk);
    const [a, b, other] = await Promise.all([
      batcher.load(GROW, TENT_A),
      batcher.load(GROW, TENT_B),
      batcher.load("22222222-2222-4222-8222-222222222222", TENT_C),
    ]);
    expect(fetchBulk).toHaveBeenCalledTimes(2);
    expect(fetchBulk.mock.calls[0]).toEqual([GROW, [TENT_A, TENT_B]]);
    expect(a.tent_id).toBe(TENT_A);
    expect(b.tent_id).toBe(TENT_B);
    expect(other.tent_id).toBe(TENT_C);
    // The next tick starts a new batch.
    await batcher.load(GROW, TENT_A);
    expect(fetchBulk).toHaveBeenCalledTimes(3);
  });

  it("rejects a tent the bulk read marked unavailable, leaving the others resolved", async () => {
    const batcher = createSnapshotBatcher(async () => ({
      [TENT_A]: snapshotFor(TENT_A, 20),
      [TENT_B]: null,
    }));
    const [a, b] = await Promise.allSettled([
      batcher.load(GROW, TENT_A),
      batcher.load(GROW, TENT_B),
    ]);
    expect(a.status).toBe("fulfilled");
    expect(b).toMatchObject({ status: "rejected", reason: new Error("unavailable") });
  });
});
