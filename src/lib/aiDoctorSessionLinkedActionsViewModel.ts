/**
 * Pure view model for the "Linked Action Queue items" panel shown on the
 * AI Doctor session detail page.
 *
 * Responsibilities:
 *   - Filter raw action_queue rows down to those provably created from the
 *     current AI Doctor session (source = "ai_doctor" + matching
 *     [session:<id>] back-pointer in `reason`).
 *   - Sanitize reason text so internal back-pointer tokens never leak.
 *   - Produce stable focus URLs for /actions?focus=<id>.
 *
 * Safety:
 *   - No I/O. No React. No DB. No automation/device verbs.
 *   - Never returns `target_device` or any device-control hint.
 *   - Deterministic and null-safe.
 */
import {
  extractSourceAiDoctorSessionId,
  isAiDoctorDerived,
  stripBackPointerTokens,
  type ActionQueueSource,
} from "@/lib/actionQueueProvenanceRules";
import { actionsPath } from "@/lib/routes";

/** Row shape required from the action_queue read. Intentionally minimal. */
export interface LinkedActionInputRow {
  id?: string | null;
  status?: string | null;
  source?: string | null;
  reason?: string | null;
}

export interface LinkedActionItem {
  id: string;
  status: string;
  reasonText: string;
  focusHref: string;
}

export interface LinkedActionsViewModel {
  count: number;
  items: LinkedActionItem[];
  /** Convenience: when exactly one linked action exists, link directly to it. */
  primaryFocusHref: string | null;
  hasMultiple: boolean;
}

/** Statuses considered "open" for back-link surfacing on the session page. */
export const OPEN_LINKED_ACTION_STATUSES = [
  "pending_approval",
  "approved",
  "simulated",
] as const;
export type OpenLinkedActionStatus = (typeof OPEN_LINKED_ACTION_STATUSES)[number];

export function isOpenLinkedActionStatus(
  status: string | null | undefined,
): status is OpenLinkedActionStatus {
  return (
    status === "pending_approval" ||
    status === "approved" ||
    status === "simulated"
  );
}

export function buildFocusHref(actionId: string): string {
  return `${actionsPath()}?focus=${encodeURIComponent(actionId)}`;
}

/**
 * Build the view model. Filters defensively even if the upstream query
 * already constrained the result — this keeps the function safe to reuse
 * and easy to test in isolation.
 */
export function buildAiDoctorSessionLinkedActionsViewModel(
  sessionId: string | null | undefined,
  rows: ReadonlyArray<LinkedActionInputRow | null | undefined> | null | undefined,
): LinkedActionsViewModel {
  const sid = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!sid || !Array.isArray(rows)) {
    return { count: 0, items: [], primaryFocusHref: null, hasMultiple: false };
  }

  const seen = new Set<string>();
  const items: LinkedActionItem[] = [];
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !row.id) continue;
    if (seen.has(row.id)) continue;
    if (!isAiDoctorDerived({ source: (row.source ?? null) as ActionQueueSource })) {
      continue;
    }
    if (!isOpenLinkedActionStatus(row.status ?? null)) continue;
    if (extractSourceAiDoctorSessionId(row.reason ?? null) !== sid) continue;

    seen.add(row.id);
    items.push({
      id: row.id,
      status: row.status as string,
      reasonText: stripBackPointerTokens(row.reason ?? null),
      focusHref: buildFocusHref(row.id),
    });
  }

  return {
    count: items.length,
    items,
    primaryFocusHref: items.length === 1 ? items[0].focusHref : null,
    hasMultiple: items.length > 1,
  };
}
