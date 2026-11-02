/**
 * Timeline entry clock. Same local shape as Recent Quick Logs:
 * "Nov 1, 2026, 09:22 AM" in en-US.
 *
 * Pure and null-safe. Invalid input is "Unknown time", never the raw ISO.
 */

const TIMELINE_ENTRY_TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export const TIMELINE_ENTRY_UNKNOWN_TIME = "Unknown time";

const RAW_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function formatTimelineEntryTimestamp(iso: string | null | undefined): string {
  if (typeof iso !== "string" || iso.trim() === "") return TIMELINE_ENTRY_UNKNOWN_TIME;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return TIMELINE_ENTRY_UNKNOWN_TIME;
  try {
    const formatted = new Date(parsed).toLocaleString(undefined, TIMELINE_ENTRY_TIMESTAMP_FORMAT);
    if (formatted.trim() === "" || RAW_ISO.test(formatted)) return TIMELINE_ENTRY_UNKNOWN_TIME;
    return formatted;
  } catch {
    return TIMELINE_ENTRY_UNKNOWN_TIME;
  }
}
