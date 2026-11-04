/**
 * #2821: the /tents tent card and the Dashboard Environment strip kept an older
 * reading after a newer Quick Log whole-tent snapshot was saved, because the
 * latest-snapshot read sees only sensor_readings and diary evidence. Quick Log
 * snapshots live on grow_events + environment_events. The newest capture wins.
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLatestSensorSnapshotsByTent } from "@/hooks/useLatestSensorSnapshot";
import { LatestSnapshotQuickLogMerge } from "@/lib/latestSnapshotQuickLogMerge";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import type { SensorReading } from "@/mock";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GROW = "11111111-1111-4111-8111-111111111111";
const TENT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const TENT_B = "aaaaaaaa-0000-4000-8000-000000000002";
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const io = vi.hoisted(() => ({
  sensorRows: [] as Record<string, unknown>[],
  growEvents: [] as Record<string, unknown>[],
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: OWNER } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let rows: Record<string, unknown>[] =
        table === "sensor_readings_effective"
          ? io.sensorRows
          : table === "grow_events"
            ? io.growEvents
            : [];
      const b = {
        select: () => b,
        order: () => b,
        is: () => b,
        or: () => b,
        limit: () => b,
        eq: (column: string, value: unknown) => {
          rows = rows.filter((row) => !(column in row) || row[column] === value);
          return b;
        },
        in: (column: string, ids: string[]) => {
          rows = rows.filter((row) => ids.includes(row[column] as string));
          return b;
        },
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(ok, bad),
      };
      return b;
    },
  },
}));

let seq = 0;
const sensorRow = (tentId: string, metric: string, value: number, iso: string) => ({
  id: `bbbbbbbb-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  user_id: OWNER,
  tent_id: tentId,
  grow_id: GROW,
  metric,
  value,
  // A manual-source row stays "fresh" for 24h, so it used to win outright.
  source: "manual",
  quality: "ok",
  ts: iso,
  captured_at: iso,
  created_at: iso,
  device_id: null,
  raw_payload: null,
  correction_valid: true,
});
const quickLogEvent = (tentId: string, iso: string, t: number, rh: number, vpd: number) => ({
  id: `cccccccc-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  plant_id: null,
  tent_id: tentId,
  occurred_at: iso,
  event_type: "environment",
  source: "manual",
  is_deleted: false,
  environment_events: [{ temperature_c: t, humidity_pct: rh, vpd_kpa: vpd }],
});

const manual = (
  tentId: string,
  iso: string,
  temp: number,
  rh: number,
  vpd: number,
): SensorReading =>
  ({
    ts: iso,
    capturedAt: iso,
    tentId,
    temp,
    rh,
    vpd,
    co2: 0,
    soil: 0,
    source: "manual",
    status: "ok",
    observedMetrics: ["temp", "rh", "vpd"],
  }) as unknown as SensorReading;

const base = (ts: string | null, temp: number | null = 22.2): SensorSnapshot => ({
  ...EMPTY_SNAPSHOT,
  source: "manual",
  ts,
  temp,
  rh: 60,
  vpd: 1.07,
  tent_id: TENT_A,
});

describe("LatestSnapshotQuickLogMerge (pure)", () => {
  it("a strictly newer Quick Log snapshot replaces the older base, as manual", () => {
    const merged = LatestSnapshotQuickLogMerge.merge(
      base(minutesAgo(600)),
      [manual(TENT_A, minutesAgo(5), 23.9, 54, 1.36)],
      [TENT_A],
    );
    expect(merged).toMatchObject({
      source: "manual",
      temp: 23.9,
      rh: 54,
      vpd: 1.36,
      tent_id: TENT_A,
      alert_persistence_eligible: false,
    });
    expect(merged.ts).not.toBe(base(minutesAgo(600)).ts);
  });

  it("keeps the base when the sensor capture is newer, or on a tie", () => {
    const at = minutesAgo(5);
    const newer = base(minutesAgo(1));
    expect(
      LatestSnapshotQuickLogMerge.merge(newer, [manual(TENT_A, at, 23.9, 54, 1.36)], [TENT_A]),
    ).toBe(newer);
    const tie = base(at);
    expect(
      LatestSnapshotQuickLogMerge.merge(tie, [manual(TENT_A, at, 23.9, 54, 1.36)], [TENT_A]),
    ).toBe(tie);
  });

  it("never lets a future-dated Quick Log capture win over a valid reading", () => {
    const nowMs = Date.parse("2026-11-03T22:00:00.000Z");
    const valid = base(new Date(nowMs - 60 * 60_000).toISOString());
    const tol = LatestSnapshotQuickLogMerge.FUTURE_SKEW_TOLERANCE_MS;
    const farFuture = new Date(nowMs + 24 * 60 * 60_000).toISOString();
    const justPastSkew = new Date(nowMs + tol + 1_000).toISOString();
    for (const at of [farFuture, justPastSkew]) {
      expect(
        LatestSnapshotQuickLogMerge.merge(
          valid,
          [manual(TENT_A, at, 30, 40, 2.5)],
          [TENT_A],
          nowMs,
        ),
      ).toBe(valid);
    }
    // Within the skew tolerance a slightly-ahead capture still counts as newest.
    const withinSkew = new Date(nowMs + tol - 1_000).toISOString();
    expect(
      LatestSnapshotQuickLogMerge.merge(
        valid,
        [manual(TENT_A, withinSkew, 23.9, 54, 1.36)],
        [TENT_A],
        nowMs,
      ),
    ).toMatchObject({ source: "manual", temp: 23.9 });
    // A future-dated capture beside a valid one: the valid one is used.
    expect(
      LatestSnapshotQuickLogMerge.merge(
        valid,
        [
          manual(TENT_A, farFuture, 30, 40, 2.5),
          manual(TENT_A, new Date(nowMs - 60_000).toISOString(), 23.9, 54, 1.36),
        ],
        [TENT_A],
        nowMs,
      ),
    ).toMatchObject({ source: "manual", temp: 23.9 });
  });

  it("uses the Quick Log snapshot when the base is empty or untimed", () => {
    const m = [manual(TENT_A, minutesAgo(5), 23.9, 54, 1.36)];
    expect(LatestSnapshotQuickLogMerge.merge(EMPTY_SNAPSHOT, m, [TENT_A]).temp).toBe(23.9);
    expect(LatestSnapshotQuickLogMerge.merge(base(null), m, [TENT_A]).temp).toBe(23.9);
  });

  it("picks the newest of several by capture time, whatever the input order", () => {
    const merged = LatestSnapshotQuickLogMerge.newestSnapshot(
      [
        manual(TENT_A, minutesAgo(5), 20, 50, 1),
        manual(TENT_A, minutesAgo(60), 30, 70, 2),
        manual(TENT_A, minutesAgo(1), 25, 55, 1.2),
      ],
      [TENT_A],
    );
    expect(merged?.temp).toBe(25);
  });

  it("ignores another tent, an empty scope, non-manual and untimed readings", () => {
    const m = manual(TENT_B, minutesAgo(1), 25, 55, 1.2);
    const b = base(minutesAgo(600));
    expect(LatestSnapshotQuickLogMerge.merge(b, [m], [TENT_A])).toBe(b);
    expect(LatestSnapshotQuickLogMerge.merge(b, [manual(TENT_A, minutesAgo(1), 1, 1, 1)], [])).toBe(
      b,
    );
    expect(
      LatestSnapshotQuickLogMerge.merge(
        b,
        [{ ...m, tentId: TENT_A, source: "live" } as SensorReading],
        [TENT_A],
      ),
    ).toBe(b);
    expect(
      LatestSnapshotQuickLogMerge.merge(b, [manual(TENT_A, "not a date", 1, 1, 1)], [TENT_A]),
    ).toBe(b);
    expect(LatestSnapshotQuickLogMerge.merge(b, null, [TENT_A])).toBe(b);
  });

  it("never invents a metric the Quick Log save did not observe", () => {
    const tempOnly = {
      ...manual(TENT_A, minutesAgo(1), 24, 0, 0),
      observedMetrics: ["temp"],
    } as unknown as SensorReading;
    const merged = LatestSnapshotQuickLogMerge.merge(base(minutesAgo(600)), [tempOnly], [TENT_A]);
    expect(merged).toMatchObject({ temp: 24, rh: null, vpd: null });
  });
});

describe("useLatestSensorSnapshotsByTent merges Quick Log snapshots (#2821)", () => {
  afterEach(() => {
    cleanup();
    io.sensorRows = [];
    io.growEvents = [];
  });
  const render = (tents: { tentId: string; growId: string | null }[]) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    return renderHook(() => useLatestSensorSnapshotsByTent(tents), { wrapper });
  };

  it("shows the newer Quick Log snapshot over an older, still-fresh manual sensor row", async () => {
    const old = minutesAgo(18 * 60);
    io.sensorRows = [
      sensorRow(TENT_A, "temperature_c", 22.2, old),
      sensorRow(TENT_A, "humidity_pct", 60, old),
    ];
    const at = minutesAgo(10);
    io.growEvents = [quickLogEvent(TENT_A, at, 23.9, 54, 1.36)];
    const { result } = render([{ tentId: TENT_A, growId: GROW }]);
    await waitFor(() => expect(result.current[TENT_A].snapshot.temp).toBe(23.9));
    expect(result.current[TENT_A].snapshot).toMatchObject({ rh: 54, vpd: 1.36, source: "manual" });
    expect(Date.parse(result.current[TENT_A].snapshot.ts as string)).toBe(Date.parse(at));
  });

  it("keeps the sensor snapshot when it is newer than the Quick Log one", async () => {
    const recent = minutesAgo(2);
    io.sensorRows = [
      sensorRow(TENT_A, "temperature_c", 22.2, recent),
      sensorRow(TENT_A, "humidity_pct", 60, recent),
    ];
    io.growEvents = [quickLogEvent(TENT_A, minutesAgo(300), 23.9, 54, 1.36)];
    const { result } = render([{ tentId: TENT_A, growId: GROW }]);
    await waitFor(() => expect(result.current[TENT_A].status).toBe("ok"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current[TENT_A].snapshot.temp).toBe(22.2);
  });
});
