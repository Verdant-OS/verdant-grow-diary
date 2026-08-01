import { findCannabisSymptomById, type CannabisSymptomId } from "@/constants/cannabisSymptomTypes";
import { normalizeGrowStage, type CanonicalGrowStage } from "@/constants/growStages";
import { buildTimelineEntryAnchorId } from "@/lib/timelineEntryAnchorRules";
import { timelinePath } from "@/lib/routes";

export interface GuidedSymptomCheckDraft {
  readonly plantId?: unknown;
  readonly symptomId: CannabisSymptomId | null;
  readonly stage: unknown;
  readonly stageConfirmed: boolean;
  readonly observationLocation?: string | null;
}

export type GuidedSymptomCheckValidation =
  | {
      readonly ok: true;
      readonly stage: CanonicalGrowStage;
      readonly details: Readonly<Record<string, string>>;
    }
  | { readonly ok: false; readonly reason: string };

export function resolveGuidedSymptomStage(value: unknown): CanonicalGrowStage | null {
  return typeof value === "string" ? normalizeGrowStage(value) : null;
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
  const symptom = findCannabisSymptomById(draft.symptomId);
  if (!symptom) return { ok: false, reason: "Choose the visible sign you observed." };

  const stage = resolveGuidedSymptomStage(draft.stage);
  if (!stage) return { ok: false, reason: "Choose the plant's current stage." };
  if (!draft.stageConfirmed) {
    return { ok: false, reason: "Confirm the stage before saving this Symptom Check." };
  }

  const details: Record<string, string> = {
    observedSign: symptom.observedSign,
    observation_stage: stage,
  };
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
