/**
 * cureSpaceSetupFields — canonical option values + labels for the V0
 * `cure_space_setup` Quick Log event detail fields.
 *
 * Pure constants. No React, no I/O.
 *
 * Hard rules:
 *  - Setup fields are operator-entered grow memory. They are NEVER
 *    treated as live telemetry, and Verdant does not score, gate, or
 *    automate cure decisions from them.
 *  - This module emits no alerts and no Action Queue items.
 */

export const CURE_SPACE_SETUP_EVENT_TYPE = "cure_space_setup" as const;
export type CureSpaceSetupEventType = typeof CURE_SPACE_SETUP_EVENT_TYPE;

export const CURE_BAG_SIZE_TYPES = [
  "1lb",
  "5lb",
  "10lb",
  "32oz",
  "16oz",
  "other",
  "unknown",
] as const;
export type CureBagSizeType = (typeof CURE_BAG_SIZE_TYPES)[number];

export const CURE_BAG_ARRANGEMENTS = [
  "spaced",
  "tight",
  "stacked",
  "single_layer",
  "unknown",
] as const;
export type CureBagArrangement = (typeof CURE_BAG_ARRANGEMENTS)[number];

export const CURE_VENTILATION_METHODS = [
  "passive_only",
  "gentle_indirect_fan",
  "strong_direct_fan",
  "intake_exhaust_pair",
  "unknown",
] as const;
export type CureVentilationMethod = (typeof CURE_VENTILATION_METHODS)[number];

export const CURE_BUFFERING_METHODS = [
  "none",
  "boveda",
  "integra",
  "other",
  "unknown",
] as const;
export type CureBufferingMethod = (typeof CURE_BUFFERING_METHODS)[number];

/** Numeric bounds (presentation-only validation, not health scoring). */
export const CURE_SPACE_VOLUME_MAX_M3 = 100;
export const CURE_SPACE_FLOOR_PCT_MIN = 0;
export const CURE_SPACE_FLOOR_PCT_MAX = 100;
export const CURE_SPACE_OPEN_AREA_MAX_CM2 = 100_000;
export const CURE_SPACE_BAG_COUNT_MAX = 1_000;
export const CURE_SPACE_PACKS_PER_BAG_MAX = 50;
export const CURE_SPACE_TEMP_MIN_C = -10;
export const CURE_SPACE_TEMP_MAX_C = 60;
export const CURE_SPACE_DELTA_T_MIN_C = -30;
export const CURE_SPACE_DELTA_T_MAX_C = 30;
export const CURE_SPACE_BUFFER_RH_MIN = 0;
export const CURE_SPACE_BUFFER_RH_MAX = 100;

/**
 * Cautious copy. Verdant never claims certainty of cure outcomes or
 * "competition-grade guaranteed" results from setup memory.
 */
export const CURE_SPACE_SETUP_RECORDED_NOTE =
  "Operator-entered setup context recorded as grow memory.";
export const CURE_SPACE_SETUP_TIGHT_ARRANGEMENT_NOTE =
  "Needs review: tight bag arrangement may restrict airflow between bags.";
export const CURE_SPACE_SETUP_HIGH_FLOOR_USE_NOTE =
  "Needs review: high floor-space usage may limit airflow paths around bags.";
export const CURE_SPACE_SETUP_STRONG_VENTILATION_NOTE =
  "Caution: strong direct ventilation can dry bags too quickly. Grower review required.";
export const CURE_SPACE_SETUP_MISSING_SOURCE_NOTE =
  "Needs review: setup measurements lack a labeled sensor snapshot source.";
