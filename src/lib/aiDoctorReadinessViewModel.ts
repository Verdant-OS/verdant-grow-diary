/**
 * aiDoctorReadinessViewModel — pure presenter mapping for the AI Doctor
 * Context Readiness panel.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no fetch, no Action Queue writes.
 *  - Deterministic for a given context + open-alerts count.
 *  - Source labels are honest: demo/stale/invalid are NEVER presented as live.
 *  - Output is presentation-only; never persists, never calls an external model.
 */

import {
  generateAiDoctorResult,
  type AiDoctorContext,
} from "@/lib/aiDoctorEngine";
import {
  assessContextStrength,
  type AiDoctorResult,
} from "@/lib/aiDoctorSafetyRules";
import type { SensorSourceTag } from "@/lib/aiDoctorContextCompiler";

export type AiDoctorReadinessState =
  | "ready"
  | "needs_more_context"
  | "sensor_missing"
  | "telemetry_limited"
  | "demo_only";

export const AI_DOCTOR_READINESS_STATE_LABELS: Record<
  AiDoctorReadinessState,
  string
> = Object.freeze({
  ready: "Ready for cautious check-in",
  needs_more_context: "Needs more context",
  sensor_missing: "Sensor data missing",
  telemetry_limited: "Telemetry limited or stale",
  demo_only: "Demo data only",
});

export const AI_DOCTOR_SOURCE_LABELS: Record<SensorSourceTag, string> =
  Object.freeze({
    live: "Live",
    manual: "Manual",
    csv: "CSV / imported",
    demo: "Demo",
    stale: "Stale",
    invalid: "Invalid",
  });

export interface AiDoctorReadinessSourceBadge {
  source: SensorSourceTag;
  label: string;
  sampleCount: number;
  isTrustworthy: boolean;
}

export interface AiDoctorReadinessLimitation {
  code:
    | "stale_or_invalid"
    | "demo_only"
    | "no_sensors"
    | "no_recent_events"
    | "missing_stage";
  message: string;
}

/**
 * Coarse confidence/trust class derived from the existing AI Doctor
 * context. Distinguishes:
 *  - "ready"          — trustworthy live/manual evidence + recent events.
 *  - "limited"        — context can run, but the answer may be weak.
 *  - "not_trustworthy" — sensor data is stale/invalid/demo-only and
 *                       must not be presented as healthy live data.
 */
export type AiDoctorReadinessConfidenceClass =
  | "ready"
  | "limited"
  | "not_trustworthy";

export const AI_DOCTOR_CONFIDENCE_CLASS_COPY: Record<
  AiDoctorReadinessConfidenceClass,
  string
> = Object.freeze({
  ready:
    "Context looks strong enough for a more useful AI Doctor check.",
  limited:
    "AI Doctor can run, but the answer may be limited until more evidence is added.",
  not_trustworthy:
    "Sensor context is not trustworthy enough to rely on. Add or verify readings before using them for diagnosis.",
});

/**
 * Evidence flags derived purely from existing AI Doctor context fields.
 * No caller-supplied extras: watering / feeding / photo / unknown
 * stage / unknown medium / unknown pot size all come from the context
 * payload itself. Open-alerts uses the count already threaded into the
 * view-model. Medium and pot size are not yet tracked on the Phase 1
 * payload — they are reported as `unknown` so the panel can prompt the
 * grower, never inferred or guessed.
 */
export interface AiDoctorContextEvidenceFlags {
  hasRecentWatering: boolean;
  hasRecentFeeding: boolean;
  hasRecentPhoto: boolean;
  hasOpenAlerts: boolean;
  hasUnknownStage: boolean;
  hasUnknownMedium: boolean;
  hasUnknownPotSize: boolean;
}

export interface AiDoctorReadinessView {
  state: AiDoctorReadinessState;
  stateLabel: string;
  confidenceClass: AiDoctorReadinessConfidenceClass;
  confidenceClassCopy: string;
  evidenceFlags: AiDoctorContextEvidenceFlags;
  plantIdentity: {
    plantId: string | null;
    plantName: string | null;
    stage: string | null;
    strain: string | null;
  };
  counts: {
    recentLogs: number;
    recentSensorReadings: number;
    sensorGroups: number;
    openAlerts: number;
  };
  sourceBadges: readonly AiDoctorReadinessSourceBadge[];
  limitations: readonly AiDoctorReadinessLimitation[];
  missingInformation: readonly string[];
  preview: {
    notice: string;
    summary: string;
    immediateAction: string;
    confidence: number;
    confidenceBand: AiDoctorResult["confidence_band"];
    evidence: readonly string[];
    possibleCauses: readonly string[];
    followUp24h: string;
    recoveryPlan3Day: string;
    whatNotToDo: readonly string[];
  };
}

const WATERING_EVENT_RE = /water/i;
const FEEDING_EVENT_RE = /feed|nutrient/i;
const PHOTO_EVENT_RE = /photo|image|picture/i;

export function deriveAiDoctorContextEvidenceFlags(
  context: AiDoctorContext,
  openAlertsCount: number,
): AiDoctorContextEvidenceFlags {
  const events = context.recent_grow_events ?? [];
  let hasRecentWatering = false;
  let hasRecentFeeding = false;
  let hasRecentPhoto = false;
  for (const ev of events) {
    const type = ev.event_type ?? "";
    if (!hasRecentWatering && WATERING_EVENT_RE.test(type)) hasRecentWatering = true;
    if (!hasRecentFeeding && FEEDING_EVENT_RE.test(type)) hasRecentFeeding = true;
    if (!hasRecentPhoto && PHOTO_EVENT_RE.test(type)) hasRecentPhoto = true;
  }
  const stage =
    typeof context.stage === "string" ? context.stage.trim() : context.stage;
  // Medium / pot size come from the context payload (carried directly
  // from the plant/profile row). Anything blank / non-string / null is
  // treated as unknown — never inferred from notes or strain.
  const medium =
    typeof context.medium === "string" ? context.medium.trim() : null;
  const potSize =
    typeof context.pot_size === "string" ? context.pot_size.trim() : null;
  return {
    hasRecentWatering,
    hasRecentFeeding,
    hasRecentPhoto,
    hasOpenAlerts: openAlertsCount > 0,
    hasUnknownStage: !stage,
    hasUnknownMedium: !medium,
    hasUnknownPotSize: !potSize,
  };
}

function classifyConfidenceClass(
  state: AiDoctorReadinessState,
): AiDoctorReadinessConfidenceClass {
  if (state === "ready") return "ready";
  if (state === "demo_only" || state === "telemetry_limited") {
    return "not_trustworthy";
  }
  return "limited";
}


export const AI_DOCTOR_PREVIEW_NOTICE = "Preview only — not saved.";

export interface BuildAiDoctorReadinessViewArgs {
  context: AiDoctorContext;
  openAlertsCount?: number;
}

function classifyState(
  context: AiDoctorContext,
): AiDoctorReadinessState {
  const strength = assessContextStrength(context);
  if (strength.hasDemoOnly) return "demo_only";
  if (!strength.hasAnySensors) return "sensor_missing";
  if (strength.hasStaleOrInvalid && !strength.hasTrustworthySensors) {
    return "telemetry_limited";
  }
  if (strength.hasStaleOrInvalid) return "telemetry_limited";
  if (strength.hasTrustworthySensors && strength.hasRecentEvents) {
    return "ready";
  }
  return "needs_more_context";
}

export function buildAiDoctorReadinessView(
  args: BuildAiDoctorReadinessViewArgs,
): AiDoctorReadinessView {
  const { context } = args;
  const openAlerts = Math.max(0, args.openAlertsCount ?? 0);
  const result = generateAiDoctorResult(context);
  const state = classifyState(context);

  const sourceBadges: AiDoctorReadinessSourceBadge[] = context.sensor_groups.map(
    (g) => ({
      source: g.source,
      label: AI_DOCTOR_SOURCE_LABELS[g.source],
      sampleCount: g.sample_count,
      isTrustworthy: g.source === "live" || g.source === "manual",
    }),
  );

  const limitations: AiDoctorReadinessLimitation[] = [];
  if (context.sensor_groups.some((g) => g.source === "stale" || g.source === "invalid")) {
    limitations.push({
      code: "stale_or_invalid",
      message: "Some recent sensor readings are stale or invalid — treat as untrusted.",
    });
  }
  if (state === "demo_only") {
    limitations.push({
      code: "demo_only",
      message: "Only demo sensor data available — not usable for a real diagnosis.",
    });
  }
  if (context.sensor_groups.length === 0) {
    limitations.push({
      code: "no_sensors",
      message: "No sensor snapshots in the last 7 days.",
    });
  }
  if (context.recent_grow_events.length === 0) {
    limitations.push({
      code: "no_recent_events",
      message: "No grow log entries in the last 14 days.",
    });
  }
  if (!context.stage) {
    limitations.push({
      code: "missing_stage",
      message: "Plant stage is not recorded.",
    });
  }

  const confidenceClass = classifyConfidenceClass(state);
  const evidenceFlags = deriveAiDoctorContextEvidenceFlags(context, openAlerts);

  return Object.freeze({
    state,
    stateLabel: AI_DOCTOR_READINESS_STATE_LABELS[state],
    confidenceClass,
    confidenceClassCopy: AI_DOCTOR_CONFIDENCE_CLASS_COPY[confidenceClass],
    evidenceFlags,
    plantIdentity: {
      plantId: context.plant_id,
      plantName: context.plant_name,
      stage: context.stage,
      strain: context.strain,
    },
    counts: {
      recentLogs: context.recent_grow_events.length,
      recentSensorReadings: context.recentSensorReadings.length,
      sensorGroups: context.sensor_groups.length,
      openAlerts,
    },
    sourceBadges: Object.freeze(sourceBadges),
    limitations: Object.freeze(limitations),
    missingInformation: result.missing_information,
    preview: {
      notice: AI_DOCTOR_PREVIEW_NOTICE,
      summary: result.summary,
      immediateAction: result.immediate_action,
      confidence: result.confidence,
      confidenceBand: result.confidence_band,
      evidence: result.evidence,
      possibleCauses: result.possible_causes,
      followUp24h: result.follow_up_24h,
      recoveryPlan3Day: result.recovery_plan_3_day,
      whatNotToDo: result.what_not_to_do,
    },
  });
}
