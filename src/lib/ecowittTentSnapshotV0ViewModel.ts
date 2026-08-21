/**
 * ecowittTentSnapshotV0ViewModel — presenter model for locked EcoWitt tent
 * Sensor Snapshot V0 (air temp, air RH, soil moisture).
 *
 * Pure. Builds latest packet + last-24h sparkline points + constitution badges.
 * UI must remain a stateless presenter over this model.
 */

import {
  classifyEcowittTentSnapshotV0BridgeQuiet,
  classifyEcowittTentSnapshotV0Source,
  ECOWITT_TENT_SNAPSHOT_V0_METRICS,
  ECOWITT_TENT_SNAPSHOT_V0_NO_LIVE_DATA,
  evaluateEcowittTentSnapshotV0Metric,
  isUtcNightHour,
  mapEcowittTentSnapshotV0MetricKey,
  readObservedAtIso,
  toFiniteMetricValue,
  type EcowittTentSnapshotV0MetricKey,
  type EcowittTentSnapshotV0RowLike,
  type EcowittTentSnapshotV0TruthSource,
} from "@/lib/ecowittTentSnapshotV0Rules";
import {
  classifyTempAgainstStage,
  classifyRhAgainstStage,
  type EnvClassification,
} from "@/lib/environmentStageTargetRules";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface EcowittTentSnapshotV0SparkPoint {
  ts: string;
  value: number;
}

export interface EcowittTentSnapshotV0MetricView {
  key: EcowittTentSnapshotV0MetricKey;
  label: string;
  /** Display value: temp in °C (stored), rh/soil in %. Null when missing/invalid. */
  value: number | null;
  unit: string;
  capturedAt: string | null;
  truthSource: EcowittTentSnapshotV0TruthSource | "none";
  badgeLabel: string;
  valid: boolean;
  reason: string | null;
  sparkline: EcowittTentSnapshotV0SparkPoint[];
  sparklineState: "ok" | "empty" | "stale" | "demo";
  /** Stage-band status for current value when stage known; else unavailable. */
  inSpecNow: EnvClassification | "unavailable";
}

export interface EcowittTentSnapshotV0NightDrift {
  /** True when any night sample was outside stage targets. */
  drifted: boolean;
  /** Calm copy; never invents a claim when evidence is missing. */
  summary: string;
  nightSampleCount: number;
  outOfSpecCount: number;
}

export interface EcowittTentSnapshotV0ViewModel {
  tentId: string | null;
  hasAnyReading: boolean;
  bridgeQuiet: boolean;
  quietMessage: string | null;
  overallTruthSource: EcowittTentSnapshotV0TruthSource | "none";
  overallBadgeLabel: string;
  latestCapturedAt: string | null;
  metrics: EcowittTentSnapshotV0MetricView[];
  nightDrift: EcowittTentSnapshotV0NightDrift;
  /** Fields seen in payloads that V0 refuses to guess (report-only). */
  unusedFieldNamesRefused: readonly string[];
}

export interface BuildEcowittTentSnapshotV0Options {
  tentId?: string | null;
  now?: Date;
  /** Grow stage for in-spec / night-drift checks (optional). */
  stage?: string | null;
  historyWindowMs?: number;
}

const METRIC_LABEL: Record<EcowittTentSnapshotV0MetricKey, string> = {
  temp: "Air temperature",
  rh: "Air RH",
  soil: "Soil moisture",
};

const METRIC_UNIT: Record<EcowittTentSnapshotV0MetricKey, string> = {
  temp: "°C",
  rh: "%",
  soil: "%",
};

const BADGE_LABEL: Record<EcowittTentSnapshotV0TruthSource | "none", string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV",
  demo: "Demo",
  stale: "Stale",
  invalid: "Invalid",
  none: "No live data",
};

/** Known EcoWitt FIELD_MAP keys V0 intentionally does not surface. */
export const ECOWITT_TENT_SNAPSHOT_V0_UNUSED_FIELD_NAMES = [
  "co2",
  "co2in",
  "co2_ppm",
  "soilmoisture2",
] as const;

function emptyMetric(key: EcowittTentSnapshotV0MetricKey): EcowittTentSnapshotV0MetricView {
  return {
    key,
    label: METRIC_LABEL[key],
    value: null,
    unit: METRIC_UNIT[key],
    capturedAt: null,
    truthSource: "none",
    badgeLabel: BADGE_LABEL.none,
    valid: false,
    reason: null,
    sparkline: [],
    sparklineState: "empty",
    inSpecNow: "unavailable",
  };
}

function pickLatestPerMetric(
  rows: readonly EcowittTentSnapshotV0RowLike[],
  now: Date,
): Map<
  EcowittTentSnapshotV0MetricKey,
  {
    value: number;
    capturedAt: string;
    truth: EcowittTentSnapshotV0TruthSource;
    evaluation: { valid: boolean; reason: string | null };
  }
> {
  const best = new Map<
    EcowittTentSnapshotV0MetricKey,
    {
      value: number;
      capturedAt: string;
      capturedMs: number;
      truth: EcowittTentSnapshotV0TruthSource;
      evaluation: { valid: boolean; reason: string | null };
    }
  >();

  for (const row of rows) {
    const metricKey = mapEcowittTentSnapshotV0MetricKey(row.metric);
    if (!metricKey) continue;
    const value = toFiniteMetricValue(row.value);
    if (value === null) continue;
    const capturedAt = readObservedAtIso(row);
    if (!capturedAt) continue;
    const capturedMs = Date.parse(capturedAt);
    if (!Number.isFinite(capturedMs)) continue;

    const truth = classifyEcowittTentSnapshotV0Source({ row, now });
    const evaluation = evaluateEcowittTentSnapshotV0Metric(metricKey, value);
    const prev = best.get(metricKey);
    if (!prev || capturedMs > prev.capturedMs) {
      best.set(metricKey, { value, capturedAt, capturedMs, truth, evaluation });
    }
  }

  const out = new Map<
    EcowittTentSnapshotV0MetricKey,
    {
      value: number;
      capturedAt: string;
      truth: EcowittTentSnapshotV0TruthSource;
      evaluation: { valid: boolean; reason: string | null };
    }
  >();
  for (const [key, entry] of best) {
    out.set(key, {
      value: entry.value,
      capturedAt: entry.capturedAt,
      truth: entry.evaluation.valid ? entry.truth : "invalid",
      evaluation: entry.evaluation,
    });
  }
  return out;
}

function buildSparkline(
  rows: readonly EcowittTentSnapshotV0RowLike[],
  key: EcowittTentSnapshotV0MetricKey,
  windowStartMs: number,
  now: Date,
): {
  points: EcowittTentSnapshotV0SparkPoint[];
  state: EcowittTentSnapshotV0MetricView["sparklineState"];
} {
  const points: EcowittTentSnapshotV0SparkPoint[] = [];
  let sawDemo = false;
  let sawStaleOnly = true;

  for (const row of rows) {
    if (mapEcowittTentSnapshotV0MetricKey(row.metric) !== key) continue;
    const value = toFiniteMetricValue(row.value);
    if (value === null) continue;
    const evaluation = evaluateEcowittTentSnapshotV0Metric(key, value);
    if (!evaluation.valid) continue;
    const capturedAt = readObservedAtIso(row);
    if (!capturedAt) continue;
    const ms = Date.parse(capturedAt);
    if (!Number.isFinite(ms) || ms < windowStartMs) continue;

    const truth = classifyEcowittTentSnapshotV0Source({ row, now });
    if (truth === "demo") sawDemo = true;
    if (truth === "live" || truth === "manual") sawStaleOnly = false;

    points.push({ ts: capturedAt, value });
  }

  points.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  if (points.length === 0) return { points: [], state: "empty" };
  if (sawDemo) return { points, state: "demo" };
  if (sawStaleOnly) return { points, state: "stale" };
  return { points, state: "ok" };
}

function classifyInSpec(
  key: EcowittTentSnapshotV0MetricKey,
  value: number | null,
  stage: string | null | undefined,
  stale: boolean,
): EnvClassification | "unavailable" {
  if (value === null || !Number.isFinite(value)) return "unavailable";
  if (key === "temp") {
    // Stored Celsius.
    return classifyTempAgainstStage(value, { stage: stage ?? null, stale }).classification;
  }
  if (key === "rh") {
    return classifyRhAgainstStage(value, { stage: stage ?? null, stale }).classification;
  }
  // Soil stage bands are not part of environmentStageTargetRules — honest unavailable.
  return "unavailable";
}

function buildNightDrift(
  rows: readonly EcowittTentSnapshotV0RowLike[],
  stage: string | null | undefined,
  windowStartMs: number,
): EcowittTentSnapshotV0NightDrift {
  let nightSampleCount = 0;
  let outOfSpecCount = 0;

  for (const row of rows) {
    const key = mapEcowittTentSnapshotV0MetricKey(row.metric);
    if (key !== "temp" && key !== "rh") continue;
    const value = toFiniteMetricValue(row.value);
    if (value === null) continue;
    if (!evaluateEcowittTentSnapshotV0Metric(key, value).valid) continue;
    const capturedAt = readObservedAtIso(row);
    if (!capturedAt) continue;
    const ms = Date.parse(capturedAt);
    if (!Number.isFinite(ms) || ms < windowStartMs) continue;
    if (!isUtcNightHour(capturedAt)) continue;

    nightSampleCount += 1;
    const classification = classifyInSpec(key, value, stage, false);
    if (classification === "below_target" || classification === "above_target") {
      outOfSpecCount += 1;
    }
  }

  if (nightSampleCount === 0) {
    return {
      drifted: false,
      summary: "No night samples in the last 24 hours to judge drift.",
      nightSampleCount: 0,
      outOfSpecCount: 0,
    };
  }
  if (!stage) {
    return {
      drifted: false,
      summary: "Night samples present, but stage targets are unknown — drift not judged.",
      nightSampleCount,
      outOfSpecCount: 0,
    };
  }
  const drifted = outOfSpecCount > 0;
  return {
    drifted,
    summary: drifted
      ? `Drifted last night — ${outOfSpecCount} of ${nightSampleCount} night samples outside stage targets.`
      : `In-spec overnight — ${nightSampleCount} night samples within stage targets.`,
    nightSampleCount,
    outOfSpecCount,
  };
}

function overallTruth(
  metrics: EcowittTentSnapshotV0MetricView[],
  bridgeQuiet: boolean,
): EcowittTentSnapshotV0TruthSource | "none" {
  if (bridgeQuiet) return "none";
  const truths = metrics
    .map((m) => m.truthSource)
    .filter((t): t is EcowittTentSnapshotV0TruthSource => t !== "none");
  if (truths.length === 0) return "none";
  if (truths.some((t) => t === "invalid")) return "invalid";
  if (truths.some((t) => t === "demo")) return "demo";
  if (truths.some((t) => t === "stale")) return "stale";
  if (truths.every((t) => t === "live")) return "live";
  if (truths.some((t) => t === "manual")) return "manual";
  if (truths.some((t) => t === "csv")) return "csv";
  return truths[0] ?? "none";
}

/**
 * Build the V0 tent Sensor Snapshot view-model from long-format sensor_readings.
 */
export function buildEcowittTentSnapshotV0ViewModel(
  rows: readonly EcowittTentSnapshotV0RowLike[] | null | undefined,
  options: BuildEcowittTentSnapshotV0Options = {},
): EcowittTentSnapshotV0ViewModel {
  const now = options.now ?? new Date();
  const historyWindowMs = options.historyWindowMs ?? DAY_MS;
  const windowStartMs = now.getTime() - historyWindowMs;
  const list = Array.isArray(rows) ? rows : [];
  const tentScoped =
    options.tentId != null && options.tentId !== ""
      ? list.filter((r) => (r.tent_id ?? null) === options.tentId)
      : list;

  const quietState = classifyEcowittTentSnapshotV0BridgeQuiet(tentScoped, { now });
  const bridgeQuiet = quietState === "quiet" || quietState === "has_non_live_only";
  // "Quiet" for grower copy means no live packet. Non-live-only still shows
  // the readings with honest badges, but surfaces the quiet message.
  const showQuietMessage = quietState !== "has_live";

  const latest = pickLatestPerMetric(tentScoped, now);
  const metrics: EcowittTentSnapshotV0MetricView[] = ECOWITT_TENT_SNAPSHOT_V0_METRICS.map((key) => {
    const base = emptyMetric(key);
    const entry = latest.get(key);
    const spark = buildSparkline(tentScoped, key, windowStartMs, now);
    if (!entry) {
      return { ...base, sparkline: spark.points, sparklineState: spark.state };
    }
    const stale = entry.truth === "stale" || entry.truth === "invalid" || entry.truth === "demo";
    const displayValue = entry.evaluation.valid ? entry.value : null;
    return {
      ...base,
      value: displayValue,
      capturedAt: entry.capturedAt,
      truthSource: entry.truth,
      badgeLabel: BADGE_LABEL[entry.truth],
      valid: entry.evaluation.valid,
      reason: entry.evaluation.reason,
      sparkline: spark.points,
      sparklineState: spark.state,
      inSpecNow: classifyInSpec(key, displayValue, options.stage, stale),
    };
  });

  const latestCapturedAt =
    metrics
      .map((m) => m.capturedAt)
      .filter((v): v is string => typeof v === "string")
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

  const overall = overallTruth(metrics, showQuietMessage && quietState === "quiet");

  return {
    tentId: options.tentId ?? null,
    hasAnyReading: tentScoped.length > 0 && metrics.some((m) => m.capturedAt !== null),
    bridgeQuiet: showQuietMessage,
    quietMessage: showQuietMessage ? ECOWITT_TENT_SNAPSHOT_V0_NO_LIVE_DATA : null,
    overallTruthSource: overall,
    overallBadgeLabel: BADGE_LABEL[overall],
    latestCapturedAt,
    metrics,
    nightDrift: buildNightDrift(tentScoped, options.stage, windowStartMs),
    unusedFieldNamesRefused: ECOWITT_TENT_SNAPSHOT_V0_UNUSED_FIELD_NAMES,
  };
}
