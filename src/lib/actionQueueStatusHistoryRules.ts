/**
 * actionQueueStatusHistoryRules — pure helpers that normalize an
 * Action Queue row's approve/reject history for the drawer.
 *
 * Hard constraints:
 *  - No I/O, no React, no Supabase, no AI calls.
 *  - Input rows come from existing `diary_entries` trace inserts
 *    written by `actionQueueTimelineTraceRules`. We do not invent
 *    history rows — if the read returns nothing, the helper returns
 *    an empty array and the UI shows the calm empty-state copy.
 *  - Never surfaces internal UUIDs or raw payload internals in the
 *    visible `label`. IDs are kept inside the structured `idempotency_key`
 *    for dedupe only.
 *  - Sort is deterministic: timestamp DESC, then trace_kind, then
 *    idempotency_key as a stable tie-breaker.
 */

import type { ActionQueueTraceKind } from "@/lib/actionQueueTimelineTraceRules";

export interface DiaryTraceRowLike {
  id?: string | null;
  entry_at?: string | null;
  created_at?: string | null;
  note?: string | null;
  details?: unknown;
}

export interface ActionQueueStatusHistoryEntry {
  /** Grower-facing label, e.g. "Action approved" / "Action rejected". */
  label: string;
  /** ISO timestamp (entry_at preferred, created_at fallback). */
  at: string;
  /** Discriminant. Never the raw status enum from action_queue. */
  kind: ActionQueueTraceKind;
  /** Idempotency key used to dedupe duplicate trace rows in render. */
  idempotency_key: string;
}

export const STATUS_HISTORY_EMPTY_COPY = "No status history found yet.";

const TRACE_LABEL: Record<ActionQueueTraceKind, string> = {
  approved: "Action approved",
  rejected: "Action rejected",
};

function pickTimestamp(row: DiaryTraceRowLike): string | null {
  const at =
    (typeof row.entry_at === "string" && row.entry_at) ||
    (typeof row.created_at === "string" && row.created_at) ||
    null;
  if (!at) return null;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

function readDetails(row: DiaryTraceRowLike): {
  kind: ActionQueueTraceKind | null;
  idempotency_key: string | null;
  action_id: string | null;
} {
  if (!row.details || typeof row.details !== "object") {
    return { kind: null, idempotency_key: null, action_id: null };
  }
  const d = row.details as Record<string, unknown>;
  if (d.kind !== "action_queue_trace") {
    return { kind: null, idempotency_key: null, action_id: null };
  }
  const trace_kind = d.trace_kind === "approved" || d.trace_kind === "rejected"
    ? (d.trace_kind as ActionQueueTraceKind)
    : null;
  const idem = typeof d.idempotency_key === "string" ? d.idempotency_key : null;
  const action_id = typeof d.action_id === "string" ? d.action_id : null;
  return { kind: trace_kind, idempotency_key: idem, action_id };
}

/**
 * Normalize raw `diary_entries` rows into the drawer's status-history
 * list. Filters out non-Action-Queue rows, dedupes by idempotency key,
 * and sorts deterministically.
 *
 * `actionId` is required so we only show history for THIS action even
 * if the caller passes a wider set.
 */
export function buildActionQueueStatusHistory(
  rows: ReadonlyArray<DiaryTraceRowLike> | null | undefined,
  actionId: string,
): ActionQueueStatusHistoryEntry[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const seen = new Set<string>();
  const out: ActionQueueStatusHistoryEntry[] = [];
  for (const row of rows) {
    const details = readDetails(row);
    if (!details.kind || !details.idempotency_key) continue;
    if (details.action_id && details.action_id !== actionId) continue;
    if (seen.has(details.idempotency_key)) continue;
    const at = pickTimestamp(row);
    if (!at) continue;
    seen.add(details.idempotency_key);
    out.push({
      label: TRACE_LABEL[details.kind],
      at,
      kind: details.kind,
      idempotency_key: details.idempotency_key,
    });
  }
  // Deterministic: time DESC, then kind, then idempotency_key.
  out.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? 1 : -1;
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.idempotency_key < b.idempotency_key ? -1 : 1;
  });
  return out;
}
