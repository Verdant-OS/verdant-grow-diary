import type { CommunityResult, DigestCursor, DigestItem } from "@/lib/communityTypes";

/** A publish instant: epoch milliseconds plus the fraction digits Date.parse drops. */
interface Instant {
  ms: number;
  subMs: number;
}

/**
 * Reads an ISO timestamp without losing database microseconds. Date.parse keeps
 * whole milliseconds; digits past the third fractional place are compared
 * separately. Returns null when the timestamp is unreadable.
 */
function readInstant(timestamp: string): Instant | null {
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return null;
  const fraction = /T\d{2}:\d{2}:\d{2}\.(\d+)/.exec(timestamp)?.[1] ?? "";
  const subMs = Number(fraction.slice(3, 9).padEnd(6, "0"));
  return { ms, subMs };
}

/** Code-point comparison, so ordering never depends on the runtime locale. */
function compareHandles(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Newest first by (publishedAt, publicationHandle), both descending. */
function compareDescending(a: Instant, aHandle: string, b: Instant, bHandle: string): number {
  if (a.ms !== b.ms) return b.ms - a.ms;
  if (a.subMs !== b.subMs) return b.subMs - a.subMs;
  return compareHandles(bHandle, aHandle);
}

/**
 * Orders digest items newest first and keeps only those strictly after the
 * cursor in that order. The cursor is navigation only: this function records
 * nothing as seen. A cursor or any item with an unreadable timestamp is
 * reported as `invalid`, so bad input never looks like "nothing newer".
 */
export function orderCommunityDigest(
  items: readonly DigestItem[],
  before: DigestCursor,
): CommunityResult<readonly DigestItem[]> {
  const cursorAt = before === null ? null : readInstant(before.publishedAt);
  if (before !== null && cursorAt === null) return { ok: false, code: "invalid" };

  const placed: { item: DigestItem; at: Instant }[] = [];
  for (const item of items) {
    const at = readInstant(item.publication.publishedAt);
    if (at === null) return { ok: false, code: "invalid" };
    placed.push({ item, at });
  }

  const afterCursor =
    before === null || cursorAt === null
      ? placed
      : placed.filter(
          (entry) =>
            compareDescending(
              entry.at,
              entry.item.publication.publicationHandle,
              cursorAt,
              before.publicationHandle,
            ) > 0,
        );

  const ordered = afterCursor
    .sort((a, b) =>
      compareDescending(
        a.at,
        a.item.publication.publicationHandle,
        b.at,
        b.item.publication.publicationHandle,
      ),
    )
    .map((entry) => entry.item);
  return { ok: true, value: ordered };
}
