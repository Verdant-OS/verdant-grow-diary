/**
 * Read-only plant context for the structured Water form.
 *
 * Stage is selected from explicit records in order of specificity. Missing
 * context stays missing; this helper never infers a stage, medium, or pot size
 * from dates, strain, sensor data, or watering history.
 */

import type { ResolvedQuickLogV2Target } from "./quickLogV2Rules";

export interface WateringContextPlantLike {
  id: string;
  grow_id?: string | null;
  tent_id?: string | null;
  stage?: string | null;
  medium?: string | null;
  pot_size?: string | null;
}

export interface WateringContextTentLike {
  id: string;
  grow_id?: string | null;
  stage?: string | null;
}

export interface WateringContextGrowLike {
  id: string;
  stage?: string | null;
}

export interface QuickLogWateringContextInput {
  resolved: ResolvedQuickLogV2Target | null | undefined;
  plants: readonly WateringContextPlantLike[];
  tents: readonly WateringContextTentLike[];
  grows: readonly WateringContextGrowLike[];
}

export interface QuickLogWateringContextField {
  label: "Stage" | "Medium" | "Pot size";
  value: string;
  source: "Plant record" | "Tent record" | "Grow record" | "Not recorded";
  present: boolean;
  testId: "stage" | "medium" | "pot-size";
}

export interface QuickLogWateringContextViewModel {
  visible: boolean;
  scope: "plant" | "tent" | "none";
  fields: readonly QuickLogWateringContextField[];
  helper: string;
}

export const WATERING_CONTEXT_UNKNOWN = "Not recorded" as const;
export const WATERING_CONTEXT_PLANT_SPECIFIC = "Plant-specific" as const;

const HIDDEN: QuickLogWateringContextViewModel = {
  visible: false,
  scope: "none",
  fields: Object.freeze([]),
  helper: "",
};

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function knownField(
  label: QuickLogWateringContextField["label"],
  testId: QuickLogWateringContextField["testId"],
  value: string,
  source: Exclude<QuickLogWateringContextField["source"], "Not recorded">,
): QuickLogWateringContextField {
  return { label, testId, value: humanize(value), source, present: true };
}

function unknownField(
  label: QuickLogWateringContextField["label"],
  testId: QuickLogWateringContextField["testId"],
  value: string = WATERING_CONTEXT_UNKNOWN,
): QuickLogWateringContextField {
  return { label, testId, value, source: "Not recorded", present: false };
}

export function buildQuickLogWateringContext(
  input: QuickLogWateringContextInput,
): QuickLogWateringContextViewModel {
  const resolved = input.resolved;
  if (!resolved?.ok || !resolved.targetType) return HIDDEN;

  const plants = input.plants ?? [];
  const tents = input.tents ?? [];
  const grows = input.grows ?? [];
  const plant =
    resolved.targetType === "plant"
      ? (plants.find((candidate) => candidate?.id === resolved.plantId) ?? null)
      : null;
  const tentId = resolved.tentId ?? plant?.tent_id ?? null;
  const tent = tentId ? (tents.find((candidate) => candidate?.id === tentId) ?? null) : null;
  const growId = resolved.growId ?? plant?.grow_id ?? tent?.grow_id ?? null;
  const grow = growId ? (grows.find((candidate) => candidate?.id === growId) ?? null) : null;

  const plantStage = clean(plant?.stage);
  const tentStage = clean(tent?.stage);
  const growStage = clean(grow?.stage);
  const stage = plantStage
    ? knownField("Stage", "stage", plantStage, "Plant record")
    : tentStage
      ? knownField("Stage", "stage", tentStage, "Tent record")
      : growStage
        ? knownField("Stage", "stage", growStage, "Grow record")
        : unknownField("Stage", "stage");

  if (resolved.targetType === "plant") {
    const medium = clean(plant?.medium);
    const potSize = clean(plant?.pot_size);
    return {
      visible: true,
      scope: "plant",
      fields: Object.freeze([
        stage,
        medium
          ? knownField("Medium", "medium", medium, "Plant record")
          : unknownField("Medium", "medium"),
        potSize
          ? knownField("Pot size", "pot-size", potSize, "Plant record")
          : unknownField("Pot size", "pot-size"),
      ]),
      helper: "Read-only plant context. Verdant does not turn these fields into a watering target.",
    };
  }

  return {
    visible: true,
    scope: "tent",
    fields: Object.freeze([
      stage,
      unknownField("Medium", "medium", WATERING_CONTEXT_PLANT_SPECIFIC),
      unknownField("Pot size", "pot-size", WATERING_CONTEXT_PLANT_SPECIFIC),
    ]),
    helper:
      "Whole-tent context. Medium and pot size stay plant-specific; Verdant does not infer them.",
  };
}
