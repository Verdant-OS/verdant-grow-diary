/**
 * aiDoctorReviewResultViewModel — pure render mapping for the safe
 * read-only review result preview.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O.
 *  - All copy + labels live here; presenter is JSX-thin.
 */
import {
  validateAiDoctorReviewResult,
  type AiDoctorReviewConfidence,
  type AiDoctorReviewResult,
  type AiDoctorReviewRiskLevel,
} from "@/lib/aiDoctorReviewResultContract";

export const AI_DOCTOR_REVIEW_EMPTY_STATE =
  "No AI Doctor review result yet.";
export const AI_DOCTOR_REVIEW_PREVIEW_LABEL =
  "Review result preview — no AI request sent.";
export const AI_DOCTOR_REVIEW_SUGGESTION_NOTICE =
  "Suggestion preview only — grower approval required.";

export const AI_DOCTOR_REVIEW_CONFIDENCE_LABELS: Record<
  AiDoctorReviewConfidence,
  string
> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

export const AI_DOCTOR_REVIEW_RISK_LABELS: Record<
  AiDoctorReviewRiskLevel,
  string
> = {
  low: "Low risk",
  watch: "Watch",
  elevated: "Elevated risk",
  high: "High risk",
};

export interface AiDoctorReviewResultView {
  hasResult: boolean;
  emptyState: string;
  previewLabel: string;
  result: AiDoctorReviewResult | null;
  confidenceLabel: string;
  riskLabel: string;
  suggestionNotice: string;
}

const EMPTY_VIEW: AiDoctorReviewResultView = Object.freeze({
  hasResult: false,
  emptyState: AI_DOCTOR_REVIEW_EMPTY_STATE,
  previewLabel: AI_DOCTOR_REVIEW_PREVIEW_LABEL,
  result: null,
  confidenceLabel: "",
  riskLabel: "",
  suggestionNotice: AI_DOCTOR_REVIEW_SUGGESTION_NOTICE,
}) as AiDoctorReviewResultView;

export function buildAiDoctorReviewResultView(
  input: unknown,
): AiDoctorReviewResultView {
  if (input == null) return EMPTY_VIEW;
  const v = validateAiDoctorReviewResult(input);
  if (v.ok === false) return EMPTY_VIEW;
  return {
    hasResult: true,
    emptyState: AI_DOCTOR_REVIEW_EMPTY_STATE,
    previewLabel: AI_DOCTOR_REVIEW_PREVIEW_LABEL,
    result: v.result,
    confidenceLabel: AI_DOCTOR_REVIEW_CONFIDENCE_LABELS[v.result.confidence],
    riskLabel: AI_DOCTOR_REVIEW_RISK_LABELS[v.result.risk_level],
    suggestionNotice: AI_DOCTOR_REVIEW_SUGGESTION_NOTICE,
  };
}
