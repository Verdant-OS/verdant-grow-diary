/**
 * Where a moved original entry lives now, from a verified readback. Kept on a
 * pending typed Water or Feed only with receipt_target_moved, so a reload still
 * links history review to the right Timeline. Never a confirmed receipt.
 */
export interface PendingQuickLogHistoryReviewTarget {
  growId: string | null;
  tentId: string | null;
  plantId: string | null;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** A closed projection; anything else is corrupt stored data. */
export function isPendingQuickLogHistoryReviewTarget(
  value: unknown,
): value is PendingQuickLogHistoryReviewTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const target = value as Record<string, unknown>;
  return (
    Object.keys(target).every((key) => ["growId", "tentId", "plantId"].includes(key)) &&
    nullableString(target.growId) &&
    nullableString(target.tentId) &&
    nullableString(target.plantId)
  );
}

/** A review target is valid only beside receipt_target_moved. */
export function historyReviewTargetAllowed(reason: unknown, target: unknown): boolean {
  return (
    target === undefined ||
    (reason === "receipt_target_moved" && isPendingQuickLogHistoryReviewTarget(target))
  );
}

/** A detached copy, so later mutation of the caller's object cannot reach storage. */
export function copyHistoryReviewTarget(
  target: PendingQuickLogHistoryReviewTarget,
): PendingQuickLogHistoryReviewTarget {
  return { growId: target.growId, tentId: target.tentId, plantId: target.plantId };
}
