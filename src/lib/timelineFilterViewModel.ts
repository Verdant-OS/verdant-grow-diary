/**
 * timelineFilterViewModel — pure chip + empty-state shaping for the
 * Plant/Tent timeline memory filter bar.
 *
 * Hard constraints:
 *  - Pure: no I/O, no React, no globals.
 *  - Chips with zero matching items (other than "all") are hidden so
 *    growers never see filters that would invent empty buckets.
 *  - Empty state copy is the literal: "No events match this filter."
 */
import {
  classifyTimelineMemoryItem,
  TIMELINE_FILTER_KEYS,
  TIMELINE_FILTER_LABELS,
  type TimelineFilterKey,
  type TimelineMemoryItem,
} from "@/lib/timelineFilterRules";

export const TIMELINE_FILTER_EMPTY_STATE_COPY =
  "No events match this filter." as const;

export interface TimelineFilterChip {
  key: TimelineFilterKey;
  label: string;
  count: number;
  selected: boolean;
}

/**
 * Count how many items belong to each filter bucket.
 */
export function countTimelineFilterBuckets(
  items: ReadonlyArray<TimelineMemoryItem>,
): Record<TimelineFilterKey, number> {
  const counts: Record<TimelineFilterKey, number> = {
    all: items.length,
    notes: 0,
    watering: 0,
    feeding: 0,
    photos: 0,
    manual_sensor_snapshot: 0,
    warnings: 0,
  };
  for (const item of items) {
    const buckets = classifyTimelineMemoryItem(item);
    for (const k of TIMELINE_FILTER_KEYS) {
      if (k === "all") continue;
      if (buckets.has(k)) counts[k] += 1;
    }
  }
  return counts;
}

/**
 * Build the visible chip list. "all" is always present; the rest are
 * shown only when they have ≥1 matching item in the data set.
 */
export function buildTimelineFilterChips(
  items: ReadonlyArray<TimelineMemoryItem>,
  selected: TimelineFilterKey,
): TimelineFilterChip[] {
  const counts = countTimelineFilterBuckets(items);
  const chips: TimelineFilterChip[] = [];
  for (const key of TIMELINE_FILTER_KEYS) {
    const count = counts[key];
    if (key !== "all" && count === 0) continue;
    chips.push({
      key,
      label: TIMELINE_FILTER_LABELS[key],
      count,
      selected: selected === key,
    });
  }
  return chips;
}

/**
 * Should the filter be considered "reset"? Useful for the Show all CTA.
 */
export function isTimelineFilterReset(selected: TimelineFilterKey): boolean {
  return selected === "all";
}

export const TIMELINE_FILTER_RESET_KEY: TimelineFilterKey = "all";
