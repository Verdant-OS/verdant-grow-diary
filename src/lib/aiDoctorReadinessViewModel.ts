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

export interface AiDoctorReadinessView {
  state: AiDoctorReadinessState;
  stateLabel: string;
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

  return Object.freeze({
    state,
    stateLabel: AI_DOCTOR_READINESS_STATE_LABELS[state],
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
