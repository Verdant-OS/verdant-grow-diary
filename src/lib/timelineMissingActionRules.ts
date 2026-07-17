/**
 * timelineMissingActionRules — pure "next missing action" inference for
 * the diary Timeline.
 *
 * Reads the grower's own logged history and infers, per care category
 * (watering, feeding, training, environment checks), the typical gap
 * between entries. When the time since the newest entry of a category
 * exceeds that typical gap, the category is surfaced as a suggestion the
 * grower can jump to — nothing more.
 *
 * Hard constraints:
 *  - Pure: no I/O, no Supabase, no React, no DOM, no clock reads — `now`
 *    is always injected by the caller.
 *  - Read-only over rows the caller already loaded. Never invents data.
 *  - Suggestion-only by doctrine: this module describes what the logged
 *    history shows, never claims certainty, and never acts on its own.
 *    The grower decides.
 *  - Event-type classification is delegated to the canonical
 *    `classifyTimelineEntry` — no local classification tables beyond the
 *    explicit "environment" token, which the canonical classifier files
 *    under notes for chip purposes but which is a care category here.
 */

import { classifyTimelineEntry } from "@/lib/timelineEntryClassification";

export type MissingActionCategory =
  | "watering"
  | "feeding"
  | "training"
  | "environment";

/** Stable priority order used to break ties between equally-late categories. */
export const MISSING_ACTION_CATEGORIES: ReadonlyArray<MissingActionCategory> = [
  "watering",
  "feeding",
  "environment",
  "training",
];

export const MISSING_ACTION_CATEGORY_LABELS: Readonly<
  Record<MissingActionCategory, string>
> = Object.freeze({
  watering: "Watering",
  feeding: "Feeding",
  training: "Training",
  environment: "Environment check",
});

/** Minimum entries of a category before a rhythm is inferred at all. */
export const MISSING_ACTION_MIN_SAMPLES = 3;
/** Inferred gaps are clamped to this sane range, in days. */
export const MISSING_ACTION_MIN_GAP_DAYS = 1;
export const MISSING_ACTION_MAX_GAP_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Loose row shape shared by diary entries and mapped grow events. */
export interface MissingActionRow {
  id: string;
  entry_at?: string | null;
  details?: Record<string, unknown> | null;
}

export interface CareCadence {
  category: MissingActionCategory;
  /** Median gap between consecutive entries, clamped, in whole days. */
  typicalGapDays: number;
  /** ISO timestamp of the newest entry in the category. */
  lastAtIso: string;
  sampleCount: number;
}

export interface MissingActionSuggestion {
  category: MissingActionCategory;
  categoryLabel: string;
  typicalGapDays: number;
  daysSinceLast: number;
  lastAtIso: string;
}

export type MissingActionResult =
  | { status: "found"; suggestion: MissingActionSuggestion }
  | { status: "nothing_missing" }
  | { status: "not_enough_history" };

function rowTimestampMs(row: MissingActionRow): number | null {
  if (typeof row?.entry_at !== "string" || row.entry_at === "") return null;
  const t = new Date(row.entry_at).getTime();
  return Number.isFinite(t) ? t : null;
}

function rowEventType(row: MissingActionRow): string | null {
  const v = row?.details ? row.details["event_type"] : null;
  return typeof v === "string" && v.trim() !== "" ? v.trim().toLowerCase() : null;
}

/**
 * Resolve a row's care category, or null when the row is not a care
 * entry (notes, photos, symptoms, reminders, harvest, transplant).
 */
export function resolveMissingActionCategory(
  row: MissingActionRow,
): MissingActionCategory | null {
  const eventType = rowEventType(row);
  if (eventType === null) return null;
  // "environment" is the canonical Quick Log environment-check token; the
  // shared classifier buckets it under notes for chip rendering, so it is
  // resolved explicitly before delegating.
  if (eventType === "environment" || eventType === "environment_check") {
    return "environment";
  }
  const bucket = classifyTimelineEntry({ eventType });
  if (bucket === "watering" || bucket === "feeding" || bucket === "training") {
    return bucket;
  }
  // Manual/sensor snapshots and pH/EC measurements are environment evidence.
  if (bucket === "measurement") return "environment";
  return null;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Infer the typical logging rhythm for one category from the rows.
 * Returns null when fewer than MISSING_ACTION_MIN_SAMPLES entries carry a
 * parseable timestamp — not enough history is never guessed around.
 */
export function inferCareCadence(
  rows: ReadonlyArray<MissingActionRow>,
  category: MissingActionCategory,
): CareCadence | null {
  const stamps: Array<{ ms: number; iso: string }> = [];
  for (const row of rows ?? []) {
    if (resolveMissingActionCategory(row) !== category) continue;
    const ms = rowTimestampMs(row);
    if (ms === null) continue;
    stamps.push({ ms, iso: row.entry_at as string });
  }
  if (stamps.length < MISSING_ACTION_MIN_SAMPLES) return null;
  stamps.sort((a, b) => a.ms - b.ms);
  const gaps: number[] = [];
  for (let i = 1; i < stamps.length; i += 1) {
    const gapDays = (stamps[i].ms - stamps[i - 1].ms) / DAY_MS;
    if (gapDays > 0) gaps.push(gapDays);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const typical = Math.min(
    MISSING_ACTION_MAX_GAP_DAYS,
    Math.max(MISSING_ACTION_MIN_GAP_DAYS, Math.round(median(gaps))),
  );
  return {
    category,
    typicalGapDays: typical,
    lastAtIso: stamps[stamps.length - 1].iso,
    sampleCount: stamps.length,
  };
}

/**
 * Find the care category most beyond its own logged rhythm right now.
 * "Missing" means: days since the newest entry of the category exceed the
 * category's typical gap. The most-behind category (largest overshoot in
 * days) wins; ties resolve by MISSING_ACTION_CATEGORIES order.
 */
export function findNextMissingAction(
  rows: ReadonlyArray<MissingActionRow>,
  now: Date,
): MissingActionResult {
  const nowMs = now.getTime();
  let best: { overshoot: number; suggestion: MissingActionSuggestion } | null = null;
  let sawCadence = false;
  for (const category of MISSING_ACTION_CATEGORIES) {
    const cadence = inferCareCadence(rows, category);
    if (!cadence) continue;
    sawCadence = true;
    const daysSinceLast = (nowMs - new Date(cadence.lastAtIso).getTime()) / DAY_MS;
    const overshoot = daysSinceLast - cadence.typicalGapDays;
    if (overshoot <= 0) continue;
    if (best === null || overshoot > best.overshoot) {
      best = {
        overshoot,
        suggestion: {
          category,
          categoryLabel: MISSING_ACTION_CATEGORY_LABELS[category],
          typicalGapDays: cadence.typicalGapDays,
          daysSinceLast: Math.floor(daysSinceLast),
          lastAtIso: cadence.lastAtIso,
        },
      };
    }
  }
  if (best) return { status: "found", suggestion: best.suggestion };
  return sawCadence
    ? { status: "nothing_missing" }
    : { status: "not_enough_history" };
}

/**
 * Newest row id for a category — the timeline anchor the UI scrolls to so
 * the grower lands on the last time they logged that care. Null when the
 * category has no timestamped rows in the list.
 */
export function findNewestEntryIdForCategory(
  rows: ReadonlyArray<MissingActionRow>,
  category: MissingActionCategory,
): string | null {
  let bestMs = -1;
  let bestId: string | null = null;
  for (const row of rows ?? []) {
    if (resolveMissingActionCategory(row) !== category) continue;
    const ms = rowTimestampMs(row);
    if (ms === null || ms <= bestMs) continue;
    bestMs = ms;
    bestId = row.id;
  }
  return bestId;
}

export function buildMissingActionCopy(s: MissingActionSuggestion): string {
  const days = s.daysSinceLast === 1 ? "1 day" : `${s.daysSinceLast} days`;
  const gap =
    s.typicalGapDays === 1 ? "every day" : `about every ${s.typicalGapDays} days`;
  return `${s.categoryLabel} may be due — last logged ${days} ago; your logged rhythm is ${gap}.`;
}

export const MISSING_ACTION_NOT_ENOUGH_HISTORY_COPY =
  "Not enough logged history yet to infer a care rhythm. Keep logging and this improves.";
export const MISSING_ACTION_NOTHING_MISSING_COPY =
  "Nothing looks behind its usual rhythm in your logged history.";
export const MISSING_ACTION_DISCLAIMER_COPY =
  "Based only on your logged history. You decide what your plants need.";
