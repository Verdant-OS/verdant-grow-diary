/**
 * environmentCheckInsightsViewModel — pure rules + view-model for the
 * Diary Calendar's Environment Check insights panel.
 *
 * Hard constraints:
 *   - Pure. No I/O, no React, no Supabase, no fetch, no AI / model calls,
 *     no Action Queue, no alerts, no device control.
 *   - Reads only diary Environment Check entries (same envelope used by
 *     environmentCheckTimelineViewModel). Never touches sensor_readings.
 *   - Never classifies the grow as healthy / unhealthy.
 *   - Never produces "danger" / "fix immediately" / health-score copy.
 *   - Out-of-range copy is always cautious and labeled as diary evidence.
 *   - Missing / malformed values are silently omitted (no throw).
 */

import {
  buildEnvironmentCheckTimelineList,
  type EnvironmentCheckTimelineRawEntry,
} from "./environmentCheckTimelineViewModel";

export const ENVIRONMENT_CHECK_INSIGHTS_TITLE =
  "Environment Check insights" as const;

export const ENVIRONMENT_CHECK_INSIGHTS_DISCLAIMER =
  "Diary evidence only — not live sensor telemetry." as const;

export const ENVIRONMENT_CHECK_INSIGHTS_NOT_ENOUGH =
  "Not enough Environment Check history to identify a trend." as const;

export const ENVIRONMENT_CHECK_INSIGHTS_OUT_OF_RANGE =
  "Outside target range in diary entries" as const;

export const ENVIRONMENT_CHECK_INSIGHTS_GENERIC_TARGETS =
  "Using generic environment ranges. Review against your grow targets." as const;

export const ENVIRONMENT_CHECK_INSIGHTS_MISSING_DATA =
  "Some Environment Checks were missing values; those are omitted from the summary." as const;

export type EnvironmentCheckInsightsMetricKey =
  | "temp"
  | "humidity"
  | "vpd"
  | "co2";

export interface EnvironmentCheckInsightsTargetRange {
  min: number;
  max: number;
  unit: string;
}

export interface EnvironmentCheckInsightsTargets {
  temp_c: EnvironmentCheckInsightsTargetRange;
  humidity_pct: EnvironmentCheckInsightsTargetRange;
  vpd_kpa: EnvironmentCheckInsightsTargetRange;
  co2_ppm: EnvironmentCheckInsightsTargetRange;
}

/**
 * Generic, cautious default ranges. Intentionally broad — these are NOT
 * stage-specific. Surfaces a generic-targets warning whenever consumers
 * use them.
 */
export const ENVIRONMENT_CHECK_INSIGHTS_DEFAULT_TARGETS: EnvironmentCheckInsightsTargets =
  Object.freeze({
    temp_c: { min: 20, max: 28, unit: "°C" },
    humidity_pct: { min: 40, max: 65, unit: "%" },
    vpd_kpa: { min: 0.8, max: 1.5, unit: "kPa" },
    co2_ppm: { min: 400, max: 1500, unit: "ppm" },
  });

export interface EnvironmentCheckInsightsMetricStat {
  key: EnvironmentCheckInsightsMetricKey;
  label: string;
  unit: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  latest: number;
  /** Cautious diary-evidence flag — never a health score. */
  outOfRange: boolean;
  /** "low" | "high" | null relative to target range. Presentation hint. */
  rangeDirection: "low" | "high" | "in" | null;
  trend: "rising" | "falling" | "steady";
}

export interface EnvironmentCheckInsightsLatest {
  occurredAt: string;
  values: Array<{
    key: EnvironmentCheckInsightsMetricKey;
    label: string;
    value: string;
  }>;
}

export interface EnvironmentCheckInsightsViewModel {
  count: number;
  hasEnoughHistory: boolean;
  summary: string;
  disclaimer: typeof ENVIRONMENT_CHECK_INSIGHTS_DISCLAIMER;
  usingGenericTargets: boolean;
  genericTargetsNote: string | null;
  missingDataNote: string | null;
  latest: EnvironmentCheckInsightsLatest | null;
  metrics: EnvironmentCheckInsightsMetricStat[];
  outOfRangeNote: string | null;
}

// ── internals ───────────────────────────────────────────────────────────

interface NumericSample {
  occurredAt: string;
  temp_c: number | null;
  humidity_pct: number | null;
  vpd_kpa: number | null;
  co2_ppm: number | null;
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickEnvelope(raw: EnvironmentCheckTimelineRawEntry): Record<string, unknown> | null {
  const details = raw.details;
  if (!details || typeof details !== "object") return null;
  const ec = (details as Record<string, unknown>).environment_check;
  if (!ec || typeof ec !== "object" || Array.isArray(ec)) return null;
  return ec as Record<string, unknown>;
}

function extractSample(
  raw: EnvironmentCheckTimelineRawEntry,
  occurredAt: string,
): NumericSample | null {
  const env = pickEnvelope(raw);
  if (!env) return null;

  const tempC = asFiniteNumber(env.temp_c ?? env.tempC ?? env.air_temp_c);
  const tempF = asFiniteNumber(env.room_temp_f ?? env.tempF ?? env.air_temp_f);
  const tempCFinal =
    tempC != null
      ? tempC
      : tempF != null
        ? Math.round(((tempF - 32) * 5) / 9 * 100) / 100
        : null;

  const rh = asFiniteNumber(env.humidity_pct ?? env.rhPercent ?? env.rh_percent);
  const vpd = asFiniteNumber(env.vpd_kpa ?? env.vpdKpa);
  const co2 = asFiniteNumber(env.co2_ppm ?? env.co2Ppm ?? env.co2);

  const anyValue =
    tempCFinal != null || rh != null || vpd != null || co2 != null;
  if (!anyValue) return null;

  return {
    occurredAt,
    temp_c: tempCFinal,
    humidity_pct: rh,
    vpd_kpa: vpd,
    co2_ppm: co2,
  };
}

function summarizeMetric(
  key: EnvironmentCheckInsightsMetricKey,
  label: string,
  unit: string,
  /** newest-first */
  samples: Array<{ occurredAt: string; value: number }>,
  range: EnvironmentCheckInsightsTargetRange,
): EnvironmentCheckInsightsMetricStat | null {
  if (samples.length === 0) return null;
  const values = samples.map((s) => s.value);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const avg = sum / values.length;
  const latest = values[0];

  let rangeDirection: EnvironmentCheckInsightsMetricStat["rangeDirection"] = null;
  let outOfRange = false;
  if (Number.isFinite(range.min) && Number.isFinite(range.max)) {
    if (latest < range.min) {
      rangeDirection = "low";
      outOfRange = true;
    } else if (latest > range.max) {
      rangeDirection = "high";
      outOfRange = true;
    } else {
      rangeDirection = "in";
    }
  }

  let trend: EnvironmentCheckInsightsMetricStat["trend"] = "steady";
  if (samples.length >= 2) {
    // newest-first, so oldest = last
    const newest = samples[0].value;
    const oldest = samples[samples.length - 1].value;
    const delta = newest - oldest;
    // Use a metric-scaled threshold so we don't fire on noise.
    const threshold = Math.max(Math.abs(oldest) * 0.02, key === "co2" ? 25 : 0.1);
    if (delta > threshold) trend = "rising";
    else if (delta < -threshold) trend = "falling";
  }

  return {
    key,
    label,
    unit,
    count: values.length,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    avg: Math.round(avg * 100) / 100,
    latest: Math.round(latest * 100) / 100,
    outOfRange,
    rangeDirection,
    trend,
  };
}

function formatLatestValue(
  key: EnvironmentCheckInsightsMetricKey,
  value: number,
): string {
  switch (key) {
    case "temp":
      return `${value.toFixed(1)}°C`;
    case "humidity":
      return `${value.toFixed(0)}%`;
    case "vpd":
      return `${value.toFixed(2)} kPa`;
    case "co2":
      return `${Math.round(value)} ppm`;
  }
}

function buildSummary(
  count: number,
  metrics: EnvironmentCheckInsightsMetricStat[],
): string {
  if (count < 2) return ENVIRONMENT_CHECK_INSIGHTS_NOT_ENOUGH;
  const head = `${count} Environment Checks logged in view`;
  const trendBits: string[] = [];
  for (const m of metrics) {
    if (m.trend === "rising") trendBits.push(`${m.label} trending higher`);
    else if (m.trend === "falling") trendBits.push(`${m.label} trending lower`);
  }
  if (trendBits.length === 0) return `${head}.`;
  // Keep summary calm — cap to first two hints.
  return `${head}. ${trendBits.slice(0, 2).join("; ")}.`;
}

/**
 * Build the Environment Check insights view-model from raw diary entries.
 * Pure & deterministic. Returns a stable shape even for empty input.
 */
export function buildEnvironmentCheckInsightsViewModel(
  rawEntries:
    | readonly EnvironmentCheckTimelineRawEntry[]
    | null
    | undefined,
  options?: {
    targets?: EnvironmentCheckInsightsTargets;
    /** When true, generic-targets warning is suppressed (caller passed plant targets). */
    plantSpecificTargets?: boolean;
  },
): EnvironmentCheckInsightsViewModel {
  const targets =
    options?.targets ?? ENVIRONMENT_CHECK_INSIGHTS_DEFAULT_TARGETS;
  const usingGenericTargets = !options?.plantSpecificTargets;

  const vmList = buildEnvironmentCheckTimelineList(rawEntries);
  const list = Array.isArray(rawEntries) ? rawEntries : [];

  // Build numeric samples keyed by entryId so we can preserve the ordered
  // vmList sequence (newest-first).
  const sampleById = new Map<string, NumericSample>();
  let missingDataCount = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== "object") {
      missingDataCount += 1;
      continue;
    }
    const id = typeof raw.id === "string" ? raw.id : null;
    if (!id) {
      missingDataCount += 1;
      continue;
    }
    const vm = vmList.find((v) => v.entryId === id);
    if (!vm) {
      // Not an environment check (already filtered) — don't count as missing.
      continue;
    }
    const sample = extractSample(raw, vm.occurredAt);
    if (!sample) {
      missingDataCount += 1;
      continue;
    }
    sampleById.set(id, sample);
  }

  // Newest-first ordered numeric samples per metric.
  const tempSamples: Array<{ occurredAt: string; value: number }> = [];
  const rhSamples: Array<{ occurredAt: string; value: number }> = [];
  const vpdSamples: Array<{ occurredAt: string; value: number }> = [];
  const co2Samples: Array<{ occurredAt: string; value: number }> = [];

  for (const vm of vmList) {
    const s = sampleById.get(vm.entryId);
    if (!s) continue;
    if (s.temp_c != null)
      tempSamples.push({ occurredAt: s.occurredAt, value: s.temp_c });
    if (s.humidity_pct != null)
      rhSamples.push({ occurredAt: s.occurredAt, value: s.humidity_pct });
    if (s.vpd_kpa != null)
      vpdSamples.push({ occurredAt: s.occurredAt, value: s.vpd_kpa });
    if (s.co2_ppm != null)
      co2Samples.push({ occurredAt: s.occurredAt, value: s.co2_ppm });
  }

  const metrics: EnvironmentCheckInsightsMetricStat[] = [];
  const t = summarizeMetric("temp", "Temp", targets.temp_c.unit, tempSamples, targets.temp_c);
  if (t) metrics.push(t);
  const r = summarizeMetric(
    "humidity",
    "RH",
    targets.humidity_pct.unit,
    rhSamples,
    targets.humidity_pct,
  );
  if (r) metrics.push(r);
  const v = summarizeMetric("vpd", "VPD", targets.vpd_kpa.unit, vpdSamples, targets.vpd_kpa);
  if (v) metrics.push(v);
  const c = summarizeMetric("co2", "CO₂", targets.co2_ppm.unit, co2Samples, targets.co2_ppm);
  if (c) metrics.push(c);

  const count = vmList.length;
  const hasEnoughHistory = count >= 2;

  const latest: EnvironmentCheckInsightsLatest | null =
    vmList.length > 0
      ? (() => {
          const newest = vmList[0];
          const s = sampleById.get(newest.entryId);
          const values: EnvironmentCheckInsightsLatest["values"] = [];
          if (s) {
            if (s.temp_c != null)
              values.push({ key: "temp", label: "Temp", value: formatLatestValue("temp", s.temp_c) });
            if (s.humidity_pct != null)
              values.push({ key: "humidity", label: "RH", value: formatLatestValue("humidity", s.humidity_pct) });
            if (s.vpd_kpa != null)
              values.push({ key: "vpd", label: "VPD", value: formatLatestValue("vpd", s.vpd_kpa) });
            if (s.co2_ppm != null)
              values.push({ key: "co2", label: "CO₂", value: formatLatestValue("co2", s.co2_ppm) });
          }
          return { occurredAt: newest.occurredAt, values };
        })()
      : null;

  const outOfRangeCount = metrics.filter((m) => m.outOfRange).length;
  const outOfRangeNote = outOfRangeCount > 0
    ? ENVIRONMENT_CHECK_INSIGHTS_OUT_OF_RANGE
    : null;

  return {
    count,
    hasEnoughHistory,
    summary: buildSummary(count, metrics),
    disclaimer: ENVIRONMENT_CHECK_INSIGHTS_DISCLAIMER,
    usingGenericTargets,
    genericTargetsNote: usingGenericTargets
      ? ENVIRONMENT_CHECK_INSIGHTS_GENERIC_TARGETS
      : null,
    missingDataNote:
      missingDataCount > 0 ? ENVIRONMENT_CHECK_INSIGHTS_MISSING_DATA : null,
    latest,
    metrics,
    outOfRangeNote,
  };
}
