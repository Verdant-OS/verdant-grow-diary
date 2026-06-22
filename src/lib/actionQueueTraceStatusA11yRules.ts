/**
 * actionQueueTraceStatusA11yRules — pure helpers that derive accessible
 * announcement copy for the /actions trace status badge.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no AI calls.
 *  - Never includes internal IDs / UUIDs in announcement copy.
 *  - Never says "safe" or "healthy".
 *  - Approval-framed; nothing implies equipment/device execution.
 *  - Returns null when no meaningful change should be announced (e.g.
 *    initial render, or unchanged state) so callers can avoid noisy
 *    aria-live updates.
 */

import type { ActionTraceBadgeState } from "@/lib/actionQueueTraceStatusRules";

export const TRACE_STATUS_ANNOUNCEMENT_TESTID =
  "action-queue-trace-status-announcer";

/** Calm, neutral copy for each state. No IDs. No "safe"/"healthy". */
export const TRACE_STATUS_ANNOUNCEMENT_COPY: Record<
  ActionTraceBadgeState,
  string
> = {
  idle: "Trace OK",
  retrying: "Retrying trace",
  failed: "Trace failed",
};

export interface BuildTraceStatusAnnouncementInput {
  /** Current derived badge state for the row. */
  state: ActionTraceBadgeState;
  /** Previous derived badge state, or null on first observation. */
  previousState: ActionTraceBadgeState | null;
  /**
   * True when this is the first observation of this row (e.g. initial
   * list render). When true, only non-idle states are announced — idle
   * on first render is the calm default and should stay quiet to avoid
   * dozens of "Trace OK" announcements firing at once.
   */
  isInitial: boolean;
}

/**
 * Return the announcement string for a meaningful change, or null when
 * nothing should be announced. Pure / deterministic.
 */
export function buildTraceStatusAnnouncement(
  input: BuildTraceStatusAnnouncementInput,
): string | null {
  if (!input) return null;
  const { state, previousState, isInitial } = input;
  if (isInitial) {
    // Don't broadcast "Trace OK" on the initial full-list render.
    if (state === "idle") return null;
    return TRACE_STATUS_ANNOUNCEMENT_COPY[state] ?? null;
  }
  if (previousState === state) return null;
  return TRACE_STATUS_ANNOUNCEMENT_COPY[state] ?? null;
}
