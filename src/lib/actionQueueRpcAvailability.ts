/**
 * Runtime detector for the `action_queue_transition` Postgres RPC being
 * missing, renamed, or not exposed through PostgREST's schema cache.
 *
 * We do NOT trust the raw error text for user-facing copy (see
 * `actionQueueFailureCopy.ts`), but we DO inspect the error shape here so the
 * UI can distinguish "the backend function isn't available" from a normal
 * transient error. That lets us render a persistent, friendly banner instead
 * of the generic "try again" toast that would otherwise loop indefinitely.
 *
 * Signals recognised:
 *   - PostgREST schema-cache miss:    code "PGRST202"
 *   - Postgres "undefined_function":  code "42883"
 *   - Message text matches known "function ... does not exist" /
 *     "Could not find the function" patterns emitted by PostgREST / PostgREST
 *     v11+ when the RPC name is wrong or the signature drifted.
 *
 * Pure, side-effect free. No React, no Supabase, no logging.
 */

const KNOWN_MISSING_RPC_CODES: ReadonlySet<string> = new Set([
  "PGRST202", // PostgREST: function not found in schema cache
  "PGRST203", // PostgREST: ambiguous / signature mismatch after rename
  "42883", // Postgres: undefined_function
  "42P01", // Postgres: undefined_table — only treated as RPC-missing when combined with rpc name
]);

const MISSING_RPC_MESSAGE_PATTERNS: readonly RegExp[] = [
  /could not find the function/i,
  /function .* does not exist/i,
  /procedure .* does not exist/i,
  /no function matches the given name/i,
  /searched for a function named/i,
  /no matches were found in the schema cache/i,
  /could not choose the best candidate function/i,
  /unknown function/i,
];

const RPC_NAME_PATTERN = /action_queue_transition/i;

const NESTED_ERROR_KEYS: readonly string[] = ["error", "cause", "originalError", "context", "data"];

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function matchesMissingRpcText(text: string): boolean {
  for (const pattern of MISSING_RPC_MESSAGE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * Returns true when `error` looks like the `action_queue_transition` RPC is
 * missing from the deployed backend. Safe to call with anything — never
 * throws, never mutates its argument.
 */
export function isMissingActionQueueTransitionRpcError(
  error: unknown,
  seen: WeakSet<object> = new WeakSet(),
): boolean {
  if (!error || typeof error !== "object" || Array.isArray(error)) return false;
  if (seen.has(error as object)) return false;
  seen.add(error as object);
  const row = error as Record<string, unknown>;

  const code = readString(row, "code");
  if (code && KNOWN_MISSING_RPC_CODES.has(code)) {
    // 42P01 alone isn't specific — require the RPC name to appear somewhere.
    if (code !== "42P01") return true;
    const blob = [readString(row, "message"), readString(row, "details"), readString(row, "hint")]
      .filter((s): s is string => s !== null)
      .join(" ");
    if (RPC_NAME_PATTERN.test(blob)) return true;
  }

  for (const key of ["message", "details", "body", "statusText", "description"]) {
    const text = readString(row, key);
    if (text && matchesMissingRpcText(text)) return true;
  }

  const hint = readString(row, "hint");
  if (hint && RPC_NAME_PATTERN.test(hint) && /function|procedure|rpc/i.test(hint)) {
    return true;
  }

  // Some clients surface a 404 with a body string from PostgREST.
  const status = readNumber(row, "status") ?? readNumber(row, "statusCode");
  if (status === 404) {
    const body = readString(row, "body") ?? readString(row, "message");
    if (body && (RPC_NAME_PATTERN.test(body) || matchesMissingRpcText(body))) {
      return true;
    }
  }

  // Recurse into common wrapper shapes (fetch/Supabase can nest the real error).
  for (const key of NESTED_ERROR_KEYS) {
    const nested = row[key];
    if (nested && typeof nested === "object") {
      if (isMissingActionQueueTransitionRpcError(nested, seen)) return true;
    }
  }

  return false;
}

/**
 * Grower-safe copy for the missing-RPC state. Deliberately avoids echoing
 * backend error text or naming internal functions.
 */
export const ACTION_QUEUE_TRANSITION_RPC_UNAVAILABLE_COPY = {
  title: "Action updates are temporarily unavailable",
  body:
    "The backend service that records approve, reject, and complete decisions isn't responding right now. " +
    "Your queue is unchanged — no status was updated and no device commands were sent. " +
    "Support has been notified. Please try again in a few minutes.",
} as const;

/**
 * Tri-state availability of the `action_queue_transition` RPC.
 *
 *   "unknown"     — not yet proven either way (initial mount, before any
 *                   transition attempt). The UI surfaces this as an explicit
 *                   "checking availability" placeholder so growers never see a
 *                   stale/assumed status.
 *   "available"   — a transition succeeded, proving the RPC is reachable.
 *   "unavailable" — a transition failed with a missing-RPC signal (see
 *                   `isMissingActionQueueTransitionRpcError`).
 *
 * Evidence-honest: we never optimistically flip to "available" without proof.
 */
export type ActionQueueRpcAvailability = "unknown" | "available" | "unavailable";

/**
 * Grower-safe copy for the interim "we don't know yet" state. Kept short so it
 * fits in a status pill without truncation on mobile.
 */
export const ACTION_QUEUE_TRANSITION_RPC_CHECKING_COPY = {
  title: "Checking action updates…",
  label: "Checking availability",
} as const;

/**
 * Grower-safe copy for the confirmed "reachable" state.
 */
export const ACTION_QUEUE_TRANSITION_RPC_AVAILABLE_COPY = {
  title: "Action transitions are available",
  label: "Transitions ready",
} as const;
