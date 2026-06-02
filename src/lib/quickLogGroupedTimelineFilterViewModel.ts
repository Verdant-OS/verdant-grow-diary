/**
 * quickLogGroupedTimelineFilterViewModel — pure filter rules for the
 * QuickLog v2 grouped timeline UX polish slice.
 *
 * Hard constraints:
 *  - Pure: no I/O, no Supabase, no React, no timers, no globals.
 *  - Display-only. Filters never mutate entries and never write data.
 *  - Filter state lives in the UI only; this module is stateless.
 *  - No "live/synced/connected/imported" wording. Sources stay honest.
 *  - Filter rules live OUTSIDE JSX so the presenter stays presenter-only.
 *
 * Filter semantics:
 *  - "all"         → every entry
 *  - "water"       → grouped Water + standalone Water
 *  - "note"        → grouped Note + standalone Note
 *  - "environment" → standalone environment snapshots AND grouped cards
 *                    (because grouped cards always carry environment context).
 */
import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";

export const QUICK_LOG_GROUPED_TIMELINE_FILTERS = [
  "all",
  "water",
  "note",
  "environment",
] as const;

export type QuickLogGroupedTimelineFilter =
  (typeof QUICK_LOG_GROUPED_TIMELINE_FILTERS)[number];

export const QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS: Record<
  QuickLogGroupedTimelineFilter,
  string
> = {
  all: "All",
  water: "Water",
  note: "Note",
  environment: "Environment",
};

export function isQuickLogGroupedTimelineFilter(
  v: unknown,
): v is QuickLogGroupedTimelineFilter {
  return (
    typeof v === "string" &&
    (QUICK_LOG_GROUPED_TIMELINE_FILTERS as ReadonlyArray<string>).includes(v)
  );
}

export function entryMatchesQuickLogGroupedTimelineFilter(
  entry: QuickLogTimelineEntry,
  filter: QuickLogGroupedTimelineFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "water") {
    if (entry.kind === "grouped") return entry.action.kind === "water";
    if (entry.kind === "action") return entry.action.kind === "water";
    return false;
  }
  if (filter === "note") {
    if (entry.kind === "grouped") return entry.action.kind === "note";
    if (entry.kind === "action") return entry.action.kind === "note";
    return false;
  }
  // environment: standalone env + any grouped (grouped always has env context)
  if (entry.kind === "environment") return true;
  if (entry.kind === "grouped") return true;
  return false;
}

export function filterQuickLogGroupedTimelineEntries(
  entries: ReadonlyArray<QuickLogTimelineEntry>,
  filter: QuickLogGroupedTimelineFilter,
): QuickLogTimelineEntry[] {
  return entries.filter((e) =>
    entryMatchesQuickLogGroupedTimelineFilter(e, filter),
  );
}

export const QUICK_LOG_GROUPED_TIMELINE_EMPTY_OVERALL_TEXT =
  "No QuickLog entries yet.";
export const QUICK_LOG_GROUPED_TIMELINE_EMPTY_FILTERED_TEXT =
  "No QuickLog entries match this filter.";
export const QUICK_LOG_GROUPED_TIMELINE_CREATE_BUTTON_LABEL =
  "Create Quick Log";

/**
 * Source labels are kept honest. Real entries are always "Manual".
 * Demo/sample fixtures (never produced by the live hook) are labeled
 * explicitly so they cannot be mistaken for real plant memory.
 */
export const QUICK_LOG_MANUAL_SOURCE_LABEL = "Manual";
export const QUICK_LOG_DEMO_SOURCE_LABEL = "Demo data";
export const QUICK_LOG_SAMPLE_SOURCE_LABEL = "Sample timeline entry";
