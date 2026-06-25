/**
 * Pure copy builder for the Quick Log "stale snapshot" attach helper.
 *
 * Hard rules:
 *  - Never implies the stale snapshot will be attached.
 *  - Never uses Live wording.
 *  - Falls back cleanly when the captured timestamp is missing/invalid.
 *  - No I/O, no React, no clock reads.
 */
import { formatSnapshotTimestamp } from "@/lib/dateFormat";

export const STALE_HELPER_SUFFIX =
  "Stale or unverified readings are not saved as current sensor context.";

export const STALE_HELPER_PREFIX = "Refresh before attaching this snapshot.";

export function buildStaleSnapshotHelperCopy(
  capturedAt: string | number | Date | null | undefined,
  locale?: string,
): string {
  if (capturedAt === null || capturedAt === undefined || capturedAt === "") {
    return `${STALE_HELPER_PREFIX} ${STALE_HELPER_SUFFIX}`;
  }
  const formatted = formatSnapshotTimestamp(capturedAt, locale);
  if (formatted === "Unknown time") {
    return `${STALE_HELPER_PREFIX} ${STALE_HELPER_SUFFIX}`;
  }
  return `${STALE_HELPER_PREFIX} Captured ${formatted}. ${STALE_HELPER_SUFFIX}`;
}
