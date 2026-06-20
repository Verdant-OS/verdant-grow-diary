/**
 * ggsSentinelSmokeRunner — pure, read-only "is the GGS ingest path
 * actually producing live, canonical, fresh readings?" verdict.
 *
 * Hard constraints:
 *  - Pure function. No I/O, no React, no timers, no network, no Supabase.
 *  - Read-only. NEVER emits device commands, setpoints, or anything that
 *    could control Spider Farmer hardware.
 *  - Freshness guidance (`MetricFreshnessAssessment`) is EXPLANATORY
 *    ONLY. It MUST NOT change the verdict precedence. Aging metrics do
 *    not flip the verdict to BLOCKED_STALE_READING.
 *  - Unknown / missing / non-canonical data is never classified as
 *    PASS_LIVE_SENTINEL_READY.
 *  - `raw_payload` is never returned in the verdict surface. The
 *    presenter has no path to render it; the safety scan pins this.
 */

import { SPIDER_FARMER_GGS_PROVIDER, SPIDER_FARMER_GGS_STALE_MS } from "./spiderFarmerGgsMappingRules";

/** Halfway to stale. Aging is explanatory only — never a blocker. */
export const SPIDER_FARMER_GGS_AGING_MS = Math.floor(SPIDER_FARMER_GGS_STALE_MS / 2);

export type SentinelState =
  | "PASS_LIVE_SENTINEL_READY"
  | "BLOCKED_NO_GGS_ROWS"
  | "BLOCKED_NO_SOIL_TEMP_C"
  | "BLOCKED_NO_EC"
  | "BLOCKED_VENDOR_PROVENANCE_MISSING"
  | "BLOCKED_SOURCE_NOT_CANONICAL"
  | "BLOCKED_STALE_READING"
  | "BLOCKED_VALIDATION_ERROR"
  | "BLOCKED_RAW_PAYLOAD_RENDER_RISK";

export type MetricFreshnessState = "fresh" | "fresh_but_aging" | "stale" | "missing";

export type RequiredMetricKey = "soil_temp_c" | "soil_ec";

export const REQUIRED_METRIC_KEYS: ReadonlyArray<RequiredMetricKey> = [
  "soil_temp_c",
  "soil_ec",
];

export const REQUIRED_METRIC_LABELS: Readonly<Record<RequiredMetricKey, string>> = {
  soil_temp_c: "Soil temp",
  soil_ec: "Soil EC",
};

/** Closed vocabulary of `quality` values the runner accepts as canonical. */
export const CANONICAL_QUALITY_VALUES: ReadonlySet<string> = new Set(["live", "stale", "invalid"]);

/**
 * The minimum row shape the runner reads from `sensor_readings`. A wider
 * row (with `tent_id`, `device_id`, `user_id`, `raw_payload`, ...) is
 * acceptable, but the runner deliberately ignores everything not on this
 * interface so it can never accidentally surface untrusted fields.
 */
export interface SentinelSensorRow {
  metric: string;
  value: number | null | undefined;
  source: string | null | undefined;
  quality: string | null | undefined;
  captured_at: string | null;
}

export interface MetricFreshnessAssessment {
  metric: RequiredMetricKey;
  label: string;
  state: MetricFreshnessState;
  ageMs: number | null;
  capturedAt: string | null;
  nextAction: string;
}

export interface SentinelSmokeRunnerInput {
  rows: ReadonlyArray<SentinelSensorRow>;
  now: Date;
}

export interface SentinelSmokeRunnerVerdict {
  state: SentinelState;
  reasonCodes: ReadonlyArray<string>;
  freshness: ReadonlyArray<MetricFreshnessAssessment>;
}

const NEXT_ACTION_BY_STATE: Readonly<Record<MetricFreshnessState, string>> = {
  fresh: "No action needed",
  fresh_but_aging: "Confirm bridge is still publishing on schedule",
  stale: "Ingest a new real GGS reading",
  missing: "Paste/ingest a real GGS payload",
};

function ageMsFrom(capturedAt: string | null, now: Date): number | null {
  if (capturedAt === null) return null;
  const ts = Date.parse(capturedAt);
  if (!Number.isFinite(ts)) return null;
  return now.getTime() - ts;
}

function classifyAge(ageMs: number | null): MetricFreshnessState {
  if (ageMs === null) return "missing";
  if (ageMs > SPIDER_FARMER_GGS_STALE_MS) return "stale";
  if (ageMs > SPIDER_FARMER_GGS_AGING_MS) return "fresh_but_aging";
  return "fresh";
}

function latestRowForMetric(
  rows: ReadonlyArray<SentinelSensorRow>,
  metric: RequiredMetricKey,
): SentinelSensorRow | null {
  let best: SentinelSensorRow | null = null;
  let bestTs = -Infinity;
  for (const row of rows) {
    if (row.metric !== metric) continue;
    if (row.value === null || row.value === undefined || !Number.isFinite(row.value)) continue;
    if (row.captured_at === null) continue;
    const ts = Date.parse(row.captured_at);
    if (!Number.isFinite(ts)) continue;
    if (ts > bestTs) {
      bestTs = ts;
      best = row;
    }
  }
  return best;
}

export function assessMetricFreshness(
  row: SentinelSensorRow | null,
  metric: RequiredMetricKey,
  now: Date,
): MetricFreshnessAssessment {
  if (row === null) {
    return {
      metric,
      label: REQUIRED_METRIC_LABELS[metric],
      state: "missing",
      ageMs: null,
      capturedAt: null,
      nextAction: NEXT_ACTION_BY_STATE.missing,
    };
  }
  const ageMs = ageMsFrom(row.captured_at, now);
  const state = classifyAge(ageMs);
  return {
    metric,
    label: REQUIRED_METRIC_LABELS[metric],
    state,
    ageMs,
    capturedAt: row.captured_at,
    nextAction: NEXT_ACTION_BY_STATE[state],
  };
}

function hasGgsRows(rows: ReadonlyArray<SentinelSensorRow>): boolean {
  for (const row of rows) {
    if (typeof row.source === "string" && row.source === SPIDER_FARMER_GGS_PROVIDER) return true;
  }
  return false;
}

function anyNonCanonicalSource(rows: ReadonlyArray<SentinelSensorRow>): boolean {
  for (const row of rows) {
    if (typeof row.source !== "string") return true;
    if (row.source !== SPIDER_FARMER_GGS_PROVIDER) return true;
  }
  return false;
}

function anyNonCanonicalQuality(rows: ReadonlyArray<SentinelSensorRow>): boolean {
  for (const row of rows) {
    if (typeof row.quality !== "string") return true;
    if (!CANONICAL_QUALITY_VALUES.has(row.quality)) return true;
  }
  return false;
}

function anyValidationError(rows: ReadonlyArray<SentinelSensorRow>): boolean {
  for (const row of rows) {
    if (typeof row.metric !== "string" || row.metric.length === 0) return true;
    if (row.value === null || row.value === undefined || !Number.isFinite(row.value)) return true;
    if (row.captured_at !== null) {
      const ts = Date.parse(row.captured_at);
      if (!Number.isFinite(ts)) return true;
    }
  }
  return false;
}

function anyStaleOrInvalidQuality(rows: ReadonlyArray<SentinelSensorRow>): boolean {
  for (const row of rows) {
    if (row.quality === "stale" || row.quality === "invalid") return true;
  }
  return false;
}

/**
 * Compute the Sentinel smoke verdict.
 *
 * Verdict precedence — evaluated in order; the first matching code wins.
 * Freshness assessment is computed in parallel but never enters this
 * ladder (explanatory only).
 *
 *   1. BLOCKED_NO_GGS_ROWS                  no rows at all
 *   2. BLOCKED_VENDOR_PROVENANCE_MISSING    no row tagged spider_farmer_ggs
 *   3. BLOCKED_SOURCE_NOT_CANONICAL         any row carries a different source
 *   4. BLOCKED_VALIDATION_ERROR             any row missing/invalid metric/value/captured_at
 *   5. BLOCKED_NO_SOIL_TEMP_C               required metric missing
 *   6. BLOCKED_NO_EC                        required metric missing
 *   7. BLOCKED_STALE_READING                latest required metric beyond stale threshold
 *                                            OR any row carries quality=stale|invalid
 *   8. BLOCKED_RAW_PAYLOAD_RENDER_RISK      unreachable by construction; pinned by test
 *   9. PASS_LIVE_SENTINEL_READY             all required metrics fresh, canonical, valid
 */
export function runGgsSentinelSmoke(input: SentinelSmokeRunnerInput): SentinelSmokeRunnerVerdict {
  const { rows, now } = input;
  const reasonCodes: string[] = [];

  const freshness: MetricFreshnessAssessment[] = REQUIRED_METRIC_KEYS.map((metric) =>
    assessMetricFreshness(latestRowForMetric(rows, metric), metric, now),
  );

  if (rows.length === 0) {
    return { state: "BLOCKED_NO_GGS_ROWS", reasonCodes: ["no_rows"], freshness };
  }

  if (!hasGgsRows(rows)) {
    reasonCodes.push("no_spider_farmer_ggs_rows");
    return { state: "BLOCKED_VENDOR_PROVENANCE_MISSING", reasonCodes, freshness };
  }

  if (anyNonCanonicalSource(rows)) {
    reasonCodes.push("non_canonical_source");
    return { state: "BLOCKED_SOURCE_NOT_CANONICAL", reasonCodes, freshness };
  }

  if (anyNonCanonicalQuality(rows)) {
    reasonCodes.push("non_canonical_quality");
    return { state: "BLOCKED_SOURCE_NOT_CANONICAL", reasonCodes, freshness };
  }

  if (anyValidationError(rows)) {
    reasonCodes.push("validation_error");
    return { state: "BLOCKED_VALIDATION_ERROR", reasonCodes, freshness };
  }

  for (const metric of REQUIRED_METRIC_KEYS) {
    const row = latestRowForMetric(rows, metric);
    if (row === null) {
      const code = metric === "soil_temp_c" ? "BLOCKED_NO_SOIL_TEMP_C" : "BLOCKED_NO_EC";
      reasonCodes.push(metric === "soil_temp_c" ? "missing_soil_temp_c" : "missing_soil_ec");
      return { state: code, reasonCodes, freshness };
    }
  }

  if (anyStaleOrInvalidQuality(rows)) {
    reasonCodes.push("quality_marked_stale_or_invalid");
    return { state: "BLOCKED_STALE_READING", reasonCodes, freshness };
  }

  for (const assessment of freshness) {
    if (assessment.state === "stale" || assessment.state === "missing") {
      reasonCodes.push(`${assessment.metric}_${assessment.state}`);
      return { state: "BLOCKED_STALE_READING", reasonCodes, freshness };
    }
  }

  return { state: "PASS_LIVE_SENTINEL_READY", reasonCodes: [], freshness };
}
