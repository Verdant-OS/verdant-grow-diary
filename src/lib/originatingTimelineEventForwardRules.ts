/**
 * originatingTimelineEventForwardRules — Evidence Ref Population v1.
 *
 * Pure helpers used at write boundaries to forward already-typed, persisted
 * originating timeline event refs into newly-created rows (e.g. carrying an
 * alert's refs into the action_queue row it derives).
 *
 * Strict safety envelope:
 *   - No I/O. No React. No Supabase. No fetch. No AI calls. No automation.
 *   - Never infers refs from prose, timestamps, ids, metrics, or summaries.
 *   - Never copies raw payloads, tokens, prompts, or model output.
 *   - Always runs inputs through the adapter so malformed / forbidden / unknown
 *     entries are deterministically dropped or coerced.
 *   - Absent / invalid input always returns `[]`.
 */
import {
  adaptOriginatingTimelineEventsColumn,
  adaptOriginatingTimelineEventsFromRow,
} from "@/lib/originatingTimelineEventAdapter";
import type { OriginatingTimelineEventRef } from "@/lib/originatingTimelineEventRules";

/**
 * Forward the persisted `originating_timeline_events` column from a source
 * alert row into refs suitable for persisting on a derived action_queue row.
 * Returns `[]` for null/missing/invalid input.
 */
export function forwardAlertRefsToActionQueue(
  alertRow:
    | { originating_timeline_events?: unknown }
    | null
    | undefined,
): OriginatingTimelineEventRef[] {
  return adaptOriginatingTimelineEventsFromRow(alertRow);
}

/**
 * Forward refs that already live on an in-memory suggestion/handoff object.
 * Accepts a raw column-shaped array (unknown JSON) and returns the sanitized
 * deterministic list. Returns `[]` for null/missing/invalid input.
 */
export function forwardInMemoryRefs(
  raw: unknown,
): OriginatingTimelineEventRef[] {
  return adaptOriginatingTimelineEventsColumn(raw);
}
