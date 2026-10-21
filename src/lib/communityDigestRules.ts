import type { DigestCursor, DigestItem } from "@/lib/communityTypes";

/** Code-point comparison, so ordering never depends on the runtime locale. */
function compareHandles(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Newest first by (publishedAt, publicationHandle), both descending. */
function compareDescending(aMs: number, aHandle: string, bMs: number, bHandle: string): number {
  if (aMs !== bMs) return bMs - aMs;
  return compareHandles(bHandle, aHandle);
}

/**
 * Orders digest items newest first and keeps only those strictly after the
 * cursor in that order. The cursor is navigation only: this function records
 * nothing as seen. Items or a cursor with an unreadable timestamp cannot be
 * placed honestly, so they are dropped (cursor: empty page).
 */
export function orderCommunityDigest(
  items: readonly DigestItem[],
  before: DigestCursor,
): readonly DigestItem[] {
  const cursorMs = before === null ? null : Date.parse(before.publishedAt);
  if (cursorMs !== null && !Number.isFinite(cursorMs)) return [];

  const placed = items
    .map((item) => ({ item, ms: Date.parse(item.publication.publishedAt) }))
    .filter((entry) => Number.isFinite(entry.ms));

  const afterCursor =
    before === null || cursorMs === null
      ? placed
      : placed.filter(
          (entry) =>
            compareDescending(
              entry.ms,
              entry.item.publication.publicationHandle,
              cursorMs,
              before.publicationHandle,
            ) > 0,
        );

  return afterCursor
    .sort((a, b) =>
      compareDescending(
        a.ms,
        a.item.publication.publicationHandle,
        b.ms,
        b.item.publication.publicationHandle,
      ),
    )
    .map((entry) => entry.item);
}
