/**
 * Pure run-eligibility rules for the Plant Detail AI Doctor review.
 *
 * The ordinary path remains driven by the existing readiness result. A
 * separate historical-review path may make a manual review button available
 * when the grower has a real plant record and enough sanitized CSV history,
 * even though current-condition readiness is still insufficient.
 *
 * This helper never upgrades readiness, never calls a model, and never writes
 * alerts, actions, sensor rows, or device commands.
 */
import type { AiDoctorContextResult } from "@/lib/aiDoctorContextRules";
import type { ImportedSensorHistorySection } from "@/lib/aiDoctorContextCompiler";
import {
  summarizeCsvHistoryEligibilityEvidence,
  type CsvHistorySensorRowLike,
} from "@/lib/aiDoctorCsvHistoryContextRules";
import { AI_DOCTOR_REVIEW_PACKET_CSV_ROW_CAP } from "@/lib/aiDoctorReviewRequestPacket";

export const AI_DOCTOR_HISTORICAL_REVIEW_MIN_VALID_OBSERVATIONS = 2;

export type AiDoctorReviewMode = "blocked" | "standard" | "historical_review";

export type AiDoctorReviewEligibilityReason =
  | "context_ready"
  | "historical_context_ready"
  | "missing_plant_profile"
  | "missing_csv_history"
  | "too_few_valid_observations"
  | "single_historical_timestamp"
  | "current_telemetry_requires_standard_context";

export interface AiDoctorReviewEligibilityInput {
  context: AiDoctorContextResult;
  hasPlantProfile: boolean;
  importedHistory: ImportedSensorHistorySection | null | undefined;
  /** Exact bounded-source rows used to build the candidate packet summary. */
  historicalRows?: ReadonlyArray<CsvHistorySensorRowLike> | null;
  /** Historical-only eligibility must preserve the missing-current caveat. */
  missingLiveSensorReadings: boolean;
}

export interface AiDoctorReviewEligibilityResult {
  allowed: boolean;
  mode: AiDoctorReviewMode;
  reason: AiDoctorReviewEligibilityReason;
  /** Numeric observations represented in the sanitized summary. */
  validObservationCount: number;
}

function countValidObservations(history: ImportedSensorHistorySection | null | undefined): number {
  if (!history || !Array.isArray(history.metrics)) return 0;
  return history.metrics.reduce((total, metric) => {
    const count = metric?.count;
    return Number.isInteger(count) && count > 0 ? total + count : total;
  }, 0);
}

/**
 * Resolve whether the explicit, grower-initiated review control may render.
 * CSV history can only open the limited historical path. The returned mode
 * never changes `context.readiness`, so an insufficient current context stays
 * insufficient in the request packet and UI data contract.
 */
export function evaluateAiDoctorReviewEligibility(
  input: AiDoctorReviewEligibilityInput,
): AiDoctorReviewEligibilityResult {
  if (input.context.readiness === "partial" || input.context.readiness === "strong") {
    return {
      allowed: true,
      mode: "standard",
      reason: "context_ready",
      validObservationCount: countValidObservations(input.importedHistory),
    };
  }

  if (!input.hasPlantProfile || !input.context.evidence.includes("plant-profile")) {
    return {
      allowed: false,
      mode: "blocked",
      reason: "missing_plant_profile",
      validObservationCount: 0,
    };
  }

  const history = input.importedHistory;
  if (!history || history.hasCsvHistory !== true || history.totalReadings < 1) {
    return {
      allowed: false,
      mode: "blocked",
      reason: "missing_csv_history",
      validObservationCount: 0,
    };
  }

  const evidence = summarizeCsvHistoryEligibilityEvidence(
    input.historicalRows,
    AI_DOCTOR_REVIEW_PACKET_CSV_ROW_CAP,
  );
  const validObservationCount = evidence.validObservationCount;
  if (validObservationCount < AI_DOCTOR_HISTORICAL_REVIEW_MIN_VALID_OBSERVATIONS) {
    return {
      allowed: false,
      mode: "blocked",
      reason: "too_few_valid_observations",
      validObservationCount,
    };
  }

  if (evidence.distinctObservationTimestampCount < 2) {
    return {
      allowed: false,
      mode: "blocked",
      reason: "single_historical_timestamp",
      validObservationCount,
    };
  }

  // This slice deliberately opens only the historical/missing-current path.
  // Fresh current telemetry should become eligible through the ordinary
  // readiness contract after the grower adds the missing diary context.
  if (!input.missingLiveSensorReadings) {
    return {
      allowed: false,
      mode: "blocked",
      reason: "current_telemetry_requires_standard_context",
      validObservationCount,
    };
  }

  return {
    allowed: true,
    mode: "historical_review",
    reason: "historical_context_ready",
    validObservationCount,
  };
}
