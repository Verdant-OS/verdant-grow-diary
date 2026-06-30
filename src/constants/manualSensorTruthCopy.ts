/**
 * manualSensorTruthCopy — pre-save sensor truth context strings for the
 * manual sensor snapshot flow (Quick Log / Daily Check).
 *
 * Pure constants. No React, no I/O. Reused by the presenter so JSX does
 * not duplicate safety language.
 *
 * Rules enforced by these strings:
 *  - Manual data is never labeled live.
 *  - This card is not device control.
 *  - A single reading is not a plant-health diagnosis.
 *  - Missing readings stay unknown, never "healthy".
 *
 * Note: source-label vocabulary ("manual") matches
 *   SENSOR_SOURCE_SHORT_LABEL.manual in src/constants/sensorSourceLabels.ts.
 */

export const MANUAL_SENSOR_TRUTH_TITLE = "Manual snapshot" as const;

export const MANUAL_SENSOR_TRUTH_SOURCE_LINE =
  "Saved as manual, not live sensor data." as const;

export const MANUAL_SENSOR_TRUTH_NOT_DEVICE_CONTROL_LINE =
  "Not live device control." as const;

export const MANUAL_SENSOR_TRUTH_NOT_DIAGNOSIS_LINE =
  "Not a plant-health diagnosis." as const;

export const MANUAL_SENSOR_TRUTH_MISSING_READINGS_LINE =
  "Missing readings will stay unknown, not healthy." as const;

export const MANUAL_SENSOR_TRUTH_SUSPICIOUS_PREFIX =
  "Check this value before saving:" as const;

export const MANUAL_SENSOR_TRUTH_LINES = [
  MANUAL_SENSOR_TRUTH_SOURCE_LINE,
  MANUAL_SENSOR_TRUTH_NOT_DEVICE_CONTROL_LINE,
  MANUAL_SENSOR_TRUTH_NOT_DIAGNOSIS_LINE,
] as const;
