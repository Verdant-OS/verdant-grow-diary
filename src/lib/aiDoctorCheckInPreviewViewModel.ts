/**
 * aiDoctorCheckInPreviewViewModel — pure formatter for the "Preview AI
 * Doctor Check-In" panel.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no fetch, no Action Queue writes.
 *  - Deterministic for a given context. Uses ONLY the Phase 1 engine
 *    (`generateAiDoctorResult`) and the safety-rules context strength.
 *  - Output is presentation-only; never persists, never calls a model.
 *  - Demo / stale / invalid telemetry is surfaced as a labeled limitation.
 *  - Weak context emphasizes missing information rather than certainty.
 */

import {
  generateAiDoctorResult,
  type AiDoctorContext,
} from "@/lib/aiDoctorEngine";
import {
  assessContextStrength,
  type AiDoctorActionQueueSuggestion,
  type AiDoctorConfidenceBand,
  type AiDoctorResult,
  type AiDoctorRiskLevel,
} from "@/lib/aiDoctorSafetyRules";

export const AI_DOCTOR_CHECK_IN_PREVIEW_NOTICE =
  "Preview only — not saved.";
export const AI_DOCTOR_CHECK_IN_NO_MODEL_NOTICE =
  "No live AI model was called.";

export type AiDoctorCheckInLimitationCode =
  | "stale_or_invalid"
  | "demo_only"
  | "no_sensors"
  | "no_recent_events"
  | "missing_stage";

export interface AiDoctorCheckInLimitation {
  code: AiDoctorCheckInLimitationCode;
  message: string;
}

export interface AiDoctorCheckInPreviewView {
  notices: {
    previewOnly: string;
    noModelCalled: string;
  };
  contextWeak: boolean;
  summary: string;
  likelyIssue: string;
  confidence: number;
  confidenceBand: AiDoctorConfidenceBand;
  evidence: readonly string[];
  missingInformation: readonly string[];
  possibleCauses: readonly string[];
  immediateAction: string;
  whatNotToDo: readonly string[];
  followUp24h: string;
  recoveryPlan3Day: string;
  riskLevel: AiDoctorRiskLevel;
  limitations: readonly AiDoctorCheckInLimitation[];
  actionQueueSuggestion: AiDoctorActionQueueSuggestion | null;
}

function collectLimitations(
  context: AiDoctorContext,
): AiDoctorCheckInLimitation[] {
  const limitations: AiDoctorCheckInLimitation[] = [];
  const hasStaleOrInvalid = context.sensor_groups.some(
    (g) => g.source === "stale" || g.source === "invalid",
  );
  const hasDemo = context.sensor_groups.some((g) => g.source === "demo");
  const trustworthy = context.sensor_groups.some(
    (g) => g.source === "live" || g.source === "manual",
  );

  if (hasStaleOrInvalid) {
    limitations.push({
      code: "stale_or_invalid",
      message:
        "Some recent sensor readings are stale or invalid — treat as untrusted.",
    });
  }
  if (hasDemo && !trustworthy) {
    limitations.push({
      code: "demo_only",
      message:
        "Only demo sensor data available — not usable for a real diagnosis.",
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
  return limitations;
}

export function buildAiDoctorCheckInPreviewView(
  context: AiDoctorContext,
): AiDoctorCheckInPreviewView {
  const result: AiDoctorResult = generateAiDoctorResult(context);
  const strength = assessContextStrength(context);
  const contextWeak =
    !strength.hasTrustworthySensors || strength.evidenceSignals <= 1;

  const summary = contextWeak
    ? result.summary +
      " Context is thin — emphasize missing information over certainty."
    : result.summary;

  return Object.freeze({
    notices: {
      previewOnly: AI_DOCTOR_CHECK_IN_PREVIEW_NOTICE,
      noModelCalled: AI_DOCTOR_CHECK_IN_NO_MODEL_NOTICE,
    },
    contextWeak,
    summary,
    likelyIssue: result.likely_issue,
    confidence: result.confidence,
    confidenceBand: result.confidence_band,
    evidence: result.evidence,
    missingInformation: result.missing_information,
    possibleCauses: result.possible_causes,
    immediateAction: result.immediate_action,
    whatNotToDo: result.what_not_to_do,
    followUp24h: result.follow_up_24h,
    recoveryPlan3Day: result.recovery_plan_3_day,
    riskLevel: result.risk_level,
    limitations: Object.freeze(collectLimitations(context)),
    actionQueueSuggestion: result.action_queue_suggestion,
  });
}
