/**
 * timelineFilterRules — pure classification + filter predicates for the
 * Plant/Tent timeline memory view.
 *
 * Hard constraints:
 *  - Pure: no I/O, no Supabase, no React, no globals.
 *  - Never invents events; unknown event types fall back to "notes".
 *  - Manual sensor snapshot cards are always classified as
 *    "manual_sensor_snapshot" — never "live", "synced", "connected",
 *    or "imported".
 *  - "Warnings" filter pulls from existing validation metadata only.
 *
 * Filter buckets supported by the UI:
 *  - all
 *  - notes (diary / note entries)
 *  - watering
 *  - feeding
 *  - photos
 *  - manual_sensor_snapshot
 *  - warnings (any item whose existing metadata flags warning/invalid)
 *
 * The CHIP set is derived from the data in `timelineFilterViewModel` so
 * filters with zero matching items are hidden from the bar.
 */
import {
  classifyTimelineEntry,
  type TimelineFilterCategory,
} from "@/lib/timelineEntryClassification";
import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";

export type TimelineFilterKey =
  | "all"
  | "notes"
  | "watering"
  | "feeding"
  | "photos"
  | "manual_sensor_snapshot"
  | "warnings";

export const TIMELINE_FILTER_KEYS: ReadonlyArray<TimelineFilterKey> = [
  "all",
  "notes",
  "watering",
  "feeding",
  "photos",
  "manual_sensor_snapshot",
  "warnings",
];

export const TIMELINE_FILTER_LABELS: Record<TimelineFilterKey, string> = {
  all: "All",
  notes: "Diary / notes",
  watering: "Watering",
  feeding: "Feeding",
  photos: "Photos",
  manual_sensor_snapshot: "Manual sensor snapshots",
  warnings: "Warnings / issues",
};

export interface TimelineDiaryItem {
  kind: "diary";
  key: string;
  occurredAt: string;
  /** Raw diary event_type as persisted (may be null / unknown). */
  eventType: string | null;
  hasPhoto: boolean;
  note: string | null;
  /** Optional severity carried by upstream metadata. */
  hasWarning?: boolean;
}

export interface TimelineManualSnapshotItem {
  kind: "manual_sensor_snapshot";
  key: string;
  occurredAt: string;
  card: ManualSnapshotTimelineCard;
}

/**
 * Frozen AI Doctor sensor-evidence audit row, projected from
 * `ai_doctor_sessions`. Values are immutable snapshots from the moment of
 * the explicit run — later sensor updates never rewrite them.
 */
export interface TimelineAiDoctorEvidenceItem {
  kind: "ai_doctor_sensor_evidence_audit";
  key: string;
  occurredAt: string;
  status:
    | "usable"
    | "stale"
    | "invalid"
    | "needs_review"
    | "no_data";
  reasonCode: string | null;
  countsAsHealthyEvidence: boolean;
  mode: "healthy" | "cautionary" | "unsafe" | "missing";
}

export type TimelineMemoryItem =
  | TimelineDiaryItem
  | TimelineManualSnapshotItem
  | TimelineAiDoctorEvidenceItem;

/**
 * Map an item to the buckets it matches. An item can match multiple
 * buckets (a diary entry with a photo matches both "photos" and "notes"
 * if event_type is unknown; manual snapshots with warnings match both
 * "manual_sensor_snapshot" and "warnings").
 */
export function classifyTimelineMemoryItem(
  item: TimelineMemoryItem,
): ReadonlySet<TimelineFilterKey> {
  const buckets = new Set<TimelineFilterKey>(["all"]);

  if (item.kind === "manual_sensor_snapshot") {
    buckets.add("manual_sensor_snapshot");
    if (item.card.severity === "warning" || item.card.severity === "invalid") {
      buckets.add("warnings");
    }
    return buckets;
  }

  if (item.kind === "ai_doctor_sensor_evidence_audit") {
    // Always appears under "all"; non-healthy modes also surface under
    // "warnings" so growers can scan past evaluations that lacked
    // healthy sensor evidence.
    if (item.mode === "unsafe" || item.mode === "cautionary") {
      buckets.add("warnings");
    }
    return buckets;
  }

  // Diary item — delegate to the shared classifier.
  const cat: TimelineFilterCategory = classifyTimelineEntry({
    eventType: item.eventType,
    source: item.hasPhoto ? "photo" : "note",
  });
  if (cat === "photos") buckets.add("photos");
  if (cat === "watering") buckets.add("watering");
  if (cat === "feeding") buckets.add("feeding");
  if (cat === "notes") buckets.add("notes");
  // Other categories (symptoms/training/measurement/transplant/harvest/
  // reminder) are not exposed as top-level chips in this slice — they
  // still appear under "all". Unknown types fell through to "notes".
  if (item.hasWarning) buckets.add("warnings");
  return buckets;
}

/**
 * Predicate: does `item` belong in the currently-selected filter?
 */
export function timelineMemoryItemMatchesFilter(
  item: TimelineMemoryItem,
  filter: TimelineFilterKey,
): boolean {
  if (filter === "all") return true;
  return classifyTimelineMemoryItem(item).has(filter);
}

/**
 * Apply a filter to a list. Order is preserved (callers sort upstream).
 */
export function filterTimelineMemoryItems(
  items: ReadonlyArray<TimelineMemoryItem>,
  filter: TimelineFilterKey,
): TimelineMemoryItem[] {
  if (filter === "all") return [...items];
  return items.filter((i) => timelineMemoryItemMatchesFilter(i, filter));
}
