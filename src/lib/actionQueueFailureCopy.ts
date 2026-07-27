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
  transition: "Action status couldn't be saved. No new transition was recorded. Try again.",
  audit: "The status was saved, but its audit entry could not be recorded.",
  outcome: "No outcome was saved. Try again.",
  followup: "The action remains completed; only the follow-up note is missing.",
};

const TRANSITION_REASON_COPY = {
  status_conflict: "This action changed elsewhere. The latest status has been reloaded.",
  action_not_found: "This action is no longer available. The queue has been reloaded.",
} as const;

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
  if (operation === "transition" && error && typeof error === "object" && !Array.isArray(error)) {
    const row = error as Record<string, unknown>;
    if (row.ok === false && row.reason === "status_conflict") {
      return TRANSITION_REASON_COPY.status_conflict;
    }
    if (row.ok === false && row.reason === "action_not_found") {
      return TRANSITION_REASON_COPY.action_not_found;
    }
  }

  return SAFE_COPY[operation];
}
