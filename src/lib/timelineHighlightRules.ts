/**
 * timelineHighlightRules — pure helpers that parse a safe `?highlight=`
 * token and decide whether a diary entry matches it.
 *
 * Supported token format (the only one):
 *   action-queue:<safeActionId>:<approved|rejected>
 *
 * Match rule:
 *   A diary entry matches when its `details.idempotency_key` equals the
 *   token. We never match by visible note text, by raw UUIDs, or by any
 *   loose substring. The idempotency key is produced by
 *   `actionQueueTimelineTraceRules.buildActionQueueTraceIdempotencyKey`
 *   and has identical shape.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no AI calls.
 *  - Invalid/malformed tokens parse to `null` (never throw).
 *  - Visible copy never includes internal UUIDs.
 */

export const TIMELINE_HIGHLIGHT_PARAM = "highlight";

export const TIMELINE_HIGHLIGHT_ARIA_LABEL =
  "Highlighted Action Queue diary trace";
export const TIMELINE_HIGHLIGHT_TESTID =
  "timeline-highlighted-action-queue-trace";
export const TIMELINE_HIGHLIGHT_NOT_VISIBLE_COPY =
  "Highlighted diary trace is not visible in the current timeline view.";
export const TIMELINE_HIGHLIGHT_NOT_VISIBLE_TESTID =
  "timeline-highlight-not-visible";

export type TimelineActionQueueHighlightKind = "approved" | "rejected";

export interface ParsedActionQueueHighlight {
  kind: "action_queue_trace";
  actionId: string;
  traceKind: TimelineActionQueueHighlightKind;
  /** Verbatim, normalized token used for `details.idempotency_key` match. */
  idempotencyKey: string;
}

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function parseTimelineHighlightToken(
  raw: string | null | undefined,
): ParsedActionQueueHighlight | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > 128) return null;
  const parts = raw.split(":");
  if (parts.length !== 3) return null;
  const [prefix, actionId, traceKind] = parts;
  if (prefix !== "action-queue") return null;
  if (!SAFE_ID_RE.test(actionId)) return null;
  if (traceKind !== "approved" && traceKind !== "rejected") return null;
  return {
    kind: "action_queue_trace",
    actionId,
    traceKind,
    idempotencyKey: `action-queue:${actionId}:${traceKind}`,
  };
}

export interface DiaryEntryDetailsLike {
  /** Untyped because the diary `details` column is JSON. */
  details?: unknown;
}



/**
 * Returns true ONLY when the entry's `details.idempotency_key` matches
 * the parsed highlight. Always false for null highlight, missing
 * details, or non-action-queue trace rows.
 */
export function diaryEntryMatchesHighlight(
  entry: DiaryEntryDetailsLike | null | undefined,
  highlight: ParsedActionQueueHighlight | null,
): boolean {
  if (!highlight) return false;
  if (!entry || typeof entry !== "object") return false;
  const details = (entry as { details?: unknown }).details;
  if (!details || typeof details !== "object") return false;
  const d = details as Record<string, unknown>;
  if (d.kind !== "action_queue_trace") return false;
  return d.idempotency_key === highlight.idempotencyKey;
}

/**
 * Returns true when the highlight is set but no entry in the provided
 * list matches it. UI surfaces use this to render the calm
 * `TIMELINE_HIGHLIGHT_NOT_VISIBLE_COPY` message.
 */
export function highlightIsMissingFromList(
  entries: ReadonlyArray<DiaryEntryDetailsLike> | null | undefined,
  highlight: ParsedActionQueueHighlight | null,
): boolean {
  if (!highlight) return false;
  if (!Array.isArray(entries) || entries.length === 0) return true;
  for (const e of entries) {
    if (diaryEntryMatchesHighlight(e, highlight)) return false;
  }
  return true;
}
