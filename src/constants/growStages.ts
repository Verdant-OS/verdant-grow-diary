/**
 * Canonical grow stage taxonomy.
 *
 * One source of truth for stage display labels and short badge labels.
 * Aliases like "Vegetation", "Veg", "vegetative", "VEG" all collapse to
 * the canonical "vegetative" stage with the same display + badge text.
 *
 * Presenter / constants-only. No I/O. No React.
 */

export type CanonicalGrowStage =
  | "seedling"
  | "vegetative"
  | "flower"
  | "harvest";

export interface GrowStageDescriptor {
  /** Canonical lowercase identifier. */
  value: CanonicalGrowStage;
  /** Full display label, e.g. "Vegetative". */
  label: string;
  /** Short badge label, e.g. "Veg". */
  badge: string;
}

export const GROW_STAGES: Readonly<Record<CanonicalGrowStage, GrowStageDescriptor>> = {
  seedling: { value: "seedling", label: "Seedling", badge: "Seedling" },
  vegetative: { value: "vegetative", label: "Vegetative", badge: "Veg" },
  flower: { value: "flower", label: "Flower", badge: "Flower" },
  harvest: { value: "harvest", label: "Harvest", badge: "Harvest" },
};

const ALIAS_MAP: Record<string, CanonicalGrowStage> = {
  seedling: "seedling",
  seed: "seedling",
  veg: "vegetative",
  vegetative: "vegetative",
  vegetation: "vegetative",
  vegetate: "vegetative",
  flower: "flower",
  flowering: "flower",
  bloom: "flower",
  harvest: "harvest",
  harvested: "harvest",
};

/**
 * Normalize any incoming stage string (case- and whitespace-insensitive)
 * to a canonical stage value, or null when unknown. Never invents.
 */
export function normalizeGrowStage(
  stage: string | null | undefined,
): CanonicalGrowStage | null {
  if (!stage) return null;
  const k = stage.trim().toLowerCase();
  return ALIAS_MAP[k] ?? null;
}

export function formatGrowStageLabel(
  stage: string | null | undefined,
): string {
  const canon = normalizeGrowStage(stage);
  if (!canon) return "Unknown";
  return GROW_STAGES[canon].label;
}

export function formatGrowStageBadge(
  stage: string | null | undefined,
): string {
  const canon = normalizeGrowStage(stage);
  if (!canon) return "Unknown";
  return GROW_STAGES[canon].badge;
}
