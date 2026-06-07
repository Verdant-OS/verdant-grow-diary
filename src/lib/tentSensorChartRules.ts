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
  toFiniteNumber,
  type SensorReadingLike,
  type SensorSnapshot,
} from "@/lib/sensorSnapshot";
import { formatSensorSourceLabel } from "@/lib/manualSensorSourceLabel";
import {
  classifyManualMetric,
  classifySnapshotTruth,
  type SensorTruthAssessment,
} from "@/lib/sensorTruthRules";




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
 *
 * Truth filtering (presentation-side only):
 *   - per-metric realism guards null out impossible values so the chart
 *     never plots impossible spikes;
 *   - if temp or rh at a given ts is invalid, the derived vpd at that ts
 *     is also nulled (matches the snapshot-level VPD dependency rule).
 *
 * Unknown metrics are ignored. Returns [] for empty/null input. Never
 * upgrades, rewrites, or invents source labels.
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
    // Per-metric realism guard. Invalid → leave field null so the chart
    // line breaks instead of spiking.
    const truth = classifyManualMetric(r.metric, v);
    if (!truth.valid) continue;
    pt[key] = v;
  }
  // VPD depends on temp + rh — null out vpd at any ts where either input
  // is missing/invalid for that same point.
  for (const pt of byTs.values()) {
    if (pt.vpd !== null && (pt.temp === null || pt.rh === null)) {
      pt.vpd = null;
    }
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
  /**
   * Truth-filtered snapshot: fields that failed grow-room realism guards
   * are nulled. Use this for headers, KPIs and gauges. The raw,
   * unfiltered snapshot is intentionally not exposed — invalid values
   * must not appear as healthy numerics on user-facing surfaces.
   */
  snapshot: SensorSnapshot | null;
  /** Per-field invalid/suspicious classification and short reason chips. */
  truth: SensorTruthAssessment | null;
}

export function buildTentSensorHeaderView(
  rows: SensorReadingLike[] | null | undefined,
  now: number = Date.now(),
): TentSensorHeaderView {
  if (!rows || rows.length === 0) {
    return { hasReadings: false, capturedAt: null, sourceLabel: null, stale: false, snapshot: null, truth: null };
  }
  const snap = snapshotFromReadings(rows);
  if (!snap) {
    return { hasReadings: false, capturedAt: null, sourceLabel: null, stale: false, snapshot: null, truth: null };
  }
  const truth = classifySnapshotTruth(snap, now);
  return {
    hasReadings: true,
    capturedAt: snap.ts,
    sourceLabel: formatSensorSourceLabel({
      source: snap.source,
      deviceId: snap.device_id ?? null,
    }),
    stale: isStale(snap.ts, now),
    snapshot: truth.snapshot,
    truth,
  };
}
