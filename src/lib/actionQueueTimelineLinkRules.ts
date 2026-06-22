/**
 * actionQueueTimelineLinkRules — pure helpers that derive a safe
 * "View diary trace" link for an approved/rejected Action Queue row.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no AI calls.
 *  - Returns null when the row's status is not approved/rejected, when
 *    the trace is known to have failed, or when the action id is not a
 *    safe route-shaped token. Callers MUST treat null as "no link" and
 *    may render `TIMELINE_TRACE_UNAVAILABLE_COPY` instead.
 *  - The visible label never includes raw UUIDs. The internal trace key
 *    is only present in the route query, where the timeline already
 *    accepts opaque highlight tokens.
 *  - Highlight token is the deterministic idempotency key from
 *    `actionQueueTimelineTraceRules` so timeline surfaces can match the
 *    exact diary row if/when highlight support is added — without
 *    requiring us to know the diary row id here.
 */

import { buildActionQueueTraceIdempotencyKey } from "@/lib/actionQueueTimelineTraceRules";

export type ActionDiaryTraceLinkKind = "approved" | "rejected";

export const TIMELINE_TRACE_LINK_LABEL = "View diary trace";
export const TIMELINE_TRACE_UNAVAILABLE_COPY = "Diary trace unavailable.";
export const TIMELINE_HIGHLIGHT_PARAM = "highlight";

export interface BuildActionDiaryTraceLinkInput {
  status: string | null | undefined;
  actionId: string;
  /** True when the page knows the trace insert for this action failed. */
  traceFailed?: boolean;
}

export interface ActionDiaryTraceLink {
  href: string;
  label: string;
  /** Deterministic key; opaque to the timeline today, safe to expose in URL. */
  highlight: string;
  kind: ActionDiaryTraceLinkKind;
}

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function statusToKind(status: string | null | undefined): ActionDiaryTraceLinkKind | null {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  return null;
}

export function buildActionDiaryTraceLink(
  input: BuildActionDiaryTraceLinkInput,
): ActionDiaryTraceLink | null {
  if (!input || typeof input.actionId !== "string") return null;
  if (!SAFE_ID_RE.test(input.actionId)) return null;
  if (input.traceFailed) return null;
  const kind = statusToKind(input.status);
  if (!kind) return null;
  const highlight = buildActionQueueTraceIdempotencyKey(input.actionId, kind);
  const href = `/timeline?${TIMELINE_HIGHLIGHT_PARAM}=${encodeURIComponent(highlight)}`;
  return { href, label: TIMELINE_TRACE_LINK_LABEL, highlight, kind };
}

export const JUMP_TO_HIGHLIGHTED_TRACE_LABEL = "Jump to highlighted trace";
export const JUMP_TO_HIGHLIGHTED_TRACE_TESTID =
  "action-queue-jump-to-highlighted-trace";

/**
 * Build a safe "Jump to highlighted trace" link directly from the raw
 * highlight token (e.g. parsed from /actions ?highlight=...). Returns
 * null for malformed/unsafe tokens. Visible label never includes IDs.
 */
export function buildJumpToHighlightedTraceLink(
  rawHighlight: string | null | undefined,
): { href: string; label: string; highlight: string } | null {
  if (typeof rawHighlight !== "string") return null;
  const parts = rawHighlight.split(":");
  if (parts.length !== 3) return null;
  const [prefix, actionId, kind] = parts;
  if (prefix !== "action-queue") return null;
  if (!SAFE_ID_RE.test(actionId)) return null;
  if (kind !== "approved" && kind !== "rejected") return null;
  const href = `/timeline?${TIMELINE_HIGHLIGHT_PARAM}=${encodeURIComponent(rawHighlight)}`;
  return { href, label: JUMP_TO_HIGHLIGHTED_TRACE_LABEL, highlight: rawHighlight };
}
