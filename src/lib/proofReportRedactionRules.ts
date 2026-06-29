/**
 * SAFETY-CONTRACT: APPROVAL-REQUIRED
 *
 * proofReportRedactionRules — pure sanitizer for human-readable proof
 * reports (copy/print surfaces).
 *
 * Hard constraints:
 *  - Pure: no I/O, no React, no Supabase, no time.
 *  - Defensive: redacts well-known sensitive shapes before any
 *    copy-to-clipboard or print uses the text.
 *  - Never invents content — only strips known-bad shapes and replaces
 *    them with the literal token `[redacted]`.
 *
 * Patterns redacted (case-insensitive where appropriate):
 *  - UUIDs (canonical 8-4-4-4-12 hex form)
 *  - Second / millisecond ISO timestamps (Z or ±HH:MM)
 *  - Bearer tokens, JWT-shaped strings
 *  - `service_role` / SUPABASE_SERVICE_ROLE references
 *  - `bridge_token`, `bridge_token_id`, `access_token`, `refresh_token`
 *  - `raw_payload` references and obvious env-secret patterns
 *  - MAC-like values (`AA:BB:CC:DD:EE:FF` and EUI-64 dotted forms)
 *  - Long hex blobs that look like API keys (>= 32 hex chars)
 */

export const REDACTED_PLACEHOLDER = "[redacted]";

const UUID_RE =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;

const ISO_SECOND_RE =
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\b/g;

const MAC_RE = /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g;

const BEARER_RE = /\bBearer\s+[A-Za-z0-9._\-]+/g;

const JWT_RE = /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g;

const LONG_HEX_RE = /\b[0-9a-fA-F]{32,}\b/g;

/**
 * Keyword tokens that — if they ever appear in human-readable copy/print
 * output — indicate a likely secret leak. We strip occurrences of these
 * tokens (and an adjacent `=value` or `:value` pair if present) instead
 * of leaving them in the report.
 */
const SECRET_KEYWORDS: ReadonlyArray<string> = [
  "service_role",
  "SUPABASE_SERVICE_ROLE",
  "SUPABASE_SERVICE_ROLE_KEY",
  "bridge_token_id",
  "bridge_token",
  "access_token",
  "refresh_token",
  "raw_payload",
  "anon_key",
  "ANON_KEY",
  "api_key",
  "API_KEY",
  "apikey",
  "passkey",
  "password",
  "secret",
  "jwt",
  "authorization",
];

// Matches `KEY=value`, `KEY: value`, `"KEY": "value"`, JSON, YAML, env,
// URL query, and code-span forms. The key may be wrapped in matching
// quotes (e.g. `"access_token"`). Value is captured up to whitespace,
// quote, comma, semicolon, ampersand, or backtick.
const SECRET_PAIR_RES: ReadonlyArray<RegExp> = SECRET_KEYWORDS.map(
  (k) =>
    new RegExp(
      `["'\`]?\\b${k}\\b["'\`]?\\s*[:=]\\s*["'\`]?[^\\s"'\`,;&]+["'\`]?`,
      "gi",
    ),
);

// Authorization header (and `Authorization` followed by any value) — the
// entire value up to end-of-line is redacted, since `Bearer <token>` would
// otherwise leave the token after the `:` colon-pair strip.
const AUTH_HEADER_RE = /\bAuthorization\s*[:=]\s*[^\r\n]+/gi;

// Bare keyword fallback — replaces a residual reference once any
// preceding `key=value` pairs have been stripped.
const SECRET_BARE_RES: ReadonlyArray<RegExp> = SECRET_KEYWORDS.map(
  (k) => new RegExp(`\\b${k}\\b`, "gi"),
);

/**
 * Sanitize a human-readable proof report (markdown or plain text) before
 * it is used for copy-to-clipboard or print output.
 *
 * Deterministic and idempotent: sanitizing already-sanitized text is a
 * no-op.
 */
export function sanitizeProofReportMarkdown(input: string): string {
  if (typeof input !== "string" || input.length === 0) return "";
  let out = input;
  // Authorization headers first — strip whole value before any sub-pattern
  // (e.g. `Bearer ...`) is partially consumed by other rules.
  out = out.replace(AUTH_HEADER_RE, REDACTED_PLACEHOLDER);
  // Order matters: strip key=value pairs next so the placeholder doesn't
  // immediately get re-stripped by the bare keyword pass.
  for (const re of SECRET_PAIR_RES) out = out.replace(re, REDACTED_PLACEHOLDER);
  out = out.replace(JWT_RE, REDACTED_PLACEHOLDER);
  out = out.replace(BEARER_RE, REDACTED_PLACEHOLDER);
  out = out.replace(UUID_RE, REDACTED_PLACEHOLDER);
  out = out.replace(ISO_SECOND_RE, REDACTED_PLACEHOLDER);
  out = out.replace(MAC_RE, REDACTED_PLACEHOLDER);
  out = out.replace(LONG_HEX_RE, REDACTED_PLACEHOLDER);
  for (const re of SECRET_BARE_RES) out = out.replace(re, REDACTED_PLACEHOLDER);
  return out;
}

/**
 * Static UI copy describing what the copy/print sanitizer does. Surfaced
 * near the Copy / Print controls so operators see the contract before
 * sharing.
 */
export const PROOF_REPORT_REDACTION_NOTICE: readonly string[] = Object.freeze([
  "Copy and print use the sanitized report.",
  "Raw IDs, payloads, and secrets are excluded.",
]);
