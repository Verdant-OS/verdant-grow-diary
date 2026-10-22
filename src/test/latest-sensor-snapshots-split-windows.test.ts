/**
 * Codex P2s on #2303 at 4a304fe3: a capped shared window that settles no tent
 * is split in half instead of fanning out to one read per tent (sensor), or
 * giving up (diary). Bulk and per-tent reads stay equivalent.
 */
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchLatestSensorSnapshot,
  fetchLatestSensorSnapshotsByTent,
} from "@/hooks/useLatestSensorSnapshot";

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

beforeEach(() => {
  io.sensorRows = [];
  io.diaryRows = [];
  io.failSensor = false;
  io.failDiary = false;
});
afterEach(() => {
  cleanup();
  io.from.mockClear();
});

const tentIds = (n: number, base: number) =>
  Array.from(
    { length: n },
    (_, i) => `aaaaaaaa-0000-4000-8000-${String(base + i).padStart(12, "0")}`,
  );

describe("capped shared windows split instead of fanning out", () => {
  it("settles 21 evenly busy tents with split sensor windows, not 21 per-tent reads", async () => {
    // 21 tents × 49 interleaved rows: the 1,000-row window leaves every tent
    // below the 50-row exactness threshold, so no tent settles.
    const tents = tentIds(21, 200);
    io.sensorRows = Array.from({ length: 49 }, (_, round) =>
      tents.map((tent, t) =>
        sensorRow(tent, "temperature_c", 20 + t / 10, minutesAgo(1 + round * 0.05 + t * 0.001)),
      ),
    ).flat();
    const bulk = await fetchLatestSensorSnapshotsByTent(GROW, tents);
    expect(sensorCalls()).toBe(3);
    for (const tent of tents) expect(bulk[tent]).toMatchObject({ source: "live" });
    expect(bulk[tents[7]]).toEqual(await fetchLatestSensorSnapshot(GROW, [tents[7]]));
  });

  it("finds each tent's diary snapshot past the shared ceiling during a sensor outage", async () => {
    // Six tents, each with 179 unusable candidates before its usable snapshot:
    // the deepest shared window (capped at 999 rows) shows each ~166.
    io.failSensor = true;
    const tents = tentIds(6, 300);
    const rows: Record<string, unknown>[] = [];
    for (let round = 0; round < 180; round++) {
      tents.forEach((tent, t) => {
        const iso = minutesAgo(10 + round + t * 0.01);
        rows.push(
          round < 179
            ? {
                id: uuid(++seq),
                entry_at: iso,
                tent_id: tent,
                details: { sensor_snapshot: { note: "no metric" } },
              }
            : diaryRow(tent, iso, 20 + t, 55),
        );
      });
    }
    io.diaryRows = rows;
    const bulk = await fetchLatestSensorSnapshotsByTent(GROW, tents);
    tents.forEach((tent, t) =>
      expect(bulk[tent]).toMatchObject({ source: "diary", temp: 20 + t, rh: 55 }),
    );
    expect(bulk[tents[2]]).toEqual(await fetchLatestSensorSnapshot(GROW, [tents[2]]));
  });
});
