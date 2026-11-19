/**
 * Week / age / start-date labels for the field notebook tent card.
 *
 * The card used to print fixed "Week —", "Age: —" and "Started: —"
 * placeholders even though every grow row carries `started_at` (a required
 * column the database fills with the creation time and the grower can edit).
 * These labels are derived from that saved date only; nothing is guessed.
 *
 * Pure: no React, no Supabase, no clock. `nowMs` and `timeZone` are injected.
 */

export interface FieldNotebookTentAgeLabels {
  weekLabel: string;
  ageLabel: string;
  startedLabel: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Shown when the grow's start date is missing or unreadable. No bare dashes. */
export const FIELD_NOTEBOOK_TENT_AGE_UNKNOWN: FieldNotebookTentAgeLabels = Object.freeze({
  weekLabel: "Start date not set",
  ageLabel: "Age not set",
  startedLabel: "not set",
});

function parseStartedAt(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Calendar day number (UTC-epoch based) of an instant in the given zone, so
 * "started today" follows the grower's calendar rather than 24-hour blocks.
 */
function zonedDayNumber(ms: number, timeZone: string | undefined): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
    const bag: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") bag[part.type] = part.value;
    }
    const y = Number(bag.year);
    const m = Number(bag.month);
    const d = Number(bag.day);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  } catch {
    return null;
  }
}

function formatStartedDate(ms: number, timeZone: string | undefined): string | null {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

/**
 * Build the tent card labels from the grow's saved start date.
 *
 * - Day count is whole calendar days in `timeZone` (0 on the start day).
 * - Week is 1-based: days 0–6 are Week 1.
 * - A start date later than now (a planned grow) reads "Not started yet".
 */
export function buildFieldNotebookTentAgeLabels(input: {
  startedAt: string | null | undefined;
  nowMs: number;
  timeZone?: string;
}): FieldNotebookTentAgeLabels {
  const startedMs = parseStartedAt(input.startedAt);
  if (startedMs === null || !Number.isFinite(input.nowMs)) return FIELD_NOTEBOOK_TENT_AGE_UNKNOWN;
  const startedDay = zonedDayNumber(startedMs, input.timeZone);
  const today = zonedDayNumber(input.nowMs, input.timeZone);
  const startedLabel = formatStartedDate(startedMs, input.timeZone);
  if (startedDay === null || today === null || startedLabel === null) {
    return FIELD_NOTEBOOK_TENT_AGE_UNKNOWN;
  }
  const days = today - startedDay;
  if (days < 0) {
    return { weekLabel: "Not started yet", ageLabel: "Age: not started yet", startedLabel };
  }
  const week = Math.floor(days / 7) + 1;
  const ageLabel =
    days === 0 ? "Age: started today" : `Age: ${days} ${days === 1 ? "day" : "days"}`;
  return { weekLabel: `Week ${week}`, ageLabel, startedLabel };
}
