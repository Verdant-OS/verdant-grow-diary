/** Canonical, model-facing provenance copy for AI Doctor history summaries. */
export const AI_DOCTOR_CSV_HISTORY_LABEL = "CSV history";
export const AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE =
  "This is imported CSV history, not live telemetry. Do not diagnose from CSV history alone.";
export const AI_DOCTOR_IMPORTED_SENSOR_HISTORY_SECTION_LABEL = "Imported sensor history";
export const AI_DOCTOR_IMPORTED_SENSOR_HISTORY_TREND_NOTE =
  "Imported history may show trends but is not proof of current conditions.";
export const AI_DOCTOR_IMPORTED_SENSOR_HISTORY_GUIDANCE = Object.freeze([
  AI_DOCTOR_CSV_HISTORY_NOT_LIVE_NOTE,
  AI_DOCTOR_IMPORTED_SENSOR_HISTORY_TREND_NOTE,
] as const);
