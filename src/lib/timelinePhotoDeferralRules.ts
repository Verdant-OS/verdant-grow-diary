/**
 * Timeline photo deferral (grower bug item 10, issue #2785).
 *
 * Timeline renders each diary photo at its original camera size. Measured in a
 * mocked Chromium run, 100 entries with 12 MP photos took the renderer to about
 * 1.5 GB after scrolling to the end, against about 0.42 GB with no photos; the
 * JS heap stayed near 60 MB. So only the newest photos load on their own, and
 * older entries offer a button that loads that one photo when the grower asks.
 *
 * Pure: no React, no I/O, no clock.
 */

/** How many photo-bearing entries, newest first in render order, load on their own. */
export const TIMELINE_EAGER_PHOTO_LIMIT = 20;

export const TIMELINE_DEFERRED_PHOTO_COPY = {
  button: "Show photo",
  hint: "Older photos load when you tap, to keep this page from running out of memory.",
} as const;

export const TIMELINE_DEFERRED_PHOTO_TESTID = "timeline-photo-deferred" as const;

interface PhotoRow {
  id: string;
  photo_url: string | null;
}

/**
 * Ids whose photo loads on its own: the first `limit` rows that have a photo, in
 * the order given (the Timeline's render order), plus every id the grower has
 * already revealed. A row with no photo never counts toward the limit.
 */
export function selectTimelineEagerPhotoIds(
  rows: readonly PhotoRow[],
  revealedIds: ReadonlySet<string>,
  limit: number = TIMELINE_EAGER_PHOTO_LIMIT,
): ReadonlySet<string> {
  const eager = new Set<string>(revealedIds);
  let shown = 0;
  for (const row of rows) {
    if (shown >= limit) break;
    if (!row.photo_url) continue;
    eager.add(row.id);
    shown += 1;
  }
  return eager;
}
