/**
 * Pure rules for the canonical `/doctor` entry surface.
 *
 * The entry page never chooses a plant, invokes AI, spends a credit, or
 * writes data. It only presents active plants and builds links into the
 * existing plant-scoped cautious-review surface.
 */
import { isActivePlant, type ArchivedPlantLike } from "@/lib/archivedPlantVisibilityRules";
import { PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID } from "@/lib/plantDetailQuickActions";
import { plantDetailPath } from "@/lib/routes";

export interface AiDoctorEntryPlant extends ArchivedPlantLike {
  id?: string | null;
  name?: string | null;
  strain?: string | null;
  stage?: string | null;
  tentId?: string | null;
  tent_id?: string | null;
}

export interface AiDoctorEntryOption {
  id: string;
  name: string;
  details: string | null;
  href: string;
}

function normalizedRequired(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizedOptional(value: unknown): string | null {
  return normalizedRequired(value);
}

/**
 * Canonical return target for every plant-scoped AI Doctor entry.
 *
 * `tentId` is the only preserved query context. The fixed hash returns the
 * grower to the cautious-review section; reaching it never starts AI.
 */
export function buildPlantAiDoctorReviewPath(input: {
  plantId?: string | null;
  tentId?: string | null;
}): string | null {
  const plantId = normalizedRequired(input?.plantId);
  if (!plantId) return null;
  const normalizedTentId = normalizedOptional(input?.tentId);
  const base = plantDetailPath(
    plantId,
    normalizedTentId ? { tentId: normalizedTentId } : undefined,
  );
  return `${base}#${PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID}`;
}

/** Active, valid plant choices in deterministic name/id order. */
export function buildAiDoctorEntryOptions(
  plants: readonly AiDoctorEntryPlant[] | null | undefined,
): readonly AiDoctorEntryOption[] {
  if (!Array.isArray(plants)) return [];

  const options: AiDoctorEntryOption[] = [];
  for (const plant of plants) {
    if (!plant || !isActivePlant(plant)) continue;
    const id = normalizedRequired(plant.id);
    if (!id) continue;

    const name = normalizedOptional(plant.name) ?? "Unnamed plant";
    const strain = normalizedOptional(plant.strain);
    const stage = normalizedOptional(plant.stage);
    const tentId = normalizedOptional(plant.tentId) ?? normalizedOptional(plant.tent_id);
    const details = [strain, stage].filter((value): value is string => Boolean(value)).join(" · ");
    const href = buildPlantAiDoctorReviewPath({ plantId: id, tentId });
    if (!href) continue;

    options.push({
      id,
      name,
      details: details || null,
      href,
    });
  }

  options.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, "en", {
      numeric: true,
      sensitivity: "base",
    });
    return byName !== 0 ? byName : a.id.localeCompare(b.id);
  });

  return options;
}
