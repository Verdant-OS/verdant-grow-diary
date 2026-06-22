/**
 * actionQueueTraceStatusRules — pure helpers that derive a calm,
 * operator-readable "trace" badge state for Action Queue rows.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no AI calls.
 *  - Reads only what the page already knows about retry state.
 *    Never guesses, never claims a row is "safe" or "healthy".
 *  - Copy is approval-framed; nothing here implies equipment control.
 */

export type ActionTraceBadgeState = "idle" | "retrying" | "failed";

export const ACTION_TRACE_BADGE_LABEL: Record<ActionTraceBadgeState, string> = {
  idle: "Trace ready",
  retrying: "Retrying trace",
  failed: "Trace failed",
};

export const ACTION_TRACE_BADGE_HELP: Record<ActionTraceBadgeState, string> = {
  idle:
    "Diary timeline trace is ready. No equipment is controlled from this surface.",
  retrying:
    "Retrying the diary timeline trace. The action's status is not being changed again.",
  failed:
    "Status was saved, but the diary timeline trace failed to write. Approval is not being repeated.",
};

export interface DeriveActionTraceBadgeStateInput {
  actionId: string;
  traceFailureActionId?: string | null;
  retryingTrace?: boolean;
}

/**
 * Derive the badge state from existing page state. Never speculative:
 *  - "failed" only when the page knows this row's trace insert failed.
 *  - "retrying" only when failed AND a retry is in flight.
 *  - otherwise "idle" (nothing wrong is known).
 */
export function deriveActionTraceBadgeState(
  input: DeriveActionTraceBadgeStateInput,
): ActionTraceBadgeState {
  if (!input || !input.actionId) return "idle";
  if (input.traceFailureActionId !== input.actionId) return "idle";
  return input.retryingTrace ? "retrying" : "failed";
}
