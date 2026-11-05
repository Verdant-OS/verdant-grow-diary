/**
 * csvTimestampRules — pure interpretation of CSV observation timestamps.
 *
 * A timestamp is either an instant (it carries `Z` or a numeric offset) or a
 * wall-clock reading with no zone. A wall-clock reading is never assigned
 * UTC, the browser zone, the account zone or the file name's date: it stays
 * unresolved until the grower names the source time zone. Daylight-saving
 * folds (a wall time that happened twice) and gaps (a wall time that never
 * happened) stay unresolved even with a zone; no occurrence is guessed and no
 * time is rolled forward.
 *
 * Supported formats, deliberately and only these (no host-dependent
 * `Date.parse` fallback):
 *  - `YYYY-MM-DD[ T]HH:mm[:ss[.fff]]` followed by `Z`, `±HH:MM` or `±HHMM` → instant
 *  - `YYYY-MM-DD[ T]HH:mm[:ss[.fff]]` → wall clock
 *  - `YYYY-MM-DD` → wall clock at 00:00 that day
 *  - `MM/DD/YYYY[ HH:mm[:ss]]` (US month-first, two-digit years are 20YY) → wall clock
 * Calendar parts are validated strictly: Feb 30, month 13 or hour 25 are invalid,
 * never rolled over.
 *
 * No React, no Supabase, no clock.
 */

export type CsvTimeBasis = "explicit_offset" | "source_time_zone";

export type CsvTimeInterpretation =
  | { kind: "resolved"; iso: string; basis: CsvTimeBasis; zone: string | null; offset: string }
  | { kind: "needs_zone" }
  | { kind: "ambiguous"; zone: string; candidates: readonly [string, string] }
  | { kind: "nonexistent"; zone: string }
  | { kind: "invalid" };

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ms: number;
}

const EXPLICIT_RE =
  /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?\s*(Z|[+-]\d{2}:?\d{2})$/i;
const NAIVE_ISO_RE =
  /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$/i;
const US_SLASH_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(zone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(zone, fmt);
  }
  return fmt;
}

/** True only for a time zone name this runtime's Intl data recognizes. */
export function isValidIanaTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.trim() === "" || zone !== zone.trim()) return false;
  try {
    zoneFormatter(zone);
    return true;
  } catch {
    return false;
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildWall(
  y: string,
  mo: string,
  d: string,
  h?: string,
  mi?: string,
  s?: string,
  frac?: string,
): WallClock | null {
  const wall: WallClock = {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h ?? 0),
    minute: Number(mi ?? 0),
    second: Number(s ?? 0),
    ms: frac ? Number(frac.slice(0, 3).padEnd(3, "0")) : 0,
  };
  if (wall.month < 1 || wall.month > 12) return null;
  if (wall.day < 1 || wall.day > daysInMonth(wall.year, wall.month)) return null;
  if (wall.hour > 23 || wall.minute > 59 || wall.second > 59) return null;
  return wall;
}

function wallAsUtcMs(w: WallClock): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, w.ms);
}

/** Offset (ms east of UTC) that `zone` applies at instant `utcMs`. */
function zoneOffsetMs(zone: string, utcMs: number): number {
  const parts: Record<string, number> = {};
  for (const p of zoneFormatter(zone).formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const wall = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const wholeSecond = utcMs - (((utcMs % 1000) + 1000) % 1000);
  return wall - wholeSecond;
}

export function formatUtcOffset(offsetMs: number): string {
  const sign = offsetMs < 0 ? "-" : "+";
  const total = Math.round(Math.abs(offsetMs) / 60_000);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

function parseExplicitOffset(token: string): number | null {
  if (/^z$/i.test(token)) return 0;
  const m = token.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) return null;
  const hours = Number(m[2]);
  const minutes = Number(m[3]);
  if (hours > 14 || minutes > 59) return null;
  const ms = (hours * 60 + minutes) * 60_000;
  return m[1] === "-" ? -ms : ms;
}

function parseWallClock(text: string): WallClock | null | "not_wall" {
  const iso = text.match(NAIVE_ISO_RE);
  if (iso) return buildWall(iso[1], iso[2], iso[3], iso[4], iso[5], iso[6], iso[7]);
  const us = text.match(US_SLASH_RE);
  if (us) {
    const year = us[3].length === 2 ? String(2000 + Number(us[3])) : us[3];
    return buildWall(year, us[1], us[2], us[4], us[5], us[6]);
  }
  return "not_wall";
}

/**
 * Interpret one CSV timestamp. `sourceTimeZone` is the IANA zone the grower
 * explicitly confirmed for wall-clock values, or null when none was chosen.
 * An explicit offset in the text always wins and is never shifted again.
 */
export function interpretCsvTimestamp(
  text: string,
  sourceTimeZone: string | null,
): CsvTimeInterpretation {
  const input = (text ?? "").trim();
  if (!input) return { kind: "invalid" };

  const explicit = input.match(EXPLICIT_RE);
  if (explicit) {
    const wall = buildWall(
      explicit[1],
      explicit[2],
      explicit[3],
      explicit[4],
      explicit[5],
      explicit[6],
      explicit[7],
    );
    const offsetMs = parseExplicitOffset(explicit[8]);
    if (!wall || offsetMs == null) return { kind: "invalid" };
    return {
      kind: "resolved",
      iso: new Date(wallAsUtcMs(wall) - offsetMs).toISOString(),
      basis: "explicit_offset",
      zone: null,
      offset: formatUtcOffset(offsetMs),
    };
  }

  const wall = parseWallClock(input);
  if (wall === "not_wall" || wall === null) return { kind: "invalid" };
  if (sourceTimeZone == null) return { kind: "needs_zone" };
  if (!isValidIanaTimeZone(sourceTimeZone)) return { kind: "invalid" };

  const wallMs = wallAsUtcMs(wall);
  const day = 86_400_000;
  const offsets = new Set([
    zoneOffsetMs(sourceTimeZone, wallMs - day),
    zoneOffsetMs(sourceTimeZone, wallMs + day),
  ]);
  const instants: number[] = [];
  for (const offset of offsets) {
    const candidate = wallMs - offset;
    if (zoneOffsetMs(sourceTimeZone, candidate) === offset) instants.push(candidate);
  }
  instants.sort((a, b) => a - b);

  if (instants.length === 0) return { kind: "nonexistent", zone: sourceTimeZone };
  if (instants.length > 1) {
    return {
      kind: "ambiguous",
      zone: sourceTimeZone,
      candidates: [new Date(instants[0]).toISOString(), new Date(instants[1]).toISOString()],
    };
  }
  return {
    kind: "resolved",
    iso: new Date(instants[0]).toISOString(),
    basis: "source_time_zone",
    zone: sourceTimeZone,
    offset: formatUtcOffset(wallMs - instants[0]),
  };
}
