/**
 * plantPendingOutcomeNoticeRules — pure view-model for PlantDetail's
 * calm "pending follow-up outcome" notice.
 *
 * Takes already-detected pending-outcome rows (same shape as
 * `useDashboardPendingOutcomeReviews` / `PendingOutcomeReview`) plus a
 * plant id, and returns matching plant-scoped items only.
 *
 * SAFETY / SCOPE:
 *  - Pure, deterministic, null-safe. No I/O, React, or DB.
 *  - Display/filter only. Never mutates action_queue or diary_entries.
 *  - Never invents outcomes. Never claims an action fixed anything.
 *  - Reuses `outcomeMatchesAction` and `actionOutcomeWindowRules` —
 *    does not restate their matching or timestamp logic.
 */

import { outcomeMatchesAction } from "@/lib/actionOutcomeRules";
import {
  parseTimestampMs,
  PRE_WINDOW_HOURS,
} from "@/lib/actionOutcomeWindowRules";
import { actionDetailOutcomePath } from "@/lib/routes";
import type { PendingOutcomeReview } from "@/lib/pendingOutcomeReviewRules";

const MS_PER_HOUR = 3_600_000;

/** Source row: Dashboard pending-review shape, plus optional loose fields. */
export type PlantPendingOutcomeNoticeSourceRow = Partial<PendingOutcomeReview> & {
  action_queue_id?: string | null;
  plant_id?: string | null;
  completed_at?: string | null;
  approved_at?: string | null;
  suggested_change?: string | null;
  hours_since_completed?: number | null;
};

export interface PlantPendingOutcomeNoticeItem {
  actionId: string;
  plantId: string;
  suggestedChange: string | null;
  /** ISO timestamp used for sort (approved_at, else completed_at). */
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
  /**
   * Optional diary outcome rows. When provided, any row that still matches
   * via `outcomeMatchesAction` is dropped (defense in depth; the Dashboard
   * loader already excludes these).
   */
  outcomes?: readonly
    | {
        details?: {
          event_type?: unknown;
          action_queue_id?: unknown;
          outcome_kind?: unknown;
        } | null;
      }
    | null
    | undefined;
}

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function resolveSortTimestamp(row: PlantPendingOutcomeNoticeSourceRow): {
  iso: string;
  ms: number;
} | null {
  const completedIso = nonEmptyString(row.completed_at);
  const dueIso = resolveDueAt(completedIso);
  const dueMs = parseTimestampMs(dueIso);
  if (dueMs !== null && dueIso) return { iso: dueIso, ms: dueMs };

  const approvedIso = nonEmptyString(row.approved_at);
  const approvedMs = parseTimestampMs(approvedIso);
  if (approvedMs !== null && approvedIso) return { iso: approvedIso, ms: approvedMs };

  const completedMs = parseTimestampMs(completedIso);
  if (completedMs !== null && completedIso) return { iso: completedIso, ms: completedMs };
  return null;
}

function resolveDueAt(completedAt: string | null): string | null {
  const completedMs = parseTimestampMs(completedAt);
  if (completedMs === null) return null;
  return new Date(completedMs + PRE_WINDOW_HOURS * MS_PER_HOUR).toISOString();
}

/**
 * Returns plant-scoped pending-outcome notice items.
 *
 * Empty result is always `{ items: [] }` — never null.
 * Sort: ascending by dueAt (completed_at + PRE_WINDOW_HOURS), falling
 * back to approved_at then completed_at; action id is the tie-breaker.
 */
export function buildPlantPendingOutcomeNoticeViewModel(
  input: BuildPlantPendingOutcomeNoticeInput,
): PlantPendingOutcomeNoticeViewModel {
  const plantId = nonEmptyString(input.plantId);
  if (!plantId) return { items: [] };

  const rows = input.pendingReviews ?? [];
  const outcomes = input.outcomes;

  const items: PlantPendingOutcomeNoticeItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const actionId = nonEmptyString(row.action_queue_id);
    if (!actionId) continue;
    const rowPlantId = nonEmptyString(row.plant_id);
    if (!rowPlantId || rowPlantId !== plantId) continue;

    if (outcomes !== undefined && outcomes !== null) {
      const alreadyRecorded = outcomes.some((outcomeRow) =>
        outcomeMatchesAction(outcomeRow, actionId),
      );
      if (alreadyRecorded) continue;
    }

    const sort = resolveSortTimestamp(row);
    if (!sort) continue;

    const completedAt = nonEmptyString(row.completed_at);
    const hours =
      typeof row.hours_since_completed === "number" &&
      Number.isFinite(row.hours_since_completed)
        ? Math.max(0, Math.floor(row.hours_since_completed))
        : null;

    items.push({
      actionId,
      plantId,
      suggestedChange: nonEmptyString(row.suggested_change),
      sortTimestamp: sort.iso,
      dueAt: resolveDueAt(completedAt),
      hoursSinceCompleted: hours,
      href: actionDetailOutcomePath(actionId),
    });
  }

  items.sort((a, b) => {
    const aMs = parseTimestampMs(a.sortTimestamp) ?? 0;
    const bMs = parseTimestampMs(b.sortTimestamp) ?? 0;
    if (aMs !== bMs) return aMs - bMs;
    return a.actionId < b.actionId ? -1 : a.actionId > b.actionId ? 1 : 0;
  });

  return { items };
}

export default buildPlantPendingOutcomeNoticeViewModel;
