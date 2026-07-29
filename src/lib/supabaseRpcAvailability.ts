/**
 * supabaseRpcAvailability — classify a PostgREST/Supabase RPC error into a
 * small, grower/operator-safe vocabulary.
 *
 * Why this exists:
 *   Verdant's client types are generated from the schema. When a reviewed
 *   migration has been merged but not yet APPLIED to the target project (the
 *   protected apply-lane gap), calling its RPC fails with PostgREST's
 *   "function not found" / "schema cache" family. Surfaces that render the raw
 *   `error.message` then show growers and operators a Postgres string that
 *   neither explains the cause nor names a next action.
 *
 * Pure, deterministic, null-safe. No React, no I/O, no privileged access.
 * Never echoes the raw backend message into the returned copy — callers may
 * still log the original for diagnostics, but the UI copy is fixed text.
 */

/**
 * PostgREST codes that mean "the thing you called is not in the schema cache".
 *  - PGRST202: no function matches the name/arguments in the schema cache
 *  - PGRST205: no table/view matches the name in the schema cache
 *  - 42883:    Postgres "function does not exist"
 *  - 42P01:    Postgres "relation does not exist"
 */
const MISSING_OBJECT_CODES: ReadonlySet<string> = new Set([
  "PGRST202",
  "PGRST205",
  "42883",
  "42P01",
]);

/**
 * Message fragments PostgREST uses for the same condition when a structured
 * code is not carried through (older clients, edge proxies, wrapped errors).
 * Matched case-insensitively against the message only — never against data.
 */
const MISSING_OBJECT_MESSAGE_FRAGMENTS: ReadonlyArray<RegExp> = [
  /could not find the function/i,
  /could not find the table/i,
  /schema cache/i,
  /function .* does not exist/i,
  /relation .* does not exist/i,
];

export type SupabaseRpcAvailability =
  /** The object is not in the schema cache — migration unapplied, or types/cache stale. */
  | "missing_or_stale"
  /** The call reached the object and failed for another reason (permission, validation, network). */
  | "other_error"
  /** No error. */
  | "ok";

export interface SupabaseRpcErrorLike {
  readonly code?: string | null;
  readonly message?: string | null;
}

/**
 * Classify an RPC error. `null`/`undefined` means success.
 */
export function classifySupabaseRpcError(
  error: SupabaseRpcErrorLike | null | undefined,
): SupabaseRpcAvailability {
  if (!error) return "ok";
  const code = typeof error.code === "string" ? error.code.trim().toUpperCase() : "";
  if (code && MISSING_OBJECT_CODES.has(code)) return "missing_or_stale";
  const message = typeof error.message === "string" ? error.message : "";
  if (message && MISSING_OBJECT_MESSAGE_FRAGMENTS.some((re) => re.test(message))) {
    return "missing_or_stale";
  }
  return "other_error";
}

/** Convenience predicate for call sites that only branch on the missing case. */
export function isMissingOrStaleRpc(error: SupabaseRpcErrorLike | null | undefined): boolean {
  return classifySupabaseRpcError(error) === "missing_or_stale";
}

/**
 * Operator-facing copy for the missing/stale state. Deliberately names the
 * next action rather than the Postgres error, and never claims the data is
 * healthy or that anything was written.
 */
export const RPC_MISSING_OR_STALE_COPY = {
  title: "This check can't run yet — its database function isn't live",
  body:
    "The reviewed migration that creates this function has not been applied to this project yet, " +
    "or the API schema cache is still serving an older definition. Nothing was read or written, " +
    "and no status below should be treated as verified.",
  nextActionLabel: "What to do next",
  nextActionSteps: Object.freeze([
    "Apply the pending reviewed migrations through the protected apply lane (never an ad-hoc SQL console).",
    "Regenerate the client schema types so the function is typed again.",
    "Reload this page — the check re-runs on load.",
  ]),
} as const;
