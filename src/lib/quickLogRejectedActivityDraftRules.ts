import type { QuickLogWeightUnit } from "@/constants/quickLogActivityTypes";
import {
  getQuickLogActivityDetailFields,
  validateQuickLogDetailNumberInput,
} from "@/lib/quickLogActivityDetailFields";
import { sanitizeHarvestWeightInput, sanitizeHarvestWeightUnit } from "@/lib/harvestDetailsRules";
import type { PendingQuickLogActivity } from "@/lib/quickLogPendingActivityStore";
import {
  resolveGuidedSymptomStage,
  SYMPTOM_CHECK_NO_SYMPTOMS_RESULT,
} from "@/lib/symptomCheckRules";
import type { CanonicalQuickLogStage } from "@/lib/grow";

export interface RejectedQuickLogActivityDraft {
  readonly detailValues: Readonly<Record<string, string>>;
  readonly harvestWet: string;
  readonly harvestDry: string;
  readonly harvestUnit: QuickLogWeightUnit;
  /** Canonical stored temperature values are restored in Celsius, never relabelled Fahrenheit. */
  readonly temperatureEntryUnit: "celsius" | null;
  readonly guidedSymptomCheck: boolean;
  readonly guidedSymptomStage: CanonicalQuickLogStage | null;
  readonly guidedSymptomStageConfirmed: boolean;
  readonly guidedSymptomNoneObserved: boolean;
}

/** Recover the exact user-entered structured values from a refused RPC's frozen payload. */
export function restoreRejectedQuickLogActivityDraft(
  record: PendingQuickLogActivity | null | undefined,
): RejectedQuickLogActivityDraft {
  const activityId = record?.input.activityId;
  const details = record?.input.extraDetails;
  const values: Record<string, string> = {};
  let temperatureEntryUnit: "celsius" | null = null;
  if (activityId && details) {
    for (const field of getQuickLogActivityDetailFields(activityId, "celsius")) {
      const container = field.envelope ? details[field.envelope] : details;
      if (!container || typeof container !== "object" || Array.isArray(container)) continue;
      const value = (container as Record<string, unknown>)[field.key];
      if (typeof value !== "string" && typeof value !== "number") continue;
      const text = String(value);
      if (field.kind === "select") {
        if (field.options?.some((option) => option.value === text)) values[field.key] = text;
      } else if (field.kind === "number") {
        if (validateQuickLogDetailNumberInput(field, text).ok && text.trim()) {
          values[field.key] = text;
          if (field.temperatureCelsius) temperatureEntryUnit = "celsius";
        }
      } else if (typeof value === "string") {
        values[field.key] = text;
      }
    }
  }

  const harvest = activityId === "harvest" ? record?.receipt.harvestDetails : null;
  const guidedSymptomCheck =
    activityId === "issue_observation" && record?.receipt.symptomCheck === true;
  const guidedSymptomStage = guidedSymptomCheck
    ? resolveGuidedSymptomStage(details?.observation_stage)
    : null;
  return {
    detailValues: values,
    harvestWet: sanitizeHarvestWeightInput(harvest?.wetWeight) ?? "",
    harvestDry: sanitizeHarvestWeightInput(harvest?.dryWeight) ?? "",
    harvestUnit: sanitizeHarvestWeightUnit(harvest?.weightUnit) ?? "g",
    temperatureEntryUnit,
    guidedSymptomCheck,
    guidedSymptomStage,
    guidedSymptomStageConfirmed: guidedSymptomStage !== null,
    guidedSymptomNoneObserved:
      guidedSymptomCheck && details?.symptom_check_result === SYMPTOM_CHECK_NO_SYMPTOMS_RESULT,
  };
}
