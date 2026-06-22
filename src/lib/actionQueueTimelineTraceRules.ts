/**
 * actionQueueTimelineTraceRules — pure helpers that build a safe
 * traceability entry for the Action Queue → Timeline write path.
 *
 * Hard constraints:
 *  - Pure module. No I/O, no React, no Supabase, no AI calls.
 *  - Never produces device-control fields, equipment payloads, or
 *    automation instructions.
 *  - Never embeds raw `[alert:<id>]` / `[session:<id>]` back-pointer
 *    tokens in grower-visible note text. Internal ids may only live
 *    inside the structured `details` payload for idempotency joins.
 *  - Deterministic idempotency key: repeated transitions for the same
 *    (action_id, event_type) collapse to a single trace entry.
 */

import { stripBackPointerTokens } from "@/lib/actionQueueProvenanceRules";
import { sanitizeActionCopy } from "@/lib/actionQueueRowView";

/** Approval-related transitions that produce a timeline trace. */
export type ActionQueueTraceKind = "approved" | "rejected";

export const ACTION_QUEUE_TRACE_KIND_VALUES: readonly ActionQueueTraceKind[] = [
  "approved",
  "rejected",
] as const;

export interface ActionQueueTraceInput {
  action_id: string;
  user_id: string;
  grow_id: string;
  tent_id?: string | null;
  plant_id?: string | null;
  action_type?: string | null;
  suggested_change?: string | null;
  reason?: string | null;
  source?: string | null;
  kind: ActionQueueTraceKind;
}

export interface ActionQueueTraceDraft {
  user_id: string;
  grow_id: string;
  note: string;
  stage: null;
  entry_at: string;
  details: ActionQueueTraceDetails;
}

export interface ActionQueueTraceDetails {
  kind: "action_queue_trace";
  trace_kind: ActionQueueTraceKind;
  idempotency_key: string;
  action_id: string;
  tent_id: string | null;
  plant_id: string | null;
  source: string;
  action_type: string;
  reason_summary: string;
  /**
   * Read-only flag asserting this trace row carries NO device control
   * payload. Downstream readers can assert on it.
   */
  device_control: false;
}

const TRACE_LABEL: Record<ActionQueueTraceKind, string> = {
  approved: "Action approved",
  rejected: "Action rejected",
};

const MAX_REASON_LEN = 280;

/**
 * Deterministic idempotency key. Same (action_id, kind) → same key,
 * regardless of clock or retry count. Used to detect duplicate trace
 * entries before insert.
 */
export function buildActionQueueTraceIdempotencyKey(
  action_id: string,
  kind: ActionQueueTraceKind,
): string {
  return `action-queue:${action_id}:${kind}`;
}

function safeReasonSummary(raw: string | null | undefined): string {
  const stripped = stripBackPointerTokens(raw ?? "");
  const sanitized = sanitizeActionCopy(stripped);
  if (!sanitized) return "";
  if (sanitized.length <= MAX_REASON_LEN) return sanitized;
  return `${sanitized.slice(0, MAX_REASON_LEN - 1).trimEnd()}…`;
}

function safeActionType(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  return trimmed || "suggested action";
}

function safeSource(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  return trimmed || "unknown";
}

/**
 * Build the diary-entry payload that records an Action Queue
 * approve/reject transition on the timeline.
 *
 * Output is JSON-serializable and contains zero raw payload, zero
 * service-role context, and zero device-control fields.
 *
 * The visible `note` text uses calm, grower-readable copy. Internal
 * ids are kept inside `details` for idempotency only — they are not
 * surfaced via the rendered note.
 */
export function buildActionQueueTraceDraft(
  input: ActionQueueTraceInput,
  now: Date = new Date(),
): ActionQueueTraceDraft {
  const reasonSummary = safeReasonSummary(input.reason);
  const safeTitle = sanitizeActionCopy(input.suggested_change ?? "") ||
    safeActionType(input.action_type);
  const label = TRACE_LABEL[input.kind];
  const note = reasonSummary
    ? `${label}: ${safeTitle}. ${reasonSummary}`
    : `${label}: ${safeTitle}.`;

  return {
    user_id: input.user_id,
    grow_id: input.grow_id,
    note,
    stage: null,
    entry_at: now.toISOString(),
    details: {
      kind: "action_queue_trace",
      trace_kind: input.kind,
      idempotency_key: buildActionQueueTraceIdempotencyKey(
        input.action_id,
        input.kind,
      ),
      action_id: input.action_id,
      tent_id: input.tent_id ?? null,
      plant_id: input.plant_id ?? null,
      source: safeSource(input.source),
      action_type: safeActionType(input.action_type),
      reason_summary: reasonSummary,
      device_control: false,
    },
  };
}
