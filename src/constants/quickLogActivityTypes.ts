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
 *    marked `enabled: true`. Contextual constraints such as Harvest stage
 *    eligibility live in pure rules and are re-checked before persistence.
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
 * Optional Harvest detail payload persisted under
 * `grow_events.details.harvest`. All fields are optional — a Harvest
 * log with only a note is valid. Values stay as strings so the exact
 * grower-entered precision is preserved and no unit is ever invented.
 */
export type QuickLogWeightUnit = "g" | "oz" | "lb" | "kg";
export const QUICK_LOG_WEIGHT_UNITS: readonly QuickLogWeightUnit[] = [
  "g",
  "oz",
  "lb",
  "kg",
] as const;

export interface QuickLogHarvestDetails {
  wetWeight?: string;
  dryWeight?: string;
  weightUnit?: QuickLogWeightUnit;
  /**
   * Slice A3.2 — canonical grams + grower's ORIGINAL value+unit,
   * additive to the Vocab A fields above. Present ONLY when the grower
   * entered a non-`g` unit (oz/lb/kg), so g-only entries keep their
   * original persisted shape unchanged (backward compatible).
   * Timeline presenter renders "2 lb (907.18 g)" when both exist.
   */
  wet_weight_grams?: number;
  dry_weight_grams?: number;
  original_wet_weight?: string;
  original_dry_weight?: string;
  original_weight_unit?: QuickLogWeightUnit;
}

/**
 * Save route kind — describes which existing safe persistence path an
 * activity uses. `none` means the activity has no safe save path.
 */
export type QuickLogSaveRouteKind =
  "manual_note" | "structured_water" | "event" | "manual_sensor_reading" | "none";

/**
 * Server-side event_type value used with `quicklog_save_event`.
 * Constrained to values the DB validator currently accepts.
 */
export type QuickLogEventTypeValue =
  "watering" | "feeding" | "training" | "observation" | "photo" | "environment" | "harvest";

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
  /** Whether this activity has a supported persistence route. */
  enabled: boolean;
  /** Grower-facing reason when disabled. Present iff enabled=false. */
  disabledReason?: string;
}

/**
 * Shown when an eligible Harvest save reaches an out-of-date backend that
 * still rejects the event type.
 */
export const QUICK_LOG_HARVEST_BACKEND_UNAVAILABLE_REASON =
  "Harvest logging is not enabled on this backend yet.";

/**
 * Marker written into p_details on every new Quick Log note save. A note and
 * an issue both persist as an `observation` grow_events row, so only the diary
 * mirror's details can tell them apart. Older notes have no marker and keep
 * their existing heading.
 */
export const QUICK_LOG_NOTE_MARKER_KEY = "quick_log_activity";
export const QUICK_LOG_NOTE_MARKER_VALUE = "note";

/** Tile copy is still being worded; placeholders stay greppable until then. */
export const QUICK_LOG_NOTE_TILE_COPY = {
  label: "TODO_COPY: Quick note",
  description: "TODO_COPY: Anything you want to remember.",
} as const;

export const QUICK_LOG_ISSUE_TILE_COPY = {
  label: "TODO_COPY: Problem spotted",
  description: "TODO_COPY: Something looks off (leaves, pests, smell).",
} as const;

/** Heading for a saved issue (observation + subtype "issue"). */
export const QUICK_LOG_ISSUE_TIMELINE_LABEL = "Issue";

/** Heading for any other observation, including old unmarked notes. */
export const QUICK_LOG_OBSERVATION_TIMELINE_LABEL = "Observation";

export const QUICK_LOG_ACTIVITY_DEFINITIONS: Readonly<
  Record<QuickLogActivityId, QuickLogActivityDefinition>
> = Object.freeze({
  note: {
    id: "note",
    label: QUICK_LOG_NOTE_TILE_COPY.label,
    description: QUICK_LOG_NOTE_TILE_COPY.description,
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
    saveRoute: "structured_water",
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
    safetyNote: "Environment checks are saved as manual observations, not live sensor data.",
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
    safetyNote: "Record training performed. This log does not mean the plant was safe to train.",
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
    safetyNote: "Record leaves removed. This log does not diagnose recovery or plant stress.",
    saveRoute: "event",
    eventType: "training",
    detailsSubtype: "defoliation",
    timelineLabel: "Defoliation",
    savedBreakdownLabel: "Defoliation",
    enabled: true,
  },
  issue_observation: {
    id: "issue_observation",
    label: QUICK_LOG_ISSUE_TILE_COPY.label,
    description: QUICK_LOG_ISSUE_TILE_COPY.description,
    safetyNote: "Record what you observed. This is not a diagnosis by itself.",
    saveRoute: "event",
    eventType: "observation",
    detailsSubtype: "issue",
    timelineLabel: QUICK_LOG_ISSUE_TIMELINE_LABEL,
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
    savedBreakdownLabel: "Manual snapshot — saved as manual, not live sensor data",
    enabled: true,
  },
  harvest: {
    id: "harvest",
    label: "Harvest",
    description: "Record a harvest event.",
    safetyNote: "Record harvest activity. This does not claim harvest readiness or final yield.",
    saveRoute: "event",
    eventType: "harvest",
    timelineLabel: "Harvest",
    savedBreakdownLabel: "Harvest",
    enabled: true,
  },
});

export const QUICK_LOG_ACTIVITY_LIST: readonly QuickLogActivityDefinition[] =
  QUICK_LOG_ACTIVITY_IDS.map((id) => QUICK_LOG_ACTIVITY_DEFINITIONS[id]);
