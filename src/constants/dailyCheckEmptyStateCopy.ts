/**
 * dailyCheckEmptyStateCopy — pre-localized, deterministic copy for the
 * /daily-check empty/blocked states.
 *
 * Pure constants. No React, no I/O. Reused by the presenter so JSX never
 * duplicates safety language.
 *
 * Rules enforced by these strings:
 *  - Missing context is never described as healthy.
 *  - Manual data is never relabeled as live.
 *  - No diagnosis from missing data.
 */

export const DAILY_CHECK_EMPTY_NO_TENT_TITLE = "Add a tent first." as const;
export const DAILY_CHECK_EMPTY_NO_TENT_BODY =
  "Quick Log needs at least one tent so sensor snapshots have a home. No tent context means readings stay unknown, not healthy." as const;

export const DAILY_CHECK_EMPTY_NO_PLANT_TITLE = "Add a plant first." as const;
export const DAILY_CHECK_EMPTY_NO_PLANT_BODY =
  "Quick Log is plant-centered. Without a plant, missing context stays unknown — never marked healthy." as const;

export const DAILY_CHECK_EMPTY_NO_SELECTED_PLANT_TITLE =
  "Pick a plant to log against." as const;
export const DAILY_CHECK_EMPTY_NO_SELECTED_PLANT_BODY =
  "Choose a plant above. Missing plant context stays unknown — Quick Log will not assume the plant is healthy." as const;

export const DAILY_CHECK_EMPTY_PLANT_NEEDS_TENT_TITLE =
  "Assign a tent to this plant." as const;
export const DAILY_CHECK_EMPTY_PLANT_NEEDS_TENT_BODY =
  "Sensor snapshots need a tent assignment. Without one, manual readings can't be attached and missing data stays unknown." as const;

export const DAILY_CHECK_EMPTY_GO_TO_PLANTS_LABEL = "Go to Plants" as const;
export const DAILY_CHECK_EMPTY_GO_TO_TENTS_LABEL = "Go to Tents" as const;
export const DAILY_CHECK_EMPTY_OPEN_TIMELINE_LABEL = "Open Timeline" as const;
export const DAILY_CHECK_EMPTY_OPEN_SENSORS_LABEL = "Open Sensors" as const;
