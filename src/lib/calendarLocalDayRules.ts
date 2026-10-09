/**
 * calendarLocalDayRules — viewer's local civil day for calendar grouping.
 *
 * Timestamped events (occurred_at, entry_at, scheduled instants) group by
 * the grower's local calendar day. A bare YYYY-MM-DD is already a civil
 * date and stays put. Plant and grow start dates, including a UTC-midnight
 * save of a picked date, stay on that civil date (BUG-004). Stored instants
 * stay UTC; these helpers only choose a display bucket.
 *
 * Pure: no React, no Supabase, no clock. Local day uses Date local getters,
 * which follow the process timezone.
 */
import { formatCalendarDateInput, resolvePlantStartCalendarDate } from "@/lib/plantStartDateRules";

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD from a Date's local calendar fields. Null when the instant is invalid. */
export function localCalendarDayKey(date: Date): string | null {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return null;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (year < 1000 || year > 9999) return null;
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/** True for a real civil date, rejecting overflow such as 2026-02-30. */
function isStrictDateOnly(value: string): boolean {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Bucket a diary or review instant by the viewer's local day.
 * A bare YYYY-MM-DD stays that day. Any other parseable instant, including
 * exact UTC midnight, uses local calendar fields.
 */
export function calendarInstantDayKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (isStrictDateOnly(trimmed)) return trimmed;
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return null;
  return localCalendarDayKey(new Date(timestamp));
}

/**
 * Civil day for a plant start, grow start, or flower-flip calendar date.
 * Bare dates and UTC-midnight saves keep their UTC civil date. Any other
 * instant uses the viewer's local day, matching plantStartDateRules.
 */
export function calendarStartDateDayKey(
  value: string | number | Date | null | undefined,
): string | null {
  if (value == null) return null;
  let stored: string | null = null;
  if (typeof value === "string") {
    stored = value;
  } else if (value instanceof Date) {
    stored = Number.isFinite(value.getTime()) ? value.toISOString() : null;
  } else if (typeof value === "number") {
    stored = Number.isFinite(value) ? new Date(value).toISOString() : null;
  }
  if (stored == null) return null;
  const date = resolvePlantStartCalendarDate(stored);
  return date ? formatCalendarDateInput(date) : null;
}
