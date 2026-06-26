/**
 * dryPhaseCheckFields — canonical option values + labels for the V0
 * `dry_phase_check` Quick Log event detail fields.
 *
 * Pure constants. No React, no I/O.
 *
 * Hard rules:
 *  - Dry phase checks are grower observations + optional sensor context.
 *    They are NEVER auto-scored, and never trigger alerts or Action
 *    Queue items from this layer.
 */

export const DRY_PHASE_CHECK_EVENT_TYPE = "dry_phase_check" as const;
export type DryPhaseCheckEventType = typeof DRY_PHASE_CHECK_EVENT_TYPE;

export const DRY_STEM_SNAP_STATUSES = [
  "bends",
  "partial_snap",
  "clean_snap",
  "unknown",
] as const;
export type DryStemSnapStatus = (typeof DRY_STEM_SNAP_STATUSES)[number];

export const DRY_BUD_FEEL_VALUES = [
  "wet",
  "tacky",
  "dry_outside_moist_inside",
  "crispy",
  "unknown",
] as const;
export type DryBudFeel = (typeof DRY_BUD_FEEL_VALUES)[number];

/**
 * Reuse the Grove Bag airflow taxonomy — same operator observation set,
 * same caution semantics (strong_direct → caution, stagnant → review).
 * Imported by the rules module; not re-exported here to keep this file
 * dependency-free.
 */

export const DRY_AMBIENT_TEMP_MIN_C = -10;
export const DRY_AMBIENT_TEMP_MAX_C = 60;
export const DRY_AMBIENT_RH_MIN = 0;
export const DRY_AMBIENT_RH_MAX = 100;
export const DRY_VPD_MIN_KPA = 0;
export const DRY_VPD_MAX_KPA = 5;
export const DRY_DAY_MAX = 60;

export const DRY_PHASE_RECORDED_NOTE =
  "Dry phase observation recorded as grow memory.";
export const DRY_PHASE_MOLD_CONCERN_NOTE =
  "Observed concern — grower decision required. Inspect closely and document next observation.";
export const DRY_PHASE_STRONG_AIRFLOW_NOTE =
  "Caution: strong direct airflow can over-dry exterior buds. Grower review required.";
export const DRY_PHASE_STAGNANT_AIRFLOW_NOTE =
  "Needs review: stagnant air can allow localized humidity buildup.";
export const DRY_PHASE_OUT_OF_RANGE_NOTE =
  "Needs review: ambient reading outside typical drying range.";
