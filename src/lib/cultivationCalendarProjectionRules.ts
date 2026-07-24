/**
 * cultivationCalendarProjectionRules — conservative, history-derived review
 * suggestions for the cultivation calendar.
 *
 * These blocks are advisory only. They describe a review opportunity inferred
 * from a sufficiently consistent log cadence; they never record care, change
 * a plant, or create a task.
 *
 * Pure: no I/O, network, clock reads, or writes.
 */

export const CULTIVATION_CALENDAR_HISTORY_CATEGORIES = [
  "watering",
  "feeding",
  "training",
  "environment",
] as const;

export type CultivationCalendarHistoryCategory =
  (typeof CULTIVATION_CALENDAR_HISTORY_CATEGORIES)[number];

export interface CultivationCalendarHistoryFact {
  category: CultivationCalendarHistoryCategory;
  /** ISO-like timestamp of a logged fact. */
  occurredAt: string | null | undefined;
  /** Optional opaque row id used only to make generated block ids stable. */
  id?: string | null;
}

export interface CultivationCalendarProjectedReviewBlock {
  /** Deterministic, opaque identifier for rendering and stable ordering. */
  id: string;
  category: CultivationCalendarHistoryCategory;
  /** Canonical UTC ISO timestamp for calendar placement. */
  scheduledAt: string;
  /** Short, honest title for the calendar block. */
  title: typeof CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE;
  /** Category-specific, non-prescriptive grower-facing copy. */
  advisoryText: string;
  /** Number of valid historical facts that informed this suggestion. */
  sourceFactCount: number;
  /** Median positive interval between its historical facts, in milliseconds. */
  cadenceMs: number;
}

export const CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE = "Suggested review based on recent logs";

const ISO_WITH_EXPLICIT_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

const CATEGORY_REVIEW_COPY: Readonly<Record<CultivationCalendarHistoryCategory, string>> = {
  watering: "Review watering readiness",
  feeding: "Review feeding context",
  training: "Review gentle training readiness",
  environment: "Review environmental conditions",
};

interface NormalizedHistoryFact {
  id: string;
  occurredAt: string;
  occurredAtMs: number;
}

function isHistoryCategory(value: unknown): value is CultivationCalendarHistoryCategory {
  return (
    value === "watering" || value === "feeding" || value === "training" || value === "environment"
  );
}

function normalizeUtcIso(value: unknown): { iso: string; ms: number } | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // A bare local timestamp would make cadence depend on the runtime timezone.
  // Logged dates must name an explicit instant before they can influence an
  // advisory review projection.
  if (!trimmed || !ISO_WITH_EXPLICIT_ZONE_PATTERN.test(trimmed)) return null;

  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;

  const date = new Date(ms);
  try {
    return { iso: date.toISOString(), ms };
  } catch {
    return null;
  }
}

function normalizeNow(now: Date | string): number | null {
  if (now instanceof Date) {
    const value = now.getTime();
    return Number.isFinite(value) ? value : null;
  }
  return normalizeUtcIso(now)?.ms ?? null;
}

function stableFactId(value: unknown, fallbackIso: string): string {
  if (typeof value !== "string") return fallbackIso;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 160) : fallbackIso;
}

function compareStableText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function deterministicMedian(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function nextReviewMs(latestMs: number, cadenceMs: number, nowMs: number): number | null {
  if (!Number.isFinite(latestMs) || !Number.isFinite(cadenceMs) || cadenceMs <= 0) {
    return null;
  }

  let reviewMs = latestMs + cadenceMs;
  if (!Number.isFinite(reviewMs)) return null;

  if (reviewMs < nowMs) {
    const intervalsToAdvance = Math.ceil((nowMs - reviewMs) / cadenceMs);
    reviewMs += intervalsToAdvance * cadenceMs;
  }

  return Number.isFinite(reviewMs) ? reviewMs : null;
}

function toUtcIso(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

/**
 * Build conservative calendar blocks from logged history. A category is
 * skipped in full when any of its facts is malformed, future-dated, or names
 * the same instant twice. That prevents a partial or ambiguous history from
 * being presented as a reliable cadence.
 */
export function buildCultivationCalendarProjectedReviewBlocks(
  history: readonly CultivationCalendarHistoryFact[] | null | undefined,
  now: Date | string,
): CultivationCalendarProjectedReviewBlock[] {
  const nowMs = normalizeNow(now);
  if (nowMs === null || !history || history.length === 0) return [];

  const factsByCategory = new Map<CultivationCalendarHistoryCategory, NormalizedHistoryFact[]>();
  const invalidCategories = new Set<CultivationCalendarHistoryCategory>();

  for (const fact of history) {
    if (!fact || !isHistoryCategory(fact.category)) continue;

    const normalized = normalizeUtcIso(fact.occurredAt);
    if (normalized === null || normalized.ms > nowMs) {
      invalidCategories.add(fact.category);
      continue;
    }

    const categoryFacts = factsByCategory.get(fact.category) ?? [];
    categoryFacts.push({
      id: stableFactId(fact.id, normalized.iso),
      occurredAt: normalized.iso,
      occurredAtMs: normalized.ms,
    });
    factsByCategory.set(fact.category, categoryFacts);
  }

  const blocks: CultivationCalendarProjectedReviewBlock[] = [];

  for (const category of CULTIVATION_CALENDAR_HISTORY_CATEGORIES) {
    if (invalidCategories.has(category)) continue;

    const categoryFacts = factsByCategory.get(category);
    if (!categoryFacts || categoryFacts.length < 3) continue;

    const orderedFacts = [...categoryFacts].sort((a, b) => {
      if (a.occurredAtMs !== b.occurredAtMs) return a.occurredAtMs - b.occurredAtMs;
      return compareStableText(a.id, b.id);
    });

    const observedTimes = new Set<number>();
    let hasDuplicateTimestamp = false;
    for (const fact of orderedFacts) {
      if (observedTimes.has(fact.occurredAtMs)) {
        hasDuplicateTimestamp = true;
        break;
      }
      observedTimes.add(fact.occurredAtMs);
    }
    if (hasDuplicateTimestamp) continue;

    const intervals = orderedFacts
      .slice(1)
      .map((fact, index) => fact.occurredAtMs - orderedFacts[index].occurredAtMs);
    if (intervals.some((interval) => !Number.isFinite(interval) || interval <= 0)) {
      continue;
    }

    const cadenceMs = deterministicMedian(intervals);
    if (cadenceMs === null || cadenceMs <= 0 || !Number.isFinite(cadenceMs)) continue;

    const latestFact = orderedFacts[orderedFacts.length - 1];
    const projectedMs = nextReviewMs(latestFact.occurredAtMs, cadenceMs, nowMs);
    const scheduledAt = projectedMs === null ? null : toUtcIso(projectedMs);
    if (scheduledAt === null) continue;

    blocks.push({
      id: `history-review:${category}:${encodeURIComponent(latestFact.id)}`,
      category,
      scheduledAt,
      title: CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE,
      advisoryText: `${CULTIVATION_CALENDAR_SUGGESTED_REVIEW_TITLE}. ${CATEGORY_REVIEW_COPY[category]}.`,
      sourceFactCount: orderedFacts.length,
      cadenceMs,
    });
  }

  return blocks.sort((a, b) => {
    if (a.scheduledAt !== b.scheduledAt) return compareStableText(a.scheduledAt, b.scheduledAt);
    if (a.category !== b.category) return compareStableText(a.category, b.category);
    return compareStableText(a.id, b.id);
  });
}

export const CULTIVATION_CALENDAR_STAGE_PALETTE = {
  seedling: {
    stage: "seedling",
    label: "Seedling",
    blockClassName: "border border-emerald-400/40 bg-emerald-500/15 text-emerald-100",
  },
  veg: {
    stage: "veg",
    label: "Vegetative",
    blockClassName: "border border-lime-400/40 bg-lime-500/15 text-lime-100",
  },
  flower: {
    stage: "flower",
    label: "Flowering",
    blockClassName: "border border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-100",
  },
  drying: {
    stage: "drying",
    label: "Drying / Curing",
    blockClassName: "border border-amber-400/40 bg-amber-500/15 text-amber-100",
  },
} as const;

export type CultivationCalendarStage = keyof typeof CULTIVATION_CALENDAR_STAGE_PALETTE;
export type CultivationCalendarStagePalette =
  (typeof CULTIVATION_CALENDAR_STAGE_PALETTE)[CultivationCalendarStage];

/** Returns null for missing or unfamiliar stages instead of inventing a color. */
export function resolveCultivationCalendarStagePalette(
  stage: unknown,
): CultivationCalendarStagePalette | null {
  if (stage === "seedling" || stage === "veg" || stage === "flower" || stage === "drying") {
    return CULTIVATION_CALENDAR_STAGE_PALETTE[stage];
  }
  return null;
}
