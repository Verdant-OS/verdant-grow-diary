/** Placeholder note the manual Quick Log RPC writes when the grower note is empty. */
export const QUICK_LOG_PLACEHOLDER_NOTE = "(quick log)";

const COMPANION_WINDOW_MS = 2 * 60 * 1000;

export type TimelineQuickLogPlaceholderRow = {
  id: string;
  note?: string | null;
  photo_url?: string | null;
  plant_id?: string | null;
  tent_id?: string | null;
  entry_at: string;
  details?: Record<string, unknown> | null;
};

/** Checks whether a timeline row carries a non-blank photo URL. */
function hasPhoto(row: TimelineQuickLogPlaceholderRow): boolean {
  return typeof row.photo_url === "string" && row.photo_url.trim().length > 0;
}

/** Checks whether a timeline row is a blank "(quick log)" placeholder without a photo. */
function isBlankPlaceholder(row: TimelineQuickLogPlaceholderRow): boolean {
  return (row.note ?? "").trim() === QUICK_LOG_PLACEHOLDER_NOTE && !hasPhoto(row);
}

/** Reads a non-blank details.linked_grow_event_id when present. */
function readLinkedGrowEventId(row: TimelineQuickLogPlaceholderRow): string | null {
  const candidate = row.details?.linked_grow_event_id;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Checks whether two timeline rows share a compatible plant or tent target anchor. */
function sharesTarget(
  left: TimelineQuickLogPlaceholderRow,
  right: TimelineQuickLogPlaceholderRow,
): boolean {
  const plantMatch = !left.plant_id || !right.plant_id ? true : left.plant_id === right.plant_id;
  const tentMatch = !left.tent_id || !right.tent_id ? true : left.tent_id === right.tent_id;
  const hasAnchor = Boolean(left.plant_id || left.tent_id);
  return hasAnchor && plantMatch && tentMatch;
}

/**
 * A photo Quick Log writes a diary photo row and the manual RPC also inserts a
 * blank "(quick log)" mirror. Drop only that blank mirror when a photo row for
 * the same plant or tent landed within two minutes and any persisted
 * details.linked_grow_event_id links match. A lone placeholder stays.
 */
export function dropBlankQuickLogPlaceholderRows<T extends TimelineQuickLogPlaceholderRow>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => {
    if (!isBlankPlaceholder(row)) return true;
    const at = new Date(row.entry_at).getTime();
    if (Number.isNaN(at)) return true;
    const rowLinkedId = readLinkedGrowEventId(row);
    const hasCompanion = rows.some((other) => {
      if (other.id === row.id || !hasPhoto(other) || !sharesTarget(row, other)) return false;
      const otherLinkedId = readLinkedGrowEventId(other);
      if (rowLinkedId !== null || otherLinkedId !== null) {
        if (rowLinkedId === null || otherLinkedId === null || rowLinkedId !== otherLinkedId) {
          return false;
        }
      }
      const otherAt = new Date(other.entry_at).getTime();
      if (Number.isNaN(otherAt)) return false;
      return Math.abs(otherAt - at) <= COMPANION_WINDOW_MS;
    });
    return !hasCompanion;
  });
}
