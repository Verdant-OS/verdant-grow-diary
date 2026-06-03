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
 * Plant Timeline empty-state copy. Surfaced alongside the existing
 * QuickLog memory empty text so a grower lands on a clear, honest,
 * non-automated next step: log something manually.
 */
export const QUICK_LOG_GROUPED_TIMELINE_EMPTY_TITLE_TEXT =
  "No timeline entries yet.";
export const QUICK_LOG_GROUPED_TIMELINE_EMPTY_HINT_TEXT =
  "Add a Quick Log to start this plant's history.";

/**
 * Source labels are kept honest. Real entries are always "Manual".
 * Demo/sample fixtures (never produced by the live hook) are labeled
 * explicitly so they cannot be mistaken for real plant memory.
 */
export const QUICK_LOG_MANUAL_SOURCE_LABEL = "Manual";
export const QUICK_LOG_DEMO_SOURCE_LABEL = "Demo data";
export const QUICK_LOG_SAMPLE_SOURCE_LABEL = "Sample timeline entry";

/**
 * Canonical user-facing labels for QuickLog v2 action kinds. The grouped
 * timeline only supports "water" and "note"; other event types are
 * handled by the diary timeline rules (see `growDiaryTimelineRules`).
 * Keeping this map in the view-model prevents JSX from duplicating it.
 */
export const QUICK_LOG_ACTION_LABELS = {
  water: "Watering",
  note: "Note",
} as const;

export function quickLogActionLabel(kind: "water" | "note"): string {
  return QUICK_LOG_ACTION_LABELS[kind];
}

/**
 * Deterministic, locale-stable display formatting for an ISO occurred_at
 * timestamp. Uses UTC so server-rendered text matches test snapshots
 * across machines/timezones. Returns the input unchanged when it is not
 * a parseable ISO string (no invented dates).
 */
export function formatQuickLogOccurredAt(
  iso: string | null | undefined,
): string {
  if (typeof iso !== "string" || iso.length === 0) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(new Date(ms)) + " UTC";
  } catch {
    return iso;
  }
}

/** Screen-reader label for a source badge, e.g. "Source: Manual". */
export function quickLogSourceAccessibleLabel(sourceLabel: string): string {
  return `Source: ${sourceLabel}`;
}

/**
 * Screen-reader label for the occurred_at line, e.g.
 * "Occurred at Mar 15, 2026 09:00 UTC".
 */
export function quickLogOccurredAtAccessibleLabel(
  formattedOccurredAt: string,
): string {
  return `Occurred at ${formattedOccurredAt}`;
}

