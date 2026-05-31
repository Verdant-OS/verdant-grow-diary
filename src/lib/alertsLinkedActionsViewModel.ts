/**
 * alertsLinkedActionsViewModel — pure helper that turns a flat list of
 * action_queue rows (already restricted to non-terminal statuses by the
 * caller) into a per-alert summary of linked open actions.
 *
 * Safety:
 *  - No I/O, no React, no DB.
 *  - Never returns or constructs device commands.
 *  - Never exposes raw `[alert:<id>]` or `[session:<id>]` tokens — callers
 *    receive only the parsed alert id and action id.
 *  - Deterministic, null-safe parsing via the shared provenance helper.
 */
import { extractSourceAlertId } from "@/lib/actionQueueProvenanceRules";

/** Mirrors the canonical TERMINAL_STATUSES list to avoid a circular import. */
const TERMINAL_SET = new Set<string>(["completed", "rejected", "cancelled"]);

export interface LinkedActionRowInput {
  id: string;
  reason?: string | null;
  status?: string | null;
}

export interface AlertLinkedActionsSummary {
  /** Number of open (non-terminal) action_queue rows linked to this alert. */
  count: number;
  /** When exactly one row matches, its id — used for the optional deep link. */
  singleActionId: string | null;
}

/**
 * Build a map of alertId -> summary for the supplied visible alert ids.
 * Filters out terminal action rows and rows that do not carry a parseable
 * `[alert:<id>]` token. Pure: same input -> same output.
 */
export function buildAlertsLinkedActionsViewModel(
  rows: ReadonlyArray<LinkedActionRowInput | null | undefined>,
  visibleAlertIds: ReadonlyArray<string>,
): Map<string, AlertLinkedActionsSummary> {
  const allowed = new Set(
    visibleAlertIds.filter((id) => typeof id === "string" && id.length > 0),
  );
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    if (!row || typeof row.id !== "string") continue;
    const status = (row.status ?? "").toLowerCase();
    if (TERMINAL_SET.has(status)) continue;
    const alertId = extractSourceAlertId(row.reason ?? null);
    if (!alertId || !allowed.has(alertId)) continue;
    const bucket = grouped.get(alertId);
    if (bucket) {
      if (!bucket.includes(row.id)) bucket.push(row.id);
    } else {
      grouped.set(alertId, [row.id]);
    }
  }
  const out = new Map<string, AlertLinkedActionsSummary>();
  for (const [alertId, ids] of grouped) {
    out.set(alertId, {
      count: ids.length,
      singleActionId: ids.length === 1 ? ids[0] : null,
    });
  }
  return out;
}
