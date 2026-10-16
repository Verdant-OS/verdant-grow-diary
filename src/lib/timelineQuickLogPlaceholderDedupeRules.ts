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

function readNonBlankString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Grow-event id persisted on a diary mirror. Photo attachment rows do not
 * carry this field; see `readPhotoObjectPath`.
 */
function readLinkedGrowEventId(row: TimelineQuickLogPlaceholderRow): string | null {
  const details = row.details;
  if (!details) return null;
  return (
    readNonBlankString(details.linked_grow_event_id) ?? readNonBlankString(details.grow_event_id)
  );
}

/**
 * The photo diary writer stores the object on the `photo_url` column.
 * The manual-save mirror stores that same path at `details.photo_url`
 * and leaves the column empty, so the column alone is not the photo's link.
 */
function readPhotoObjectPath(row: TimelineQuickLogPlaceholderRow): string | null {
  return readNonBlankString(row.photo_url) ?? readNonBlankString(row.details?.photo_url);
}

/**
 * Positive link only. Two grow-event ids must be equal. When the photo row
 * has no grow-event id, its object path must equal the mirror's stored path.
 * When neither row has an id, this is false — a shared target and time are
 * not enough.
 */
function placeholderLinksPhoto(
  placeholder: TimelineQuickLogPlaceholderRow,
  photo: TimelineQuickLogPlaceholderRow,
): boolean {
  const placeholderId = readLinkedGrowEventId(placeholder);
  const photoId = readLinkedGrowEventId(photo);
  if (placeholderId !== null && photoId !== null) return placeholderId === photoId;
  if (placeholderId === null && photoId === null) return false;
  const placeholderPath = readPhotoObjectPath(placeholder);
  const photoPath = readPhotoObjectPath(photo);
  return placeholderPath !== null && placeholderPath === photoPath;
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
 * the same plant or tent landed within two minutes and the rows share a
 * positive link: equal grow-event ids, or the photo column path equal to
 * the mirror's details.photo_url. A missing id on both rows never hides
 * the placeholder. A lone placeholder stays.
 */
export function dropBlankQuickLogPlaceholderRows<T extends TimelineQuickLogPlaceholderRow>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => {
    if (!isBlankPlaceholder(row)) return true;
    const at = new Date(row.entry_at).getTime();
    if (Number.isNaN(at)) return true;
    const hasCompanion = rows.some((other) => {
      if (other.id === row.id || !hasPhoto(other) || !sharesTarget(row, other)) return false;
      if (!placeholderLinksPhoto(row, other)) return false;
      const otherAt = new Date(other.entry_at).getTime();
      if (Number.isNaN(otherAt)) return false;
      return Math.abs(otherAt - at) <= COMPANION_WINDOW_MS;
    });
    return !hasCompanion;
  });
}
