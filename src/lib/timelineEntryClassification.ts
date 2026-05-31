/**
 * timelineEntryClassification — single source of truth for mapping a
 * diary/QuickLog event into a presentation-only filter bucket used by
 * the Grow Timeline and Plant Relative Timeline.
 *
 * Strictly read-only:
 *  - Pure, deterministic, null-safe.
 *  - No I/O, no React, no side effects.
 *  - No writes, no automation, no device control, no service_role.
 *  - No sensor-ingest / webhook coupling.
 *
 * Why this lives alone:
 *  - Two render surfaces (`src/pages/Timeline.tsx` and
 *    `src/components/PlantRelativeTimelineSection.tsx`) historically
 *    each carried their own event-type → category mapping table. Drift
 *    between them silently misclassified QuickLog entries. This module
 *    is the only place the mapping is allowed to live.
 */

/**
 * Filter bucket for any timeline rendering surface. "all" is a UI-only
 * passthrough; every diary event resolves to one of the non-"all" keys.
 */
export type TimelineFilterCategory =
  | "photos"
  | "watering"
  | "feeding"
  | "symptoms"
  | "training"
  | "measurement"
  | "transplant"
  | "harvest"
  | "reminder"
  | "notes";

/** Event types QuickLog emits that map to the "symptoms" bucket. */
export const SYMPTOM_EVENT_TYPES: ReadonlySet<string> = new Set([
  "symptoms",
  "pest_disease",
  "diagnosis",
]);

/** Event types QuickLog emits that map to the "training" bucket. */
export const TRAINING_EVENT_TYPES: ReadonlySet<string> = new Set([
  "training",
  "defoliation",
]);

/** Event types that map to the "measurement" bucket (manual snapshots, pH/EC). */
export const MEASUREMENT_EVENT_TYPES: ReadonlySet<string> = new Set([
  "measurement",
  "manual_snapshot",
  "sensor_snapshot",
]);

/** Event types that map to the "transplant" bucket. */
export const TRANSPLANT_EVENT_TYPES: ReadonlySet<string> = new Set([
  "transplant",
  "repot",
]);

/** Event types that map to the "harvest" bucket. */
export const HARVEST_EVENT_TYPES: ReadonlySet<string> = new Set([
  "harvest",
  "dry",
  "drying",
  "cure",
  "curing",
]);

/** Event types that map to the "reminder" bucket. */
export const REMINDER_EVENT_TYPES: ReadonlySet<string> = new Set([
  "reminder",
  "action_followup",
]);

/**
 * Detail keys that flag a diary entry as containing a manual measurement
 * (used by the legacy Grow Timeline filter strip). Exported so
 * `Timeline.tsx` does not need to keep its own copy.
 */
export const MEASUREMENT_DETAIL_KEYS: ReadonlySet<string> = new Set([
  "ph",
  "ec",
  "runoff",
  "watering",
]);

export interface ClassifyTimelineEntryInput {
  /** QuickLog/diary event type string. Case-insensitive. */
  eventType: string | null | undefined;
  /** Best-guess source kind. "photo" wins regardless of eventType. */
  source?: "note" | "photo" | "sensor" | null | undefined;
}

/**
 * Classify a timeline entry into exactly one filter bucket.
 *
 * Rules (deterministic, in order):
 *  1. `source === "photo"` always wins → "photos".
 *  2. `eventType === "photo"` → "photos".
 *  3. Exact lowercase match against a named bucket set.
 *  4. Anything else (unknown, empty, null, malformed) → "notes".
 */
export function classifyTimelineEntry(
  input: ClassifyTimelineEntryInput | null | undefined,
): TimelineFilterCategory {
  if (!input) return "notes";
  const source = input.source ?? null;
  const type =
    typeof input.eventType === "string" ? input.eventType.toLowerCase().trim() : "";

  if (source === "photo") return "photos";
  if (type === "photo") return "photos";
  if (type === "watering") return "watering";
  if (type === "feeding") return "feeding";
  if (SYMPTOM_EVENT_TYPES.has(type)) return "symptoms";
  if (TRAINING_EVENT_TYPES.has(type)) return "training";
  if (MEASUREMENT_EVENT_TYPES.has(type)) return "measurement";
  if (TRANSPLANT_EVENT_TYPES.has(type)) return "transplant";
  if (HARVEST_EVENT_TYPES.has(type)) return "harvest";
  if (REMINDER_EVENT_TYPES.has(type)) return "reminder";
  return "notes";
}
