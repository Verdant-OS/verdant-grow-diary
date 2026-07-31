/**
 * sensorTruthGateRules — the deterministic Sensor Truth Gate for Verdant
 * Skill Runtime v1 (Build 2).
 *
 * Runs BEFORE any LLM or vision model. Classifies raw or normalized
 * sensor candidates into truth-gated evaluations that skills consume;
 * after this layer, no skill reads raw sensor rows directly.
 *
 * Pure & deterministic: no I/O, no Supabase, no React, no Date.now() —
 * `nowMs` is always injected. Same candidates + same nowMs → identical
 * output, byte for byte.
 *
 * COMPOSITION, NOT A SECOND RULE SYSTEM — every threshold and vocabulary
 * is imported from its existing authority:
 *  - Source labels: `CANONICAL_SENSOR_SOURCES` from
 *    `@/constants/sensorIngestProvenance` (the canonical six). Legacy
 *    aliases normalize exactly as the existing boundary rule does
 *    (imported→csv, sim→demo); everything else is deny-by-default
 *    invalid — never live.
 *  - Realism / suspicion: predicates + `classifyManualMetric` from
 *    `@/lib/sensorTruthRules` (the doc-named rule table), including the
 *    EC unit-mismatch heuristic and stuck-RH detection.
 *  - Freshness: live readings use `SENSOR_FRESH_WINDOW_MINUTES` and the
 *    future-skew limit from `@/lib/latestSensorSnapshotRules`; non-live
 *    sources use `resolveStaleWindowMs` from
 *    `@/lib/sensorSnapshotStatusContract` (the per-source registry —
 *    24h default, which is the manual-reading doctrine).
 *  - Units: `fahrenheitToCelsius` from `@/lib/temperatureUnits`,
 *    `toCanonicalMscm` from `@/lib/ecUnits`.
 *  - VPD: `calculateAirVpdKpa` from `@/lib/vpdRules`, gated so vpd_kpa
 *    is never derived from invalid, suspicious, stale, or untrusted
 *    temperature/humidity inputs, and a missing vpd_kpa never becomes 0.
 *  - Provider display names: `deriveProviderLabel` from
 *    `@/constants/sensorProviderLabels` (presentation-only; vendor
 *    identity never affects trust).
 *
 * Intentional divergences (documented, not accidental):
 *  - Unknown source labels classify as invalid here even though some
 *    legacy aggregation paths default unrecognized sources to live —
 *    the gate is deny-by-default and those paths predate it.
 *  - Future-dated readings beyond the shared skew limit are invalid,
 *    matching the DB trigger, even though some AI annotators currently
 *    treat future timestamps as fresh.
 *  - F/C confusion is flagged with no new numeric band: a temperature
 *    failing realism in its declared unit while passing when read in
 *    the other unit is suspicious by construction.
 *
 * Hard rules (from the build spec):
 *  - Demo / CSV / manual must never become live.
 *  - Missing values must never become zero.
 *  - Invalid/stale values never support a healthy conclusion.
 *  - Multiple sensors are never silently averaged — aggregation happens
 *    only under an explicit aggregation rule, over usable values only.
 */

import {
  CANONICAL_SENSOR_SOURCES,
  isCanonicalSensorSource,
  type CanonicalSensorSource,
} from "@/constants/sensorIngestProvenance";
import { deriveProviderLabel } from "@/constants/sensorProviderLabels";
import {
  classifyManualMetric,
  isAirTempCRealistic,
  isAirTempFRealistic,
  isHumidityStuckExtreme,
  type TruthReasonCode,
} from "@/lib/sensorTruthRules";
import {
  SENSOR_FRESH_WINDOW_MINUTES,
  SENSOR_FUTURE_SKEW_LIMIT_MINUTES,
} from "@/lib/latestSensorSnapshotRules";
import { resolveStaleWindowMs, type SnapshotStatus } from "@/lib/sensorSnapshotStatusContract";
import { fahrenheitToCelsius } from "@/lib/temperatureUnits";
import { toCanonicalMscm } from "@/lib/ecUnits";
import { calculateAirVpdKpa } from "@/lib/vpdRules";
import { SKILL_SENSOR_SOURCE_LABELS } from "@/lib/verdantSkillSchemas";

// ---------------------------------------------------------------------------
// Vocabulary locks
// ---------------------------------------------------------------------------

// The Skill Runtime contract labels and the ingest-provenance canon must
// stay the same six strings. Drift fails typecheck here.
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _sourceVocabularyLocked: AssertEqual<
  CanonicalSensorSource,
  (typeof SKILL_SENSOR_SOURCE_LABELS)[number]
> = true;
void _sourceVocabularyLocked;

// ---------------------------------------------------------------------------
// Input candidate
// ---------------------------------------------------------------------------

/** Canonical gate metric keys (the storage vocabulary). */
export const SENSOR_GATE_METRICS = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "soil_ec_ms_cm",
  "soil_temp_c",
  "ph",
] as const;
export type SensorGateMetric = (typeof SENSOR_GATE_METRICS)[number];

export interface SensorReadingCandidate {
  /** Vendor/app identity. Presentation-only; never affects trust. */
  provider?: string | null;
  transport?: string | null;
  /** Raw source label as recorded; normalized deny-by-default. */
  source: string | null | undefined;
  capturedAt: string | null | undefined;
  receivedAt?: string | null;
  tentId: string;
  plantId?: string | null;
  metric: string;
  /** Missing stays null. The gate never substitutes zero. */
  value: number | null | undefined;
  unit?: string | null;
  /** Upstream per-reading confidence, 0..1. Defaults to 1 when absent. */
  confidence?: number | null;
  calibration?: { lastCalibratedAt?: string | null; note?: string | null } | null;
  /** Opaque pointer to the stored raw payload. Contents never enter. */
  rawPayloadRef?: string | null;
}

// ---------------------------------------------------------------------------
// Result vocabulary
// ---------------------------------------------------------------------------

export type SensorFreshness = "fresh" | "stale" | "future_invalid" | "unknown_timestamp";

export type SensorValidity = "valid" | "suspicious" | "invalid" | "missing" | "unknown_metric";

/** Build-spec usability states. Only "usable" and "degraded" reach reasoning. */
export type SensorUsability = "usable" | "degraded" | "stale" | "invalid" | "unknown";

export type SensorTruthWarning =
  | TruthReasonCode
  | "unknown_metric"
  | "unknown_source"
  | "legacy_source_alias"
  | "future_timestamp"
  | "missing_timestamp"
  | "missing_value"
  | "temperature_unit_suspected"
  | "ec_unit_unknown"
  | "soil_moisture_stuck_extreme"
  | "sensor_conflict"
  | "demo_source";

export type SensorExclusionReason =
  | "unknown_metric"
  | "unknown_source"
  | "demo_source"
  | "invalid_value"
  | "future_timestamp"
  | "missing_timestamp"
  | "missing_value"
  | "stale_reading";

export interface SensorTruthEvaluation {
  tentId: string;
  plantId: string | null;
  metric: SensorGateMetric | null;
  /** Canonical unit value, or null. Never invented, never defaulted to 0. */
  normalizedValue: number | null;
  normalizedUnit: string | null;
  source: CanonicalSensorSource;
  freshness: SensorFreshness;
  validity: SensorValidity;
  usability: SensorUsability;
  /** Multiplier applied to upstream confidence for this usability tier. */
  confidenceFactor: number;
  /** clamp01(candidate.confidence ?? 1) * confidenceFactor. */
  adjustedConfidence: number;
  warnings: SensorTruthWarning[];
  excludedFromReasoning: boolean;
  exclusionReason: SensorExclusionReason | null;
  /** Presenter-safe provenance line. No payload contents, ids, or secrets. */
  provenanceSummary: string;
}

/**
 * Confidence multipliers per usability tier. Follows the existing
 * fixed-step precedent (cloud-row confidence steps 0 / 0.3 / 0.5) with
 * usable passing upstream confidence through untouched.
 */
export const SENSOR_TRUTH_CONFIDENCE_FACTORS: Record<SensorUsability, number> = Object.freeze({
  usable: 1,
  degraded: 0.5,
  stale: 0.3,
  invalid: 0,
  unknown: 0,
});

/**
 * Cross-sensor disagreement tolerances per metric (canonical units).
 * This is a NEW capability — no prior module compares sensors — so these
 * constants have no competing authority to import from.
 */
export const SENSOR_CONFLICT_TOLERANCES: Record<SensorGateMetric, number> = Object.freeze({
  temperature_c: 2,
  humidity_pct: 8,
  vpd_kpa: 0.3,
  co2_ppm: 300,
  soil_moisture_pct: 10,
  soil_ec_ms_cm: 0.8,
  soil_temp_c: 2,
  ph: 0.5,
});

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/** Legacy trust-equivalent aliases (matches the existing boundary rule). */
const LEGACY_SOURCE_ALIASES: Record<string, CanonicalSensorSource> = {
  imported: "csv",
  sim: "demo",
};

interface NormalizedSource {
  source: CanonicalSensorSource;
  warning: SensorTruthWarning | null;
}

function normalizeCandidateSource(raw: unknown): NormalizedSource {
  if (isCanonicalSensorSource(raw)) return { source: raw, warning: null };
  if (typeof raw === "string" && raw in LEGACY_SOURCE_ALIASES) {
    return { source: LEGACY_SOURCE_ALIASES[raw], warning: "legacy_source_alias" };
  }
  // Deny-by-default: vendor names, transports, "unknown", or anything
  // else classify as invalid — never live.
  return { source: "invalid", warning: "unknown_source" };
}

const METRIC_ALIAS: Record<string, SensorGateMetric> = {
  temperature_c: "temperature_c",
  temperature_f: "temperature_c",
  humidity_pct: "humidity_pct",
  vpd_kpa: "vpd_kpa",
  co2_ppm: "co2_ppm",
  soil_moisture_pct: "soil_moisture_pct",
  soil_ec_ms_cm: "soil_ec_ms_cm",
  soil_ec: "soil_ec_ms_cm",
  soil_ec_us_cm: "soil_ec_ms_cm",
  soil_temp_c: "soil_temp_c",
  ph: "ph",
  reservoir_ph: "ph",
};

const CANONICAL_UNIT: Record<SensorGateMetric, string> = {
  temperature_c: "°C",
  humidity_pct: "%",
  vpd_kpa: "kPa",
  co2_ppm: "ppm",
  soil_moisture_pct: "%",
  soil_ec_ms_cm: "mS/cm",
  soil_temp_c: "°C",
  ph: "pH",
};

/** Normalize the µ/μ/u spelling split before EC unit comparison. */
function normalizeEcUnitString(unit: string): string {
  return unit.replace(/[μu]S\/cm/i, "µS/cm").replace(/µs\/cm/i, "µS/cm");
}

function clamp01(v: number | null | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 1;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

interface NormalizedMetricValue {
  metric: SensorGateMetric | null;
  value: number | null;
  unit: string | null;
  warnings: SensorTruthWarning[];
}

/**
 * Resolve the candidate's metric key to canonical vocabulary and convert
 * its value to the canonical unit. Missing values pass through as null —
 * never zero. Unknown metrics and unknown EC units resolve to null value
 * with a warning instead of a guess.
 */
export function normalizeSensorCandidate(
  candidate: Pick<SensorReadingCandidate, "metric" | "value" | "unit">,
): NormalizedMetricValue {
  const warnings: SensorTruthWarning[] = [];
  const metric = METRIC_ALIAS[candidate.metric] ?? null;
  if (metric === null) {
    return { metric: null, value: null, unit: null, warnings: ["unknown_metric"] };
  }
  const raw = candidate.value;
  if (raw === null || raw === undefined || !Number.isFinite(raw)) {
    return {
      metric,
      value: null,
      unit: CANONICAL_UNIT[metric],
      warnings: raw === null || raw === undefined ? ["missing_value"] : [],
    };
  }

  let value: number | null = raw;

  if (metric === "temperature_c" || metric === "soil_temp_c") {
    const unit = (candidate.unit ?? "").trim().toUpperCase();
    const declaredF = candidate.metric === "temperature_f" || unit === "F" || unit === "°F";
    if (declaredF) {
      value = fahrenheitToCelsius(raw);
      // Fails realism as °F but reads realistic as °C → unit suspected.
      // (Air-realism predicates, so the heuristic applies to air temp only.)
      if (metric === "temperature_c" && !isAirTempCRealistic(value) && isAirTempCRealistic(raw)) {
        warnings.push("temperature_unit_suspected");
      }
    } else if (
      metric === "temperature_c" &&
      !isAirTempCRealistic(raw) &&
      isAirTempFRealistic(raw)
    ) {
      // Declared °C but only plausible as °F → unit suspected.
      warnings.push("temperature_unit_suspected");
    }
  }

  if (metric === "soil_ec_ms_cm") {
    const rawUnit = (candidate.unit ?? "").trim();
    const declaredUs =
      candidate.metric === "soil_ec_us_cm" || normalizeEcUnitString(rawUnit) === "µS/cm";
    if (declaredUs) {
      value = toCanonicalMscm(raw, "µS/cm");
    } else if (rawUnit !== "" && rawUnit !== "mS/cm") {
      const converted = toCanonicalMscm(
        raw,
        normalizeEcUnitString(rawUnit) as Parameters<typeof toCanonicalMscm>[1],
      );
      if (converted === null) {
        return {
          metric,
          value: null,
          unit: CANONICAL_UNIT[metric],
          warnings: ["ec_unit_unknown"],
        };
      }
      value = converted;
    }
  }

  return { metric, value, unit: CANONICAL_UNIT[metric], warnings };
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

const MINUTE_MS = 60_000;

function classifyCandidateFreshness(
  capturedAt: string | null | undefined,
  source: CanonicalSensorSource,
  nowMs: number,
): { freshness: SensorFreshness; warning: SensorTruthWarning | null } {
  if (capturedAt == null || capturedAt === "") {
    return { freshness: "unknown_timestamp", warning: "missing_timestamp" };
  }
  const t = Date.parse(capturedAt);
  if (Number.isNaN(t)) {
    return { freshness: "unknown_timestamp", warning: "missing_timestamp" };
  }
  const ageMs = nowMs - t;
  if (-ageMs > SENSOR_FUTURE_SKEW_LIMIT_MINUTES * MINUTE_MS) {
    return { freshness: "future_invalid", warning: "future_timestamp" };
  }
  // Live readings use the shared 15-minute live-fresh window; all other
  // sources use the status contract's centralized per-source resolver
  // (24h default — the manual-reading doctrine window).
  const windowMs =
    source === "live" ? SENSOR_FRESH_WINDOW_MINUTES * MINUTE_MS : resolveStaleWindowMs(source);
  if (ageMs > windowMs) {
    return { freshness: "stale", warning: "stale_reading" };
  }
  return { freshness: "fresh", warning: null };
}

// ---------------------------------------------------------------------------
// Core evaluation
// ---------------------------------------------------------------------------

export interface EvaluateSensorTruthOptions {
  /** Injected clock (epoch ms). Required — the gate never reads a clock. */
  nowMs: number;
}

function dedupe<T>(items: readonly T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function buildProvenanceSummary(
  candidate: SensorReadingCandidate,
  source: CanonicalSensorSource,
): string {
  const parts: string[] = [`${source} reading`];
  const provider = deriveProviderLabel(candidate.provider ?? null);
  if (provider) parts.push(provider);
  const transport = (candidate.transport ?? "").trim();
  if (transport) parts.push(transport);
  return parts.join(" · ");
}

/**
 * Evaluate one sensor candidate deterministically. This is the single
 * choke point: skills consume `SensorTruthEvaluation`s, never raw rows.
 */
export function evaluateSensorTruth(
  candidate: SensorReadingCandidate,
  options: EvaluateSensorTruthOptions,
): SensorTruthEvaluation {
  const warnings: SensorTruthWarning[] = [];

  const sourceResult = normalizeCandidateSource(candidate.source);
  if (sourceResult.warning) warnings.push(sourceResult.warning);
  const source = sourceResult.source;
  if (source === "demo") warnings.push("demo_source");

  const normalized = normalizeSensorCandidate(candidate);
  warnings.push(...normalized.warnings);

  const freshnessResult = classifyCandidateFreshness(candidate.capturedAt, source, options.nowMs);
  if (freshnessResult.warning) warnings.push(freshnessResult.warning);
  const freshness = freshnessResult.freshness;

  // Validity: realism + suspicion via the doc-named rule table.
  let validity: SensorValidity;
  let value = normalized.value;
  if (normalized.metric === null) {
    validity = "unknown_metric";
  } else if (value === null) {
    validity = candidate.value === null || candidate.value === undefined ? "missing" : "invalid";
  } else {
    const truth = classifyManualMetric(normalized.metric, value);
    if (!truth.valid) {
      validity = "invalid";
      if (truth.reasonCode) warnings.push(truth.reasonCode);
      value = null; // invalid values are nulled, never passed through
    } else if (normalized.metric === "humidity_pct" && isHumidityStuckExtreme(value)) {
      validity = "suspicious";
      warnings.push("humidity_stuck_extreme");
    } else if (normalized.metric === "soil_moisture_pct" && (value === 0 || value === 100)) {
      // Domain-bound stuck detection mirrors the RH rule; 0/100 are the
      // unit's own bounds, not a tunable threshold.
      validity = "suspicious";
      warnings.push("soil_moisture_stuck_extreme");
    } else if (warnings.includes("temperature_unit_suspected")) {
      validity = "suspicious";
    } else {
      validity = "valid";
    }
  }

  // Usability + exclusion (deterministic precedence).
  let usability: SensorUsability;
  let exclusionReason: SensorExclusionReason | null = null;
  if (validity === "unknown_metric") {
    usability = "unknown";
    exclusionReason = "unknown_metric";
  } else if (sourceResult.warning === "unknown_source") {
    usability = "invalid";
    exclusionReason = "unknown_source";
  } else if (source === "demo") {
    usability = "invalid";
    exclusionReason = "demo_source";
  } else if (source === "invalid" || validity === "invalid") {
    usability = "invalid";
    exclusionReason = "invalid_value";
  } else if (freshness === "future_invalid") {
    usability = "invalid";
    exclusionReason = "future_timestamp";
  } else if (freshness === "unknown_timestamp") {
    usability = "unknown";
    exclusionReason = "missing_timestamp";
  } else if (validity === "missing") {
    usability = "unknown";
    exclusionReason = "missing_value";
  } else if (source === "stale" || freshness === "stale") {
    usability = "stale";
    exclusionReason = "stale_reading";
  } else if (validity === "suspicious") {
    usability = "degraded";
  } else {
    usability = "usable";
  }

  const excludedFromReasoning = usability !== "usable" && usability !== "degraded";
  const confidenceFactor = SENSOR_TRUTH_CONFIDENCE_FACTORS[usability];
  const adjustedConfidence =
    Math.round(clamp01(candidate.confidence) * confidenceFactor * 1000) / 1000;

  return {
    tentId: candidate.tentId,
    plantId: candidate.plantId ?? null,
    metric: normalized.metric,
    normalizedValue: excludedFromReasoning && validity === "invalid" ? null : value,
    normalizedUnit: normalized.unit,
    source,
    freshness,
    validity,
    usability,
    confidenceFactor,
    adjustedConfidence,
    warnings: dedupe(warnings),
    excludedFromReasoning,
    exclusionReason: excludedFromReasoning ? exclusionReason : null,
    provenanceSummary: buildProvenanceSummary(candidate, source),
  };
}

// ---------------------------------------------------------------------------
// Truth-gated VPD derivation
// ---------------------------------------------------------------------------

export interface TruthGatedVpdResult {
  /** Derived vpd_kpa, or null. A missing vpd_kpa never becomes 0. */
  vpdKpa: number | null;
  reason: "derived" | "temperature_not_usable" | "humidity_not_usable" | "inputs_missing" | null;
}

/**
 * Derive vpd_kpa from truth-gated temperature and humidity evaluations.
 * Requires BOTH inputs to be fully usable — degraded (e.g. stuck-at-0
 * humidity), stale, invalid, or untrusted inputs block derivation, which
 * also enforces the RH-must-be-positive rule without a second copy of it.
 */
export function deriveTruthGatedVpd(
  temperature: SensorTruthEvaluation | null | undefined,
  humidity: SensorTruthEvaluation | null | undefined,
): TruthGatedVpdResult {
  if (
    !temperature ||
    temperature.metric !== "temperature_c" ||
    temperature.normalizedValue === null
  ) {
    return { vpdKpa: null, reason: "inputs_missing" };
  }
  if (!humidity || humidity.metric !== "humidity_pct" || humidity.normalizedValue === null) {
    return { vpdKpa: null, reason: "inputs_missing" };
  }
  if (temperature.usability !== "usable") {
    return { vpdKpa: null, reason: "temperature_not_usable" };
  }
  if (humidity.usability !== "usable") {
    return { vpdKpa: null, reason: "humidity_not_usable" };
  }
  const vpd = calculateAirVpdKpa({
    tempC: temperature.normalizedValue,
    rhPercent: humidity.normalizedValue,
  });
  if (vpd === null) return { vpdKpa: null, reason: "inputs_missing" };
  return { vpdKpa: vpd, reason: "derived" };
}

// ---------------------------------------------------------------------------
// Series evaluation — conflicts + explicit-only aggregation
// ---------------------------------------------------------------------------

export interface SensorConflict {
  tentId: string;
  metric: SensorGateMetric;
  /** Max minus min across the disagreeing included readings. */
  spread: number;
  tolerance: number;
  readingCount: number;
}

export interface SensorAggregate {
  tentId: string;
  metric: SensorGateMetric;
  rule: "mean";
  value: number;
  /** How many usable readings entered the aggregate. */
  usableCount: number;
  /** How many readings were excluded from the aggregate. */
  excludedCount: number;
}

export interface EvaluateSensorSeriesOptions extends EvaluateSensorTruthOptions {
  /**
   * Aggregation happens ONLY when explicitly requested, and only over
   * usable readings. There is no silent averaging.
   */
  aggregation?: { rule: "mean" };
}

export interface SensorSeriesResult {
  evaluations: SensorTruthEvaluation[];
  conflicts: SensorConflict[];
  aggregates: SensorAggregate[];
}

export function evaluateSensorSeries(
  candidates: readonly SensorReadingCandidate[],
  options: EvaluateSensorSeriesOptions,
): SensorSeriesResult {
  const evaluations = candidates.map((c) => evaluateSensorTruth(c, { nowMs: options.nowMs }));

  // Group included (usable/degraded) fresh readings by tent + metric.
  const groups = new Map<string, SensorTruthEvaluation[]>();
  evaluations.forEach((e) => {
    if (e.metric === null || e.normalizedValue === null) return;
    if (e.excludedFromReasoning) return;
    const key = `${e.tentId} ${e.metric}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  });

  const conflicts: SensorConflict[] = [];
  for (const [key, list] of [...groups.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (list.length < 2) continue;
    const values = list.map((e) => e.normalizedValue as number);
    const spread = Math.max(...values) - Math.min(...values);
    const metric = list[0].metric as SensorGateMetric;
    const tolerance = SENSOR_CONFLICT_TOLERANCES[metric];
    if (spread > tolerance) {
      const tentId = key.split(" ")[0];
      conflicts.push({
        tentId,
        metric,
        spread: Math.round(spread * 1000) / 1000,
        tolerance,
        readingCount: list.length,
      });
      // Conflicting readings stay visible but carry the conflict warning;
      // they are never flattened into a single false-certainty number.
      list.forEach((e) => {
        if (!e.warnings.includes("sensor_conflict")) {
          e.warnings = [...e.warnings, "sensor_conflict"];
        }
      });
    }
  }

  const aggregates: SensorAggregate[] = [];
  if (options.aggregation?.rule === "mean") {
    for (const [key, list] of [...groups.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )) {
      const usable = list.filter((e) => e.usability === "usable");
      if (usable.length === 0) continue;
      const tentId = key.split(" ")[0];
      const metric = list[0].metric as SensorGateMetric;
      const totalForGroup = evaluations.filter(
        (e) => e.tentId === tentId && e.metric === metric,
      ).length;
      const sum = usable.reduce((acc, e) => acc + (e.normalizedValue as number), 0);
      aggregates.push({
        tentId,
        metric,
        rule: "mean",
        value: Math.round((sum / usable.length) * 1000) / 1000,
        usableCount: usable.length,
        excludedCount: totalForGroup - usable.length,
      });
    }
  }

  return { evaluations, conflicts, aggregates };
}

// ---------------------------------------------------------------------------
// Provenance summary
// ---------------------------------------------------------------------------

export interface SensorProvenanceSummary {
  /** Per-source counts in canonical label order. Zero-count sources omitted. */
  sourceCounts: Array<{ source: CanonicalSensorSource; count: number }>;
  includedCount: number;
  excludedCount: number;
  /** Deduped, sorted warning codes across the series. */
  warnings: SensorTruthWarning[];
}

export function summarizeSensorProvenance(
  evaluations: readonly SensorTruthEvaluation[],
): SensorProvenanceSummary {
  const counts = new Map<CanonicalSensorSource, number>();
  const warnings = new Set<SensorTruthWarning>();
  let excluded = 0;
  for (const e of evaluations) {
    counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
    e.warnings.forEach((w) => warnings.add(w));
    if (e.excludedFromReasoning) excluded += 1;
  }
  return {
    sourceCounts: CANONICAL_SENSOR_SOURCES.filter((s) => counts.has(s)).map((s) => ({
      source: s,
      count: counts.get(s) as number,
    })),
    includedCount: evaluations.length - excluded,
    excludedCount: excluded,
    warnings: [...warnings].sort(),
  };
}

// ---------------------------------------------------------------------------
// Interop mappers — explicit bridges to the existing vocabularies
// ---------------------------------------------------------------------------

/** Map gate usability onto the canonical SnapshotStatus contract. */
export function usabilityToSnapshotStatus(u: SensorUsability): SnapshotStatus {
  switch (u) {
    case "usable":
      return "usable";
    case "degraded":
      return "needs_review";
    case "stale":
      return "stale";
    case "invalid":
      return "invalid";
    case "unknown":
      return "needs_review";
  }
}

/** Map gate usability onto the persisted DB quality vocabulary. */
export function usabilityToDbQuality(u: SensorUsability): "ok" | "degraded" | "stale" | "invalid" {
  switch (u) {
    case "usable":
      return "ok";
    case "degraded":
      return "degraded";
    case "stale":
      return "stale";
    case "invalid":
      return "invalid";
    case "unknown":
      return "invalid";
  }
}
