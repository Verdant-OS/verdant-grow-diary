/** Presentation-only history scope. The database remains the read authority. */
import {
  FREE_CAPABILITIES,
  SUBSCRIPTION_ROW_SCAN_LIMIT,
  lovableRowEntitles,
  type LovableSubscriptionRow,
} from "@/lib/entitlements";
import type { ParsedEnvironmentRow } from "@/lib/csvParser";

export type CsvHistoryWindow =
  | { status: "ready"; days: number | null }
  | { status: "loading" | "paused" | "error" | "unknown" };

export const UNKNOWN_CSV_HISTORY_WINDOW: CsvHistoryWindow = { status: "unknown" };

export function resolveCsvHistoryWindow(
  rows: readonly LovableSubscriptionRow[],
  now: Date,
): CsvHistoryWindow {
  // The sensor history SELECT policy uses live subscriptions, with no staff
  // or client sandbox override. Reuse canonical row semantics for that target.
  if (rows.some((row) => row && lovableRowEntitles(row, "live", now))) {
    return { status: "ready", days: null };
  }
  // A bounded scan cannot disprove an older entitling subscription beyond it.
  if (rows.length > SUBSCRIPTION_ROW_SCAN_LIMIT || rows.some((row) => !row)) {
    return UNKNOWN_CSV_HISTORY_WINDOW;
  }
  return { status: "ready", days: FREE_CAPABILITIES.sensorHistoryDays };
}

export function csvHistoryWindowNotice(window: CsvHistoryWindow): string {
  if (window.status === "loading") {
    return "Checking your sensor history window. Saved readings may be outside the history available to your account.";
  }
  if (window.status === "paused") {
    return "Waiting for a connection to check your sensor history window. Saved readings may be outside the history available to your account.";
  }
  if (window.status !== "ready") {
    return "We couldn't verify your sensor history window. Saved readings may be outside the history available to your account.";
  }
  if (window.days === null) {
    return "Your account has no plan time limit for sensor history. This view still shows a limited number of available readings.";
  }
  return `Your account's sensor history covers the last ${window.days} days, using each reading's observation time. Older readings can be saved but won't appear in history while this window applies.`;
}

export function buildCsvHistoryWindowPreview(
  rows: readonly Pick<ParsedEnvironmentRow, "captured_at">[],
  window: CsvHistoryWindow,
  now: Date,
): { outsideCount: number; observationCount: number } | null {
  if (window.status !== "ready" || window.days === null) return null;
  const cutoff = now.getTime() - window.days * 24 * 60 * 60 * 1000;
  return {
    outsideCount: rows.filter((row) => Date.parse(row.captured_at) < cutoff).length,
    observationCount: rows.length,
  };
}
