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
  SENSOR_PROVENANCE_TRANSPORTS,
  isCanonicalSensorSource,
  type CanonicalSensorSource,
} from "@/constants/sensorIngestProvenance";
import { SENSOR_PROVIDER_LABELS, deriveProviderLabel } from "@/constants/sensorProviderLabels";
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
import { PPFD_MAX, PPFD_MIN, PPFD_UNIT_LONG } from "@/lib/ppfdRules";
import { SKILL_SENSOR_SOURCE_LABELS } from "@/lib/verdantSkillSchemas";

/**
 * Prototype-safe record lookup. Untrusted candidate strings are used as
 * keys into alias/allowlist tables; a plain `in`/index lookup would let
 * keys like "constructor" resolve to inherited Object members.
 */
function ownLookup<V>(table: Record<string, V>, key: string): V | undefined {
  if (typeof key !== "string") return undefined;
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

/**
 * Untrusted JSON metadata is string-typed at the type level but can be
 * anything at runtime (arrays coerce silently through `String()`,
 * `Date.parse`, and property lookup). Non-strings become null so every
 * consumer classifies them as absent/unknown rather than coercing.
 */
function safeString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * A raw-payload reference must be an opaque row identifier — never
 * payload contents, a signed URL, or a credential. Anything else is
 * dropped rather than forwarded into model-facing evaluations.
 */
const OPAQUE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function safeRawPayloadRef(v: unknown): string | null {
  const s = safeString(v);
  if (s === null) return null;
  const trimmed = s.trim();
  if (!OPAQUE_REF_RE.test(trimmed)) return null;
  if (trimmed.includes("://")) return null;
  return trimmed;
}

/** An ISO timestamp must carry Z or an explicit ±HH:MM offset. */
const ISO_EXPLICIT_TZ_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parse a timestamp to epoch ms, or null. Timezone-less strings are
 * REJECTED rather than parsed: `Date.parse("2026-07-30T12:00:00")` uses
 * the process's local timezone, which would make freshness and the
 * canonical timestamp depend on where the code runs — breaking the
 * gate's determinism contract.
 */
function parseExplicitTimestampMs(v: unknown): number | null {
  const s = safeString(v);
  if (s === null) return null;
  const trimmed = s.trim();
  if (trimmed === "" || !ISO_EXPLICIT_TZ_RE.test(trimmed)) return null;
  const t = Date.parse(trimmed);
  return Number.isNaN(t) ? null : t;
}

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
  "ppfd",
] as const;
export type SensorGateMetric = (typeof SENSOR_GATE_METRICS)[number];

export interface SensorReadingCandidate {
  /** Vendor/app identity. Presentation-only; never affects trust. */
  provider?: string | null;
  transport?: string | null;
  /** Raw source label as recorded; normalized deny-by-default. */
  source: string | null | undefined;
  /**
   * Persisted quality label (ok|degraded|stale|invalid) when the row
   * carries one. Non-ok quality can only WORSEN the evaluation, never
   * upgrade it; unknown labels classify as invalid.
   */
  quality?: string | null;
  capturedAt: string | null | undefined;
  receivedAt?: string | null;
  tentId: string;
  plantId?: string | null;
  /** Sensor/device identity, used to separate temporal samples from
   * genuine cross-sensor disagreement in series evaluation. */
  deviceId?: string | null;
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
  | "unit_unknown"
  | "soil_moisture_stuck_extreme"
  | "sensor_conflict"
  | "upstream_quality"
  | "unknown_quality"
  | "invalid_confidence"
  | "demo_source";

export type SensorExclusionReason =
  | "unknown_metric"
  | "unknown_source"
  | "demo_source"
  | "invalid_value"
  | "future_timestamp"
  | "missing_timestamp"
  | "missing_value"
  | "upstream_quality"
  | "stale_reading";

export interface SensorTruthEvaluation {
  tentId: string;
  plantId: string | null;
  deviceId: string | null;
  /** Canonical ISO capture timestamp, or null when absent/unparseable. */
  capturedAt: string | null;
  /** Canonical ISO ingest timestamp; breaks equal-capture-time ties. */
  receivedAt: string | null;
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
  /** Opaque audit pointer to the stored raw payload. Never contents. */
  rawPayloadRef: string | null;
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

/** Ordering used when a persisted quality label caps usability. */
const USABILITY_SEVERITY: Record<SensorUsability, number> = {
  usable: 0,
  degraded: 1,
  stale: 2,
  unknown: 3,
  invalid: 4,
};

/** Persisted DB quality labels → the BEST usability they permit. */
const QUALITY_TO_MAX_USABILITY: Record<string, SensorUsability> = {
  ok: "usable",
  degraded: "degraded",
  stale: "stale",
  invalid: "invalid",
};

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
  ppfd: 200,
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
  const alias = typeof raw === "string" ? ownLookup(LEGACY_SOURCE_ALIASES, raw) : undefined;
  if (alias !== undefined) {
    return { source: alias, warning: "legacy_source_alias" };
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
  // Persisted long-form rows and the webhook normalizer store EC as "ec".
  ec: "soil_ec_ms_cm",
  soil_temp_c: "soil_temp_c",
  ph: "ph",
  reservoir_ph: "ph",
  ppfd: "ppfd",
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
  ppfd: PPFD_UNIT_LONG,
};

/** Normalize the µ/μ/u spelling split before EC unit comparison. */
function normalizeEcUnitString(unit: string): string {
  return unit.replace(/[μu]S\/cm/i, "µS/cm").replace(/µs\/cm/i, "µS/cm");
}

/**
 * Accepted declared units per metric (lowercased). An EMPTY unit means
 * the candidate is trusted to already be in the metric's canonical unit
 * — the one documented implicit-unit assumption. Any other explicit
 * unit must be recognized or the value is rejected, never guessed.
 * (EC units are validated separately through `toCanonicalMscm`.)
 */
const ACCEPTED_UNITS: Record<Exclude<SensorGateMetric, "soil_ec_ms_cm">, readonly string[]> = {
  temperature_c: ["", "c", "°c", "f", "°f"],
  humidity_pct: ["", "%"],
  vpd_kpa: ["", "kpa"],
  co2_ppm: ["", "ppm"],
  soil_moisture_pct: ["", "%"],
  soil_temp_c: ["", "c", "°c", "f", "°f"],
  ph: ["", "ph"],
  ppfd: ["", "µmol/m²/s", "μmol/m²/s", "umol/m2/s", "µmol"],
};

/**
 * Upstream confidence handling: ABSENT confidence defaults to 1, but an
 * explicitly malformed (non-finite) confidence is conservative 0 — bad
 * trust metadata must never increase trust.
 */
function normalizeUpstreamConfidence(v: number | null | undefined): {
  value: number;
  malformed: boolean;
} {
  if (v === null || v === undefined) return { value: 1, malformed: false };
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return { value: 0, malformed: true };
  }
  if (v < 0) return { value: 0, malformed: false };
  if (v > 1) return { value: 1, malformed: false };
  return { value: v, malformed: false };
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
  const metricKey = safeString(candidate.metric);
  const metric = metricKey === null ? null : (ownLookup(METRIC_ALIAS, metricKey) ?? null);
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

  // Untrusted payloads may carry non-string unit metadata; classify it
  // as unknown instead of throwing on a string method.
  if (
    candidate.unit !== null &&
    candidate.unit !== undefined &&
    typeof candidate.unit !== "string"
  ) {
    return {
      metric,
      value: null,
      unit: CANONICAL_UNIT[metric],
      warnings: ["unit_unknown"],
    };
  }

  // Reject unrecognized explicit units instead of assuming canonical —
  // e.g. { metric: "temperature_c", unit: "K" } must never pass as °C.
  if (metric !== "soil_ec_ms_cm") {
    const declaredUnit = (candidate.unit ?? "").trim().toLowerCase();
    if (!ACCEPTED_UNITS[metric].includes(declaredUnit)) {
      return {
        metric,
        value: null,
        unit: CANONICAL_UNIT[metric],
        warnings: ["unit_unknown"],
      };
    }
  }

  let value: number | null = raw;

  if (metric === "temperature_c" || metric === "soil_temp_c") {
    const unit = (candidate.unit ?? "").trim().toUpperCase();
    // A unit-encoding metric key (temperature_f) contradicted by an
    // explicit Celsius unit is unresolvable — reject, never guess.
    if (candidate.metric === "temperature_f" && (unit === "C" || unit === "°C")) {
      return {
        metric,
        value: null,
        unit: CANONICAL_UNIT[metric],
        warnings: ["temperature_unit_suspected"],
      };
    }
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
    // Mirror the temperature doctrine: a unit-encoding metric key
    // (soil_ec_us_cm) contradicted by an explicit non-µS unit is
    // unresolvable — reject, never guess a conversion.
    if (
      candidate.metric === "soil_ec_us_cm" &&
      rawUnit !== "" &&
      normalizeEcUnitString(rawUnit) !== "µS/cm"
    ) {
      return {
        metric,
        value: null,
        unit: CANONICAL_UNIT[metric],
        warnings: ["unit_mismatch_suspected"],
      };
    }
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
  capturedAtRaw: unknown,
  source: CanonicalSensorSource,
  nowMs: number,
): { freshness: SensorFreshness; warning: SensorTruthWarning | null } {
  const t = parseExplicitTimestampMs(capturedAtRaw);
  if (t === null) {
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
  // Provider is echoed ONLY when it resolves against the known provider
  // label map — arbitrary adapter text (including credential-shaped
  // strings) must never reach the presenter-safe summary, even
  // title-cased.
  // Non-string metadata from untrusted payloads is treated as absent —
  // never fed to string methods.
  const providerRaw = typeof candidate.provider === "string" ? candidate.provider : "";
  const providerKey = providerRaw.trim().toLowerCase().replace(/-/g, "_");
  if (providerKey && ownLookup(SENSOR_PROVIDER_LABELS, providerKey)) {
    const provider = deriveProviderLabel(providerRaw);
    if (provider) parts.push(provider);
  }
  // Transport is echoed ONLY when it is one of the canonical provenance
  // transports — an arbitrary adapter string (token, URL, header) must
  // never reach the presenter-safe summary.
  const transport = (typeof candidate.transport === "string" ? candidate.transport : "")
    .trim()
    .toLowerCase();
  if ((SENSOR_PROVENANCE_TRANSPORTS as readonly string[]).includes(transport)) {
    parts.push(transport);
  }
  return parts.join(" · ");
}

/** Canonical ISO capture timestamp, or null when absent/unparseable. */
function canonicalCapturedAt(capturedAtRaw: unknown): string | null {
  const t = parseExplicitTimestampMs(capturedAtRaw);
  if (t === null) return null;
  return new Date(t).toISOString();
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
    } else if (normalized.metric === "ppfd" && (value < PPFD_MIN || value > PPFD_MAX)) {
      // classifyManualMetric has no ppfd case; the bounds authority is
      // ppfdRules (its self-declared single source of truth).
      validity = "invalid";
      value = null;
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

  // Persisted quality can only WORSEN the evaluation. A row the sensor
  // layer already marked degraded/stale/invalid must never be recomputed
  // as healthier here; unknown quality labels classify as invalid.
  const qualityRaw: unknown = candidate.quality;
  if (qualityRaw !== null && qualityRaw !== undefined) {
    // Non-string quality metadata is deny-by-default unknown, never
    // coerced (an array would otherwise stringify to a valid label).
    const qualityStr = safeString(qualityRaw);
    const quality = qualityStr === null ? "" : qualityStr.trim().toLowerCase();
    const cap = quality === "" ? undefined : ownLookup(QUALITY_TO_MAX_USABILITY, quality);
    if (cap === undefined) {
      warnings.push("unknown_quality");
      usability = "invalid";
      exclusionReason = exclusionReason ?? "upstream_quality";
    } else if (USABILITY_SEVERITY[cap] > USABILITY_SEVERITY[usability]) {
      warnings.push("upstream_quality");
      usability = cap;
      exclusionReason = exclusionReason ?? "upstream_quality";
    }
  }

  const excludedFromReasoning = usability !== "usable" && usability !== "degraded";
  const confidenceFactor = SENSOR_TRUTH_CONFIDENCE_FACTORS[usability];
  const upstreamConfidence = normalizeUpstreamConfidence(candidate.confidence);
  if (upstreamConfidence.malformed) warnings.push("invalid_confidence");
  const adjustedConfidence = Math.round(upstreamConfidence.value * confidenceFactor * 1000) / 1000;

  return {
    tentId: candidate.tentId,
    plantId: candidate.plantId ?? null,
    deviceId: candidate.deviceId ?? null,
    capturedAt: canonicalCapturedAt(candidate.capturedAt),
    receivedAt: canonicalCapturedAt(candidate.receivedAt),
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
    rawPayloadRef: safeRawPayloadRef(candidate.rawPayloadRef),
    provenanceSummary: buildProvenanceSummary(candidate, source),
  };
}

// ---------------------------------------------------------------------------
// Truth-gated VPD derivation
// ---------------------------------------------------------------------------

export interface TruthGatedVpdResult {
  /** Derived vpd_kpa, or null. A missing vpd_kpa never becomes 0. */
  vpdKpa: number | null;
  reason:
    | "derived"
    | "temperature_not_usable"
    | "humidity_not_usable"
    | "context_mismatch"
    | "not_contemporaneous"
    | "inputs_missing"
    | null;
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
  // Readings from different tents must never be combined into one VPD.
  if (temperature.tentId !== humidity.tentId) {
    return { vpdKpa: null, reason: "context_mismatch" };
  }
  if (temperature.usability !== "usable") {
    return { vpdKpa: null, reason: "temperature_not_usable" };
  }
  if (humidity.usability !== "usable") {
    return { vpdKpa: null, reason: "humidity_not_usable" };
  }
  // Temperature and RH must describe the same environmental moment. The
  // pairing window reuses the shared live-fresh window — no new
  // threshold. (Checked after usability so the more actionable
  // per-input reason wins when both apply.)
  const tempMs = Date.parse(temperature.capturedAt ?? "");
  const rhMs = Date.parse(humidity.capturedAt ?? "");
  if (
    Number.isNaN(tempMs) ||
    Number.isNaN(rhMs) ||
    Math.abs(tempMs - rhMs) > SENSOR_FRESH_WINDOW_MINUTES * MINUTE_MS
  ) {
    return { vpdKpa: null, reason: "not_contemporaneous" };
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
  /** Set for root-zone (plant-scoped) groups; null for tent-scoped ones. */
  plantId: string | null;
  metric: SensorGateMetric;
  /** Max minus min across the disagreeing included readings. */
  spread: number;
  tolerance: number;
  readingCount: number;
}

export interface SensorAggregate {
  tentId: string;
  /** Set for root-zone (plant-scoped) groups; null for tent-scoped ones. */
  plantId: string | null;
  metric: SensorGateMetric;
  rule: "mean";
  value: number;
  /** How many usable readings entered the aggregate. */
  usableCount: number;
  /** How many readings were excluded from the aggregate. */
  excludedCount: number;
}

/**
 * Root-zone metrics are plant-scoped: two plants in one tent legitimately
 * differ, so they group per plant. Atmospheric metrics group per tent.
 */
const ROOT_ZONE_METRICS: ReadonlySet<SensorGateMetric> = new Set([
  "soil_moisture_pct",
  "soil_ec_ms_cm",
  "soil_temp_c",
  "ph",
]);

/**
 * Recency ordering for two samples from the same device. Capture time
 * leads; when a row has no usable capture time its received time stands
 * in, so a NEWER broken row still supersedes an older good one (a device
 * whose newest sample is unusable must contribute nothing rather than
 * silently fall back to stale-but-healthy evidence). Input order is the
 * final deterministic tiebreaker — later wins.
 */
function isMoreRecentSample(
  next: SensorTruthEvaluation,
  nextOrder: number,
  prev: SensorTruthEvaluation,
  prevOrder: number,
): boolean {
  const nextPrimary = next.capturedAt ?? next.receivedAt ?? "";
  const prevPrimary = prev.capturedAt ?? prev.receivedAt ?? "";
  const primaryCmp = nextPrimary.localeCompare(prevPrimary);
  if (primaryCmp !== 0) return primaryCmp > 0;
  const receivedCmp = (next.receivedAt ?? "").localeCompare(prev.receivedAt ?? "");
  if (receivedCmp !== 0) return receivedCmp > 0;
  return nextOrder > prevOrder;
}

/** Grouping plant scope: the plant for root-zone metrics, else null. */
function groupPlantId(e: {
  metric: SensorGateMetric | null;
  plantId: string | null;
}): string | null {
  return e.metric !== null && ROOT_ZONE_METRICS.has(e.metric) ? e.plantId : null;
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

  // Cross-metric dependency (mirrors classifySnapshotTruth): a recorded
  // vpd_kpa is untrustworthy when a contemporaneous same-tent temperature
  // or humidity reading is invalid — even if the VPD value itself parses
  // inside the plausible band. Missing timestamps fail closed.
  // Any sibling input that cannot support reasoning taints the VPD —
  // not just outright-invalid values, but stale, demo, unknown-source,
  // and missing-value readings too. Siblings are first deduplicated to
  // the latest sample per device, so a superseded bad row does not taint
  // evidence its own correction already replaced.
  const latestSiblings = new Map<string, { e: SensorTruthEvaluation; order: number }>();
  evaluations.forEach((e, i) => {
    if (e.metric !== "temperature_c" && e.metric !== "humidity_pct") return;
    const key = `${e.tentId}|${e.metric}|${e.deviceId !== null ? `d:${e.deviceId}` : `anon:${i}`}`;
    const prev = latestSiblings.get(key);
    if (prev === undefined || isMoreRecentSample(e, i, prev.e, prev.order)) {
      latestSiblings.set(key, { e, order: i });
    }
  });
  const invalidVpdInputs = [...latestSiblings.values()]
    .map((entry) => entry.e)
    .filter((e) => e.validity === "invalid" || e.excludedFromReasoning);
  if (invalidVpdInputs.length > 0) {
    for (const e of evaluations) {
      if (e.metric !== "vpd_kpa" || e.excludedFromReasoning) continue;
      const vpdMs = Date.parse(e.capturedAt ?? "");
      const tainted = invalidVpdInputs.some((bad) => {
        if (bad.tentId !== e.tentId) return false;
        const badMs = Date.parse(bad.capturedAt ?? "");
        if (Number.isNaN(vpdMs) || Number.isNaN(badMs)) return true;
        return Math.abs(vpdMs - badMs) <= SENSOR_FRESH_WINDOW_MINUTES * MINUTE_MS;
      });
      if (tainted) {
        e.usability = "invalid";
        e.excludedFromReasoning = true;
        e.exclusionReason = "invalid_value";
        e.normalizedValue = null;
        e.confidenceFactor = SENSOR_TRUTH_CONFIDENCE_FACTORS.invalid;
        e.adjustedConfidence = 0;
        if (!e.warnings.includes("vpd_dropped_temp_rh_invalid")) {
          e.warnings = [...e.warnings, "vpd_dropped_temp_rh_invalid"];
        }
      }
    }
  }

  // Group included (usable/degraded) readings by tent + metric, and by
  // plant as well for root-zone metrics — one plant's root-zone telemetry
  // must never contaminate another's evidence. Within each group, only
  // the LATEST reading per device participates: successive temporal
  // samples from one sensor are history, not a cross-sensor conflict,
  // and must not be averaged together.
  // Group ALL classified readings — including excluded ones — so the
  // latest-per-device pass sees a device's true newest sample. If a
  // device's newest sample is excluded (invalid, demo, stale, …), the
  // device contributes nothing: an older usable sample must not be
  // resurrected as current.
  const grouped = new Map<string, Array<{ e: SensorTruthEvaluation; order: number }>>();
  evaluations.forEach((e, i) => {
    if (e.metric === null) return;
    const key = `${e.tentId}|${groupPlantId(e) ?? ""}|${e.metric}`;
    const list = grouped.get(key) ?? [];
    list.push({ e, order: i });
    grouped.set(key, list);
  });

  const groups = new Map<string, SensorTruthEvaluation[]>();
  for (const [key, list] of grouped.entries()) {
    const latestPerDevice = new Map<string, { e: SensorTruthEvaluation; order: number }>();
    for (const { e, order } of list) {
      // A device identity separates temporal samples; anonymous
      // candidates each count as their own device.
      const deviceKey = e.deviceId !== null ? `d:${e.deviceId}` : `anon:${order}`;
      const prev = latestPerDevice.get(deviceKey);
      if (prev === undefined || isMoreRecentSample(e, order, prev.e, prev.order)) {
        latestPerDevice.set(deviceKey, { e, order });
      }
    }
    const current = [...latestPerDevice.values()]
      .map((entry) => entry.e)
      .filter((e) => !e.excludedFromReasoning && e.normalizedValue !== null);
    if (current.length === 0) continue;
    // Cross-sensor comparison and aggregation require contemporaneous
    // readings: only samples within the shared live-fresh window of the
    // group's newest reading participate — older included readings are
    // history, not simultaneous disagreement.
    let newestMs = Number.NEGATIVE_INFINITY;
    for (const e of current) {
      const t = Date.parse(e.capturedAt ?? "");
      if (!Number.isNaN(t) && t > newestMs) newestMs = t;
    }
    const contemporaneous = current.filter((e) => {
      const t = Date.parse(e.capturedAt ?? "");
      return !Number.isNaN(t) && newestMs - t <= SENSOR_FRESH_WINDOW_MINUTES * MINUTE_MS;
    });
    if (contemporaneous.length > 0) groups.set(key, contemporaneous);
  }

  const conflicts: SensorConflict[] = [];
  for (const [, list] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (list.length < 2) continue;
    const values = list.map((e) => e.normalizedValue as number);
    const spread = Math.max(...values) - Math.min(...values);
    const metric = list[0].metric as SensorGateMetric;
    const tolerance = SENSOR_CONFLICT_TOLERANCES[metric];
    if (spread > tolerance) {
      conflicts.push({
        tentId: list[0].tentId,
        plantId: groupPlantId(list[0]),
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
    for (const [, list] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const usable = list.filter((e) => e.usability === "usable");
      if (usable.length === 0) continue;
      const tentId = list[0].tentId;
      const plantId = groupPlantId(list[0]);
      const metric = list[0].metric as SensorGateMetric;
      const totalForGroup = evaluations.filter(
        (e) => e.tentId === tentId && e.metric === metric && groupPlantId(e) === plantId,
      ).length;
      const sum = usable.reduce((acc, e) => acc + (e.normalizedValue as number), 0);
      aggregates.push({
        tentId,
        plantId,
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
