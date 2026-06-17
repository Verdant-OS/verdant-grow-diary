/**
 * plantProfileContextViewModel — pure view-model for the
 * "Plant profile context" card on Plant Detail.
 *
 * Hard rules:
 *  - No I/O. No Supabase. No fetch. No storage. No AI calls.
 *  - Never infer `medium` or `pot_size` from strain, notes, tent name,
 *    grow title, diary entries, or any freeform text.
 *  - Blank / whitespace strings collapse to unknown.
 *  - This module is presentation-only; it does NOT feed AI Doctor
 *    context. Draft values must never reach the compiler from here.
 */

export interface PlantProfileContextInput {
  stage?: string | null;
  strain?: string | null;
  medium?: string | null;
  potSize?: string | null;
}

export interface PlantProfileContextField {
  readonly known: boolean;
  readonly value: string | null;
  readonly label: string;
}

export interface PlantProfileContextViewModel {
  readonly title: string;
  readonly description: string;
  readonly rationale: string;
  readonly stage: PlantProfileContextField;
  readonly strain: PlantProfileContextField;
  readonly medium: PlantProfileContextField;
  readonly potSize: PlantProfileContextField;
  readonly mediumAction: { readonly label: string; readonly disabled: true };
  readonly potSizeAction: { readonly label: string; readonly disabled: true };
}

export const PLANT_PROFILE_CONTEXT_COPY = Object.freeze({
  title: "Plant profile context",
  description:
    "AI Doctor uses plant profile details to make safer, more useful checks.",
  rationale:
    "AI Doctor uses profile context to avoid guessing from photos or logs alone.",
  unknownStage: "Stage is unknown.",
  unknownStrain: "Strain is not set.",
  unknownMedium: "Medium is not available on this plant profile yet.",
  unknownPotSize: "Pot size is not available on this plant profile yet.",
  addMedium: "Add medium — coming soon",
  addPotSize: "Add pot size — coming soon",
});

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildPlantProfileContextViewModel(
  input: PlantProfileContextInput,
): PlantProfileContextViewModel {
  const stage = clean(input.stage);
  const strain = clean(input.strain);
  // Medium / pot size are intentionally NOT derived from any other
  // field. Only explicit, non-blank string values count as known.
  const medium = clean(input.medium);
  const potSize = clean(input.potSize);

  return {
    title: PLANT_PROFILE_CONTEXT_COPY.title,
    description: PLANT_PROFILE_CONTEXT_COPY.description,
    rationale: PLANT_PROFILE_CONTEXT_COPY.rationale,
    stage: {
      known: stage !== null,
      value: stage,
      label: stage ? `Stage: ${stage}` : PLANT_PROFILE_CONTEXT_COPY.unknownStage,
    },
    strain: {
      known: strain !== null,
      value: strain,
      label: strain
        ? `Strain: ${strain}`
        : PLANT_PROFILE_CONTEXT_COPY.unknownStrain,
    },
    medium: {
      known: medium !== null,
      value: medium,
      label: medium
        ? `Medium: ${medium}`
        : PLANT_PROFILE_CONTEXT_COPY.unknownMedium,
    },
    potSize: {
      known: potSize !== null,
      value: potSize,
      label: potSize
        ? `Pot size: ${potSize}`
        : PLANT_PROFILE_CONTEXT_COPY.unknownPotSize,
    },
    mediumAction: { label: PLANT_PROFILE_CONTEXT_COPY.addMedium, disabled: true },
    potSizeAction: { label: PLANT_PROFILE_CONTEXT_COPY.addPotSize, disabled: true },
  };
}
