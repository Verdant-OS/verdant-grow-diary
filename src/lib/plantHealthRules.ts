/**
 * Recorded profile health is the grower's own assessment, never derived from
 * sensors or AI. "unknown" means not assessed: it is the database default for
 * a new plant (20260924120000) and what absent or invalid input normalizes to.
 * Clients never WRITE "unknown": when health was not assessed they omit the
 * column so the default applies (the pre-migration trigger rejects "unknown").
 */
export type StoredPlantHealth = "healthy" | "watch" | "issue";
export type PlantHealth = StoredPlantHealth | "unknown";
export type PlantHealthTone = "success" | "warning" | "destructive" | "neutral";

export function normalizePlantHealth(value: unknown): PlantHealth {
  return value === "healthy" || value === "watch" || value === "issue" ? value : "unknown";
}

const HEALTH_TONE: Readonly<Record<PlantHealth, PlantHealthTone>> = {
  healthy: "success",
  watch: "warning",
  issue: "destructive",
  unknown: "neutral",
};

export function plantHealthTone(value: unknown): PlantHealthTone {
  return HEALTH_TONE[normalizePlantHealth(value)];
}

/** An empty selection displays Unknown without inventing a supported value. */
export function editablePlantHealth(value: unknown): StoredPlantHealth | "" {
  const health = normalizePlantHealth(value);
  return health === "unknown" ? "" : health;
}

/** An unrelated profile edit must not submit the client-only unknown state. */
export function buildPlantHealthUpdate(
  value: unknown,
): { health: StoredPlantHealth } | { health?: never } {
  const health = editablePlantHealth(value);
  return health === "" ? {} : { health };
}

/** Placeholder for a health select with nothing chosen (QA 2026-09-24, BUG-009). */
export const PLANT_HEALTH_NOT_ASSESSED_LABEL = "Not assessed yet";
