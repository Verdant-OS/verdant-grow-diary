/**
 * Pure adapter from an already-validated AI Doctor review result to the
 * canonical Diagnosis snapshot used by AI Doctor history.
 *
 * This module only maps fields. It performs no persistence, Action Queue
 * writes, alerts, automation, or device control. The mapped candidate always
 * passes through `validateAndSanitizeDiagnosis` so that the existing Diagnosis
 * safety envelope remains the single source of truth.
 */
import {
  validateAndSanitizeDiagnosis,
  type DiagnosisRiskLevel,
  type SanitizeReport,
} from "@/lib/aiDoctorDiagnosisRules";
import type {
  AiDoctorReviewConfidence,
  AiDoctorReviewResult,
  AiDoctorReviewRiskLevel,
} from "@/lib/aiDoctorReviewResultContract";

/** Conservative, deterministic numeric values for persisted confidence. */
export const AI_DOCTOR_REVIEW_CONFIDENCE_SCORE: Readonly<Record<AiDoctorReviewConfidence, number>> =
  Object.freeze({
    low: 0.25,
    medium: 0.5,
    high: 0.75,
  });

/** Review risk has one extra band; collapse it conservatively for Diagnosis. */
export const AI_DOCTOR_REVIEW_DIAGNOSIS_RISK: Readonly<
  Record<AiDoctorReviewRiskLevel, DiagnosisRiskLevel>
> = Object.freeze({
  low: "low",
  // Diagnosis has no `watch` band. Preserve the caution signal by mapping it
  // upward instead of understating the saved review and any later manual
  // Action Queue handoff as low risk.
  watch: "medium",
  elevated: "medium",
  high: "high",
});

export function numericConfidenceForAiDoctorReview(confidence: AiDoctorReviewConfidence): number {
  return AI_DOCTOR_REVIEW_CONFIDENCE_SCORE[confidence];
}

/**
 * Build the sanitized Diagnosis snapshot that may be handed to the existing
 * AI Doctor session persistence boundary.
 *
 * `result` must be the output of `validateAiDoctorReviewResult`. The optional
 * Action Queue suggestion becomes at most one inert, approval-required saved
 * suggestion; this adapter never enqueues it.
 */
export function adaptAiDoctorReviewResultToDiagnosis(result: AiDoctorReviewResult): SanitizeReport {
  const riskLevel = AI_DOCTOR_REVIEW_DIAGNOSIS_RISK[result.risk_level];
  const suggestion = result.action_queue_suggestion;

  return validateAndSanitizeDiagnosis({
    summary: result.summary,
    likelyIssue: result.likely_issue,
    confidence: numericConfidenceForAiDoctorReview(result.confidence),
    evidence: result.evidence,
    missingInformation: result.missing_information,
    possibleCauses: result.possible_causes,
    immediateAction: result.immediate_action,
    whatNotToDo: [result.what_not_to_do],
    followUp24h: {
      summary: result.twenty_four_hour_follow_up,
      checklist: [],
    },
    recoveryPlan3d: {
      summary: result.three_day_recovery_plan,
      checklist: [],
    },
    riskLevel,
    suggestedActions: suggestion
      ? [
          {
            type: "task",
            title: suggestion.title,
            detail: suggestion.rationale,
            priority: riskLevel,
            reason: suggestion.rationale,
            approvalRequired: true,
          },
        ]
      : [],
  });
}
