/**
 * Grower-facing copy for the AI Doctor readiness summary (spec #2809).
 * Consumed by `src/lib/aiDoctorReadinessSummaryRules.ts`; tests assert these exact strings.
 */

export const AI_DOCTOR_READINESS_SUMMARY_HEADLINES = {
  checking: "Checking the latest readings…",
  readError: "Sensor readings couldn't be loaded.",
  recovery: "Choose whether to include imported history first.",
  historicalReview: "Review would use imported history only, not current readings.",
  notEnoughContext: "Not enough recent context to review yet.",
  demoOnly: "Only demo sensor data. A review won't treat it as real readings.",
  telemetryLimited:
    "Sensor readings are stale or invalid. A review can run but can't rely on them.",
  ready: "Ready for a cautious review.",
  limited: "A review can run, with limited confidence.",
} as const;

export const AI_DOCTOR_READINESS_SUMMARY_NEXT_STEP_LABELS = {
  retry: "Try again",
  recovery: "Choose below",
  startReview: "Start review below",
} as const;

export const AI_DOCTOR_READINESS_SUMMARY_MISSING_LABELS = {
  "recent-manual-sensor-snapshot": "Add a manual tent reading",
  "root-zone-history": "Log a root-zone check",
  "recent-watering-or-feeding": "Log the last watering or feed",
  "recent-timeline-activity": "Add a recent note or check",
  "plant-profile": "Complete the plant profile",
  stage: "Set the growth stage",
  "plant-type": "Set autoflower or photoperiod",
  strain: "Add the strain",
  medium: "Add the growing medium",
  "plant-photo": "Add a plant photo",
} as const;

export const AI_DOCTOR_READINESS_SUMMARY_UNKNOWN_MISSING_LABEL = "Add missing context" as const;

export const AI_DOCTOR_READINESS_SUMMARY_NO_SENSOR_LINE = "No current tent readings." as const;

export const AI_DOCTOR_READINESS_SUMMARY_SCOPE_LABELS = {
  tent: "Tent",
  plant: "Plant",
} as const;

export const AI_DOCTOR_READINESS_SUMMARY_READINGS_WORD = "readings" as const;
export const AI_DOCTOR_READINESS_SUMMARY_FROM_WORD = "from" as const;
export const AI_DOCTOR_READINESS_SUMMARY_SEPARATOR = " · " as const;

export const AI_DOCTOR_READINESS_SUMMARY_UNKNOWN_SOURCE_LABEL = "Unknown source" as const;

export const AI_DOCTOR_READINESS_SUMMARY_AGE_UNKNOWN = "age unknown" as const;
export const AI_DOCTOR_READINESS_SUMMARY_AGE_JUST_NOW = "just now" as const;
export const AI_DOCTOR_READINESS_SUMMARY_AGE_SUFFIXES = {
  minutes: "min ago",
  hours: "h ago",
  days: "d ago",
} as const;

/** Plant Detail AI review: heading, provenance disclosure and missing-list labels. */
export const AI_DOCTOR_READINESS_SUMMARY_HEADING = "AI review readiness" as const;
export const AI_DOCTOR_READINESS_SUMMARY_PROVENANCE_LABEL = "How this was decided" as const;
export const AI_DOCTOR_READINESS_SUMMARY_MISSING_HEADING = "Missing" as const;
