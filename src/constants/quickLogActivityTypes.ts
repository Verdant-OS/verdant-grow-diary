/**
 * quickLogActivityTypes — canonical Quick Log activity definitions for
 * Verdant V0 (One-Tent Loop).
 *
 * Pure constants. No React, no I/O, no persistence.
 *
 * Slice: Verdant Quick Log Activity Types v1a — no schema change.
 *
 * Rules (see project knowledge):
 *  - Only activities that map to existing safe persistence paths are
 *    marked `enabled: true`. Harvest is intentionally disabled here
 *    because the DB validator (`validate_grow_event`) does not include
 *    'harvest' and quicklog_save_event/quicklog_save_manual do not
 *    accept it. Enabling Harvest requires a separate v1b backend slice.
 *  - Safety copy is centralized here so JSX presenters cannot drift
 *    into recommendation/diagnosis language.
 *  - Defoliation persists as `event_type: "training"` with a
 *    metadata subtype fence (`details.subtype = "defoliation"`). The
 *    presenter must only render "Defoliation" when that fence is
 *    present — generic training stays labeled Training.
 */

export const QUICK_LOG_ACTIVITY_IDS = [
  "note",
  "photo",
  "watering",
  "feeding",
  "environment_check",
  "training",
  "defoliation",
  "issue_observation",
  "manual_sensor_snapshot",
  "harvest",
] as const;

export type QuickLogActivityId = (typeof QUICK_LOG_ACTIVITY_IDS)[number];

/**
 * Save route kind — describes which existing safe persistence path an
 * activity uses. `none` means the activity has no save path in this
 * slice (Harvest until v1b).
 */
export type QuickLogSaveRouteKind =
  | "manual_note"
  | "manual_water"
  | "event"
  | "manual_sensor_reading"
  | "none";

/**
 * Server-side event_type value used with `quicklog_save_event`.
 * Constrained to values the DB validator currently accepts:
 *   watering | feeding | training | observation | photo | environment
 */
export type QuickLogEventTypeValue =
  | "watering"
  | "feeding"
  | "training"
  | "observation"
  | "photo"
  | "environment";

export interface QuickLogActivityDefinition {
  id: QuickLogActivityId;
  /** Grower-facing label used in menus, buttons, timeline, saved breakdown. */
  label: string;
  /** Short description shown near the action. */
  description: string;
  /** Safety note — never a recommendation, never a diagnosis. */
  safetyNote: string;
  /** Which persistence path this activity uses. */
  saveRoute: QuickLogSaveRouteKind;
  /** Concrete event_type sent to quicklog_save_event, when applicable. */
  eventType?: QuickLogEventTypeValue;
  /** Metadata subtype fence for details, when applicable. */
  detailsSubtype?: string;
  /** Timeline card label. */
  timelineLabel: string;
  /** "What was saved" breakdown label. */
  savedBreakdownLabel: string;
  /** Whether this activity can be saved in v1a. */
  enabled: boolean;
  /** Grower-facing reason when disabled. Present iff enabled=false. */
  disabledReason?: string;
}

export const QUICK_LOG_HARVEST_DISABLED_REASON =
  "Harvest logging requires a backend update before it can be saved safely.";

export const QUICK_LOG_ACTIVITY_DEFINITIONS: Readonly<
  Record<QuickLogActivityId, QuickLogActivityDefinition>
> = Object.freeze({
  note: {
    id: "note",
    label: "Note",
    description: "Record a short plant note.",
    safetyNote: "A note is grower memory, not a diagnosis.",
    saveRoute: "manual_note",
    timelineLabel: "Note",
    savedBreakdownLabel: "Plant note",
    enabled: true,
  },
  photo: {
    id: "photo",
    label: "Photo",
    description: "Attach a photo to this plant's memory.",
    safetyNote: "A single photo is not a diagnosis by itself.",
    saveRoute: "event",
    eventType: "photo",
    timelineLabel: "Photo",
    savedBreakdownLabel: "Photo",
    enabled: true,
  },
  watering: {
    id: "watering",
    label: "Watering",
    description: "Record a watering event.",
    safetyNote: "Record what you watered. This log is not an irrigation recommendation.",
    saveRoute: "manual_water",
    timelineLabel: "Watering",
    savedBreakdownLabel: "Watering",
    enabled: true,
  },
  feeding: {
    id: "feeding",
    label: "Feeding",
    description: "Record what you fed.",
    safetyNote: "Record what you fed. This log is not a nutrient recommendation.",
    saveRoute: "event",
    eventType: "feeding",
    timelineLabel: "Feeding",
    savedBreakdownLabel: "Feeding",
    enabled: true,
  },
  environment_check: {
    id: "environment_check",
    label: "Environment check",
    description: "Log an environment observation.",
    safetyNote:
      "Environment checks are saved as manual observations, not live sensor data.",
    saveRoute: "event",
    eventType: "environment",
    timelineLabel: "Environment check",
    savedBreakdownLabel: "Environment check",
    enabled: true,
  },
  training: {
    id: "training",
    label: "Training",
    description: "Record training performed on this plant.",
    safetyNote:
      "Record training performed. This log does not mean the plant was safe to train.",
    saveRoute: "event",
    eventType: "training",
    timelineLabel: "Training",
    savedBreakdownLabel: "Training",
    enabled: true,
  },
  defoliation: {
    id: "defoliation",
    label: "Defoliation",
    description: "Record leaves removed.",
    safetyNote:
      "Record leaves removed. This log does not diagnose recovery or plant stress.",
    saveRoute: "event",
    eventType: "training",
    detailsSubtype: "defoliation",
    timelineLabel: "Defoliation",
    savedBreakdownLabel: "Defoliation",
    enabled: true,
  },
  issue_observation: {
    id: "issue_observation",
    label: "Issue / observation",
    description: "Record something you observed on the plant.",
    safetyNote: "Record what you observed. This is not a diagnosis by itself.",
    saveRoute: "event",
    eventType: "observation",
    detailsSubtype: "issue",
    timelineLabel: "Observation",
    savedBreakdownLabel: "Issue / observation",
    enabled: true,
  },
  manual_sensor_snapshot: {
    id: "manual_sensor_snapshot",
    label: "Manual sensor snapshot",
    description: "Record a manual sensor reading.",
    safetyNote:
      "Saved as manual, not live sensor data. Missing readings stay unknown, not healthy.",
    saveRoute: "manual_sensor_reading",
    timelineLabel: "Manual snapshot",
    savedBreakdownLabel:
      "Manual snapshot — saved as manual, not live sensor data",
    enabled: true,
  },
  harvest: {
    id: "harvest",
    label: "Harvest",
    description: "Record a harvest event.",
    safetyNote: QUICK_LOG_HARVEST_DISABLED_REASON,
    saveRoute: "none",
    timelineLabel: "Harvest",
    savedBreakdownLabel: "Harvest",
    enabled: false,
    disabledReason: QUICK_LOG_HARVEST_DISABLED_REASON,
  },
});

export const QUICK_LOG_ACTIVITY_LIST: readonly QuickLogActivityDefinition[] =
  QUICK_LOG_ACTIVITY_IDS.map((id) => QUICK_LOG_ACTIVITY_DEFINITIONS[id]);
