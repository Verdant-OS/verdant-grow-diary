/**
 * Pure helpers for the scoped Dashboard "Environment Trends" card.
 *
 * No I/O, no Supabase, no React. Computes simple aggregates over a list of
 * normalized environment samples. Strictly read-only. Not AI. Not advisory.
 */

import type { SnapshotSource } from "@/lib/sensorSnapshot";
import { toFiniteNumber } from "@/lib/sensorSnapshot";

export interface EnvironmentSample {
  ts: string;
  temp: number | null;
  rh: number | null;
  vpd: number | null;
  source: SnapshotSource;
}

export type TrendStatus = "ok" | "limited" | "empty";

export const TREND_HEADLINE: Record<TrendStatus, string> = {
  ok: "Trend data available",
  limited: "Trend data limited",
  empty: "No trend data yet",
};

export interface TrendStat {
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export interface EnvironmentTrends {
  status: TrendStatus;
  headline: string;
  count: number;
  latestTs: string | null;
  source: SnapshotSource;
  temp: TrendStat;
  rh: TrendStat;
  vpd: TrendStat;
}

const EMPTY_STAT: TrendStat = { avg: null, min: null, max: null, count: 0 };

export const EMPTY_TRENDS: EnvironmentTrends = {
  status: "empty",
  headline: TREND_HEADLINE.empty,
  count: 0,
  latestTs: null,
  source: "unavailable",
  temp: EMPTY_STAT,
  rh: EMPTY_STAT,
  vpd: EMPTY_STAT,
};

function aggregate(values: (number | null)[]): TrendStat {
  const valid = values
    .map(toFiniteNumber)
    .filter((v): v is number => v !== null);
  if (valid.length === 0) return EMPTY_STAT;
  let sum = 0;
  let min = valid[0];
  let max = valid[0];
  for (const v of valid) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { avg: sum / valid.length, min, max, count: valid.length };
}

/**
 * Compute trend aggregates from a list of samples.
 *  - empty: no samples or no usable numeric values across any metric
 *  - limited: fewer than 3 samples with at least one valid metric
 *  - ok: 3+ samples with usable values
 */
export function computeEnvironmentTrends(
  samples: EnvironmentSample[] | null | undefined,
): EnvironmentTrends {
  if (!samples || samples.length === 0) return EMPTY_TRENDS;

  const sorted = [...samples].sort((a, b) =>
    a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0,
  );
  const temp = aggregate(sorted.map((s) => s.temp));
  const rh = aggregate(sorted.map((s) => s.rh));
  const vpd = aggregate(sorted.map((s) => s.vpd));

  const usableCount = sorted.filter(
    (s) =>
      toFiniteNumber(s.temp) !== null ||
      toFiniteNumber(s.rh) !== null ||
      toFiniteNumber(s.vpd) !== null,
  ).length;

  if (usableCount === 0) return EMPTY_TRENDS;

  const status: TrendStatus = usableCount < 3 ? "limited" : "ok";
  const source = sorted[0]?.source ?? "unavailable";

  return {
    status,
    headline: TREND_HEADLINE[status],
    count: usableCount,
    latestTs: sorted[0]?.ts ?? null,
    source,
    temp,
    rh,
    vpd,
  };
}

/**
 * Group sensor_readings rows (one row per metric/ts) into EnvironmentSample
 * objects keyed by `${tent_id}|${ts}`.
 */
export interface SensorReadingLike {
  ts: string;
  metric: string;
  value: number | string | null;
  source?: string | null;
  tent_id?: string | null;
}

const METRIC_MAP: Record<string, "temp" | "rh" | "vpd"> = {
  temperature_c: "temp",
  humidity_pct: "rh",
  vpd_kpa: "vpd",
};

export function samplesFromReadings(
  rows: SensorReadingLike[] | null | undefined,
): EnvironmentSample[] {
  if (!rows || rows.length === 0) return [];
  const byKey = new Map<string, EnvironmentSample>();
  for (const r of rows) {
    const key = `${r.tent_id ?? ""}|${r.ts}`;
    let s = byKey.get(key);
    if (!s) {
      s = {
        ts: r.ts,
        temp: null,
        rh: null,
        vpd: null,
        source:
          r.source === "manual"
            ? "manual"
            : r.source === "sim"
              ? "sim"
              : "live",
      };
      byKey.set(key, s);
    }
    const field = METRIC_MAP[r.metric];
    if (field) {
      const v = toFiniteNumber(r.value);
      if (v !== null) s[field] = v;
    }
  }
  return Array.from(byKey.values());
}

export interface DiarySnapshotLike {
  entry_at: string;
  details: Record<string, unknown> | null | undefined;
}

export function samplesFromDiary(
  rows: DiarySnapshotLike[] | null | undefined,
): EnvironmentSample[] {
  if (!rows) return [];
  const out: EnvironmentSample[] = [];
  for (const row of rows) {
    const details = row.details;
    if (!details || typeof details !== "object") continue;
    const snap = details.sensor_snapshot as Record<string, unknown> | undefined;
    if (!snap || typeof snap !== "object") continue;
    const ts = typeof snap.ts === "string" ? snap.ts : row.entry_at;
    if (!ts) continue;
    out.push({
      ts,
      temp: toFiniteNumber(snap.temp),
      rh: toFiniteNumber(snap.rh),
      vpd: toFiniteNumber(snap.vpd),
      source: "diary",
    });
  }
  return out;
}

/** Filter to the latest 24h window, or fall back to the latest 20 samples. */
export function selectWindow(
  samples: EnvironmentSample[],
  now: number = Date.now(),
): EnvironmentSample[] {
  if (samples.length === 0) return [];
  const sorted = [...samples].sort((a, b) =>
    a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0,
  );
  const cutoff = now - 24 * 60 * 60 * 1000;
  const inWindow = sorted.filter((s) => {
    const t = new Date(s.ts).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
  if (inWindow.length > 0) return inWindow;
  return sorted.slice(0, 20);
}
