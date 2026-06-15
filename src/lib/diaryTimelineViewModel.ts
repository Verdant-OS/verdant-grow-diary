/**
 * diaryTimelineViewModel — pure helpers for the polished diary timeline.
 *
 * Deterministic, presenter-safe. Owns only:
 *  - Deterministic timeline sort (occurred_at → created_at → id).
 *  - Empty / filtered-empty / no-history copy.
 *  - Action label selection.
 *  - Source classification that NEVER promotes manual/csv/demo/stale/
 *    invalid to "live".
 *
 * No I/O, no Supabase, no model calls, no alerts, no Action Queue writes.
 */

import {
  getDiaryTimelineActionStyle,
  type DiaryTimelineActionStyle,
} from "@/constants/diaryTimelineActionStyles";

export const DIARY_TIMELINE_EMPTY_TITLE = "No plant history yet.";
export const DIARY_TIMELINE_EMPTY_HINT =
  "Use Quick Log to log your first note, watering, photo, or environment check.";
export const DIARY_TIMELINE_FILTERED_EMPTY_COPY =
  "No entries match these filters.";

export type { DiaryTimelineActionStyle };

/**
 * Resolve the icon/tone/label view-model for a timeline entry kind.
 * Always returns a stable shape; unknown kinds fall back to a safe entry.
 */
export function getDiaryTimelineActionView(
  kind: string | null | undefined,
): DiaryTimelineActionStyle {
  return getDiaryTimelineActionStyle(kind);
}

export type DiaryTimelineSourceTag =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";

export interface DiaryTimelineSortable {
  id: string;
  /** Preferred occurrence timestamp (ISO). Falls back to captured_at. */
  occurred_at?: string | null;
  captured_at?: string | null;
  created_at?: string | null;
  /** Optional source tag — used for display, never to lie about freshness. */
  source?: string | null;
}

function tsValue(s: string | null | undefined): number {
  if (!s) return -Infinity;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : -Infinity;
}

/**
 * Deterministic newest-first ordering:
 *   1. occurred_at || captured_at desc
 *   2. created_at desc
 *   3. id ascending (stable tiebreaker)
 *
 * Returns a new array. Input is not mutated.
 */
export function sortDiaryTimelineEntries<T extends DiaryTimelineSortable>(
  entries: readonly T[] | null | undefined,
): T[] {
  const arr = Array.isArray(entries) ? [...entries] : [];
  arr.sort((a, b) => {
    const ao = tsValue(a.occurred_at ?? a.captured_at ?? null);
    const bo = tsValue(b.occurred_at ?? b.captured_at ?? null);
    if (ao !== bo) return bo - ao;
    const ac = tsValue(a.created_at ?? null);
    const bc = tsValue(b.created_at ?? null);
    if (ac !== bc) return bc - ac;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  return arr;
}

export interface DiaryTimelineEmptyStateInput {
  /** True when the unfiltered dataset has zero rows. */
  hasAnyEntries: boolean;
  /** True when any filter is active (kind, date range, etc.). */
  filtersActive: boolean;
}

export interface DiaryTimelineEmptyState {
  show: boolean;
  variant: "no-history" | "filtered-empty";
  title: string;
  hint: string | null;
}

/**
 * Choose the right empty-state copy for the timeline.
 * - No data at all → friendly Fast Add hint.
 * - Data exists but filters hide everything → filtered-empty copy.
 */
export function selectDiaryTimelineEmptyState(
  input: DiaryTimelineEmptyStateInput,
): DiaryTimelineEmptyState {
  if (input.hasAnyEntries && input.filtersActive) {
    return {
      show: true,
      variant: "filtered-empty",
      title: DIARY_TIMELINE_FILTERED_EMPTY_COPY,
      hint: null,
    };
  }
  if (!input.hasAnyEntries) {
    return {
      show: true,
      variant: "no-history",
      title: DIARY_TIMELINE_EMPTY_TITLE,
      hint: DIARY_TIMELINE_EMPTY_HINT,
    };
  }
  return { show: false, variant: "no-history", title: "", hint: null };
}

/**
 * Resolve a display label for a timeline entry kind. Stable, friendly,
 * and never "Live" unless the source is actually live.
 */
export function diaryTimelineActionLabel(kind: string | null | undefined): string {
  switch (kind) {
    case "observation":
    case "diary_note":
      return "Diary note";
    case "watering":
      return "Watering";
    case "feeding":
      return "Feeding";
    case "training":
      return "Training";
    case "defoliation":
      return "Defoliation";
    case "transplant":
      return "Transplant";
    case "photo":
      return "Photo";
    case "measurement":
      return "Measurement";
    case "environment":
      return "Environment check";
    case "diagnosis":
      return "Diagnosis";
    case "pest_disease":
      return "Pest / Disease";
    case "harvest":
      return "Harvest";
    case "action_followup":
      return "Follow-up";
    case "action_outcome":
      return "Outcome";
    default:
      return "Entry";
  }
}

const NEVER_LIVE: ReadonlySet<string> = new Set([
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
  "import",
]);

/**
 * Source-aware display tag. Hard rule: manual / csv / demo / stale /
 * invalid / import never render as "Live".
 */
export function classifyDiaryTimelineSource(
  raw: string | null | undefined,
): DiaryTimelineSourceTag {
  if (!raw) return "manual";
  const s = String(raw).toLowerCase();
  if (NEVER_LIVE.has(s)) {
    return s === "import" ? "csv" : (s as DiaryTimelineSourceTag);
  }
  if (s === "live") return "live";
  // Unknown / opaque sources: refuse to call them Live.
  return "manual";
}
