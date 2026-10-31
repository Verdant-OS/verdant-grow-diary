/**
 * Empty-state copy for the Timeline's Recent Quick Logs lane.
 *
 * QA 2026-10-20 bug 6: with a Timeline date filter applied, the lane only
 * receives entries inside that range. When none fall inside it, the lane said
 * "No Quick Log entries yet", which reads as if the grow had none at all.
 *
 * Pure: no React, no Supabase.
 */
export const QUICK_LOG_RECENT_EMPTY_COPY = {
  unfiltered: {
    title: "No Quick Log entries yet",
    help: "Open Quick Log to capture a note, watering, photo, or manual reading.",
  },
  dateFiltered: {
    title: "No Quick Logs in this date range",
    help: "Clear or widen the date filter to see earlier entries.",
  },
} as const;

export function quickLogRecentEmptyCopy(dateFiltered: boolean): {
  title: string;
  help: string;
} {
  return dateFiltered
    ? QUICK_LOG_RECENT_EMPTY_COPY.dateFiltered
    : QUICK_LOG_RECENT_EMPTY_COPY.unfiltered;
}
