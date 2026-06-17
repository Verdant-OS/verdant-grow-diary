// Centralized request/error sanitizer for sensor-ingest-webhook.
//
// Any value that might reach a JSON response body, a thrown error message,
// a console log, or a diagnostics payload MUST flow through this module.
//
// Rules:
//   - Never expose Authorization / Bearer / bridge token values.
//   - Never expose service-role keys or env names that imply them.
//   - Never expose JWT-shaped strings, vbt_* tokens, or generic API keys.
//   - Never expose raw request headers or raw request bodies.
//   - Always produce a stable, finite, deterministic string.

const FORBIDDEN_KEY_PATTERNS: RegExp[] = [
  /authorization/i,
  /^bearer$/i,
  /token/i,
  /secret/i,
  /api[-_]?key/i,
  /service[-_]?role/i,
  /password/i,
  /passkey/i,
  /cookie/i,
  /session/i,
  /x-verdant-bridge-token/i,
  /token_hash/i,
];

const REDACTED = "[redacted]";

// Detect token-shaped / secret-shaped strings.
function looksLikeSecret(s: string): boolean {
  if (s.length < 12) return false;
  if (/^vbt_/i.test(s)) return true;
  // JWT-shaped: three dot-separated base64url segments.
  if (/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(s)) return true;
  // Bearer literal anywhere.
  if (/\bBearer\s+\S+/i.test(s)) return true;
  // sb_… service-role-like.
  if (/^sb_[A-Za-z0-9_-]{16,}$/.test(s)) return true;
  // SUPABASE_SERVICE_ROLE_KEY env name leaking.
  if (/SUPABASE_SERVICE_ROLE_KEY/.test(s)) return true;
  return false;
}


function sanitizeString(s: string): string {
  if (looksLikeSecret(s)) return REDACTED;
  // Strip embedded Bearer ... fragments.
  return s.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

export function sanitizeForResponse(value: unknown, depth = 0): unknown {
  if (depth > 4) return REDACTED;
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string") return sanitizeString(value as string);
  if (t === "number" || t === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitizeForResponse(v, depth + 1));
  }
  if (t === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY_PATTERNS.some((re) => re.test(k))) {
        out[k] = REDACTED;
        continue;
      }
      out[k] = sanitizeForResponse(v, depth + 1);
    }
    return out;
  }
  return REDACTED;
}

export function sanitizeErrorMessage(value: unknown): string {
  let raw: string;
  if (value instanceof Error) raw = value.message ?? "error";
  else if (typeof value === "string") raw = value;
  else {
    try { raw = JSON.stringify(value); } catch { raw = "error"; }
  }
  // Cap length, strip secrets, strip newlines.
  raw = raw.replace(/[\r\n]+/g, " ").slice(0, 200);
  return sanitizeString(raw);
}

// Safe console logger. Only stable string event names + sanitized details.
// Never accepts the raw req or raw body.
export function safeLog(event: string, details?: Record<string, unknown>): void {
  const safeEvent = String(event).replace(/[^A-Za-z0-9._:\- ]/g, "").slice(0, 120);
  if (!details) {
    console.log(`[sensor-ingest-webhook] ${safeEvent}`);
    return;
  }
  const safe = sanitizeForResponse(details) as Record<string, unknown>;
  console.log(`[sensor-ingest-webhook] ${safeEvent}`, safe);
}
