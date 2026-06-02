/**
 * aiDoctorContextReadiness — shared configuration for the AI Doctor
 * Context readiness panel.
 *
 * Hard constraints:
 *  - Pure constants. No React, no Supabase, no I/O.
 *  - Single source of truth for readiness thresholds and tooltip copy.
 *  - Consumed by `aiDoctorContextRules` and view-model helpers so UI
 *    components never duplicate these values inside JSX.
 */

/** How far back a timeline event counts as "recent". */
export const AI_DOCTOR_RECENT_EVENT_WINDOW_DAYS = 7;
/** How fresh a manual sensor snapshot must be to count as "fresh". */
export const AI_DOCTOR_SNAPSHOT_FRESH_HOURS = 48;

/** Shared, immutable readiness thresholds (in ms). */
export const AI_DOCTOR_CONTEXT_READINESS_CONFIG = Object.freeze({
  recentEventWindowMs:
    AI_DOCTOR_RECENT_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  snapshotFreshMs: AI_DOCTOR_SNAPSHOT_FRESH_HOURS * 60 * 60 * 1000,
});

export type AiDoctorContextReadinessConfig =
  typeof AI_DOCTOR_CONTEXT_READINESS_CONFIG;

/**
 * Concise tooltip / help copy for each readiness item exposed in the
 * panel. Keyed by the same short codes used by `aiDoctorContextRules`.
 *
 * Copy is calm, non-diagnostic, and never claims certainty.
 */
export const AI_DOCTOR_CONTEXT_TOOLTIPS: Readonly<Record<string, string>> =
  Object.freeze({
    "plant-profile": "A plant profile exists for this plant.",
    strain: "Present when the plant profile has a strain name.",
    stage: "Present when the plant has a known current stage.",
    medium: "Present when the plant profile has a growing medium.",
    "plant-photo": "Present when recent plant photo context exists.",
    "recent-timeline-activity":
      "Present when at least two timeline events were logged in the last 7 days.",
    "recent-watering-or-feeding":
      "Present when a watering or feeding entry was logged recently.",
    "recent-manual-sensor-snapshot":
      "Present when a manual sensor snapshot was logged in the last 7 days.",
    "fresh-manual-sensor-snapshot":
      "Present when a manual sensor snapshot was logged in the last 48 hours.",
    "recent-warnings":
      "Present when recent warnings or invalid sensor snapshots exist.",
  });

/** Missing-side tooltip overrides where wording should differ from evidence. */
export const AI_DOCTOR_CONTEXT_MISSING_TOOLTIPS: Readonly<
  Record<string, string>
> = Object.freeze({
  "recent-warnings":
    "No recent warnings or invalid sensor snapshots on file.",
  "plant-photo": "No recent plant photo context available.",
});
