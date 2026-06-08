/**
 * Pure helpers for the Quick Log sensor mini-chart.
 *
 * Turns raw long-format `sensor_readings` rows (already scoped to one
 * tent by the caller) into a deterministic sparkline series for a single
 * metric, plus an SVG polyline path string.
 *
 * Hard rules:
 *  - Pure. No React, no Supabase, no Date.now() unless caller omits `now`.
 *  - Never invents data. Missing / non-finite values are dropped.
 *  - Temperature is normalized to °C for display parity with the strip.
 *  - No fake live: source labels are ignored here — the chart only ever
 *    plots already-stored readings; it never promotes anything to Live.
 */

export type MiniChartMetric = "temp_c" | "humidity_pct" | "vpd_kpa";

export interface MiniChartRawRow {
  metric?: string | null;
  value?: number | string | null;
  captured_at?: string | null;
  ts?: string | null;
}

export interface MiniChartPoint {
  /** Epoch ms. Always finite. */
  t: number;
  /** Numeric value in the metric's display unit. Always finite. */
  v: number;
}

export interface MiniChartSeries {
  metric: MiniChartMetric;
  unitLabel: string;
  points: MiniChartPoint[];
  min: number;
  max: number;
  /** ISO string of the most recent sample, or null when empty. */
  latestTs: string | null;
  /** Numeric latest value, or null when empty. */
  latestValue: number | null;
}

const EMPTY_SERIES = (metric: MiniChartMetric, unitLabel: string): MiniChartSeries => ({
  metric,
  unitLabel,
  points: [],
  min: 0,
  max: 0,
  latestTs: null,
  latestValue: null,
});

const UNIT_LABEL: Record<MiniChartMetric, string> = {
  temp_c: "°C",
  humidity_pct: "%",
  vpd_kpa: "kPa",
};

function toFinite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function rowMetricMatches(raw: string | null | undefined, metric: MiniChartMetric): boolean {
  if (!raw) return false;
  if (metric === "temp_c") return raw === "temperature_c" || raw === "temp_f";
  if (metric === "humidity_pct") return raw === "humidity_pct";
  if (metric === "vpd_kpa") return raw === "vpd_kpa";
  return false;
}

function canonicalize(metric: MiniChartMetric, rawMetric: string, value: number): number {
  if (metric === "temp_c" && rawMetric === "temp_f") return ((value - 32) * 5) / 9;
  return value;
}

export interface BuildMiniChartSeriesOptions {
  metric: MiniChartMetric;
  /** Inclusive window — drop samples older than this many minutes. Defaults to 24h. */
  windowMinutes?: number;
  /** Max points kept after windowing. Defaults to 48. */
  maxPoints?: number;
  now?: Date;
}

/**
 * Build a chronologically-ordered (oldest → newest) series for `metric`
 * from raw long-format rows. Returns an empty series when no usable
 * sample exists.
 */
export function buildMiniChartSeries(
  rows: ReadonlyArray<MiniChartRawRow> | null | undefined,
  opts: BuildMiniChartSeriesOptions,
): MiniChartSeries {
  const metric = opts.metric;
  const unitLabel = UNIT_LABEL[metric];
  if (!rows || rows.length === 0) return EMPTY_SERIES(metric, unitLabel);

  const windowMs = Math.max(1, opts.windowMinutes ?? 24 * 60) * 60_000;
  const maxPoints = Math.max(2, opts.maxPoints ?? 48);
  const now = (opts.now ?? new Date()).getTime();
  const cutoff = now - windowMs;

  const out: MiniChartPoint[] = [];
  for (const row of rows) {
    const rawMetric = typeof row.metric === "string" ? row.metric : null;
    if (!rowMetricMatches(rawMetric, metric)) continue;
    const value = toFinite(row.value);
    if (value === null) continue;
    const tsStr =
      typeof row.captured_at === "string" && row.captured_at.length > 0
        ? row.captured_at
        : typeof row.ts === "string" && row.ts.length > 0
          ? row.ts
          : null;
    if (!tsStr) continue;
    const t = Date.parse(tsStr);
    if (!Number.isFinite(t)) continue;
    if (t < cutoff || t > now + 5 * 60_000) continue; // drop future skew >5m
    const v = canonicalize(metric, rawMetric!, value);
    if (!Number.isFinite(v)) continue;
    out.push({ t, v });
  }

  if (out.length === 0) return EMPTY_SERIES(metric, unitLabel);

  // Sort oldest → newest (deterministic tie-break by value).
  out.sort((a, b) => (a.t === b.t ? a.v - b.v : a.t - b.t));

  // Down-sample by keeping the most recent N (preserves the latest detail).
  const trimmed = out.length > maxPoints ? out.slice(out.length - maxPoints) : out;

  let min = trimmed[0].v;
  let max = trimmed[0].v;
  for (const p of trimmed) {
    if (p.v < min) min = p.v;
    if (p.v > max) max = p.v;
  }
  const latest = trimmed[trimmed.length - 1];
  return {
    metric,
    unitLabel,
    points: trimmed,
    min,
    max,
    latestTs: new Date(latest.t).toISOString(),
    latestValue: latest.v,
  };
}

export interface SvgPathOptions {
  width: number;
  height: number;
  /** Vertical padding inside the viewport so peaks/troughs are not clipped. */
  padding?: number;
}

/**
 * Build an SVG polyline `d` attribute for the series. Returns null when
 * fewer than 2 points exist or width/height are non-positive. The
 * y-axis is inverted (higher value = higher on the chart).
 */
export function buildMiniChartPath(
  series: MiniChartSeries,
  opts: SvgPathOptions,
): string | null {
  const { width, height } = opts;
  const padding = Math.max(0, opts.padding ?? 2);
  if (width <= 0 || height <= 0) return null;
  const pts = series.points;
  if (pts.length < 2) return null;

  const tMin = pts[0].t;
  const tMax = pts[pts.length - 1].t;
  const tSpan = Math.max(1, tMax - tMin);
  const vSpan = Math.max(1e-6, series.max - series.min);

  const innerH = Math.max(1, height - padding * 2);

  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const x = ((p.t - tMin) / tSpan) * width;
    const y = padding + (1 - (p.v - series.min) / vSpan) * innerH;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return d;
}
