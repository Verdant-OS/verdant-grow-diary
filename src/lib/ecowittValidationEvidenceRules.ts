/**
 * Pure redaction + formatting helpers for the latest EcoWitt local
 * validation evidence. No I/O, no network, no JSX.
 *
 * Operator-safe surface: never reveal tokens, bearer/authorization,
 * service_role, JWTs, signatures, api keys, raw user_id, or internal IDs
 * outside masked form.
 */

export const ECOWITT_EVIDENCE_LABEL =
  "Local EcoWitt validation evidence — test/local validation data.";

const SECRETY_KEY_PATTERNS: RegExp[] = [
  /token/i,
  /bridge_token/i,
  /vbt/i,
  /authorization/i,
  /bearer/i,
  /jwt/i,
  /service_role/i,
  /signature/i,
  /api[_-]?key/i,
  /passkey/i,
  /secret/i,
  /password/i,
  /^user_id$/i,
];

const INTERNAL_ID_KEYS = new Set(["id", "row_id", "internal_id"]);
const REDACTED = "[redacted]";
const REDACTED_SECRET_VALUE = "[REDACTED]";

// Keep credential-labelled free-text pairs aligned with the diagnostics
// sanitizer without importing its export-specific implementation. Scoping the
// rule to credential vocabulary preserves useful telemetry such as
// `temp_f=77.4` and `inserted=1`.
const CREDENTIAL_KEY_SOURCE =
  "(?:token|authorization|bearer|api[_-]?key|secret|password|service[_-]?role|anon[_-]?key|bridge[_-]?token|passkey|signature|jwt|vbt|user_id)";
// Do not consume a Bearer/Basic/Digest/Negotiate/NTLM prefix or the name of
// a nested assignment as the credential value; the dedicated later rules must
// see those spans whole. A
// matching optional quote pair keeps serialized JSON keys inside safe strings
// on the same redaction path as their unquoted free-text equivalents.
const CREDENTIAL_PAIR_PATTERN = new RegExp(
  `(["']?)[A-Za-z0-9_-]*${CREDENTIAL_KEY_SOURCE}[A-Za-z0-9_-]*\\1\\s*[=:]\\s*(?!(?:Bearer|Basic|Digest|Negotiate|NTLM)\\b)(?![A-Za-z0-9_-]+\\s*[=:])(?:"[^"]+"|'[^']+'|[^\\s"',;}]+)`,
  "gi",
);

// Keep this value class aligned with the forwarding-report sanitizer:
// secret-shaped strings must redact even when their containing key looks safe.
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /vbt_[A-Za-z0-9_-]{6,}/g,
  /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g,
  CREDENTIAL_PAIR_PATTERN,
  // Env NAME=value assignments.
  //
  // ORDER IS LOAD-BEARING: this MUST stay above BOTH the header patterns and the
  // bare-word label patterns below. Either group can destroy the variable NAME
  // before this rule sees it, and once the NAME no longer satisfies
  // `[A-Z][A-Z0-9_]{2,}=` the VALUE survives into redacted_raw_payload and the
  // clipboard export. Two distinct mechanisms:
  //
  //   1. FRAGMENTING — a bare-word label rule rewrites the label inside the NAME,
  //      so `PASSKEY=secret` became `[REDACTED]=secret`.
  //   2. CONSUMING — a header rule swallows the whole following token, NAME
  //      included, so `Authorization: PASSKEY="secret"` became
  //      `[REDACTED]"secret"`. This one needs NO credential label in the NAME at
  //      all: `Bearer SOME_PLAIN_NAME="secret"` leaked identically.
  //
  // Pinned by "redacts the whole credential assignment in a safe-key string" and
  // "redacts the credential assignment behind a header prefix".
  /\b[A-Z][A-Z0-9_]{2,}=(?:"[^"]{2,}"|'[^']{2,}'|[^\s"']{2,})/g,
  /Bearer\s+[A-Za-z0-9._-]{6,}/gi,
  // Parameterized reserved-scheme headers must be consumed WHOLE, remainder
  // included. #1222 matched only the first `attr="value"` pair, so everything
  // after the first comma — `realm=`, `nonce=`, any later attribute — survived
  // into redacted_raw_payload and the clipboard export; a short, non-hex secret
  // in any position but the first leaked. `Basic` was absent from that branch
  // entirely and fell through to the value tail, which stops at the first quote,
  // so parameterized Basic leaked both values.
  //
  // The scheme list stays CLOSED (Basic|Digest|Negotiate|NTLM). This is
  // deliberately NOT a parameterized unknown-scheme catch-all: an open scheme
  // class would consume arbitrary `word attr="value"` spans far from any real
  // Authorization header. Token-shaped values keep falling through to the tail
  // branch below — base64 padding (`…og==`) never satisfies `=` + quote, so the
  // token pins are unaffected.
  /Authorization\s*:\s*(?:(?:Basic|Digest|Negotiate|NTLM)\s+[A-Za-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*')(?:\s*,\s*[A-Za-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'))*|(?:(?:Basic|Digest|Negotiate|NTLM)\s+)?[^\s",}]+)/gi,
  /PASSKEY/gi,
  new RegExp(["service", "_", "role"].join(""), "gi"),
  /(?<![0-9A-Fa-f])[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}(?![0-9A-Fa-f])/g,
  /(?<![0-9A-Fa-f])[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}(?![0-9A-Fa-f])/g,
  /(?<![0-9A-Fa-f])[0-9A-Fa-f]{32,}(?![0-9A-Fa-f])/g,
  /(?<![0-9A-Fa-f])(?=[0-9A-Fa-f]{0,30}[A-Fa-f])[0-9A-Fa-f]{12,31}(?![0-9A-Fa-f])/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
];

function isSecretKey(key: string): boolean {
  if (SECRETY_KEY_PATTERNS.some((p) => p.test(key))) return true;
  return false;
}

function maskInternalId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "—";
  return `${value.slice(0, 4)}…(len=${value.length})`;
}

function redactSecretValues(value: string): string {
  let out = value;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(pattern, REDACTED_SECRET_VALUE);
  }
  return out;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function redactEvidenceNode(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === "string") return redactSecretValues(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : REDACTED;
  if (Array.isArray(value)) return value.map((v) => redactEvidenceNode(v));
  if (isPlainRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSecretKey(k)) {
        out[k] = REDACTED;
        continue;
      }
      if (INTERNAL_ID_KEYS.has(k.toLowerCase())) {
        out[k] = maskInternalId(v);
        continue;
      }
      out[k] = redactEvidenceNode(v);
    }
    return out;
  }
  return REDACTED;
}

export function redactEvidenceValue(value: unknown): unknown {
  try {
    if (isPlainRecord(value)) return redactEvidenceNode(value);
    if (Array.isArray(value)) {
      if (!value.every((reading) => isPlainRecord(reading))) return REDACTED;
      return value.map((reading) => redactEvidenceNode(reading));
    }
    return REDACTED;
  } catch {
    return REDACTED;
  }
}

export interface EcowittEvidenceMetricSummary {
  key: string;
  label: string;
  status: string;
  value: number | null;
  reason: string;
}

export interface EcowittEvidenceSnapshot {
  label: string;
  source: string;
  tent: string;
  captured_at: string | null;
  status: string;
  status_message: string;
  test_sender: boolean;
  invalid_test: boolean;
  stale: boolean;
  metrics: EcowittEvidenceMetricSummary[];
  redacted_raw_payload: unknown;
  derived_reading_warnings: string[];
}

export interface BuildLatestEvidenceInput {
  hasEvidence: boolean;
  status: string;
  statusMessage: string;
  sourceLabel: string;
  tentScopedLabel: string;
  capturedAtLabel: string;
  isTestSender: boolean;
  invalidTest: boolean;
  stale: boolean;
  metricRows: readonly EcowittEvidenceMetricSummary[];
  rawPayload: unknown;
  derivedReadingWarnings: readonly string[];
}

export function buildLatestEvidenceSnapshot(
  input: BuildLatestEvidenceInput,
): EcowittEvidenceSnapshot | null {
  if (!input.hasEvidence) return null;
  return {
    label: ECOWITT_EVIDENCE_LABEL,
    source: input.sourceLabel,
    tent: input.tentScopedLabel,
    captured_at: input.capturedAtLabel === "—" ? null : input.capturedAtLabel,
    status: input.status,
    status_message: input.statusMessage,
    test_sender: input.isTestSender,
    invalid_test: input.invalidTest,
    stale: input.stale,
    metrics: input.metricRows.map((m) => ({
      key: m.key,
      label: m.label,
      status: m.status,
      value: m.value,
      reason: m.reason,
    })),
    redacted_raw_payload: redactEvidenceValue(input.rawPayload),
    derived_reading_warnings: [...input.derivedReadingWarnings],
  };
}

export function serializeEvidenceForClipboard(snap: EcowittEvidenceSnapshot): string {
  return JSON.stringify(snap, null, 2);
}

export const COPY_EVIDENCE_REDACTION_NOTICE =
  "Tokens, bridge tokens, authorization/bearer/JWT, service_role, signatures, api keys, raw user_id, and internal IDs are redacted before clipboard. Test/local data only — never sent.";

export interface EcowittEvidencePreview {
  label: string;
  source: string;
  tent: string;
  captured_at: string | null;
  metric_summary: { key: string; label: string; status: string }[];
  redaction_notice: string;
}

export function buildEvidencePreview(snap: EcowittEvidenceSnapshot): EcowittEvidencePreview {
  return {
    label: snap.label,
    source: snap.source,
    tent: snap.tent,
    captured_at: snap.captured_at,
    metric_summary: snap.metrics.map((m) => ({
      key: m.key,
      label: m.label,
      status: m.status,
    })),
    redaction_notice: COPY_EVIDENCE_REDACTION_NOTICE,
  };
}
