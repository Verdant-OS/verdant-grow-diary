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
import type { AiDoctorContextResult } from "@/lib/aiDoctorContextRules";
import type { AiDoctorConfidenceResult } from "@/lib/aiDoctorConfidenceAdapter";

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
  return Array.isArray(v);
}

function isValidConfidence(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
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

  // likely_issue: may be empty, but must be a string when present.
  if (r.likely_issue !== undefined && !isString(r.likely_issue)) {
    findings.add({
      code: "required_field_missing",
      severity: "error",
      field: "likely_issue",
      message: "likely_issue must be a string.",
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
    if (!isString(value) || !isNonEmptyString(value)) {
      findings.add({
        code: "follow_up_absent",
        severity: "error",
        field: field as string,
        message: `Follow-up field "${field as string}" is missing or empty.`,
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
  if (isStringArray(r.what_not_to_do) && r.what_not_to_do.length === 0) {
    findings.add({
      code: "required_field_empty",
      severity: "error",
      field: "what_not_to_do",
      message: "what_not_to_do must contain at least one cautionary entry.",
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
 */
const CAUTIONARY_MARKERS: readonly string[] = [
  "stale",
  "invalid",
  "missing",
  "unknown",
  "unavailable",
  "not available",
  "no ",
  "not ",
  "without",
  "lack",
  "limited",
  "insufficient",
  "cannot",
  "can't",
  "unclear",
  "unconfirmed",
  "unverified",
  "need ",
  "needs ",
];

function isCautionary(lower: string): boolean {
  return CAUTIONARY_MARKERS.some((m) => lower.includes(m));
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
const EVENT_LEXICON: readonly EventLexeme[] = [
  { key: "watering", term: /\bwater(ed|ing)?\b|\birrigat(ed|ion)\b/, contextRe: /water|irrigat/ },
  { key: "feeding", term: /\b(fed|feed(ing)?|nutrient(s)?)\b/, contextRe: /feed|nutrient/ },
  { key: "photo", term: /\b(photo|image|picture)\b/, contextRe: /photo|image|picture/ },
  { key: "transplant", term: /\btransplant(ed|ing)?\b/, contextRe: /transplant/ },
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

function validateEvidenceIntegrity(
  input: AiDoctorOutputEvaluationInput,
  findings: FindingList,
): void {
  const result = input.result as unknown as Record<string, unknown>;
  const prov = summarizeProvenance(input.context);

  const evidence = Array.isArray(result.evidence) ? (result.evidence as unknown[]) : [];
  let affirmativeEvidenceCount = 0;

  for (const raw of evidence) {
    if (typeof raw !== "string") continue;
    const item = raw;
    const lower = item.toLowerCase();
    const cautionary = isCautionary(lower);
    if (!cautionary) affirmativeEvidenceCount += 1;

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
    let metricFindingAdded = false;
    for (const lex of METRIC_LEXICON) {
      if (!lex.term.test(lower)) continue;
      const sources = prov.metricSources.get(lex.key);
      if (!sources || sources.size === 0) {
        if (!cautionary) {
          findings.add({
            code: "evidence_not_in_context",
            severity: "error",
            field: "evidence",
            message: `Evidence cites ${lex.key} data that is not present in the compiled context.`,
            evidenceKeys: [item],
          });
          metricFindingAdded = true;
        }
        continue;
      }
      if (cautionary || metricUsable(sources)) continue; // present & usable → ok
      // Present, but only via non-trustworthy sources. Resolve most-severe first.
      if (sources.has("stale") || sources.has("invalid")) {
        findings.add({
          code: "evidence_source_unusable",
          severity: "error",
          field: "evidence",
          message: `Evidence relies on ${lex.key} data from a stale or invalid source, which cannot support a conclusion.`,
          evidenceKeys: [item],
        });
        metricFindingAdded = true;
      } else if (sources.has("csv")) {
        // CSV is honest historical support (valid interpretation). Allowed
        // unless it was described as live (handled by the live-claim rule).
      } else if (sources.has("demo")) {
        findings.add({
          code: "evidence_provenance_misrepresented",
          severity: "error",
          field: "evidence",
          message: `Evidence presents demo ${lex.key} data as real plant evidence.`,
          evidenceKeys: [item],
        });
        metricFindingAdded = true;
      } else {
        // Unknown / unrecognized provenance → conservative: cannot support a claim.
        findings.add({
          code: "evidence_source_unusable",
          severity: "error",
          field: "evidence",
          message: `Evidence relies on ${lex.key} data of unknown provenance, which cannot support a conclusion.`,
          evidenceKeys: [item],
        });
        metricFindingAdded = true;
      }
    }
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

  // 5. Healthy/stable telemetry claim not backed by trustworthy telemetry.
  const positive = positiveClaimText(input.result);
  if (
    (ENV_HEALTHY_RE_A.test(positive) || ENV_HEALTHY_RE_B.test(positive)) &&
    !prov.hasTrustworthy &&
    (prov.hasStaleOrInvalid || prov.hasDemo)
  ) {
    findings.add({
      code: "healthy_claim_from_bad_telemetry",
      severity: "error",
      message:
        "Result presents the environment as stable/healthy using stale, invalid, or demo telemetry.",
    });
  }

  // 6. Definitive single cause asserted with no supporting evidence item.
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

  // (Commit 3 calibration/safety rules attach here, appending to `findings`.)

  const sorted = sortFindings(findings.drain());

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
