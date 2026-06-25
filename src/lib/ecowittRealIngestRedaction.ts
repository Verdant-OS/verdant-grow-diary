/**
 * EcoWitt real-ingest payload redaction.
 *
 * Pure, non-mutating helper. Walks any value and replaces the value of
 * keys whose name (case-insensitive) contains any sensitive substring
 * with the literal string "[REDACTED]". Non-sensitive structure is
 * preserved. Primitives are returned as-is.
 *
 * Used by the validator so that the result carries `redacted_payload`
 * instead of the raw private payload. No I/O, no Supabase, no fetch.
 */

const SENSITIVE_KEY_SUBSTRINGS: readonly string[] = [
  "passkey",
  "password",
  "token",
  "secret",
  "authorization",
  "auth",
  "mac",
  "ip",
  "station",
  "gateway",
];

const REDACTED = "[REDACTED]";

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  for (const needle of SENSITIVE_KEY_SUBSTRINGS) {
    if (lower.includes(needle)) return true;
  }
  return false;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.prototype.toString.call(v) === "[object Object]"
  );
}

export function redactEcoWittRawPayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload)) {
    return payload.map((item) => redactEcoWittRawPayload(item));
  }
  if (isPlainObject(payload)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(payload)) {
      if (isSensitiveKey(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = redactEcoWittRawPayload(payload[key]);
      }
    }
    return out;
  }
  return payload;
}

export const ECOWITT_REAL_INGEST_REDACTED_LITERAL = REDACTED;
export const ECOWITT_REAL_INGEST_SENSITIVE_KEY_SUBSTRINGS =
  SENSITIVE_KEY_SUBSTRINGS;
