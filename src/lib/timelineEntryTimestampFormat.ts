/**
 * Timeline entry clock. Same local shape as Recent Quick Logs:
 * "Nov 1, 2026, 09:22 AM" in en-US.
 *
 * Pure and null-safe. Invalid input is "Unknown time", never the raw ISO.
 */

import { GrowerTimeLabel } from "@/lib/growerTimeLabel";

export const TIMELINE_ENTRY_UNKNOWN_TIME = "Unknown time";

const RAW_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function formatTimelineEntryTimestamp(iso: string | null | undefined): string {
  if (typeof iso !== "string" || iso.trim() === "") return TIMELINE_ENTRY_UNKNOWN_TIME;
  const formatted = GrowerTimeLabel.formatAbsolute(iso, {
    day: "numeric",
    hour: "2-digit",
    includeZone: false,
  });
  if (!formatted || RAW_ISO.test(formatted)) return TIMELINE_ENTRY_UNKNOWN_TIME;
  return formatted;
}
