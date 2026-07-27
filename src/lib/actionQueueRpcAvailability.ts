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
  "42883", // Postgres: undefined_function
]);

const MISSING_RPC_MESSAGE_PATTERNS: readonly RegExp[] = [
  /could not find the function/i,
  /function .* does not exist/i,
  /no function matches the given name/i,
];

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Returns true when `error` looks like the `action_queue_transition` RPC is
 * missing from the deployed backend. Safe to call with anything — never
 * throws, never mutates its argument.
 */
export function isMissingActionQueueTransitionRpcError(error: unknown): boolean {
  if (!error || typeof error !== "object" || Array.isArray(error)) return false;
  const row = error as Record<string, unknown>;

  const code = readString(row, "code");
  if (code && KNOWN_MISSING_RPC_CODES.has(code)) return true;

  const message = readString(row, "message");
  if (message) {
    for (const pattern of MISSING_RPC_MESSAGE_PATTERNS) {
      if (pattern.test(message)) return true;
    }
  }

  const details = readString(row, "details");
  if (details) {
    for (const pattern of MISSING_RPC_MESSAGE_PATTERNS) {
      if (pattern.test(details)) return true;
    }
  }

  const hint = readString(row, "hint");
  if (hint && /action_queue_transition/i.test(hint) && /function/i.test(hint)) {
    return true;
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
