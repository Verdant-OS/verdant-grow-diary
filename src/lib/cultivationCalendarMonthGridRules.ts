/**
 * cultivationCalendarMonthGridRules — a deterministic, UTC-only month-grid
 * projection for the read-only cultivation calendar.
 *
 * The model keeps historical facts and history-derived review suggestions in
 * separate arrays. A suggestion is never promoted to a logged event, task,
 * due item, Action Queue item, or automatic action.
 *
 * Pure: no I/O, no ambient clock, no local-time APIs, and no writes.
 */
import {
  CULTIVATION_CALENDAR_HISTORY_CATEGORIES,
  CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE,
  type CultivationCalendarHistoryCategory,
  type CultivationCalendarProjectedReviewBlock,
} from "@/lib/cultivationCalendarProjectionRules";

export interface CultivationCalendarMonthGridLoggedFact {
  /** Opaque source identifier used only for stable display ordering. */
  id: string;
  /** Allowlisted calendar category or another safe, caller-provided label. */
  kind: string;
  /** Short, vetted display label. */
  label: string;
}

export interface CultivationCalendarMonthGridLoggedGroup {
  /** UTC calendar date in YYYY-MM-DD form. */
  dateKey: string;
  events: readonly CultivationCalendarMonthGridLoggedFact[];
}

export interface CultivationCalendarMonthGridInput {
  /** UTC calendar month in YYYY-MM form. Invalid input fails closed. */
  monthKey: string | null | undefined;
  /** Historical facts already vetted for calendar presentation. */
  loggedGroups: readonly CultivationCalendarMonthGridLoggedGroup[] | null | undefined;
  /** Advisory blocks from the conservative cadence projector. */
  projectedReviews: readonly CultivationCalendarProjectedReviewBlock[] | null | undefined;
  /** Optional injected instant used only to identify today's UTC cell. */
  today?: Date | string | null | undefined;
}

export interface CultivationCalendarMonthGridDay {
  /** UTC date in YYYY-MM-DD form. */
  dateKey: string;
  /** 1–31, from the UTC calendar day. */
  dayOfMonth: number;
  /** Whether the cell belongs to the requested month rather than its padding. */
  isInMonth: boolean;
  /** True only when the injected UTC today value matches this cell. */
  isToday: boolean;
  /** Historical care facts. These are never inferred from suggestions. */
  loggedFacts: readonly CultivationCalendarMonthGridLoggedFact[];
  /** Conservative, history-derived review opportunities; never logged care. */
  advisoryReviews: readonly CultivationCalendarProjectedReviewBlock[];
  hasLoggedFacts: boolean;
  hasAdvisoryReviews: boolean;
}

export interface CultivationCalendarMonthGrid {
  /** Normalized requested month, or null when the input is invalid. */
  monthKey: string | null;
  isValidMonth: boolean;
  /** Sunday-first, always 42 cells for valid months. */
  days: readonly CultivationCalendarMonthGridDay[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_WITH_EXPLICIT_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
const MAX_TEXT_LENGTH = 160;

interface ParsedMonthKey {
  year: number;
  monthIndex: number;
  monthKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeShortText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_TEXT_LENGTH);
}

function formatUtcDateKey(date: Date): string | null {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return null;

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (year < 1000 || year > 9999) return null;

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Accepts only a real YYYY-MM-DD UTC calendar date. */
function normalizeDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = DATE_KEY_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const normalized = formatUtcDateKey(date);
  return normalized === value.trim() ? normalized : null;
}

function parseMonthKey(value: unknown): ParsedMonthKey | null {
  if (typeof value !== "string") return null;
  const match = MONTH_KEY_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1000 || year > 9999 || month < 1 || month > 12) return null;

  return { year, monthIndex: month - 1, monthKey: `${match[1]}-${match[2]}` };
}

/**
 * Convert an explicit instant to its UTC day. Bare local-time strings are
 * deliberately rejected so the model cannot vary with the browser timezone.
 */
function utcDateKeyFromInstant(value: unknown): string | null {
  if (value instanceof Date) return formatUtcDateKey(value);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const directDateKey = normalizeDateKey(trimmed);
  if (directDateKey) return directDateKey;
  if (!ISO_WITH_EXPLICIT_ZONE_PATTERN.test(trimmed)) return null;

  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return null;
  return formatUtcDateKey(new Date(timestamp));
}

function utcIsoFromInstant(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_WITH_EXPLICIT_ZONE_PATTERN.test(value.trim())) {
    return null;
  }

  const timestamp = Date.parse(value.trim());
  if (!Number.isFinite(timestamp)) return null;
  try {
    return new Date(timestamp).toISOString();
  } catch {
    return null;
  }
}

function isHistoryCategory(value: unknown): value is CultivationCalendarHistoryCategory {
  return (
    value === "watering" || value === "feeding" || value === "training" || value === "environment"
  );
}

function loggedKindRank(kind: string): number {
  const index = CULTIVATION_CALENDAR_HISTORY_CATEGORIES.indexOf(
    kind as CultivationCalendarHistoryCategory,
  );
  return index === -1 ? CULTIVATION_CALENDAR_HISTORY_CATEGORIES.length : index;
}

function compareLoggedFacts(
  left: CultivationCalendarMonthGridLoggedFact,
  right: CultivationCalendarMonthGridLoggedFact,
): number {
  const leftRank = loggedKindRank(left.kind);
  const rightRank = loggedKindRank(right.kind);
  if (leftRank !== rightRank) return leftRank - rightRank;

  const kindComparison = compareText(left.kind, right.kind);
  if (kindComparison !== 0) return kindComparison;

  const idComparison = compareText(left.id, right.id);
  if (idComparison !== 0) return idComparison;
  return compareText(left.label, right.label);
}

function compareProjectedReviews(
  left: CultivationCalendarProjectedReviewBlock,
  right: CultivationCalendarProjectedReviewBlock,
): number {
  const timeComparison = compareText(left.scheduledAt, right.scheduledAt);
  if (timeComparison !== 0) return timeComparison;

  const categoryComparison = compareText(left.category, right.category);
  if (categoryComparison !== 0) return categoryComparison;
  return compareText(left.id, right.id);
}

function normalizeLoggedFact(value: unknown): CultivationCalendarMonthGridLoggedFact | null {
  if (!isRecord(value)) return null;
  const id = normalizeShortText(value.id);
  const kind = normalizeShortText(value.kind);
  const label = normalizeShortText(value.label);
  if (!id || !kind || !label) return null;
  return { id, kind, label };
}

/**
 * Clone only a complete, conservative projector block. The title check keeps
 * this grid from turning an arbitrary upstream item into an instruction.
 */
function normalizeProjectedReview(value: unknown): CultivationCalendarProjectedReviewBlock | null {
  if (!isRecord(value)) return null;

  const id = normalizeShortText(value.id);
  const scheduledAt = utcIsoFromInstant(value.scheduledAt);
  const title = value.title;
  const advisoryText = normalizeShortText(value.advisoryText);
  const sourceFactCount = value.sourceFactCount;
  const cadenceMs = value.cadenceMs;

  if (
    !id ||
    !scheduledAt ||
    !isHistoryCategory(value.category) ||
    title !== CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE ||
    !advisoryText ||
    typeof sourceFactCount !== "number" ||
    !Number.isSafeInteger(sourceFactCount) ||
    sourceFactCount < 3 ||
    typeof cadenceMs !== "number" ||
    !Number.isFinite(cadenceMs) ||
    cadenceMs <= 0
  ) {
    return null;
  }

  return {
    id,
    category: value.category,
    scheduledAt,
    title: CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE,
    advisoryText,
    sourceFactCount,
    cadenceMs,
  };
}

/**
 * Build a Sunday-first six-week grid for a month. For a valid month it always
 * returns 42 UTC cells. The caller must inject `today`; this pure helper never
 * reads the current clock and therefore has no implicit timezone behavior.
 */
export function buildCultivationCalendarMonthGrid(
  input: CultivationCalendarMonthGridInput,
): CultivationCalendarMonthGrid {
  const month = parseMonthKey(input?.monthKey);
  if (!month) return { monthKey: null, isValidMonth: false, days: [] };

  const firstOfMonth = new Date(Date.UTC(month.year, month.monthIndex, 1));
  const gridStartMs = firstOfMonth.getTime() - firstOfMonth.getUTCDay() * DAY_MS;
  const todayKey = utcDateKeyFromInstant(input?.today);

  const cells: Array<{
    dateKey: string;
    dayOfMonth: number;
    isInMonth: boolean;
    isToday: boolean;
    loggedFacts: CultivationCalendarMonthGridLoggedFact[];
    advisoryReviews: CultivationCalendarProjectedReviewBlock[];
  }> = [];
  const cellsByDateKey = new Map<string, (typeof cells)[number]>();

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStartMs + index * DAY_MS);
    const dateKey = formatUtcDateKey(date);
    if (!dateKey) {
      // The requested supported range cannot reach this branch, but fail
      // closed rather than constructing a partial month grid if it ever does.
      return { monthKey: null, isValidMonth: false, days: [] };
    }

    const cell = {
      dateKey,
      dayOfMonth: date.getUTCDate(),
      isInMonth: date.getUTCFullYear() === month.year && date.getUTCMonth() === month.monthIndex,
      isToday: todayKey === dateKey,
      loggedFacts: [],
      advisoryReviews: [],
    };
    cells.push(cell);
    cellsByDateKey.set(dateKey, cell);
  }

  const loggedGroups = Array.isArray(input?.loggedGroups) ? input.loggedGroups : [];
  for (const rawGroup of loggedGroups) {
    if (!isRecord(rawGroup)) continue;
    const dateKey = normalizeDateKey(rawGroup.dateKey);
    const cell = dateKey ? cellsByDateKey.get(dateKey) : undefined;
    if (!cell || !Array.isArray(rawGroup.events)) continue;

    for (const rawEvent of rawGroup.events) {
      const event = normalizeLoggedFact(rawEvent);
      if (event) cell.loggedFacts.push(event);
    }
  }

  const projectedReviews = Array.isArray(input?.projectedReviews) ? input.projectedReviews : [];
  for (const rawReview of projectedReviews) {
    const review = normalizeProjectedReview(rawReview);
    if (!review) continue;

    const cell = cellsByDateKey.get(review.scheduledAt.slice(0, 10));
    if (cell) cell.advisoryReviews.push(review);
  }

  const days: CultivationCalendarMonthGridDay[] = cells.map((cell) => {
    const loggedFacts = [...cell.loggedFacts].sort(compareLoggedFacts);
    const advisoryReviews = [...cell.advisoryReviews].sort(compareProjectedReviews);
    return {
      dateKey: cell.dateKey,
      dayOfMonth: cell.dayOfMonth,
      isInMonth: cell.isInMonth,
      isToday: cell.isToday,
      loggedFacts,
      advisoryReviews,
      hasLoggedFacts: loggedFacts.length > 0,
      hasAdvisoryReviews: advisoryReviews.length > 0,
    };
  });

  return { monthKey: month.monthKey, isValidMonth: true, days };
}
