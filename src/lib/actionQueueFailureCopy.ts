/**
 * User-safe failure copy for Action Queue read and write paths.
 *
 * Backend errors can contain database trigger names, column names, UUIDs,
 * provider details, or authorization internals. Those details belong in
 * protected diagnostics, never in a grower-facing toast. This helper therefore
 * intentionally ignores the raw error and returns deterministic copy that
 * accurately describes what did and did not persist.
 *
 * Pure and side-effect free: no React, Supabase, logging, or device control.
 */

export type ActionQueueFailureOperation = "load" | "transition" | "audit" | "outcome" | "followup";

const SAFE_COPY: Readonly<Record<ActionQueueFailureOperation, string>> = {
  load: "We couldn't load the Action Queue. Try again.",
  transition: "Action status couldn't be saved. The action was not changed. Try again.",
  audit: "The status was saved, but its audit entry could not be recorded.",
  outcome: "No outcome was saved. Try again.",
  followup: "The action remains completed; only the follow-up note is missing.",
};

/**
 * Return deterministic, grower-safe copy without echoing any part of `error`.
 *
 * Keeping the `error` argument in the API makes every call site explicit about
 * crossing the raw-backend-error boundary while ensuring the implementation
 * cannot accidentally pass provider text through.
 */
export function safeActionQueueFailureCopy(
  operation: ActionQueueFailureOperation,
  error: unknown,
): string {
  void error;
  return SAFE_COPY[operation];
}
