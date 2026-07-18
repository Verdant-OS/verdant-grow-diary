/**
 * Pure view-model for the "PPFD and environment context" trend chart.
 *
 * Compares manually-logged PPFD readings against related environment
 * context (temperature, humidity, VPD) over time. Read-only context
 * only — never an automated diagnosis, never a trusted/untrusted
 * classification, never a recommendation source.
 *
 * Inputs are `sensor_readings`-shaped rows already loaded by the
 * caller. This module does no I/O, no Supabase queries, no AI calls,
 * no writes, no alerts, no Action Queue, no device control.
 *
 * Allowed sources are preserved verbatim: live | manual | csv | demo
 * | stale | invalid. Stale, invalid, and demo readings are explicitly
 * flagged (`omitted` with a reason) and never folded into trend
 * series — the chart surface decides whether to show them, but they
 * are never folded into trend context.
 */

import { isDiagnosticSensorProvenanceRow } from "@/lib/sensorProvenanceFenceRules";

export type ManualSensorTrendMetric = "ppfd" | "temperature_c" | "humidity_pct" | "vpd_kpa";

export type ManualSensorTrendSource = "live" | "manual" | "csv" | "demo" | "stale" | "invalid";

export type ManualSensorTrendOmissionReason =
  | "stale"
  | "invalid"
  | "demo"
  | "diagnostic"
  | "unknown_source"
  | "non_finite"
  | "missing_timestamp"
  | "unknown_metric";

export interface ManualSensorTrendInputRow {
  ts?: unknown;
  metric?: unknown;
  value?: unknown;
  source?: unknown;
  quality?: unknown;
  /** Classification-only provenance. Never returned by the view model. */
  raw_payload?: unknown;
  /** Optional grower-facing source label (e.g. "EcoWitt WH45"). */
  device_label?: unknown;
}

export interface ManualSensorTrendPoint {
  /** ISO timestamp, normalized. */
  capturedAt: string;
  metric: ManualSensorTrendMetric;
  value: number;
  /** Formatted value + unit for display (e.g. "412 µmol/m²/s"). */
  display: string;
  source: ManualSensorTrendSource;
  /** Optional grower-facing source label, never an internal ID. */
  sourceLabel?: string;
}

export interface ManualSensorTrendSeries {
  metric: ManualSensorTrendMetric;
  unit: string;
  label: string;
  points: ManualSensorTrendPoint[];
}

export interface ManualSensorTrendOmission {
  capturedAt: string | null;
  metric: ManualSensorTrendMetric | null;
  source: ManualSensorTrendSource | null;
  reason: ManualSensorTrendOmissionReason;
}

export type ManualSensorTrendState =
  | "no_ppfd"
  | "ppfd_only_no_environment"
  | "stale_invalid_only"
  | "ready";

export interface ManualSensorTrendChartViewModel {
  state: ManualSensorTrendState;
  /** Calm, grower-facing copy describing the chart purpose. */
  title: string;
  description: string;
  /** Calm message when state is not "ready". */
  emptyMessage: string | null;
  series: ManualSensorTrendSeries[];
  /** Stale/invalid/demo points kept visible but flagged. */
  flagged: ManualSensorTrendPoint[];
  omissions: ManualSensorTrendOmission[];
}

const ALLOWED_SOURCES: ReadonlySet<ManualSensorTrendSource> = new Set([
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
]);

const TRUSTED_SOURCES: ReadonlySet<ManualSensorTrendSource> = new Set(["live", "manual", "csv"]);

const METRIC_META: Record<
  ManualSensorTrendMetric,
  { label: string; unit: string; format: (v: number) => string }
> = {
  ppfd: {
    label: "PPFD",
    unit: "µmol/m²/s",
    format: (v) => `${Math.round(v)} µmol/m²/s`,
  },
  temperature_c: {
    label: "Temperature",
    unit: "°F",
    format: (v) => {
      const f = v * (9 / 5) + 32;
      return `${(Math.round(f * 10) / 10).toFixed(1)}°F`;
    },
  },
  humidity_pct: {
    label: "Humidity",
    unit: "% RH",
    format: (v) => `${Math.round(v)}% RH`,
  },
  vpd_kpa: {
    label: "VPD",
    unit: "kPa",
    format: (v) => `${(Math.round(v * 100) / 100).toFixed(2)} kPa`,
  },
};

const TRACKED_METRICS: ReadonlyArray<ManualSensorTrendMetric> = [
  "ppfd",
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
];

function normalizeMetric(value: unknown): ManualSensorTrendMetric | null {
  return typeof value === "string" && (TRACKED_METRICS as ReadonlyArray<string>).includes(value)
    ? (value as ManualSensorTrendMetric)
    : null;
}

function normalizeSource(value: unknown): ManualSensorTrendSource | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return ALLOWED_SOURCES.has(normalized as ManualSensorTrendSource)
    ? (normalized as ManualSensorTrendSource)
    : null;
}

interface ManualSensorTrendSourceResolution {
  source: ManualSensorTrendSource | null;
  omissionReason: "diagnostic" | "unknown_source" | null;
}

/**
 * Resolve trust before any chart point is built.
 *
 * Old manual rows predate the source column and carry no raw ingest envelope;
 * those are intentionally preserved as manual history. Any non-canonical
 * source, or a source-less row carrying an ingest payload, fails closed.
 */
function resolveTrendSource(row: ManualSensorTrendInputRow): ManualSensorTrendSourceResolution {
  const sourceValue = typeof row.source === "string" ? row.source.trim().toLowerCase() : null;
  const canonicalSource = normalizeSource(sourceValue);

  if (
    isDiagnosticSensorProvenanceRow({
      source: sourceValue,
      raw_payload: row.raw_payload,
    })
  ) {
    return { source: canonicalSource, omissionReason: "diagnostic" };
  }

  if (canonicalSource) {
    return { source: canonicalSource, omissionReason: null };
  }

  const sourceIsMissing = sourceValue === null || sourceValue.length === 0;
  const hasRawProvenance = row.raw_payload !== null && row.raw_payload !== undefined;
  if (sourceIsMissing && !hasRawProvenance) {
    return { source: "manual", omissionReason: null };
  }

  return { source: null, omissionReason: "unknown_source" };
}

function normalizeTs(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function normalizeValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 80 ? trimmed : undefined;
}

function makeOmission(
  capturedAt: string | null,
  metric: ManualSensorTrendMetric | null,
  source: ManualSensorTrendSource | null,
  reason: ManualSensorTrendOmissionReason,
): ManualSensorTrendOmission {
  return { capturedAt, metric, source, reason };
}

export interface BuildManualSensorTrendChartInput {
  readings: ReadonlyArray<ManualSensorTrendInputRow>;
}

const TITLE = "PPFD and environment context";
const DESCRIPTION =
  "Compare recent manual light readings with temperature, humidity, and VPD. Trend context only — not an automated diagnosis.";

const EMPTY_NO_PPFD =
  "No PPFD readings yet. Add a PPFD value to the manual sensor reading form to start a trend.";
const EMPTY_PPFD_ONLY =
  "PPFD readings present, but no temperature, humidity, or VPD context to compare against yet.";
const EMPTY_STALE_ONLY =
  "Only stale or invalid readings are available. Add a fresh manual reading to build trend context.";

export function buildManualSensorTrendChartViewModel(
  input: BuildManualSensorTrendChartInput,
): ManualSensorTrendChartViewModel {
  const omissions: ManualSensorTrendOmission[] = [];
  const acceptedPoints: ManualSensorTrendPoint[] = [];
  const flagged: ManualSensorTrendPoint[] = [];

  for (const row of input?.readings ?? []) {
    const metric = normalizeMetric(row.metric);
    const ts = normalizeTs(row.ts);
    const sourceResolution = resolveTrendSource(row);
    const source = sourceResolution.source;
    const value = normalizeValue(row.value);

    if (sourceResolution.omissionReason) {
      omissions.push(makeOmission(ts, metric, source, sourceResolution.omissionReason));
      continue;
    }
    if (!source) {
      omissions.push(makeOmission(ts, metric, null, "unknown_source"));
      continue;
    }

    if (!metric) {
      omissions.push(makeOmission(ts, null, source, "unknown_metric"));
      continue;
    }
    if (!ts) {
      omissions.push(makeOmission(null, metric, source, "missing_timestamp"));
      continue;
    }
    if (value === null) {
      omissions.push(makeOmission(ts, metric, source, "non_finite"));
      continue;
    }

    const meta = METRIC_META[metric];
    const resolvedSource = source;
    const point: ManualSensorTrendPoint = {
      capturedAt: ts,
      metric,
      value,
      display: meta.format(value),
      source: resolvedSource,
      sourceLabel: cleanLabel(row.device_label),
    };

    if (resolvedSource === "stale" || resolvedSource === "invalid") {
      flagged.push(point);
      omissions.push(makeOmission(ts, metric, resolvedSource, resolvedSource));
      continue;
    }
    if (resolvedSource === "demo") {
      flagged.push(point);
      omissions.push(makeOmission(ts, metric, resolvedSource, "demo"));
      continue;
    }

    acceptedPoints.push(point);
  }

  // Chronological order: oldest -> newest for stable trend rendering.
  acceptedPoints.sort(
    (a, b) =>
      Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
      (a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : 0),
  );
  flagged.sort(
    (a, b) =>
      Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
      (a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : 0),
  );

  const series: ManualSensorTrendSeries[] = TRACKED_METRICS.map((metric) => ({
    metric,
    unit: METRIC_META[metric].unit,
    label: METRIC_META[metric].label,
    points: acceptedPoints.filter((p) => p.metric === metric),
  }));

  const hasPpfd = series[0]?.points.length > 0;
  const hasEnvironment = series.slice(1).some((s) => s.points.length > 0);
  const hasAnyTrusted = acceptedPoints.some((p) => TRUSTED_SOURCES.has(p.source));

  let state: ManualSensorTrendState;
  let emptyMessage: string | null = null;

  if (!hasAnyTrusted && flagged.length > 0) {
    state = "stale_invalid_only";
    emptyMessage = EMPTY_STALE_ONLY;
  } else if (!hasPpfd) {
    state = "no_ppfd";
    emptyMessage = EMPTY_NO_PPFD;
  } else if (!hasEnvironment) {
    state = "ppfd_only_no_environment";
    emptyMessage = EMPTY_PPFD_ONLY;
  } else {
    state = "ready";
  }

  return {
    state,
    title: TITLE,
    description: DESCRIPTION,
    emptyMessage,
    series,
    flagged,
    omissions,
  };
}
