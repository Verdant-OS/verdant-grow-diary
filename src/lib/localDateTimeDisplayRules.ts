/**
 * Viewer-local date/time display for stored ISO instants.
 *
 * Same format as the manual-snapshot review ("MMM d, yyyy, h:mm a"). The
 * stored value is never rewritten. Unparseable input is returned unchanged
 * rather than hidden.
 *
 * Pure: the formatter is injectable for deterministic tests.
 */
import { format } from "date-fns";

export function defaultLocalDateTimeFormatter(date: Date): string {
  return format(date, "MMM d, yyyy, h:mm a");
}

export function formatLocalDateTime(
  iso: string,
  formatTimestamp: (date: Date) => string = defaultLocalDateTimeFormatter,
): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? formatTimestamp(new Date(ms)) : iso;
}
