/**
 * Pure prompt-boundary vocabulary rules for AI Doctor.
 *
 * The result contract deliberately rejects a small set of overconfident
 * or ambiguous words. Model input can contain those words in source labels,
 * packet keys, or grower-authored notes, so prompt assembly must translate
 * them without mutating the authoritative context packet.
 */

import { AI_DOCTOR_REVIEW_BANNED_WORDS } from "./aiDoctorReviewResultContract";

const SAFE_REPLACEMENTS: Readonly<Record<string, string>> = Object.freeze({
  confirmed: "supported",
  certain: "definitive",
  cured: "recovered",
  guaranteed: "expected",
  live: "current",
  synced: "updated",
  connected: "communicating",
  imported: "historical",
});

const KNOWN_PACKET_KEY_REPLACEMENTS: Readonly<Record<string, string>> = Object.freeze({
  imported_sensor_history: "historical_sensor_context",
  hasLiveSensorReadings: "hasCurrentSensorReadings",
  missingLiveSensorReadings: "missingCurrentSensorReadings",
  notForLiveDiagnosis: "notForCurrentDiagnosis",
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BANNED_WORDS_RE = new RegExp(
  `\\b(${AI_DOCTOR_REVIEW_BANNED_WORDS.map(escapeRegExp).join("|")})\\b`,
  "gi",
);

function preserveCase(source: string, replacement: string): string {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Translate validator-banned words while preserving the source meaning. */
export function sanitizeAiDoctorPromptText(value: string): string {
  const translated = value.replace(BANNED_WORDS_RE, (matched) => {
    const replacement = SAFE_REPLACEMENTS[matched.toLowerCase()];
    return replacement ? preserveCase(matched, replacement) : matched;
  });
  return translated
    .replace(/\bhistorical history\b/gi, (matched) => preserveCase(matched, "historical context"))
    .replace(/\bhistorical sensor history\b/gi, (matched) =>
      preserveCase(matched, "historical sensor context"),
    );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizePromptKey(key: string): string {
  return KNOWN_PACKET_KEY_REPLACEMENTS[key] ?? sanitizeAiDoctorPromptText(key);
}

/**
 * Return a deterministic JSON-like copy safe to place in a model prompt.
 * The input is never mutated; numbers, booleans, and null are preserved.
 */
export function buildValidatorSafeAiDoctorPromptValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeAiDoctorPromptText(value);
  if (Array.isArray(value)) {
    return value.map((item) => buildValidatorSafeAiDoctorPromptValue(item));
  }
  if (!isPlainRecord(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[sanitizePromptKey(key)] = buildValidatorSafeAiDoctorPromptValue(item);
  }
  return out;
}
