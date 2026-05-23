/**
 * Pure helpers for the Tent Detail real sensor chart + chips.
 *
 * Read-only, deterministic. No I/O, no React. Maps raw sensor_readings
 * rows (scoped to a single tent by the caller) into a chart-ready time
 * series and a latest snapshot view. No invented values: missing metrics
 * stay absent.
 */
import {
  snapshotFromReadings,
  isStale,
  SOURCE_LABEL,
  toFiniteNumber,
  type SensorReadingLike,
  type SensorSnapshot,
} from "@/lib/sensorSnapshot";

export interface TentSensorChartPoint {
  ts: string;
  temp: number | null;
  rh: number | null;
  vpd: number | null;
  co2: number | null;
  soil: number | null;
}

const METRIC_KEY: Record<string, keyof Omit<TentSensorChartPoint, "ts">> = {
  temperature_c: "temp",
  humidity_pct: "rh",
  vpd_kpa: "vpd",
  co2_ppm: "co2",
  soil_moisture_pct: "soil",
};

/**
 * Group rows by timestamp into chart points, sorted ascending by ts.
 * Unknown metrics are ignored. Returns [] for empty/null input.
 */
export function buildTentSensorChartSeries(
  rows: SensorReadingLike[] | null | undefined,
): TentSensorChartPoint[] {
  if (!rows || rows.length === 0) return [];
  const byTs = new Map<string, TentSensorChartPoint>();
  for (const r of rows) {
    const key = METRIC_KEY[r.metric];
    if (!key) continue;
    const v = toFiniteNumber(r.value);
    if (v === null) continue;
    let pt = byTs.get(r.ts);
    if (!pt) {
      pt = { ts: r.ts, temp: null, rh: null, vpd: null, co2: null, soil: null };
      byTs.set(r.ts, pt);
    }
    pt[key] = v;
  }
  return Array.from(byTs.values()).sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );
}

export interface TentSensorHeaderView {
  hasReadings: boolean;
  capturedAt: string | null;
  sourceLabel: string | null;
  stale: boolean;
  snapshot: SensorSnapshot | null;
}

export function buildTentSensorHeaderView(
  rows: SensorReadingLike[] | null | undefined,
  now: number = Date.now(),
): TentSensorHeaderView {
  if (!rows || rows.length === 0) {
    return { hasReadings: false, capturedAt: null, sourceLabel: null, stale: false, snapshot: null };
  }
  const snap = snapshotFromReadings(rows);
  if (!snap) {
    return { hasReadings: false, capturedAt: null, sourceLabel: null, stale: false, snapshot: null };
  }
  return {
    hasReadings: true,
    capturedAt: snap.ts,
    sourceLabel: SOURCE_LABEL[snap.source] ?? null,
    stale: isStale(snap.ts, now),
    snapshot: snap,
  };
}
