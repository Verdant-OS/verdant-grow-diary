/**
 * quickLogTimelineGrouping — shared constants for QuickLog v2 timeline
 * grouping.
 *
 * Hard constraints:
 *  - Pure constants. No React, no Supabase, no I/O.
 *  - This window is intentionally TIGHT (single-digit seconds) because
 *    QuickLog v2 writes an action grow_event and its sibling environment
 *    grow_event inside a single atomic RPC — they are near-simultaneous.
 *  - A tight window prevents two unrelated manual logs that happened to
 *    occur seconds apart from being merged into one card.
 *  - This is NOT the AI Doctor readiness 48h window. Do not reuse the
 *    readiness configuration here — readiness asks "is anything recent?",
 *    grouping asks "were these written by the same QuickLog save?".
 */

/**
 * Maximum |Δt| between a QuickLog action event and its sibling environment
 * event for them to be considered the same QuickLog save.
 *
 * 5 seconds keeps the pairing scoped to a single RPC round-trip while
 * tolerating small clock drift / DB-side timestamp resolution differences.
 */
export const QUICK_LOG_TIMELINE_GROUPING_WINDOW_MS = 5_000;
