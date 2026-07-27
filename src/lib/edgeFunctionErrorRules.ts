// Typed client-side helper that maps stable edge-function `error_code`
// values (see supabase/functions/*/index.ts standard failure shape) to
// user-friendly messages and safe retry behavior.
//
// Contract with the edge layer:
//   {
//     "error":       string,             // internal label, not shown to users
//     "error_code":  EdgeErrorCode,      // stable machine code — this file's input
//     "request_id":  string              // uuid for support/tracing (safe to show)
//   }
//
// SAFETY:
//  - never surfaces `error`, stack traces, JWT/session hints, or raw server text
//  - never enumerates auth state ("no such user", "expired token", etc.)
//  - unknown codes fall back to a generic message with no diagnostic leakage
//  - retry policy is derived from the code, never from raw HTTP status alone

export const EDGE_ERROR_CODES = [
  "missing_bearer_token",
  "invalid_jwt",
  "operator_role_required",
  "method_not_allowed",
  "env_missing",
  "role_check_failed",
  "query_failed",
] as const;

export type EdgeErrorCode = (typeof EDGE_ERROR_CODES)[number];

export type EdgeRetryPolicy =
  | { kind: "none"; reason: "auth" | "forbidden" | "client_bug" | "config" }
  | { kind: "manual"; afterMs?: number }
  | { kind: "auto"; afterMs: number; maxAttempts: number };

export interface EdgeErrorPresentation {
  /** Stable code from server, or "unknown" when unrecognized/absent. */
  code: EdgeErrorCode | "unknown";
  /** HTTP status when known — informational only, do not branch UI on it. */
  status: number | null;
  /** Short user-facing title. Never leaks server-side detail. */
  title: string;
  /** User-facing body/description. Safe to render verbatim. */
  message: string;
  /** True when the user can meaningfully retry (auto or manual). */
  retryable: boolean;
  /** Retry policy — respect this instead of hand-rolling per call site. */
  retry: EdgeRetryPolicy;
  /** Whether the user should be routed to (re)authenticate. */
  requiresReauth: boolean;
  /** UUID from the edge function response, safe to display for support. */
  requestId: string | null;
}

interface CopyEntry {
  title: string;
  message: string;
  retry: EdgeRetryPolicy;
  requiresReauth: boolean;
}

const COPY: Record<EdgeErrorCode, CopyEntry> = {
  missing_bearer_token: {
    title: "Please sign in",
    message: "You need to be signed in to do that. Sign in and try again.",
    retry: { kind: "none", reason: "auth" },
    requiresReauth: true,
  },
  invalid_jwt: {
    title: "Session expired",
    message: "Your session has expired. Sign in again to continue.",
    retry: { kind: "none", reason: "auth" },
    requiresReauth: true,
  },
  operator_role_required: {
    title: "Not available on this account",
    message: "This area is limited to operator accounts.",
    retry: { kind: "none", reason: "forbidden" },
    requiresReauth: false,
  },
  method_not_allowed: {
    title: "Something went wrong",
    message: "That action isn't supported here. Refresh the page and try again.",
    retry: { kind: "none", reason: "client_bug" },
    requiresReauth: false,
  },
  env_missing: {
    title: "Temporarily unavailable",
    message: "This service is temporarily unavailable. Please try again shortly.",
    retry: { kind: "manual", afterMs: 30_000 },
    requiresReauth: false,
  },
  role_check_failed: {
    title: "Couldn't verify your account",
    message: "We couldn't verify your account just now. Please try again in a moment.",
    retry: { kind: "auto", afterMs: 2_000, maxAttempts: 2 },
    requiresReauth: false,
  },
  query_failed: {
    title: "Couldn't load that right now",
    message: "We couldn't complete that request. Please try again in a moment.",
    retry: { kind: "auto", afterMs: 2_000, maxAttempts: 2 },
    requiresReauth: false,
  },
};

const UNKNOWN_COPY: CopyEntry = {
  title: "Something went wrong",
  message: "Something went wrong. Please try again in a moment.",
  retry: { kind: "manual" },
  requiresReauth: false,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isEdgeErrorCode(value: unknown): value is EdgeErrorCode {
  return typeof value === "string" && (EDGE_ERROR_CODES as readonly string[]).includes(value);
}

function coerceRequestId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

/**
 * Extract a code + request id from a fetch Response body, error object, or
 * plain payload. Never throws — an unrecognized shape resolves to "unknown".
 */
export function describeEdgeError(
  input: unknown,
  status: number | null = null,
): EdgeErrorPresentation {
  let code: EdgeErrorCode | "unknown" = "unknown";
  let requestId: string | null = null;

  if (input && typeof input === "object") {
    const anyInput = input as Record<string, unknown>;
    if (isEdgeErrorCode(anyInput.error_code)) code = anyInput.error_code;
    requestId = coerceRequestId(anyInput.request_id);
  }

  const copy = code === "unknown" ? UNKNOWN_COPY : COPY[code];
  const retryable = copy.retry.kind !== "none";

  return {
    code,
    status,
    title: copy.title,
    message: copy.message,
    retryable,
    retry: copy.retry,
    requiresReauth: copy.requiresReauth,
    requestId,
  };
}

/**
 * Parse a fetch Response into a presentation. Reads JSON safely; falls back
 * to "unknown" on non-JSON bodies. Also reads `x-request-id` header when the
 * body lacks one.
 */
export async function describeEdgeErrorResponse(
  response: Response,
): Promise<EdgeErrorPresentation> {
  let payload: unknown = null;
  try {
    payload = await response.clone().json();
  } catch {
    payload = null;
  }
  const presentation = describeEdgeError(payload, response.status);
  if (!presentation.requestId) {
    const header = response.headers.get("x-request-id");
    const coerced = coerceRequestId(header);
    if (coerced) return { ...presentation, requestId: coerced };
  }
  return presentation;
}
