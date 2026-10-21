import type { CommunityResult, DigestCursor, DigestItem } from "@/lib/communityTypes";

/** An instant: epoch milliseconds plus the fraction digits Date.parse drops. */
export interface CommunityInstant {
  ms: number;
  subMs: number;
}

/** Date, time and an explicit Z or numeric offset; T, t or a space between date and time. */
const INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:[Zz]|[+-]\d{2}:?\d{2})$/;

/**
 * Reads a timestamp without losing database microseconds. Date.parse keeps
 * whole milliseconds; digits past the third fractional place are compared
 * separately. Returns null for anything unreadable: no explicit offset (which
 * Date.parse would read as host-local time), an impossible calendar date or
 * clock time (which Date.parse rolls over), or a non-string.
 */
export function readCommunityInstant(timestamp: string): CommunityInstant | null {
  if (typeof timestamp !== "string") return null;
  const match = INSTANT_PATTERN.exec(timestamp);
  if (match === null) return null;
  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  const calendarDay = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  // An impossible day (00, Feb 30, 32 and up) rolls into another month.
  if (calendarDay.getUTCMonth() !== Number(month) - 1) return null;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return null;
  return { ms, subMs: Number(fraction.slice(3, 9).padEnd(6, "0")) };
}

/** A usable publication handle: a non-empty string, so ties break consistently. */
function isHandle(handle: unknown): handle is string {
  return typeof handle === "string" && handle.length > 0;
}

/** Code-point comparison, so ordering never depends on the runtime locale. */
function compareHandles(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Newest first by (publishedAt, publicationHandle), both descending. */
function compareDescending(
  a: CommunityInstant,
  aHandle: string,
  b: CommunityInstant,
  bHandle: string,
): number {
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
  if (!Array.isArray(items)) return { ok: false, code: "invalid" };
  if (before !== null && (typeof before !== "object" || !isHandle(before.publicationHandle))) {
    return { ok: false, code: "invalid" };
  }
  const cursorAt = before === null ? null : readCommunityInstant(before.publishedAt);
  if (before !== null && cursorAt === null) return { ok: false, code: "invalid" };

  const placed: { item: DigestItem; at: CommunityInstant }[] = [];
  for (const item of items) {
    if (item?.publication === null || item?.publication === undefined) {
      return { ok: false, code: "invalid" };
    }
    if (!isHandle(item.publication.publicationHandle)) return { ok: false, code: "invalid" };
    const at = readCommunityInstant(item.publication.publishedAt);
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
