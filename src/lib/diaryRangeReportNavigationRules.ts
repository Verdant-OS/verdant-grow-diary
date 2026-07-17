/**
 * Pure URL builders for the date-range diary report page.
 *
 * Mirrors environmentSummaryNavigationRules exactly: no I/O, no React,
 * no Supabase, deterministic output for testability.
 */

export const DIARY_RANGE_REPORT_PATH = "/reports/diary-range";

export interface DiaryRangeReportUrlInput {
  growId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

function isValidIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function buildDiaryRangeReportUrl(
  input: DiaryRangeReportUrlInput = {},
): string {
  const params: string[] = [];
  if (input.growId && typeof input.growId === "string") {
    params.push(`growId=${encodeURIComponent(input.growId)}`);
  }
  if (isValidIsoDate(input.startDate)) {
    params.push(`start=${encodeURIComponent(input.startDate)}`);
  }
  if (isValidIsoDate(input.endDate)) {
    params.push(`end=${encodeURIComponent(input.endDate)}`);
  }
  return params.length
    ? `${DIARY_RANGE_REPORT_PATH}?${params.join("&")}`
    : DIARY_RANGE_REPORT_PATH;
}

/** Pure default-range helper. Returns the last 30 days ending on `today`. */
export function defaultDiaryRangeReportRange(today: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  const end = new Date(today);
  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { startDate: fmt(start), endDate: fmt(end) };
}

/** Validate that startDate <= endDate (both ISO YYYY-MM-DD). */
export function isValidDiaryRangeReportRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): boolean {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) return false;
  return startDate <= endDate;
}
