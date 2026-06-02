/**
 * quickLogTimelineAuditViewModel — pure constants + helpers for the
 * Grouped Timeline Audit Toggle slice.
 *
 * Hard constraints:
 *  - Pure: no I/O, no Supabase, no React, no timers, no globals.
 *  - Display-only. Never mutates grouping output. Never writes data.
 *  - Audit toggle state belongs to the UI only — this module is stateless.
 *  - No "live/synced/connected/imported" wording.
 *  - Does NOT use "linked" as a label, because there is no foreign-key
 *    linkage between the action grow_events parent and the environment
 *    grow_events parent. "Grouped details" is honest.
 *  - Only entries of kind "grouped" are auditable. Standalone action and
 *    standalone environment entries must not render an audit toggle.
 */
import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";

export const QUICK_LOG_AUDIT_EXPAND_LABEL = "Review grouped details";
export const QUICK_LOG_AUDIT_COLLAPSE_LABEL = "Hide grouped details";
export const QUICK_LOG_AUDIT_ACTION_SUBCARD_TITLE = "Action event";
export const QUICK_LOG_AUDIT_ENVIRONMENT_SUBCARD_TITLE =
  "Manual environment snapshot";

export function isAuditableQuickLogEntry(
  entry: QuickLogTimelineEntry,
): boolean {
  return entry.kind === "grouped";
}

export function auditToggleLabel(expanded: boolean): string {
  return expanded
    ? QUICK_LOG_AUDIT_COLLAPSE_LABEL
    : QUICK_LOG_AUDIT_EXPAND_LABEL;
}

/**
 * A stable, deterministic key for an auditable entry's local toggle state.
 * Combines the action id and environment id so two grouped cards with the
 * same action id (shouldn't happen, but defensive) still toggle independently.
 */
export function auditEntryKey(entry: QuickLogTimelineEntry): string | null {
  if (entry.kind !== "grouped") return null;
  return `${entry.action.id}::${entry.environment.id}`;
}
