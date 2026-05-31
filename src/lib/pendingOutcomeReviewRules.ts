/**
 * pendingOutcomeReviewRules — pure helpers to detect completed action_queue
 * rows that are older than a threshold and still missing a grower-recorded
 * action_outcome diary entry.
 *
 * SAFETY / SCOPE:
 *  - Pure, deterministic. No I/O, React, or DB.
 *  - Detection only. NEVER mutates action_queue, diary_entries, or alerts.
 *  - NEVER claims an action fixed, healed, or resolved an issue.
 *  - Outcome is grower-recorded only; this helper does not infer it.
 */
import { outcomeMatchesAction } from "@/lib/actionOutcomeRules";

export const PENDING_OUTCOME_REVIEW_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface CompletedActionRowLike {
  id?: string | null;
  status?: string | null;
  completed_at?: string | null;
  suggested_change?: string | null;
}

export interface OutcomeDiaryRowLike {
  details?: {
    event_type?: unknown;
    action_queue_id?: unknown;
    outcome_kind?: unknown;
  } | null;
}

export interface PendingOutcomeReview {
  action_queue_id: string;
  completed_at: string;
  suggested_change: string | null;
  hours_since_completed: number;
}

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function parseTs(v: unknown): number | null {
  const s = nonEmptyString(v);
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : null;
}

export interface FindPendingOutcomeReviewsInput {
  completedActions: readonly CompletedActionRowLike[] | null | undefined;
  outcomes: readonly OutcomeDiaryRowLike[] | null | undefined;
  now: Date | number;
  thresholdMs?: number;
}

/**
 * Returns one PendingOutcomeReview per completed action that:
 *  - has status === "completed"
 *  - has a parseable completed_at older than `thresholdMs` (default 24h)
 *  - has no diary row matching outcomeMatchesAction(row, action.id)
 *
 * Sorted by oldest completion first so the most overdue review surfaces first.
 */
export function findPendingOutcomeReviews(
  input: FindPendingOutcomeReviewsInput,
): PendingOutcomeReview[] {
  const threshold = Number.isFinite(input.thresholdMs as number)
    ? Math.max(0, input.thresholdMs as number)
    : PENDING_OUTCOME_REVIEW_THRESHOLD_MS;
  const nowMs =
    typeof input.now === "number" ? input.now : input.now.getTime();
  if (!Number.isFinite(nowMs)) return [];

  const actions = input.completedActions ?? [];
  const outcomes = input.outcomes ?? [];

  const reviews: PendingOutcomeReview[] = [];
  for (const a of actions) {
    if (!a || a.status !== "completed") continue;
    const id = nonEmptyString(a.id);
    if (!id) continue;
    const completedMs = parseTs(a.completed_at);
    if (completedMs === null) continue;
    const ageMs = nowMs - completedMs;
    if (ageMs < threshold) continue;
    const hasOutcome = outcomes.some((row) => outcomeMatchesAction(row, id));
    if (hasOutcome) continue;
    reviews.push({
      action_queue_id: id,
      completed_at: a.completed_at as string,
      suggested_change: nonEmptyString(a.suggested_change),
      hours_since_completed: Math.floor(ageMs / (60 * 60 * 1000)),
    });
  }
  reviews.sort(
    (a, b) => Date.parse(a.completed_at) - Date.parse(b.completed_at),
  );
  return reviews;
}
