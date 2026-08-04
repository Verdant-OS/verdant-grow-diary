/**
 * timelineDateRangeRules — pure local-day date-range boundary builder for
 * Timeline's diary/grow-event queries (issue #587).
 *
 * Hard constraints:
 *  - Pure. No React, no Supabase, no I/O, no ambient `Date.now()`.
 *  - Bounds are constructed as local wall-clock instants — the numeric
 *    `Date` constructor resolves against the runtime's configured
 *    timezone, which is the grower's own timezone in a browser — and
 *    converted to a UTC ISO instant only at the return boundary.
 *  - DST transitions follow the runtime timezone as-is: a spring-forward
 *    day spans 23 real hours, a fall-back day spans 25; this module makes
 *    no attempt to normalize either back to exactly 24.
 *  - A malformed or impossible calendar date (e.g. `2026-02-30`, which
 *    `Date` would otherwise silently roll into March) resolves to a null
 *    bound rather than a guessed one.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface TimelineDateRangeInput {
  startDate?: string | null;
  endDate?: string | null;
}

export interface TimelineDateRangeBounds {
  startIso: string | null;
  endIso: string | null;
}

interface CalendarDateParts {
  year: number;
  monthIndex: number;
  day: number;
}

/**
 * Parses a strict `YYYY-MM-DD` string into calendar parts, rejecting any
 * value whose local-midnight round-trip doesn't reproduce the same
 * year/month/day (catching both malformed input and impossible dates).
 * Local midnight never falls inside a DST gap for any IANA zone this
 * application targets, so it doubles safely as the validity probe.
 */
function parseCalendarDateParts(value: string | null | undefined): CalendarDateParts | null {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return null;

  const year = Number(value.slice(0, 4));
  const monthIndex = Number(value.slice(5, 7)) - 1;
  const day = Number(value.slice(8, 10));

  const probe = new Date(year, monthIndex, day, 0, 0, 0, 0);
  if (probe.getFullYear() !== year || probe.getMonth() !== monthIndex || probe.getDate() !== day) {
    return null;
  }
  return { year, monthIndex, day };
}

/**
 * Builds inclusive local-day boundaries for `startDate`/`endDate`,
 * converted to UTC ISO instants for the Supabase query boundary.
 *
 * Timeline already resolves an inverted range to `null, null` before its
 * dates reach here (`dateRangeInvalid`); this function applies the same
 * no-bound rule on its own so it stays safe to call directly — an
 * inverted range never guesses at a swapped or partial bound.
 */
export function buildTimelineLocalDateRangeBounds(
  input: TimelineDateRangeInput,
): TimelineDateRangeBounds {
  const startParts = parseCalendarDateParts(input?.startDate);
  const endParts = parseCalendarDateParts(input?.endDate);

  const startDate = startParts
    ? new Date(startParts.year, startParts.monthIndex, startParts.day, 0, 0, 0, 0)
    : null;
  const endDate = endParts
    ? new Date(endParts.year, endParts.monthIndex, endParts.day, 23, 59, 59, 999)
    : null;

  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    return { startIso: null, endIso: null };
  }

  return {
    startIso: startDate ? startDate.toISOString() : null,
    endIso: endDate ? endDate.toISOString() : null,
  };
}
