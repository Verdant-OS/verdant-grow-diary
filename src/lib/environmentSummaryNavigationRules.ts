/**
 * Pure URL builders for the Environment Summary Report page.
 *
 * No I/O. No React. No Supabase. Deterministic output for testability.
 */

export const ENVIRONMENT_SUMMARY_REPORT_PATH = "/diary/environment-summary";

export interface EnvironmentSummaryReportUrlInput {
  startDate?: string | null;
  endDate?: string | null;
  issueId?: string | null;
}

function isValidIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function buildEnvironmentSummaryReportUrl(
  input: EnvironmentSummaryReportUrlInput = {},
): string {
  const params: string[] = [];
  if (isValidIsoDate(input.startDate)) {
    params.push(`start=${encodeURIComponent(input.startDate)}`);
  }
  if (isValidIsoDate(input.endDate)) {
    params.push(`end=${encodeURIComponent(input.endDate)}`);
  }
  if (input.issueId && typeof input.issueId === "string") {
    params.push(`issue=${encodeURIComponent(input.issueId)}`);
  }
  return params.length
    ? `${ENVIRONMENT_SUMMARY_REPORT_PATH}?${params.join("&")}`
    : ENVIRONMENT_SUMMARY_REPORT_PATH;
}

/** Pure default-range helper. Returns last 7 days ending on `today`. */
export function defaultEnvironmentSummaryRange(today: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { startDate: fmt(start), endDate: fmt(end) };
}

/** Validate that startDate <= endDate (both ISO YYYY-MM-DD). */
export function isValidEnvironmentSummaryRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): boolean {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) return false;
  return startDate <= endDate;
}
