/**
 * Pure user-facing timestamp formatters.
 *
 * Goals:
 *  - Localized human-readable output.
 *  - No microseconds, no raw `+00:00` offsets, no raw ISO strings.
 *  - Null-safe; bad input never throws.
 *
 * Presenter-only. No I/O. No React.
 */

const SNAPSHOT_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * Format an ISO-ish timestamp for snapshot cards.
 * Example: "May 31, 2026, 1:44 PM".
 *
 * Returns "Unknown time" for null/undefined/invalid input. Strips raw
 * ISO output entirely — never returns the input string verbatim.
 */
export function formatSnapshotTimestamp(
  ts: string | number | Date | null | undefined,
  locale: string | undefined = undefined,
): string {
  if (ts === null || ts === undefined || ts === "") return "Unknown time";
  const d =
    ts instanceof Date ? ts : new Date(typeof ts === "string" ? ts : Number(ts));
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "Unknown time";
  try {
    return new Intl.DateTimeFormat(locale, SNAPSHOT_FORMAT).format(d);
  } catch {
    return "Unknown time";
  }
}
