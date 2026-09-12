import { findCannabisSymptomById, type CannabisSymptomId } from "@/constants/cannabisSymptomTypes";
import type { CanonicalQuickLogStage } from "@/lib/grow";
import { normalizeQuickLogStage } from "@/lib/quickLogStageDefaultRules";
import { buildTimelineEntryAnchorId } from "@/lib/timelineEntryAnchorRules";
import { timelinePath } from "@/lib/routes";

export interface GuidedSymptomCheckDraft {
  readonly plantId?: unknown;
  readonly symptomId: CannabisSymptomId | null;
  readonly stage: unknown;
  readonly stageConfirmed: boolean;
  readonly observationLocation?: string | null;
  /**
   * Grower attests they looked and saw no visible signs. This is an
   * observation, never a health claim and never a diagnosis. It is mutually
   * exclusive with a chosen symptom: both set is a contradiction and fails
   * closed rather than silently preferring one.
   */
  readonly noSymptomsObserved?: boolean;
}

/**
 * Marker recorded for a clean check. Deliberately NOT an `observedSign`
 * value: the symptom vocabulary stays exactly the catalog, so symptom
 * guides, verification topics, and evidence cards keep failing closed
 * instead of resolving a fake "healthy" symptom definition.
 */
export const SYMPTOM_CHECK_NO_SYMPTOMS_RESULT = "no_symptoms_observed" as const;

export type GuidedSymptomCheckValidation =
  | {
      readonly ok: true;
      readonly stage: CanonicalQuickLogStage;
      readonly details: Readonly<Record<string, string>>;
    }
  | { readonly ok: false; readonly reason: string };

export function resolveGuidedSymptomStage(value: unknown): CanonicalQuickLogStage | null {
  return normalizeQuickLogStage(value);
}

export function hasGuidedSymptomPlant(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateGuidedSymptomCheck(
  draft: GuidedSymptomCheckDraft,
): GuidedSymptomCheckValidation {
  if (!hasGuidedSymptomPlant(draft.plantId)) {
    return { ok: false, reason: "Select a plant before saving this Symptom Check." };
  }

  const noSymptomsObserved = draft.noSymptomsObserved === true;
  const symptom = findCannabisSymptomById(draft.symptomId);
  if (noSymptomsObserved && symptom) {
    return {
      ok: false,
      reason: "Choose a visible sign or mark no visible symptoms, not both.",
    };
  }
  if (!noSymptomsObserved && !symptom) {
    return { ok: false, reason: "Choose the visible sign you observed." };
  }

  const stage = resolveGuidedSymptomStage(draft.stage);
  if (!stage) return { ok: false, reason: "Choose the plant's current stage." };
  if (!draft.stageConfirmed) {
    return { ok: false, reason: "Confirm the stage before saving this Symptom Check." };
  }

  const details: Record<string, string> = { observation_stage: stage };
  if (symptom) {
    details.observedSign = symptom.observedSign;
  } else {
    details.symptom_check_result = SYMPTOM_CHECK_NO_SYMPTOMS_RESULT;
  }
  const location = draft.observationLocation?.trim();
  if (location) details.observationLocation = location;
  return { ok: true, stage, details };
}

export function buildSymptomTimelineHref(
  growId: string | null | undefined,
  growEventId: string | null | undefined,
): string | null {
  if (!growId) return null;
  const base = timelinePath(growId);
  if (!growEventId) return base;
  const anchor = buildTimelineEntryAnchorId(growEventId);
  return anchor ? `${base}#${anchor}` : base;
}
