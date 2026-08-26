/**
 * growPendingOutcomeNoticeRules — pure view-model for GrowDetail's
 * calm "pending follow-up outcome" banner.
 *
 * Thin grow-scoped adapter over shared `pendingOutcomeNoticeRules`.
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

export type GrowPendingOutcomeNoticeSourceRow = PendingOutcomeNoticeSourceRow;

export interface GrowPendingOutcomeNoticeItem {
  actionId: string;
  growId: string;
  plantId: string | null;
  tentId: string | null;
  suggestedChange: string | null;
  sortTimestamp: string;
  dueAt: string | null;
  hoursSinceCompleted: number | null;
  href: string;
}

export interface GrowPendingOutcomeNoticeViewModel {
  items: GrowPendingOutcomeNoticeItem[];
}

export interface BuildGrowPendingOutcomeNoticeInput {
  growId: string | null | undefined;
  pendingReviews: readonly GrowPendingOutcomeNoticeSourceRow[] | null | undefined;
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

function toGrowItem(item: PendingOutcomeNoticeItem): GrowPendingOutcomeNoticeItem | null {
  const growId = nonEmptyString(item.growId);
  if (!growId) return null;
  return {
    actionId: item.actionId,
    growId,
    plantId: item.plantId,
    tentId: item.tentId,
    suggestedChange: item.suggestedChange,
    sortTimestamp: item.sortTimestamp,
    dueAt: item.dueAt,
    hoursSinceCompleted: item.hoursSinceCompleted,
    href: item.href,
  };
}

/**
 * Returns grow-scoped pending-outcome notice items.
 *
 * Empty result is always `{ items: [] }` — never null.
 */
export function buildGrowPendingOutcomeNoticeViewModel(
  input: BuildGrowPendingOutcomeNoticeInput,
): GrowPendingOutcomeNoticeViewModel {
  const growId = nonEmptyString(input.growId);
  if (!growId) return { items: [] };

  const shared = buildPendingOutcomeNoticeViewModel({
    scope: { kind: "grow", growId },
    pendingReviews: input.pendingReviews,
    outcomes: input.outcomes,
  });

  const items: GrowPendingOutcomeNoticeItem[] = [];
  for (const item of shared.items) {
    const growItem = toGrowItem(item);
    if (growItem) items.push(growItem);
  }
  return { items };
}

export default buildGrowPendingOutcomeNoticeViewModel;
