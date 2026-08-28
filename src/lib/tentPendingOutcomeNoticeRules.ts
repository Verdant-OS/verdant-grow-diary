/**
 * tentPendingOutcomeNoticeRules — pure view-model for TentDetail's
 * calm "pending follow-up outcome" notice.
 *
 * Thin tent-scoped adapter over shared `pendingOutcomeNoticeRules`.
 *
 * SAFETY / SCOPE:
 *  - Pure, deterministic, null-safe. No I/O, React, or DB.
 *  - Display/filter only. Never mutates action_queue or diary_entries.
 */

import {
  buildPendingOutcomeNoticeViewModel,
  nonEmptyString,
  type PendingOutcomeNoticeItem,
  type PendingOutcomeNoticeSourceRow,
} from "@/lib/pendingOutcomeNoticeRules";

export type TentPendingOutcomeNoticeSourceRow = PendingOutcomeNoticeSourceRow;

export interface TentPendingOutcomeNoticeItem {
  actionId: string;
  tentId: string;
  plantId: string | null;
  suggestedChange: string | null;
  sortTimestamp: string;
  dueAt: string | null;
  hoursSinceCompleted: number | null;
  href: string;
}

export interface TentPendingOutcomeNoticeViewModel {
  items: TentPendingOutcomeNoticeItem[];
}

export interface BuildTentPendingOutcomeNoticeInput {
  tentId: string | null | undefined;
  pendingReviews: readonly TentPendingOutcomeNoticeSourceRow[] | null | undefined;
  outcomes?:
    | readonly {
        details?: {
          event_type?: unknown;
          action_queue_id?: unknown;
          outcome_kind?: unknown;
        } | null;
      }[]
    | null;
}

function toTentItem(item: PendingOutcomeNoticeItem): TentPendingOutcomeNoticeItem | null {
  const tentId = nonEmptyString(item.tentId);
  if (!tentId) return null;
  return {
    actionId: item.actionId,
    tentId,
    plantId: item.plantId,
    suggestedChange: item.suggestedChange,
    sortTimestamp: item.sortTimestamp,
    dueAt: item.dueAt,
    hoursSinceCompleted: item.hoursSinceCompleted,
    href: item.href,
  };
}

/**
 * Returns tent-scoped pending-outcome notice items.
 *
 * Empty result is always `{ items: [] }` — never null.
 */
export function buildTentPendingOutcomeNoticeViewModel(
  input: BuildTentPendingOutcomeNoticeInput,
): TentPendingOutcomeNoticeViewModel {
  const tentId = nonEmptyString(input.tentId);
  if (!tentId) return { items: [] };

  const shared = buildPendingOutcomeNoticeViewModel({
    scope: { kind: "tent", tentId },
    pendingReviews: input.pendingReviews,
    outcomes: input.outcomes,
  });

  const items: TentPendingOutcomeNoticeItem[] = [];
  for (const item of shared.items) {
    const tentItem = toTentItem(item);
    if (tentItem) items.push(tentItem);
  }
  return { items };
}

export default buildTentPendingOutcomeNoticeViewModel;
