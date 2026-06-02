/**
 * quickLogGroupedReviewViewModel — pure presenter helpers for the
 * in-place Grouped Timeline Review Panel slice.
 *
 * Hard constraints:
 *  - Pure: no I/O, no Supabase, no React, no timers, no globals.
 *  - Display-only. Never mutates grouping output. Never writes data.
 *  - Panel open/close state lives in the UI only — this module is stateless.
 *  - No "live/synced/connected/imported" wording. Sources stay honest.
 *  - Does NOT use "linked" wording (no FK linkage exists between the
 *    action grow_events parent and the environment grow_events parent).
 *    Honest framing: "Grouped timeline details".
 *  - Only entries of kind "grouped" are reviewable. Standalone action and
 *    standalone environment entries must not render the review trigger.
 */
import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";

export const QUICK_LOG_REVIEW_OPEN_LABEL = "Review details";
export const QUICK_LOG_REVIEW_CLOSE_LABEL = "Close details";
export const QUICK_LOG_REVIEW_PANEL_TITLE = "Grouped timeline details";
export const QUICK_LOG_REVIEW_ACTION_SECTION_TITLE = "QuickLog action";
export const QUICK_LOG_REVIEW_ENVIRONMENT_SECTION_TITLE =
  "Manual environment snapshot";

export function isReviewableQuickLogEntry(
  entry: QuickLogTimelineEntry,
): boolean {
  return entry.kind === "grouped";
}

export function reviewTriggerLabel(open: boolean): string {
  return open ? QUICK_LOG_REVIEW_CLOSE_LABEL : QUICK_LOG_REVIEW_OPEN_LABEL;
}

export interface QuickLogReviewActionSection {
  kindLabel: "Water" | "Note";
  occurredAt: string;
  sourceLabel: "Manual";
  noteText: string | null;
  volumeMl: number | null;
}

/**
 * Build a flat, deterministic view-model for the action section of the
 * review panel. Pure function — never invents values, never mutates input.
 */
export function buildQuickLogReviewActionSection(
  entry: QuickLogTimelineEntry,
): QuickLogReviewActionSection | null {
  if (entry.kind !== "grouped") return null;
  return {
    kindLabel: entry.action.kind === "water" ? "Water" : "Note",
    occurredAt: entry.action.occurredAt,
    sourceLabel: "Manual",
    noteText: entry.action.noteText ?? null,
    volumeMl: entry.action.volumeMl ?? null,
  };
}
