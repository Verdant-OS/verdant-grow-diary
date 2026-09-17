/**
 * Recorded profile health is not an assessment. Unknown is a client-only
 * state for absent or invalid input; it must never become a stored value.
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
