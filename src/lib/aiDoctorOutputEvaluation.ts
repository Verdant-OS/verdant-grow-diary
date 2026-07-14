/**
 * aiDoctorOutputEvaluation — deterministic semantic evaluator for AI Doctor
 * Phase 1 results.
 *
 * Runs AFTER the existing readiness gate (`aiDoctorContextRules` /
 * `evaluateAiDoctorContext` → `AiDoctorContextResult.readiness`) has already
 * decided whether a review may start. This module does NOT re-decide readiness
 * and NEVER renames the `strong | partial | insufficient` gate terminology.
 *
 * It answers: given a finished `Phase1DiagnosisResult`, is the result safe,
 * well-formed, evidence-supported, and appropriately confident for the gate
 * decision that permitted it?
 *
 * Hard constraints:
 *  - Pure & deterministic: no React, no Supabase, no fetch, no model/API calls,
 *    no Date.now()/Math.random(), no Action Queue writes, no alerts.
 *  - Never mutates its inputs.
 *  - Never surfaces raw sensor payloads, secrets, tokens, or private IDs.
 *  - Findings are stable-sorted so regression output is byte-identical run over run.
 *
 * Scope (v1): targets the Phase 1 engine result only. The secondary
 * `AiDoctorResult` / `AiDoctorReviewResult` / `Diagnosis` families are out of
 * scope; no adapter is introduced here.
 *
 * COMMIT MAP — codes are declared as one stable union; rules land incrementally:
 *  - Commit 1 (this file, now): contract / shape rules only.
 *  - Commit 2: evidence + provenance integrity.
 *  - Commit 3: confidence calibration + recommendation safety.
 * A code appearing in the union without an active rule yet is intentional; every
 * code has an executable rule + test by the end of Commit 3/4.
 */

import type { Phase1DiagnosisResult, Phase1PlantContextPayload } from "@/lib/aiDoctorEngine";
import type { AiDoctorContextResult, AiDoctorContextReadiness } from "@/lib/aiDoctorContextRules";
import type { AiDoctorConfidenceResult } from "@/lib/aiDoctorConfidenceAdapter";
import {
  bandForConfidence,
  isLikelyAutoflower,
  DEVICE_CONTROL_DETECTION_PATTERNS,
} from "@/lib/aiDoctorSafetyRules";

// ---------------------------------------------------------------------------
// Contract version
// ---------------------------------------------------------------------------

/**
 * Stable identifier for the evaluated output contract. Bump only on a
 * breaking change to the finding-code catalog or evaluation semantics.
 */
export const AI_DOCTOR_OUTPUT_CONTRACT_VERSION = "ai-doctor-output-eval/v1";

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export type AiDoctorEvaluationStatus = "pass" | "warning" | "fail";

export type AiDoctorEvaluationSeverity = "error" | "warning" | "info";

/**
 * Stable, machine-readable finding codes. Ordering of the union is
 * documentation only — findings are sorted lexicographically by `code` at
 * runtime, never by declaration order.
 */
export type AiDoctorEvaluationCode =
  // --- contract / shape (Commit 1) ---
  | "required_field_missing"
  | "required_field_empty"
  | "invalid_confidence"
  | "invalid_risk_level"
  | "follow_up_absent"
  // --- readiness / confidence calibration (Commit 3) ---
  | "diagnosis_generated_while_insufficient"
  | "confidence_exceeds_readiness"
  | "missing_information_absent"
  | "partial_context_limitation_absent"
  | "overconfident_language"
  // --- evidence integrity (Commit 2) ---
  | "evidence_not_in_context"
  | "evidence_source_unusable"
  | "evidence_provenance_misrepresented"
  | "unsupported_causal_claim"
  | "healthy_claim_from_bad_telemetry"
  // --- recommendation safety (Commit 3) ---
  | "recommendation_conflict"
  | "aggressive_nutrient_change"
  | "aggressive_irrigation_change"
  | "unsafe_autoflower_stress"
  | "device_control_instruction"
  | "automatic_action_queue_language";

export interface AiDoctorEvaluationFinding {
  code: AiDoctorEvaluationCode;
  severity: AiDoctorEvaluationSeverity;
  /** Optional dotted path of the offending field, e.g. "action_queue_suggestion.reason". */
  field?: string;
  /** Human-readable, UI-safe explanation. Never contains raw payloads/secrets. */
  message: string;
  /** Optional evidence/context keys implicated by the finding. */
  evidenceKeys?: string[];
}

export interface AiDoctorOutputEvaluation {
  status: AiDoctorEvaluationStatus;
  findings: AiDoctorEvaluationFinding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  contractVersion: string;
}

/**
 * Explicit inputs. `readiness` is the CANONICAL gate decision
 * (`AiDoctorContextResult` from `aiDoctorContextRules`), whose `.readiness`
 * field carries the `strong | partial | insufficient` literal that permitted
 * this diagnosis. We do not invent an `AiDoctorReadinessResult` alias — that
 * name is already taken by a different (Plant Detail card) type.
 */
export interface AiDoctorOutputEvaluationInput {
  result: Phase1DiagnosisResult;
  context: Phase1PlantContextPayload;
  readiness: AiDoctorContextResult;
  /** Optional automated confidence (from `calculateAiDoctorConfidence`). */
  automatedConfidence?: AiDoctorConfidenceResult;
}

// ---------------------------------------------------------------------------
// Severity → status weighting (used for both status derivation and ordering)
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHT: Record<AiDoctorEvaluationSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

/**
 * RELIABILITY TIERS — the single authoritative severity policy.
 *
 * Rules split cleanly into two kinds, and they are NOT equally trustworthy:
 *
 *  STRUCTURAL (severity `error` → status `fail` → runtime WITHHOLDS).
 *    Derived from typed fields and structured context: required fields, the
 *    confidence value against the readiness gate, `action_type`/`status` on the
 *    Action Queue suggestion. These involve no natural-language parsing, are
 *    exact, and have never produced a false positive.
 *
 *  LINGUISTIC (severity `warning` → status `warning` → runtime CAUTIONS).
 *    Derived from bounded regexes over FREE PROSE. A regex cannot distinguish
 *    "turn the fan off" (a command) from "turning the lights off last week" (an
 *    observation) — the difference is grammatical mood, not vocabulary. These
 *    rules demonstrably leak in BOTH directions, so they must never be able to
 *    withhold a diagnosis: a false positive here would hide a CORRECT answer
 *    from the grower ("pH lockout is unlikely in fresh coco" is good reasoning).
 *
 * Device commands remain independently defended: `applyAiDoctorSafetyRules`
 * STRIPS them from engine output (using the engine's own equipment-wording
 * pattern list) before a result is ever produced. This tier is a second net, and
 * a leaky second net must caution — not block.
 *
 * The proper long-term fix is structured engine output (typed actions instead of
 * prose), at which point these rules can become exact and be promoted.
 */
const LINGUISTIC_CODES: ReadonlySet<AiDoctorEvaluationCode> = new Set([
  "device_control_instruction",
  "overconfident_language",
  "evidence_not_in_context",
  "evidence_source_unusable",
  "evidence_provenance_misrepresented",
  "healthy_claim_from_bad_telemetry",
  "unsupported_causal_claim",
  "recommendation_conflict",
  "aggressive_nutrient_change",
  "aggressive_irrigation_change",
  "unsafe_autoflower_stress",
]);
// NOTE: `automatic_action_queue_language` is deliberately absent — it is
// STRUCTURAL when the suggestion is non-advisory/pre-approved (error) and
// LINGUISTIC when only the wording implies it (warning). Set at its rule site.

// ---------------------------------------------------------------------------
// Small, dependency-free predicates (defensive — inputs may be malformed)
// ---------------------------------------------------------------------------

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function isStringArray(v: unknown): v is readonly string[] {
  // Every entry must be a string. Checking only `Array.isArray` would let
  // malformed output (e.g. `evidence: [{...}]`, `what_not_to_do: [null]`)
  // satisfy the contract while the evidence validator silently skips the
  // non-string entries — an unsupported result could then pass.
  return Array.isArray(v) && v.every((entry) => typeof entry === "string");
}

function isValidConfidence(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

/**
 * Filler that is textually non-empty but carries no content. "N/A" as a 3-day
 * plan, or `missing_information: ["None."]`, must count as ABSENT — otherwise a
 * required section can be satisfied by a placeholder.
 */
const PLACEHOLDER_VALUES: ReadonlySet<string> = new Set([
  "n/a",
  "n/a.",
  "na",
  "none",
  "none.",
  "nil",
  "null",
  "tbd",
  "-",
  "--",
  "—",
  "not applicable",
  "not applicable.",
]);

function isPlaceholder(v: unknown): boolean {
  return typeof v === "string" && PLACEHOLDER_VALUES.has(v.trim().toLowerCase());
}

/** Non-empty AND not a placeholder. */
function isMeaningfulText(v: unknown): boolean {
  return isNonEmptyString(v) && !isPlaceholder(v);
}

const VALID_RISK_LEVELS: ReadonlySet<string> = new Set(["low", "medium", "high"]);

function isValidRiskLevel(v: unknown): boolean {
  return typeof v === "string" && VALID_RISK_LEVELS.has(v);
}

// ---------------------------------------------------------------------------
// Finding collector — insertion order is irrelevant (final sort is stable)
// ---------------------------------------------------------------------------

class FindingList {
  private readonly items: AiDoctorEvaluationFinding[] = [];

  add(finding: AiDoctorEvaluationFinding): void {
    // Freeze a shallow copy so downstream callers cannot mutate collector state
    // through the returned array.
    this.items.push({ ...finding });
  }

  drain(): AiDoctorEvaluationFinding[] {
    return this.items;
  }
}

// ---------------------------------------------------------------------------
// Commit 1 — contract / shape validation
// ---------------------------------------------------------------------------

/**
 * Required non-empty text fields (blank ⇒ required_field_empty; wrong type ⇒
 * required_field_missing). `likely_issue` is intentionally NOT here: weak
 * context may legitimately leave it empty.
 */
const REQUIRED_TEXT_FIELDS: readonly (keyof Phase1DiagnosisResult)[] = [
  "summary",
  "immediate_action",
];

/** Follow-up text fields — blank ⇒ follow_up_absent (a dedicated code). */
const FOLLOW_UP_FIELDS: readonly (keyof Phase1DiagnosisResult)[] = [
  "twenty_four_hour_follow_up",
  "three_day_recovery_plan",
];

/** Array fields that must be present as arrays. */
const REQUIRED_ARRAY_FIELDS: readonly (keyof Phase1DiagnosisResult)[] = [
  "evidence",
  "missing_information",
  "possible_causes",
  "what_not_to_do",
];

function validateContractShape(result: Phase1DiagnosisResult, findings: FindingList): void {
  // Treat the result defensively: malformed/unknown-shaped input must not throw.
  const r = result as unknown as Record<string, unknown>;

  // likely_issue: REQUIRED and must be a string. Only its *value* may be empty
  // (weak context ⇒ no certain issue) — an omitted field is a contract breach,
  // because a documented output section would simply be absent.
  if (!isString(r.likely_issue)) {
    findings.add({
      code: "required_field_missing",
      severity: "error",
      field: "likely_issue",
      message: "likely_issue is missing or not a string (an empty string is allowed).",
    });
  }

  for (const field of REQUIRED_TEXT_FIELDS) {
    const value = r[field as string];
    if (!isString(value)) {
      findings.add({
        code: "required_field_missing",
        severity: "error",
        field: field as string,
        message: `Required field "${field as string}" is missing or not a string.`,
      });
    } else if (!isNonEmptyString(value)) {
      findings.add({
        code: "required_field_empty",
        severity: "error",
        field: field as string,
        message: `Required field "${field as string}" is empty.`,
      });
    }
  }

  for (const field of FOLLOW_UP_FIELDS) {
    const value = r[field as string];
    if (!isMeaningfulText(value)) {
      findings.add({
        code: "follow_up_absent",
        severity: "error",
        field: field as string,
        message: `Follow-up field "${field as string}" is missing, empty, or a placeholder ("N/A").`,
      });
    }
  }

  for (const field of REQUIRED_ARRAY_FIELDS) {
    const value = r[field as string];
    if (!isStringArray(value)) {
      findings.add({
        code: "required_field_missing",
        severity: "error",
        field: field as string,
        message: `Required field "${field as string}" is missing or not an array.`,
      });
    }
  }

  // what_not_to_do must always carry at least one entry (contract: even a
  // healthy plant gets one cautionary line). Only checked when it IS an array.
  if (
    isStringArray(r.what_not_to_do) &&
    !r.what_not_to_do.some((entry) => isMeaningfulText(entry))
  ) {
    findings.add({
      code: "required_field_empty",
      severity: "error",
      field: "what_not_to_do",
      message: "what_not_to_do must contain at least one meaningful cautionary entry.",
    });
  }

  // confidence: numeric 0..1.
  if (!isValidConfidence(r.confidence)) {
    findings.add({
      code: "invalid_confidence",
      severity: "error",
      field: "confidence",
      message: "confidence must be a finite number between 0 and 1 inclusive.",
    });
  }

  // risk_level: low | medium | high.
  if (!isValidRiskLevel(r.risk_level)) {
    findings.add({
      code: "invalid_risk_level",
      severity: "error",
      field: "risk_level",
      message: 'risk_level must be one of "low", "medium", or "high".',
    });
  }

  // action_queue_suggestion: null OR a structurally valid advisory suggestion.
  // Semantic "automatic execution" language is enforced in Commit 3; here we
  // only guard the structural shape of a present suggestion.
  // action_queue_suggestion is REQUIRED: it must be explicitly `null` (no
  // suggestion) or an advisory object. An omitted field would slip past the
  // advertised shape validation entirely.
  if (!("action_queue_suggestion" in r) || r.action_queue_suggestion === undefined) {
    findings.add({
      code: "required_field_missing",
      severity: "error",
      field: "action_queue_suggestion",
      message: "action_queue_suggestion is missing (must be null or an advisory object).",
    });
  }

  const suggestion = r.action_queue_suggestion;
  if (suggestion !== null && suggestion !== undefined) {
    if (typeof suggestion !== "object") {
      findings.add({
        code: "required_field_missing",
        severity: "error",
        field: "action_queue_suggestion",
        message: "action_queue_suggestion must be null or an advisory object.",
      });
    } else {
      const s = suggestion as Record<string, unknown>;
      if (!isNonEmptyString(s.reason)) {
        findings.add({
          code: "required_field_empty",
          severity: "error",
          field: "action_queue_suggestion.reason",
          message: "action_queue_suggestion.reason is missing or empty.",
        });
      }
      if (!isValidRiskLevel(s.risk_level)) {
        findings.add({
          code: "invalid_risk_level",
          severity: "error",
          field: "action_queue_suggestion.risk_level",
          message: 'action_queue_suggestion.risk_level must be "low", "medium", or "high".',
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Commit 2 — evidence integrity & sensor provenance
// ---------------------------------------------------------------------------

/**
 * Markers that make an evidence item / claim *cautionary* (a stated
 * limitation), which exempts it from affirmative-claim rules. Cautionary
 * mentions of stale/invalid/missing data are exactly what we WANT the result
 * to say, so they must never be flagged.
 *
 * These MUST be limitation PHRASES, never bare words. A bare `"need"` /
 * `"needs"` would exempt an affirmative claim ("plant needs water because soil
 * moisture is low"), and a bare `"no "` / `"not "` would exempt "humidity is
 * not optimal" — silently skipping provenance checks and letting unsupported
 * claims through. That is a false NEGATIVE in a safety gate, so the exemption
 * is deliberately narrow.
 */
/**
 * A limitation word alone is NOT enough — it must attach to a DATA noun.
 *
 * Bare-substring markers are structurally unsafe here: "missing", "lack",
 * "insufficient" and "without" all appear in ordinary *affirmative deficiency
 * claims* ("Plant is missing calcium because pH is off", "Plant lacks nitrogen
 * because EC is low"). Treating those as cautionary would exempt them from every
 * provenance check and let unsupported metric claims through the stop-ship gate.
 *
 * So an item is cautionary only when a limitation word sits near a word that
 * denotes DATA/EVIDENCE (reading, sensor, snapshot, log, photo, …) — never a
 * nutrient or a plant symptom.
 */
const DATA_NOUN =
  "(data|reading|readings|sensor|sensors|snapshot|snapshots|telemetry|measurement|measurements|timestamp|photo|image|entry|entries|event|events|log|logs|history|information|context|evidence|clarity)";
const LIMITATION_WORD =
  "(no|not|none|missing|lack|lacks|lacking|without|insufficient|limited|unavailable|unknown|unverified|unconfirmed|unclear|stale|invalid|absent)";

const CAUTIONARY_PATTERNS: readonly RegExp[] = [
  // limitation → data noun: "no recent readings", "stale and invalid readings"
  new RegExp(`\\b${LIMITATION_WORD}\\b[^.]{0,25}\\b${DATA_NOUN}\\b`, "i"),
  // data noun → limitation: "humidity data is stale", "sensor reading is missing"
  new RegExp(`\\b${DATA_NOUN}\\b[^.]{0,25}\\b${LIMITATION_WORD}\\b`, "i"),
  /\bcan(?:not|'t) be (trusted|verified|confirmed|used)\b/i,
];

function isCautionary(lower: string): boolean {
  return CAUTIONARY_PATTERNS.some((re) => re.test(lower));
}

function asText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Positive-claim phrases asserting LIVE telemetry. */
const LIVE_CLAIM_PATTERNS: readonly RegExp[] = [
  /\blive (sensor|sensors|reading|readings|data|telemetry|feed|snapshot|value|values)\b/,
  /\bbased on live\b/,
  /\bcurrently live\b/,
  /\breal[-\s]?time\b/,
];

/**
 * Sensor-metric lexicon. `contextTokens` match the compiled reading `metric`
 * strings (e.g. "temperature_c"); `term` matches free-text evidence.
 */
interface MetricLexeme {
  key: string;
  contextTokens: readonly string[];
  term: RegExp;
}
const METRIC_LEXICON: readonly MetricLexeme[] = [
  {
    key: "temperature",
    contextTokens: ["temperature", "temp"],
    term: /\b(temperature|temp)\b/,
  },
  { key: "humidity", contextTokens: ["humidity", "rh"], term: /\b(humidity|rh)\b/ },
  { key: "vpd", contextTokens: ["vpd"], term: /\bvpd\b/ },
  { key: "co2", contextTokens: ["co2"], term: /\bco2\b/ },
  { key: "ph", contextTokens: ["ph"], term: /\bph\b/ },
  { key: "ec", contextTokens: ["ec", "tds"], term: /\b(ec|tds)\b/ },
  {
    key: "soil moisture",
    contextTokens: ["soil_moisture", "moisture", "vwc"],
    term: /\b(soil moisture|moisture|vwc)\b/,
  },
];

const GENERIC_SENSOR_RE =
  /\b(sensor|sensors|reading|readings|snapshot|telemetry|measurement|measured)\b/;

/** Grow-event action lexicon for evidence-in-context tracing. */
interface EventLexeme {
  key: string;
  term: RegExp;
  contextRe: RegExp;
}
/**
 * Grow-EVENT citations only. Each lexeme must assert that an action was
 * LOGGED, so it can be traced to `recent_grow_events`.
 *
 * Deliberately absent:
 *  - photo/image/picture. Phase 1 is multimodal: its primary evidence IS the
 *    vision analysis, and `Phase1PlantContextPayload` carries no vision field.
 *    Treating "the photo shows yellowing" as a diary-event citation would flag
 *    ordinary visual evidence as `evidence_not_in_context` — a false positive
 *    that would withhold legitimate diagnoses at runtime. Visual claims are
 *    accepted as valid Phase-1 vision evidence.
 *  - bare `nutrient`. "may indicate a nutrient deficiency" is a DIAGNOSIS, not
 *    a claim that feeding occurred; only feeding/application language traces to
 *    a feeding event.
 */
/**
 * Grow-event provenance runs ONLY on an explicit LOGGED-ACTION claim.
 *
 * A bare domain word is not proof an action occurred. "leaf posture suggests
 * water stress", "the photo may indicate underwatering" and "possible nutrient
 * stress" are VISUAL / DIAGNOSTIC language — they assert a symptom, not a diary
 * entry — and must stay valid without a matching grow event. Only a claim that
 * an action was performed/logged ("watered yesterday", "irrigation was applied",
 * "fed at 1.2 EC", "feeding log shows", "nutrient solution was applied") may be
 * traced to `recent_grow_events`.
 */
const LOGGED_VERB = "(applied|logged|recorded|given|performed|done|administered)";
const LOG_NOUN = "(log|logs|entry|entries|event|events|record|records)";

const EVENT_LEXICON: readonly EventLexeme[] = [
  {
    key: "watering",
    term: new RegExp(
      `\\b(watered|irrigated)\\b|\\b(watering|irrigation)\\b[^.]{0,20}\\b${LOGGED_VERB}\\b|\\b(watering|irrigation)\\s+${LOG_NOUN}\\b`,
      "i",
    ),
    contextRe: /water|irrigat/,
  },
  {
    key: "feeding",
    term: new RegExp(
      `\\b(fed|fertili[sz]ed)\\b|\\b(feed|feeding|nutrients?|fertili[sz]er)\\b[^.]{0,20}\\b${LOGGED_VERB}\\b|\\b(feed|feeding|nutrient)\\s+${LOG_NOUN}\\b`,
      "i",
    ),
    contextRe: /feed|nutrient/,
  },
  {
    key: "transplant",
    term: new RegExp(
      `\\btransplanted\\b|\\btransplant\\b[^.]{0,20}\\b${LOGGED_VERB}\\b|\\btransplant\\s+${LOG_NOUN}\\b`,
      "i",
    ),
    contextRe: /transplant/,
  },
];

/** Environment / telemetry health-claim detection (both word orders). */
const ENV_HEALTHY_RE_A =
  /\b(environment|conditions|climate|telemetry|readings?|vpd|temperature|humidity|co2|room)\b[^.]{0,40}\b(stable|healthy|optimal|within range|on target|ideal|normal|dialed in|in range)\b/;
const ENV_HEALTHY_RE_B =
  /\b(stable|healthy|optimal|within range|on target|ideal|normal|dialed in|in range)\b[^.]{0,40}\b(environment|conditions|climate|telemetry|readings?|vpd|temperature|humidity|co2|room)\b/;

/** Definitive single-cause / diagnosis assertions. */
const CAUSAL_CLAIM_RE =
  /\b(caused by|due to|because of|root cause|attributable to|stems from|result of)\b|\b(nitrogen|phosphorus|potassium|calcium|magnesium|iron|nutrient) deficiency\b|\bis (over|under)watered\b/;

const TRUSTWORTHY_TAGS: ReadonlySet<string> = new Set(["live", "manual"]);
/** Synthetic tag representing metrics carried by trustworthy 7-day averages. */
const TRUSTWORTHY_AVG_TAG = "live_or_manual_avg";

interface ContextProvenance {
  hasLive: boolean;
  hasTrustworthy: boolean;
  hasStaleOrInvalid: boolean;
  hasDemo: boolean;
  hasCsv: boolean;
  hasTrustworthyAverages: boolean;
  /** metric key → set of source tags carrying that metric. */
  metricSources: Map<string, Set<string>>;
  /** Lowercased concatenation of recent grow-event types + notes. */
  eventText: string;
}

function metricKeyForContextMetric(metric: string): string | null {
  const m = metric.toLowerCase();
  for (const lex of METRIC_LEXICON) {
    if (lex.contextTokens.some((t) => m.includes(t))) return lex.key;
  }
  return null;
}

function summarizeProvenance(context: Phase1PlantContextPayload): ContextProvenance {
  const c = context as unknown as {
    source_tags?: unknown;
    recentSensorReadings?: unknown;
    averages_7d?: Record<string, unknown>;
    hasLiveSensorReadings?: unknown;
    recent_grow_events?: unknown;
  };

  const tags = Array.isArray(c.source_tags) ? (c.source_tags as unknown[]) : [];
  const tagSet = new Set(tags.map((t) => String(t)));

  const metricSources = new Map<string, Set<string>>();
  const addMetricSource = (key: string, src: string): void => {
    if (!metricSources.has(key)) metricSources.set(key, new Set());
    metricSources.get(key)!.add(src);
  };

  const readings = Array.isArray(c.recentSensorReadings)
    ? (c.recentSensorReadings as Array<Record<string, unknown>>)
    : [];
  for (const r of readings) {
    const key = metricKeyForContextMetric(String(r?.metric ?? ""));
    if (key) addMetricSource(key, String(r?.source_tag ?? "unknown"));
  }

  // averages_7d are computed from trustworthy (live/manual) sources only, so a
  // present average is usable metric evidence.
  const avg = c.averages_7d ?? {};
  const avgFieldToKey: Record<string, string> = {
    temperature_c: "temperature",
    humidity_pct: "humidity",
    vpd_kpa: "vpd",
    co2_ppm: "co2",
  };
  let hasTrustworthyAverages = false;
  for (const [field, key] of Object.entries(avgFieldToKey)) {
    const raw = (avg as Record<string, unknown>)[field];
    if (raw !== null && raw !== undefined && Number.isFinite(Number(raw))) {
      hasTrustworthyAverages = true;
      addMetricSource(key, TRUSTWORTHY_AVG_TAG);
    }
  }

  const events = Array.isArray(c.recent_grow_events)
    ? (c.recent_grow_events as Array<Record<string, unknown>>)
    : [];
  const eventText = events
    .map((e) => `${asText(e?.event_type)} ${asText(e?.note)}`)
    .join(" ")
    .toLowerCase();

  const hasLive = Boolean(c.hasLiveSensorReadings) || tagSet.has("live");
  const hasManual = tagSet.has("manual");

  return {
    hasLive,
    hasTrustworthy: hasLive || hasManual,
    hasStaleOrInvalid: tagSet.has("stale") || tagSet.has("invalid"),
    hasDemo: tagSet.has("demo"),
    hasCsv: tagSet.has("csv"),
    hasTrustworthyAverages,
    metricSources,
    eventText,
  };
}

function metricUsable(sources: Set<string> | undefined): boolean {
  if (!sources) return false;
  for (const s of sources) {
    if (TRUSTWORTHY_TAGS.has(s) || s === TRUSTWORTHY_AVG_TAG) return true;
  }
  return false;
}

/**
 * Trace one metric-bearing claim to the compiled context. The same bounded
 * provenance rules apply whether the claim appears in `evidence`, `summary`,
 * or `likely_issue`; only the finding field/message label differs.
 */
function validateMetricClaim(
  text: string,
  field: "evidence" | "summary" | "likely_issue",
  cautionary: boolean,
  prov: ContextProvenance,
  findings: FindingList,
  evidenceKey?: string,
): boolean {
  let findingAdded = false;
  const claimLabel = field === "evidence" ? "Evidence" : `Result field "${field}"`;
  const evidenceKeys = evidenceKey === undefined ? {} : { evidenceKeys: [evidenceKey] };

  for (const lex of METRIC_LEXICON) {
    if (!lex.term.test(text)) continue;
    const sources = prov.metricSources.get(lex.key);
    if (!sources || sources.size === 0) {
      if (!cautionary) {
        findings.add({
          code: "evidence_not_in_context",
          severity: "error",
          field,
          message: `${claimLabel} cites ${lex.key} data that is not present in the compiled context.`,
          ...evidenceKeys,
        });
        findingAdded = true;
      }
      continue;
    }
    if (cautionary || metricUsable(sources)) continue;

    if (sources.has("stale") || sources.has("invalid")) {
      findings.add({
        code: "evidence_source_unusable",
        severity: "error",
        field,
        message: `${claimLabel} relies on ${lex.key} data from a stale or invalid source, which cannot support a conclusion.`,
        ...evidenceKeys,
      });
      findingAdded = true;
    } else if (sources.has("csv")) {
      // CSV is honest historical support unless described as live elsewhere.
    } else if (sources.has("demo")) {
      findings.add({
        code: "evidence_provenance_misrepresented",
        severity: "error",
        field,
        message: `${claimLabel} presents demo ${lex.key} data as real plant evidence.`,
        ...evidenceKeys,
      });
      findingAdded = true;
    } else {
      findings.add({
        code: "evidence_source_unusable",
        severity: "error",
        field,
        message: `${claimLabel} relies on ${lex.key} data of unknown provenance, which cannot support a conclusion.`,
        ...evidenceKeys,
      });
      findingAdded = true;
    }
  }

  return findingAdded;
}

/**
 * Metrics that actually describe the ROOM ENVIRONMENT. A trustworthy pH, EC or
 * soil-moisture reading says nothing about whether the environment is stable —
 * so it must not license a "the room environment is stable" claim. Only these
 * metrics can.
 */
const ENVIRONMENT_METRIC_KEYS = ["temperature", "humidity", "vpd", "co2"] as const;

function hasTrustworthyEnvironmentMetric(prov: ContextProvenance): boolean {
  return ENVIRONMENT_METRIC_KEYS.some((key) => metricUsable(prov.metricSources.get(key)));
}

function positiveClaimText(result: Phase1DiagnosisResult): string {
  const r = result as unknown as Record<string, unknown>;
  const parts: unknown[] = [
    r.summary,
    r.likely_issue,
    r.immediate_action,
    r.twenty_four_hour_follow_up,
    r.three_day_recovery_plan,
  ];
  if (Array.isArray(r.possible_causes)) parts.push(...(r.possible_causes as unknown[]));
  return parts
    .filter((p) => typeof p === "string")
    .join(" \n ")
    .toLowerCase();
}

/**
 * Non-assertive metric mentions in diagnosis prose should not be treated as
 * evidence claims. This keeps "check pH" and "pH lockout is unlikely" from
 * becoming false provenance warnings while still tracing "low pH caused...".
 */
const NEGATED_METRIC_MENTION_RE =
  /\b(unlikely|not indicated|not supported|no evidence of|cannot confirm|can't confirm|unclear|unknown)\b/i;
const METRIC_REQUEST_RE = /\b(check|monitor|measure|recheck|verify)\b/i;
const METRIC_ASSERTION_RE =
  /\b(low|high|elevated|reduced|off|outside|out of range|lockout|deficien\w*|excess\w*|due to|caused by|because)\b/i;

function isNonassertiveMetricMention(clause: string): boolean {
  if (NEGATED_METRIC_MENTION_RE.test(clause)) return true;
  return METRIC_REQUEST_RE.test(clause) && !METRIC_ASSERTION_RE.test(clause);
}

function validateEvidenceIntegrity(
  input: AiDoctorOutputEvaluationInput,
  findings: FindingList,
): void {
  const result = input.result as unknown as Record<string, unknown>;
  const prov = summarizeProvenance(input.context);

  const evidence = Array.isArray(result.evidence) ? (result.evidence as unknown[]) : [];
  let affirmativeEvidenceCount = 0;
  const affirmativeEvidenceText: string[] = [];

  for (const raw of evidence) {
    if (typeof raw !== "string") continue;
    const item = raw;
    const lower = item.toLowerCase();
    const cautionary = isCautionary(lower);
    if (!cautionary) {
      affirmativeEvidenceCount += 1;
      affirmativeEvidenceText.push(lower);
    }

    // 1. Live misrepresentation — claims "live" when no live source exists.
    if (!cautionary && LIVE_CLAIM_PATTERNS.some((re) => re.test(lower)) && !prov.hasLive) {
      findings.add({
        code: "evidence_provenance_misrepresented",
        severity: "error",
        field: "evidence",
        message: "Evidence claims live sensor data, but the compiled context has no live source.",
        evidenceKeys: [item],
      });
      continue;
    }

    // 2. Metric tracing — cited metric must exist in context and be usable.
    const metricFindingAdded = validateMetricClaim(
      lower,
      "evidence",
      cautionary,
      prov,
      findings,
      item,
    );
    if (metricFindingAdded) continue;

    // 3. Generic sensor reliance with only stale/invalid data available.
    if (
      !cautionary &&
      GENERIC_SENSOR_RE.test(lower) &&
      !prov.hasTrustworthy &&
      prov.hasStaleOrInvalid
    ) {
      findings.add({
        code: "evidence_source_unusable",
        severity: "error",
        field: "evidence",
        message:
          "Evidence relies on sensor data, but only stale or invalid readings are available.",
        evidenceKeys: [item],
      });
      continue;
    }

    // 4. Grow-event tracing — cited event must exist in context.
    for (const ev of EVENT_LEXICON) {
      if (!cautionary && ev.term.test(lower) && !ev.contextRe.test(prov.eventText)) {
        findings.add({
          code: "evidence_not_in_context",
          severity: "error",
          field: "evidence",
          message: `Evidence cites a ${ev.key} event that is not present in the compiled context.`,
          evidenceKeys: [item],
        });
      }
    }
  }

  // 5. Metric-specific claims in diagnosis prose must also trace to context.
  // Split into clauses so a cautious clause does not exempt a later assertion.
  for (const field of ["summary", "likely_issue"] as const) {
    const text = asText(result[field]).toLowerCase();
    for (const clause of text.split(/[.;\n]+/)) {
      if (
        clause.trim().length === 0 ||
        isCautionary(clause) ||
        isNonassertiveMetricMention(clause)
      ) {
        continue;
      }
      validateMetricClaim(clause, field, false, prov, findings);
    }
  }

  // 6. Healthy/stable environment claim not backed by TRUSTWORTHY telemetry.
  //
  // The absence of telemetry is still unverified telemetry: with no readings at
  // all, "the room environment is stable and in range" is exactly as unsupported
  // as the same claim made over stale data. So the only thing that licenses an
  // environment health claim is live/manual data — not merely "no bad data".
  const positive = `${positiveClaimText(input.result)} \n ${affirmativeEvidenceText.join(" \n ")}`;
  if (
    (ENV_HEALTHY_RE_A.test(positive) || ENV_HEALTHY_RE_B.test(positive)) &&
    !hasTrustworthyEnvironmentMetric(prov)
  ) {
    findings.add({
      code: "healthy_claim_from_bad_telemetry",
      severity: "error",
      message:
        "Result presents the environment as stable/healthy without a trustworthy environment metric (temperature, humidity, VPD or CO2) to support it.",
    });
  }

  // 7. Definitive single cause asserted with no supporting evidence item.
  const claimText = `${asText(result.likely_issue)} \n ${asText(result.summary)}`.toLowerCase();
  if (CAUSAL_CLAIM_RE.test(claimText) && affirmativeEvidenceCount === 0) {
    findings.add({
      code: "unsupported_causal_claim",
      severity: "warning",
      field: "likely_issue",
      message: "A definitive cause is asserted without any supporting evidence item.",
    });
  }
}

// ---------------------------------------------------------------------------
// Commit 3 — confidence calibration (keyed to the canonical gate decision)
// ---------------------------------------------------------------------------

/**
 * Confidence ceilings keyed to the CANONICAL gate decision
 * (`AiDoctorContextReadiness`). No new confidence engine — these sit on top of
 * the existing numeric confidence + `bandForConfidence()`. Central + documented
 * because the repo has no readiness→ceiling mapping today:
 *  - `insufficient`: the gate should have blocked; any real confidence is wrong.
 *  - `partial`: must stay below the "high" band (`bandForConfidence` ≥ 0.7);
 *    capped conservatively at 0.6.
 *  - `strong`: may be high, but absolute certainty (≈1.0) is never justified.
 */
export const AI_DOCTOR_READINESS_CONFIDENCE_CEILING: Record<AiDoctorContextReadiness, number> =
  Object.freeze({
    insufficient: 0,
    // 0.5 aligns with the engine's own hardest cap
    // (`cap_confidence_when_stale_or_invalid`). A looser 0.6 would sit ABOVE
    // every cap `applyAiDoctorSafetyRules` already applies (0.3 without
    // trustworthy sensors, 0.39 on a single weak signal, 0.5 stale/invalid),
    // making this rule effectively inert for real engine output.
    partial: 0.5,
    strong: 0.95,
  });

const ABSOLUTE_CERTAINTY_PATTERNS: readonly RegExp[] = [
  /\bguaranteed?\b/,
  /\bdefinitely\b/,
  /\bcertainly\b/,
  /\bno doubt\b/,
  /\bwithout (a )?doubt\b/,
  /\bwithout question\b/,
  /\babsolutely certain\b/,
  /\bwill (definitely|certainly)\b/,
  /\bobviously\b/,
  /\bconclusive(ly)?\b/,
  /\bno other explanation\b/,
  /\bconfirmed diagnosis\b/,
  // Bound to a certainty claim. Bare `100%` matched "humidity is hitting 100%",
  // and bare `cured` matched "Botrytis cannot be cured" — both safe statements.
  /\b100\s?%\s+(certain|sure|confident|positive)\b/,
  /\b(is|are)\s+(now\s+)?cured\b/,
];

const LIMITATION_PATTERNS: readonly RegExp[] = [
  /\blimited\b/,
  /\bmay be limited\b/,
  /\bmore context\b/,
  /\bcannot be certain\b/,
  /\bnot enough\b/,
  /\bpreliminary\b/,
  /\bcautious\b/,
  /\buncertain\b/,
  /\btentative\b/,
  /\bmore (data|information)\b/,
];

function validateConfidenceCalibration(
  input: AiDoctorOutputEvaluationInput,
  findings: FindingList,
): void {
  const result = input.result as unknown as Record<string, unknown>;
  const readiness = (input.readiness as { readiness?: unknown } | null | undefined)?.readiness as
    | AiDoctorContextReadiness
    | undefined;
  const confidence = result.confidence;
  // Only an in-range confidence is calibrated; an out-of-range value is already
  // reported as invalid_confidence (Commit 1) and must not double-report here.
  const validConf = isValidConfidence(confidence);
  const band = validConf ? bandForConfidence(confidence as number) : "low";
  // Placeholder entries ("None.") do not count as populated missing-information.
  const missing = (
    Array.isArray(result.missing_information) ? (result.missing_information as unknown[]) : []
  ).filter((entry) => isMeaningfulText(entry));
  const positive = positiveClaimText(input.result);

  // 1. Diagnosis produced while the gate reads "insufficient" → fail.
  if (readiness === "insufficient") {
    findings.add({
      code: "diagnosis_generated_while_insufficient",
      severity: "error",
      message:
        "A diagnosis result exists while readiness is insufficient; the gate should have blocked it.",
    });
  }

  // 2. Confidence ceiling by readiness (partial / strong).
  if (validConf && (readiness === "partial" || readiness === "strong")) {
    const ceiling = AI_DOCTOR_READINESS_CONFIDENCE_CEILING[readiness];
    if ((confidence as number) > ceiling) {
      findings.add({
        code: "confidence_exceeds_readiness",
        severity: "error",
        field: "confidence",
        message: `Confidence ${confidence} exceeds the ${readiness}-readiness ceiling of ${ceiling}.`,
      });
    }
  }

  // 3. Missing-information population.
  if (missing.length === 0) {
    if (readiness === "partial") {
      findings.add({
        code: "missing_information_absent",
        severity: "error",
        field: "missing_information",
        message: "Partial readiness requires populated missing_information.",
      });
    } else if (readiness === "strong" && band !== "high") {
      findings.add({
        code: "missing_information_absent",
        severity: "warning",
        field: "missing_information",
        message: "Non-high confidence should list what is needed to raise it.",
      });
    }
  }

  // 4. Partial context must carry a visible limitation.
  if (readiness === "partial") {
    const hasLimitation = missing.length > 0 || LIMITATION_PATTERNS.some((re) => re.test(positive));
    if (!hasLimitation) {
      findings.add({
        code: "partial_context_limitation_absent",
        severity: "error",
        message:
          "Partial readiness requires a visible limitation (missing information or cautious wording).",
      });
    }
  }

  // 5. Absolute-certainty language — forbidden at every readiness level.
  if (ABSOLUTE_CERTAINTY_PATTERNS.some((re) => re.test(positive))) {
    findings.add({
      code: "overconfident_language",
      severity: "error",
      message: "Result uses absolute-certainty language that no readiness level justifies.",
    });
  }
}

// ---------------------------------------------------------------------------
// Commit 3 — recommendation safety
// ---------------------------------------------------------------------------

/**
 * Device-control detection vocabulary — reused verbatim from the engine's
 * `DEVICE_CONTROL_DETECTION_PATTERNS` (which co-locates the command patterns +
 * setpoint/switch/relay/actuate wording in the allow-listed safety module).
 */
const DEVICE_CONTROL_PATTERNS: readonly RegExp[] = DEVICE_CONTROL_DETECTION_PATTERNS;

const AUTOMATIC_AQ_PATTERNS: readonly RegExp[] = [
  /\bautomatically\b/,
  /\bauto-?approve/,
  /\bwithout approval\b/,
  /\bno approval (needed|required)\b/,
  /\bbypass(ing)? (the )?(approval|action queue|review)\b/,
  /\bwill (be )?(execute|appl|run)/,
  /\bqueue and (run|execute)\b/,
  /\bexecutes? (the )?action\b/,
  /\bapplied automatically\b/,
];

/**
 * Feed / nutrient / EC strength increases.
 *
 * `NEVER_DO_BASELINE` ("Do not adjust nutrient strength based on this output.")
 * is pushed into `what_not_to_do` UNCONDITIONALLY by `applyAiDoctorSafetyRules`
 * — there is no readiness or context-strength guard on it. Adjusting nutrient
 * strength is therefore universally prohibited by the canonical AI Doctor
 * contract, so these are detected at EVERY readiness level, including `strong`.
 * This mirrors the existing rule; it does not invent a new policy.
 */
const AGGRESSIVE_NUTRIENT_PATTERNS: readonly RegExp[] = [
  // increase/raise/bump/boost <the> feed | nutrient(s) | ec  [strength]
  /\b(increase|raise|bump|boost)\s+(the\s+)?(feed|nutrient|nutrients|ec)\b/i,
  /\bfeed more\b/i,
  /\b(reduce|lower|decrease|cut|drop)\s+(the\s+)?(feed|nutrient|nutrients|ec)\b/i,
  /\bfeed less\b/i,
  /\bless nutrients?\b/i,
  /\badd (more )?nutrient/i,
  /\bflush (immediately|now|the plant)\b/i,
  /\bdouble (the )?(feed|nutrient|ec)\b/i,
  /\bheavy feed\b/i,
];

const AGGRESSIVE_IRRIGATION_PATTERNS: readonly RegExp[] = [
  /\bwater (a lot |much )?more\b/,
  /\bincrease (the )?(watering|irrigation)\b/,
  /\breduce (the )?(watering|irrigation)\b/,
  /\bwater less\b/,
  /\birrigate now\b/,
  /\bml of water\b/,
  /\bsoak (the )?(medium|pot|plant)\b/,
];

/** Mirrors `AUTOFLOWER_NEVER_DO` (aiDoctorSafetyRules): high-stress verbs. */
const AUTOFLOWER_STRESS_PATTERNS: readonly RegExp[] = [
  /\bheav(y|ily) defoliat/,
  /\bdefoliate (heavily|hard)\b/,
  /\btop(ping)? (the|this|your)?\s?plant/,
  /\bfim\b/,
  /\bhigh[- ]stress training\b/,
  /\bsevere (lst|training)\b/,
  /\btransplant/,
  /\baggressive flush\b/,
];

interface VariableLex {
  key: string;
  inc: readonly RegExp[];
  dec: readonly RegExp[];
}
const VARIABLE_LEX: readonly VariableLex[] = [
  {
    key: "irrigation",
    inc: [
      /increase (the )?(watering|irrigation)/,
      /water more/,
      /more water/,
      /irrigate more/,
      /raise (the )?(watering|irrigation)/,
    ],
    dec: [
      /reduce (the )?(watering|irrigation)/,
      /water less/,
      /less water/,
      /withhold water/,
      /cut back on water/,
      /lower (the )?(watering|irrigation)/,
    ],
  },
  {
    key: "feed",
    inc: [
      /increase (the )?(feed|nutrient|ec)/,
      /feed more/,
      /raise (the )?ec/,
      /more nutrient/,
      /boost (the )?(feed|nutrient)/,
      /add (more )?nutrient/,
    ],
    dec: [
      /reduce (the )?(feed|nutrient|ec)/,
      /feed less/,
      /lower (the )?ec/,
      /cut (the )?(feed|nutrient)/,
      /flush/,
      /less nutrient/,
    ],
  },
  {
    key: "humidity",
    inc: [/raise (the )?(humidity|rh)/, /increase (the )?(humidity|rh)/, /more humidity/],
    dec: [
      /lower (the )?(humidity|rh)/,
      /reduce (the )?(humidity|rh)/,
      /less humidity/,
      /dehumidif/,
    ],
  },
  {
    key: "temperature",
    inc: [/raise (the )?(temp|temperature)/, /increase (the )?(temp|temperature)/, /warmer/],
    dec: [/lower (the )?(temp|temperature)/, /reduce (the )?(temp|temperature)/, /cooler/],
  },
];

function directionsFor(text: string, v: VariableLex): { inc: boolean; dec: boolean } {
  return {
    inc: v.inc.some((re) => re.test(text)),
    dec: v.dec.some((re) => re.test(text)),
  };
}

function adviceText(result: Phase1DiagnosisResult): string {
  const r = result as unknown as Record<string, unknown>;
  const parts: unknown[] = [
    r.immediate_action,
    r.twenty_four_hour_follow_up,
    r.three_day_recovery_plan,
  ];
  if (Array.isArray(r.possible_causes)) parts.push(...(r.possible_causes as unknown[]));
  const aq = r.action_queue_suggestion;
  if (aq && typeof aq === "object") {
    parts.push((aq as Record<string, unknown>).reason);
  }
  return parts
    .filter((p) => typeof p === "string")
    .join(" \n ")
    .toLowerCase();
}

/**
 * Every AFFIRMATIVE, user-visible surface — anything a grower could read as an
 * instruction, including `summary` and `likely_issue`. Device/automation
 * scanning must cover these: a result placing "Turn on the humidifier now" in
 * `summary` would otherwise bypass `device_control_instruction` entirely.
 *
 * Deliberately EXCLUDES `what_not_to_do` (prohibitions — "Do not turn on the
 * humidifier" must never be read as a device instruction) and
 * `missing_information` (stated limitations).
 */
function affirmativeResultText(result: Phase1DiagnosisResult): string {
  const r = result as unknown as Record<string, unknown>;
  return [asText(r.summary), asText(r.likely_issue), adviceText(result)]
    .filter((s) => s.trim().length > 0)
    .join(" \n ")
    .toLowerCase();
}

/**
 * Bounded, EXPLICIT prohibition markers. Deliberately not bare "no"/"not":
 * "It is not safe. Activate the pump." must still be a device finding.
 */
const PROHIBITION_MARKER_RE =
  /\b(do not|don'?t|never|avoid|should not|shouldn'?t|must not|mustn'?t|refrain from)\b/i;

/**
 * True when `text` contains a command matching `patterns` that is NOT governed
 * by an explicit prohibition.
 *
 * A prohibition only exempts a command it actually GOVERNS — i.e. the marker
 * appears before the match, inside the same clause. So:
 *   "Do not turn on the humidifier; keep observing."  → exempt (governed)
 *   "Do not wait; turn on the humidifier."            → FINDING (different clause)
 *   "It is not safe. Activate the pump."              → FINDING (not a marker)
 * This is why we do not simply drop every clause containing "no"/"not".
 */
function hasUngovernedCommand(text: string, patterns: readonly RegExp[]): boolean {
  for (const clause of text.split(/[.;,:\n]+/)) {
    for (const re of patterns) {
      const match = re.exec(clause);
      if (!match) continue;
      const preceding = clause.slice(0, match.index);
      if (PROHIBITION_MARKER_RE.test(preceding)) continue; // prohibition governs it
      return true;
    }
  }
  return false;
}

function detectRecommendationConflicts(result: Phase1DiagnosisResult, findings: FindingList): void {
  const r = result as unknown as Record<string, unknown>;
  const immediate = asText(r.immediate_action).toLowerCase();
  const dnd = (Array.isArray(r.what_not_to_do) ? (r.what_not_to_do as unknown[]) : [])
    .filter((x) => typeof x === "string")
    .join(" \n ")
    .toLowerCase();
  const t24 = asText(r.twenty_four_hour_follow_up).toLowerCase();
  const t3 = asText(r.three_day_recovery_plan).toLowerCase();
  const aq = r.action_queue_suggestion;
  const aqReason =
    aq && typeof aq === "object"
      ? asText((aq as Record<string, unknown>).reason).toLowerCase()
      : "";

  const reasons: string[] = [];
  for (const v of VARIABLE_LEX) {
    const imm = directionsFor(immediate, v);
    const forbid = directionsFor(dnd, v);
    if ((imm.inc && forbid.inc) || (imm.dec && forbid.dec)) {
      reasons.push(`immediate action conflicts with "what not to do" on ${v.key}`);
    }
    const d24 = directionsFor(t24, v);
    const d3 = directionsFor(t3, v);
    if ((d24.inc && d3.dec) || (d24.dec && d3.inc)) {
      reasons.push(`24-hour and 3-day plans disagree on ${v.key}`);
    }
    const dAq = directionsFor(aqReason, v);
    if ((imm.inc && dAq.dec) || (imm.dec && dAq.inc)) {
      reasons.push(`Action Queue suggestion conflicts with immediate action on ${v.key}`);
    }
  }
  if (reasons.length > 0) {
    findings.add({
      code: "recommendation_conflict",
      severity: "error",
      message: `Contradictory recommendations detected (${reasons.sort().join("; ")}).`,
    });
  }
}

function validateRecommendationSafety(
  input: AiDoctorOutputEvaluationInput,
  findings: FindingList,
): void {
  const result = input.result as unknown as Record<string, unknown>;
  const advice = adviceText(input.result);
  // Device + automation language is scanned across EVERY affirmative surface
  // (including summary / likely_issue), not just the recommendation sections.
  const affirmative = affirmativeResultText(input.result);
  const aq = result.action_queue_suggestion;

  // Device / equipment control — read-only advisor must never instruct it.
  // Commands governed by an explicit prohibition ("Do not turn on the
  // humidifier") are safe advice, not instructions, and must not fail the gate.
  if (hasUngovernedCommand(affirmative, DEVICE_CONTROL_PATTERNS)) {
    findings.add({
      code: "device_control_instruction",
      severity: "error",
      message: "Result instructs a device/equipment control action; AI Doctor is read-only.",
    });
  }

  // Automatic Action Queue execution.
  //  - STRUCTURAL: a non-advisory / pre-approved suggestion is an exact,
  //    field-level violation → error (withholds).
  //  - LINGUISTIC: wording that merely implies automation → warning (cautions).
  // Same prohibition rule: "Do not let it run automatically" is safe advice.
  let structuralAq = false;
  if (aq !== null && aq !== undefined && typeof aq === "object") {
    const s = aq as Record<string, unknown>;
    if (s.action_type !== "advisory" || s.status !== "pending_approval") {
      structuralAq = true;
    }
  }
  const proseAq = hasUngovernedCommand(affirmative, AUTOMATIC_AQ_PATTERNS);
  if (structuralAq || proseAq) {
    findings.add({
      code: "automatic_action_queue_language",
      severity: structuralAq ? "error" : "warning",
      field: structuralAq ? "action_queue_suggestion" : undefined,
      message: structuralAq
        ? "Action Queue suggestion is not advisory/approval-required; suggestions must stay advisory and pending_approval."
        : "Result wording implies automatic Action Queue execution; suggestions must stay advisory and approval-required.",
    });
  }

  // Aggressive changes under weak (non-strong) context.
  // Aggressive changes warn at EVERY readiness level. `strong` readiness means
  // "enough trustworthy context to run a review" — it does NOT mean "enough
  // evidence to justify a large nutrient or irrigation swing". The engine's own
  // NEVER_DO_BASELINE forbids adjusting nutrient strength / irrigation from this
  // output unconditionally, so exempting strong context would contradict it.
  // Prohibition-governed too: "Do not increase the watering until the medium
  // dries" is SAFE advice, and must not be read as an aggressive instruction.
  if (hasUngovernedCommand(advice, AGGRESSIVE_NUTRIENT_PATTERNS)) {
    findings.add({
      code: "aggressive_nutrient_change",
      severity: "warning",
      message: "Aggressive nutrient change recommended from an AI Doctor result.",
    });
  }
  if (hasUngovernedCommand(advice, AGGRESSIVE_IRRIGATION_PATTERNS)) {
    findings.add({
      code: "aggressive_irrigation_change",
      severity: "warning",
      message: "Aggressive irrigation change recommended from an AI Doctor result.",
    });
  }

  // Autoflower high-stress technique. Reuses the CANONICAL detector so both
  // safety paths stay aligned — a local regex missed forms like "autoflowering".
  // Prohibition-governed: "Do not transplant during recovery" is safe advice.
  if (
    isLikelyAutoflower(input.context) &&
    hasUngovernedCommand(advice, AUTOFLOWER_STRESS_PATTERNS)
  ) {
    findings.add({
      code: "unsafe_autoflower_stress",
      severity: "warning",
      message: "High-stress technique recommended for a likely autoflower.",
    });
  }

  // Contradictions across recommendation sections.
  detectRecommendationConflicts(input.result, findings);
}

// ---------------------------------------------------------------------------
// Deterministic ordering + summarization
// ---------------------------------------------------------------------------

/**
 * Stable-sort by: (1) severity weight, (2) code (lexicographic), (3) field,
 * (4) message. Pure; no dependence on insertion order.
 */
function sortFindings(findings: readonly AiDoctorEvaluationFinding[]): AiDoctorEvaluationFinding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    const af = a.field ?? "";
    const bf = b.field ?? "";
    if (af !== bf) return af < bf ? -1 : 1;
    if (a.message !== b.message) return a.message < b.message ? -1 : 1;
    return 0;
  });
}

function statusFrom(errorCount: number, warningCount: number): AiDoctorEvaluationStatus {
  if (errorCount > 0) return "fail";
  if (warningCount > 0) return "warning";
  return "pass";
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Evaluate a finished AI Doctor Phase 1 result. Pure and deterministic: the
 * same input always yields a byte-identical evaluation, and the input objects
 * are never mutated.
 */
export function evaluateAiDoctorOutput(
  input: AiDoctorOutputEvaluationInput,
): AiDoctorOutputEvaluation {
  const findings = new FindingList();

  // Commit 1 — contract / shape.
  validateContractShape(input.result, findings);

  // Commit 2 — evidence integrity & sensor provenance.
  validateEvidenceIntegrity(input, findings);

  // Commit 3 — confidence calibration & recommendation safety.
  validateConfidenceCalibration(input, findings);
  validateRecommendationSafety(input, findings);

  // Apply the reliability tier centrally: prose-derived rules can only ever
  // CAUTION (warning), never withhold (error). See LINGUISTIC_CODES.
  const tiered = findings
    .drain()
    .map((f) => (LINGUISTIC_CODES.has(f.code) ? { ...f, severity: "warning" as const } : f));
  const sorted = sortFindings(tiered);

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const f of sorted) {
    if (f.severity === "error") errorCount += 1;
    else if (f.severity === "warning") warningCount += 1;
    else infoCount += 1;
  }

  return {
    status: statusFrom(errorCount, warningCount),
    findings: sorted,
    errorCount,
    warningCount,
    infoCount,
    contractVersion: AI_DOCTOR_OUTPUT_CONTRACT_VERSION,
  };
}
