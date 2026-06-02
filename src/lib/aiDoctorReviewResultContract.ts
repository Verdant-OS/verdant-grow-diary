/**
 * aiDoctorReviewResultContract — pure schema + validator for AI Doctor
 * review results.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no model/API calls.
 *  - Never accepts/emits banned wording: confirmed, certain, cured,
 *    guaranteed, live, synced, connected, imported.
 *  - Strips unknown / sensitive keys silently (raw_payload, secrets,
 *    tokens, service_role, anything outside the contract).
 *  - Rejects (returns invalid) on enum violations, empty required fields,
 *    array cap overflow, device-control language, banned wording.
 */

export type AiDoctorReviewConfidence = "low" | "medium" | "high";
export type AiDoctorReviewRiskLevel = "low" | "watch" | "elevated" | "high";

export const AI_DOCTOR_REVIEW_ARRAY_CAP = 12;

export const AI_DOCTOR_REVIEW_CONFIDENCE_VALUES: readonly AiDoctorReviewConfidence[] =
  Object.freeze(["low", "medium", "high"]);
export const AI_DOCTOR_REVIEW_RISK_VALUES: readonly AiDoctorReviewRiskLevel[] =
  Object.freeze(["low", "watch", "elevated", "high"]);

export interface AiDoctorReviewActionQueueSuggestion {
  title: string;
  rationale: string;
}

export interface AiDoctorReviewResult {
  summary: string;
  likely_issue: string;
  confidence: AiDoctorReviewConfidence;
  evidence: string[];
  missing_information: string[];
  possible_causes: string[];
  immediate_action: string;
  what_not_to_do: string;
  twenty_four_hour_follow_up: string;
  three_day_recovery_plan: string;
  risk_level: AiDoctorReviewRiskLevel;
  action_queue_suggestion?: AiDoctorReviewActionQueueSuggestion;
}

export type AiDoctorReviewValidation =
  | { ok: true; result: AiDoctorReviewResult }
  | { ok: false; reason: string };

const REQUIRED_STRING_FIELDS = [
  "summary",
  "likely_issue",
  "immediate_action",
  "what_not_to_do",
  "twenty_four_hour_follow_up",
  "three_day_recovery_plan",
] as const;

const CAPPED_ARRAY_FIELDS = [
  "evidence",
  "missing_information",
  "possible_causes",
] as const;

const BANNED_WORDS = [
  "confirmed",
  "certain",
  "cured",
  "guaranteed",
  "live",
  "synced",
  "connected",
  "imported",
];

const BANNED_WORDS_RE = new RegExp(`\\b(${BANNED_WORDS.join("|")})\\b`, "i");

const DEVICE_CONTROL_RE =
  /\b(turn|switch|enable|disable|activate|deactivate|toggle|trigger|power)\b(?:\s+(?:on|off|the|a|an|your|all|every|this|that))*\s+\b(fan|fans|light|lights|pump|pumps|heater|heaters|humidifier|humidifiers|dehumidifier|dehumidifiers|valve|valves|relay|actuator|outlet|socket|controller|hvac|exhaust|intake|dosing|injector|irrigation|sprinkler)\b/i;

// Advisory / negated phrasing that scopes device verbs to "do not do this"
// guidance instead of an imperative command. When such phrasing is in the
// same sentence/clause as a device-control match, treat it as safe copy.
const NEGATION_RE =
  /\b(do\s+not|do\s*n['’]t|don['’]t|never|avoid|without|should\s*not|shouldn['’]t|no\s+need\s+to|refrain\s+from|cannot|can['’]t|must\s+not|mustn['’]t)\b/i;

const SENSITIVE_KEY_RE =
  /(^|_)(raw_payload|secret|secrets|token|tokens|api_key|apikey|service_role|password|credential|credentials|bearer|jwt)(_|$)|^(raw_payload|secret|secrets|token|tokens|api_key|apikey|service_role|password|credential|credentials|bearer|jwt)$/i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function containsBanned(text: string): boolean {
  return BANNED_WORDS_RE.test(text);
}

// Detect device-control language scoped to imperative position. Splits on
// sentence/clause boundaries so that advisory phrasing ("Do not toggle
// fans…") does not trip the imperative detector.
function containsDeviceControl(text: string): boolean {
  const clauses = text.split(/[.!?;\n]+/);
  for (const raw of clauses) {
    const clause = raw.trim();
    if (!clause) continue;
    if (!DEVICE_CONTROL_RE.test(clause)) continue;
    if (NEGATION_RE.test(clause)) continue;
    return true;
  }
  return false;
}

function sanitizeStringArray(
  v: unknown,
): { ok: true; value: string[] } | { ok: false; reason: string } {
  if (v == null) return { ok: true, value: [] };
  if (!Array.isArray(v)) return { ok: false, reason: "array_expected" };
  if (v.length > AI_DOCTOR_REVIEW_ARRAY_CAP) {
    return { ok: false, reason: "array_over_cap" };
  }
  const out: string[] = [];
  for (const item of v) {
    const s = cleanString(item);
    if (s == null) return { ok: false, reason: "empty_array_item" };
    if (containsBanned(s)) return { ok: false, reason: "banned_word" };
    if (containsDeviceControl(s)) return { ok: false, reason: "device_control" };
    out.push(s);
  }
  return { ok: true, value: out };
}

function sanitizeActionQueueSuggestion(
  v: unknown,
):
  | { ok: true; value: AiDoctorReviewActionQueueSuggestion | undefined }
  | { ok: false; reason: string } {
  if (v == null) return { ok: true, value: undefined };
  if (!isPlainObject(v)) return { ok: false, reason: "suggestion_shape" };
  const title = cleanString(v.title);
  const rationale = cleanString(v.rationale);
  if (!title || !rationale) {
    return { ok: false, reason: "suggestion_empty_field" };
  }
  for (const t of [title, rationale]) {
    if (containsBanned(t)) return { ok: false, reason: "banned_word" };
    if (containsDeviceControl(t)) {
      return { ok: false, reason: "device_control" };
    }
  }
  return { ok: true, value: { title, rationale } };
}

/**
 * Validate + sanitize an unknown payload into an `AiDoctorReviewResult`.
 *
 * Strips unknown / sensitive keys silently. Rejects on enum/required/cap
 * violations, banned wording, or device-control instructions.
 */
export function validateAiDoctorReviewResult(
  input: unknown,
): AiDoctorReviewValidation {
  if (!isPlainObject(input)) return { ok: false, reason: "shape" };

  // Drop sensitive keys silently — keep validation working on a copy.
  const safe: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(input)) {
    if (SENSITIVE_KEY_RE.test(k)) continue;
    safe[k] = val;
  }

  const required: Record<string, string> = {};
  for (const field of REQUIRED_STRING_FIELDS) {
    const s = cleanString(safe[field]);
    if (!s) return { ok: false, reason: `empty:${field}` };
    if (containsBanned(s)) return { ok: false, reason: `banned:${field}` };
    if (containsDeviceControl(s)) {
      return { ok: false, reason: `device_control:${field}` };
    }
    required[field] = s;
  }

  const confidence = safe.confidence;
  if (
    typeof confidence !== "string" ||
    !AI_DOCTOR_REVIEW_CONFIDENCE_VALUES.includes(
      confidence as AiDoctorReviewConfidence,
    )
  ) {
    return { ok: false, reason: "confidence_enum" };
  }
  const risk = safe.risk_level;
  if (
    typeof risk !== "string" ||
    !AI_DOCTOR_REVIEW_RISK_VALUES.includes(risk as AiDoctorReviewRiskLevel)
  ) {
    return { ok: false, reason: "risk_enum" };
  }

  const arrays: Record<(typeof CAPPED_ARRAY_FIELDS)[number], string[]> = {
    evidence: [],
    missing_information: [],
    possible_causes: [],
  };
  for (const field of CAPPED_ARRAY_FIELDS) {
    const r = sanitizeStringArray(safe[field]);
    if (r.ok === false) return { ok: false, reason: `${r.reason}:${field}` };
    arrays[field] = r.value;
  }

  const sug = sanitizeActionQueueSuggestion(safe.action_queue_suggestion);
  if (sug.ok === false) return { ok: false, reason: sug.reason };

  const result: AiDoctorReviewResult = {
    summary: required.summary,
    likely_issue: required.likely_issue,
    confidence: confidence as AiDoctorReviewConfidence,
    evidence: arrays.evidence,
    missing_information: arrays.missing_information,
    possible_causes: arrays.possible_causes,
    immediate_action: required.immediate_action,
    what_not_to_do: required.what_not_to_do,
    twenty_four_hour_follow_up: required.twenty_four_hour_follow_up,
    three_day_recovery_plan: required.three_day_recovery_plan,
    risk_level: risk as AiDoctorReviewRiskLevel,
    ...(sug.value ? { action_queue_suggestion: sug.value } : {}),
  };
  return { ok: true, result };
}
