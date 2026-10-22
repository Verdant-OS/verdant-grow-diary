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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import { buildTonightTentMetrics } from "@/lib/tonightTentHomeViewModel";

type Row = Record<string, unknown>;
const io = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    from: vi.fn(),
    sensorRows: [] as Row[],
    diaryRows: [] as Row[],
    failSensor: false,
    failDiary: false,
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
              : table === "diary_entries" && state.failDiary
                ? { data: null, error: { message: "diary read failed" } }
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
  io.failDiary = false;
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
    // One timestamp for A's pair: two minutesAgo calls can straddle a
    // millisecond and split the capture into two cohorts.
    const aCapture = minutesAgo(2);
    io.sensorRows = [
      sensorRow(TENT_A, "temperature_c", 24, aCapture),
      sensorRow(TENT_A, "humidity_pct", 55, aCapture),
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

  it("gives a generic diary blob its entry id as capture identity, never as alert evidence (Codex P2 on #2303 at 0994ea2a)", async () => {
    io.diaryRows = [diaryRow(TENT_A, minutesAgo(30), 26, 60)];
    const snap = await fetchLatestSensorSnapshot(GROW, [TENT_A]);
    expect(snap).toMatchObject({ source: "diary", diary_capture_id: io.diaryRows[0].id });
    expect(snap?.diary_evidence_ref).toBeUndefined();
  });

  it("carries a quality-rejected sibling on the snapshot, in bulk and per tent alike (Codex P1 on #2303 at 0994ea2a)", async () => {
    const capture = minutesAgo(2);
    io.sensorRows = [
      sensorRow(TENT_A, "vpd_kpa", 1.2, capture),
      sensorRow(TENT_A, "temperature_c", 24, capture),
      { ...sensorRow(TENT_A, "humidity_pct", 55, capture), quality: "degraded" },
      sensorRow(TENT_B, "temperature_c", 20, capture),
      sensorRow(TENT_B, "humidity_pct", 50, capture),
    ];
    const bulk = await fetchLatestSensorSnapshotsByTent(GROW, [TENT_A, TENT_B]);
    expect(bulk[TENT_A]?.rh).toBeNull();
    expect(bulk[TENT_A]?.rejected_quality_rows).toEqual([
      {
        metric: "humidity_pct",
        value: 55,
        captured_at: capture,
        source: "live",
        quality: "degraded",
      },
    ]);
    expect(bulk[TENT_B]?.rejected_quality_rows).toBeUndefined();
    for (const tentId of [TENT_A, TENT_B]) {
      expect(bulk[tentId]).toEqual(await fetchLatestSensorSnapshot(GROW, [tentId]));
    }
  });

  it("keeps a newer rejected VPD on an older diary fallback, in bulk and per tent alike (Codex P1 on #2303 at b49c32ae)", async () => {
    const capture = minutesAgo(2);
    io.sensorRows = [
      { ...sensorRow(TENT_A, "vpd_kpa", 1.2, capture), quality: "degraded" },
      sensorRow(TENT_B, "temperature_c", 20, capture),
      sensorRow(TENT_B, "humidity_pct", 50, capture),
    ];
    io.diaryRows = [diaryRow(TENT_A, minutesAgo(30), 26, 60)];
    const bulk = await fetchLatestSensorSnapshotsByTent(GROW, [TENT_A, TENT_B]);
    expect(bulk[TENT_A]).toMatchObject({ source: "diary", temp: 26 });
    expect(bulk[TENT_A]?.rejected_quality_rows).toEqual([
      { metric: "vpd_kpa", value: 1.2, captured_at: capture, source: "live", quality: "degraded" },
    ]);
    expect(await fetchLatestSensorSnapshot(GROW, [TENT_A])).toEqual(bulk[TENT_A]);
    // With Tonight's own raw-row read failed, the older diary VPD is never shown.
    const vpd = buildTonightTentMetrics({
      rows: null,
      rowsRead: { status: "error" },
      snapshot: { status: "ok", snapshot: bulk[TENT_A] as never },
      now: new Date(),
    }).find((m) => m.key === "vpd")!;
    expect(vpd.state).not.toBe("value");
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

  it("settles every sparse tent a busy tent crowded out with one more shared window, not one read each (Codex P2 at 0994ea2a)", async () => {
    // Three tents ask for 150 rows; A has 150 newer rows and fills the window.
    io.sensorRows = [
      ...Array.from({ length: 150 }, (_, i) =>
        sensorRow(TENT_A, "temperature_c", 24, minutesAgo(1 + i * 0.01)),
      ),
      sensorRow(TENT_B, "temperature_c", 22, minutesAgo(5)),
      sensorRow(TENT_C, "temperature_c", 21, minutesAgo(6)),
    ];
    const bulk = await fetchLatestSensorSnapshotsByTent(GROW, [TENT_A, TENT_B, TENT_C]);
    expect(sensorCalls()).toBe(2);
    expect(diaryCalls()).toBe(0);
    io.from.mockClear();
    for (const tentId of [TENT_A, TENT_B, TENT_C]) {
      expect(bulk[tentId]).toEqual(await fetchLatestSensorSnapshot(GROW, [tentId]));
    }
  });

  it("does not retry failed tents one by one at the real caller (Codex P2 at 4bd3fae7)", async () => {
    threeTentFixture();
    io.failSensor = true;
    // Unlike freshClient, this client retries as an app client would.
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: 2, retryDelay: 0, staleTime: Infinity, gcTime: Infinity },
      },
    });
    clients.push(client);
    const { result } = renderHook(() => useLatestSensorSnapshotsByTent(THREE), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() =>
      expect(Object.values(result.current).map((s) => s.status)).toEqual([
        "unavailable",
        "ok",
        "unavailable",
      ]),
    );
    // Give any retry timer the chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sensorCalls()).toBe(1);
    expect(diaryCalls()).toBe(1);
  });

  it("keeps one shared diary window when the sensor read fails, marking only evidence-less tents unavailable (Codex P2 at 3d1e5800)", async () => {
    threeTentFixture();
    io.failSensor = true;
    const bulk = await fetchLatestSensorSnapshotsByTent(GROW, [TENT_A, TENT_B, TENT_C]);
    // B still has diary evidence; A and C have none and a failed sensor read.
    expect(bulk[TENT_B]).toMatchObject({ source: "diary", temp: 26 });
    expect(bulk[TENT_A]).toBeNull();
    expect(bulk[TENT_C]).toBeNull();
    // The outage is not amplified: one failed window, one diary window, no per-tent reads.
    expect(sensorCalls()).toBe(1);
    expect(diaryCalls()).toBe(1);
    await expect(fetchLatestSensorSnapshot(GROW, [TENT_A])).rejects.toThrow("unavailable");
  });

  it("never scans a tent's diary candidates past the per-tent bound (Codex P1 at 108e3eab)", async () => {
    // 11 tents make the shared diary window ask for 220 rows. Tent A has 201
    // candidates: 200 unusable, then one usable. The per-tent read examines
    // 200 and gives up; the window must not reach the 201st.
    const tents = Array.from(
      { length: 11 },
      (_, i) => `aaaaaaaa-0000-4000-8000-${String(200 + i).padStart(12, "0")}`,
    );
    const [a] = tents;
    io.diaryRows = [
      ...Array.from({ length: 200 }, (_, i) => ({
        id: uuid(++seq),
        entry_at: minutesAgo(10 + i),
        tent_id: a,
        details: { sensor_snapshot: { note: "no metric" } },
      })),
      diaryRow(a, minutesAgo(500), 26, 60),
    ];
    const bulk = await fetchLatestSensorSnapshotsByTent(GROW, tents);
    expect(bulk[a]).toBeNull();
    await expect(fetchLatestSensorSnapshot(GROW, [a])).rejects.toThrow("unavailable");
    expect(bulk[tents[1]]).toEqual(EMPTY_SNAPSHOT);
  });

  it("settles a crowded-out tent through a deeper shared diary window during a sensor outage, with no per-tent read (Codex P2 at 108e3eab, fa8edcff, 0994ea2a)", async () => {
    // Sensor read fails. Three tents need diary evidence (window of 60). Tent A
    // fills the window with unusable candidates; B's usable row is pushed out.
    io.failSensor = true;
    io.diaryRows = [
      ...Array.from({ length: 61 }, (_, i) => ({
        id: uuid(++seq),
        entry_at: minutesAgo(10 + i),
        tent_id: TENT_A,
        details: { sensor_snapshot: { note: "no metric" } },
      })),
      diaryRow(TENT_B, minutesAgo(300), 26, 60),
    ];
    const bulk = await fetchLatestSensorSnapshotsByTent(GROW, [TENT_A, TENT_B, TENT_C]);
    // One failed sensor window and two shared diary windows (the second at
    // double depth over the tents the first left unsettled); nothing per tent.
    expect(sensorCalls()).toBe(1);
    expect(diaryCalls()).toBe(2);
    // B's usable row, crowded out of the first window, is found as its own read finds it.
    expect(bulk[TENT_B]).toMatchObject({ source: "diary", temp: 26, rh: 60 });
    expect(bulk[TENT_A]).toBeNull();
    expect(bulk[TENT_C]).toBeNull();
    expect(bulk[TENT_B]).toEqual(await fetchLatestSensorSnapshot(GROW, [TENT_B]));
  });

  it("marks tents unavailable, with no per-tent reads, when the shared diary read fails", async () => {
    threeTentFixture();
    io.failDiary = true;
    const bulk = await fetchLatestSensorSnapshotsByTent(GROW, [TENT_A, TENT_B, TENT_C]);
    expect(bulk[TENT_A]).toMatchObject({ source: "live", temp: 24 });
    expect(bulk[TENT_B]).toBeNull();
    expect(bulk[TENT_C]).toBeNull();
    expect(sensorCalls()).toBe(1);
    expect(diaryCalls()).toBe(1);
    await expect(fetchLatestSensorSnapshot(GROW, [TENT_B])).rejects.toThrow("unavailable");
  });

  it("treats a window at the PostgREST row ceiling as truncated (Codex P1 at 3d1e5800)", async () => {
    // 21 tents would ask for 1,050 rows; the window asks for 1,000. Tent A fills
    // it with newer rows, so a second shared window covers the other 20.
    const tents = Array.from(
      { length: 21 },
      (_, i) => `aaaaaaaa-0000-4000-8000-${String(100 + i).padStart(12, "0")}`,
    );
    const [a, b] = tents;
    io.sensorRows = [
      ...Array.from({ length: 1000 }, (_, i) =>
        sensorRow(a, "temperature_c", 24, minutesAgo(1 + i * 0.001)),
      ),
      sensorRow(b, "temperature_c", 22, minutesAgo(5)),
    ];
    const bulk = await fetchLatestSensorSnapshotsByTent(GROW, tents);
    expect(bulk[a]).toMatchObject({ source: "live", temp: 24 });
    expect(bulk[b]).toMatchObject({ source: "live", temp: 22 });
    expect(bulk[tents[2]]).toEqual(EMPTY_SNAPSHOT);
    // Two shared sensor windows instead of one plus 20 per-tent reads (Codex P2 at 0994ea2a).
    expect(sensorCalls()).toBe(2);
    expect(bulk[b]).toEqual(await fetchLatestSensorSnapshot(GROW, [b]));
  });

  it("orders both sensor reads by a unique final key before the limit (Codex P1 at 3d1e5800)", () => {
    const source = readFileSync(resolve(__dirname, "../hooks/useLatestSensorSnapshot.ts"), "utf8");
    const sensorQueries = source.split("effectiveSensorReadingsQuery()").slice(1);
    expect(sensorQueries).toHaveLength(2);
    for (const query of sensorQueries) {
      const head = query.slice(0, query.indexOf(".limit("));
      expect(head).toMatch(
        /\.order\("created_at"[^)]*\)\s*(?:\/\/[^\n]*\n\s*)*\.order\("id", \{ ascending: false \}\)/,
      );
    }
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
