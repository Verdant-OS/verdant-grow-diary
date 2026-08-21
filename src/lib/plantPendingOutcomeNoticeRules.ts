/**
 * plantPendingOutcomeNoticeRules — pure view-model for PlantDetail's
 * calm "pending follow-up outcome" notice.
 *
 * Thin plant-scoped adapter over shared `pendingOutcomeNoticeRules`.
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

/** @deprecated Prefer PendingOutcomeNoticeSourceRow — kept for plant call sites. */
export type PlantPendingOutcomeNoticeSourceRow = PendingOutcomeNoticeSourceRow;

export interface PlantPendingOutcomeNoticeItem {
  actionId: string;
  plantId: string;
  suggestedChange: string | null;
  /** ISO timestamp used for sort (dueAt, else approved_at, else completed_at). */
  sortTimestamp: string;
  /** When the 24h outcome window opened (completed_at + PRE_WINDOW_HOURS). */
  dueAt: string | null;
  hoursSinceCompleted: number | null;
  href: string;
}

export interface PlantPendingOutcomeNoticeViewModel {
  items: PlantPendingOutcomeNoticeItem[];
}

export interface BuildPlantPendingOutcomeNoticeInput {
  plantId: string | null | undefined;
  pendingReviews: readonly PlantPendingOutcomeNoticeSourceRow[] | null | undefined;
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

function toPlantItem(item: PendingOutcomeNoticeItem): PlantPendingOutcomeNoticeItem | null {
  const plantId = nonEmptyString(item.plantId);
  if (!plantId) return null;
  return {
    actionId: item.actionId,
    plantId,
    suggestedChange: item.suggestedChange,
    sortTimestamp: item.sortTimestamp,
    dueAt: item.dueAt,
    hoursSinceCompleted: item.hoursSinceCompleted,
    href: item.href,
  };
}

/**
 * Returns plant-scoped pending-outcome notice items.
 *
 * Empty result is always `{ items: [] }` — never null.
 */
export function buildPlantPendingOutcomeNoticeViewModel(
  input: BuildPlantPendingOutcomeNoticeInput,
): PlantPendingOutcomeNoticeViewModel {
  const plantId = nonEmptyString(input.plantId);
  if (!plantId) return { items: [] };

  const shared = buildPendingOutcomeNoticeViewModel({
    scope: { kind: "plant", plantId },
    pendingReviews: input.pendingReviews,
    outcomes: input.outcomes,
  });

  const items: PlantPendingOutcomeNoticeItem[] = [];
  for (const item of shared.items) {
    const plantItem = toPlantItem(item);
    if (plantItem) items.push(plantItem);
  }
  return { items };
}

export default buildPlantPendingOutcomeNoticeViewModel;
