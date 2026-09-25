/**
 * plantStartDateRules — a plant's start date is a calendar date the grower
 * picked, not an instant.
 *
 * QA 2026-09-24 (BUG-004/005): the create/edit dialogs saved the date input
 * with `new Date("YYYY-MM-DD").toISOString()`, which is UTC midnight. Plant
 * Detail then formatted it in the grower's zone, so a US Central grower who
 * picked Jul 1 saw "Jun 30". Future dates were accepted and produced a
 * negative age ("AGE -463 days").
 *
 * Contract:
 *  - New saves store the picked date at UTC midnight, the same shape as a
 *    legacy date-only save, so the date does not depend on the zone of the
 *    device that saved it or the one that reads it (picked Jul 1 in Auckland
 *    still reads Jul 1 in Los Angeles).
 *  - Reading: an instant that is exactly UTC midnight is a date-only save;
 *    its UTC calendar date is the date the grower picked. Any other instant
 *    (the column default now(), or an earlier local-midnight save) is read in
 *    the grower's local zone.
 *  - A start date after today (local) is rejected on save and never yields
 *    a negative age.
 *
 * Pure: no React, no Supabase. `now` is injected wherever time matters.
 */

export interface CalendarDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

const DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_MIDNIGHT_RE = /T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00(?::?00)?)$/;
const MS_PER_DAY = 86_400_000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Strict `YYYY-MM-DD` → calendar date, rejecting impossible dates. */
export function parsePlantStartDateInput(value: string | null | undefined): CalendarDate | null {
  if (typeof value !== "string") return null;
  const match = DATE_INPUT_RE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function localCalendarDate(now: Date): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function calendarDayNumber(date: CalendarDate): number {
  return Math.round(Date.UTC(date.year, date.month - 1, date.day) / MS_PER_DAY);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function calendarDaysBetween(from: CalendarDate, to: CalendarDate): number {
  return calendarDayNumber(to) - calendarDayNumber(from);
}

export function formatCalendarDateInput(date: CalendarDate): string {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

/** The `max` value for a start-date input: today in the grower's zone. */
export function plantStartDateInputMax(now: Date): string {
  return formatCalendarDateInput(localCalendarDate(now));
}

export type PlantStartDateSaveResult =
  { ok: true; iso: string } | { ok: false; reason: "invalid" | "future" };

export const PLANT_START_DATE_FUTURE_MESSAGE =
  "Start date can't be in the future. Pick today or an earlier date.";
export const PLANT_START_DATE_INVALID_MESSAGE = "Enter a valid start date.";

/** Date input → stored instant (UTC midnight of the picked date). */
export function plantStartDateInputToIso(value: string, now: Date): PlantStartDateSaveResult {
  const date = parsePlantStartDateInput(value);
  if (!date) return { ok: false, reason: "invalid" };
  if (calendarDaysBetween(localCalendarDate(now), date) > 0) {
    return { ok: false, reason: "future" };
  }
  return { ok: true, iso: new Date(Date.UTC(date.year, date.month - 1, date.day)).toISOString() };
}

export function plantStartDateSaveMessage(reason: "invalid" | "future"): string {
  return reason === "future" ? PLANT_START_DATE_FUTURE_MESSAGE : PLANT_START_DATE_INVALID_MESSAGE;
}

/** Stored instant → the calendar date the grower picked. */
export function resolvePlantStartCalendarDate(iso: string | null | undefined): CalendarDate | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const instant = new Date(ms);
  if (UTC_MIDNIGHT_RE.test(iso.trim())) {
    return {
      year: instant.getUTCFullYear(),
      month: instant.getUTCMonth() + 1,
      day: instant.getUTCDate(),
    };
  }
  return localCalendarDate(instant);
}

/** Stored instant → `YYYY-MM-DD` for a date input (edit prefill). */
export function plantStartDateInputValue(iso: string | null | undefined): string {
  const date = resolvePlantStartCalendarDate(iso);
  return date ? formatCalendarDateInput(date) : "";
}

/** Stored instant → a local-midnight Date for display formatting. */
export function plantStartDisplayDate(iso: string | null | undefined): Date | null {
  const date = resolvePlantStartCalendarDate(iso);
  return date ? new Date(date.year, date.month - 1, date.day) : null;
}

export type PlantAge =
  { kind: "age"; days: number } | { kind: "future"; daysUntil: number } | { kind: "unknown" };

export function resolvePlantAge(iso: string | null | undefined, now: Date): PlantAge {
  const start = resolvePlantStartCalendarDate(iso);
  if (!start) return { kind: "unknown" };
  const days = calendarDaysBetween(start, localCalendarDate(now));
  return days < 0 ? { kind: "future", daysUntil: -days } : { kind: "age", days };
}

export function formatPlantAge(age: PlantAge): string {
  if (age.kind === "unknown") return "Unknown";
  if (age.kind === "future") {
    return `Starts in ${age.daysUntil} ${age.daysUntil === 1 ? "day" : "days"}`;
  }
  return `${age.days} ${age.days === 1 ? "day" : "days"}`;
}
