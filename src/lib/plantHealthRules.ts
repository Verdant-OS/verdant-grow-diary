/**
 * Recorded profile health is the grower's own assessment, never derived from
 * sensors or AI. "unknown" means not assessed: it is the database default for
 * a new plant (20260924120000) and what absent or invalid input normalizes to.
 * Inserts never write "unknown": they omit the column so the default applies.
 * The one client write of "unknown" is a grower explicitly clearing a recorded
 * assessment in Edit Plant; before 20260924120000 is applied the trigger
 * rejects it, and the save error says so (nothing is saved).
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

/** Select item value for "Not assessed yet" (Radix items cannot use ""). */
export const PLANT_HEALTH_NOT_ASSESSED_OPTION = "not_assessed";

/** Health select value back to form state; "Not assessed yet" is "". */
export function plantHealthFromSelectValue(value: unknown): StoredPlantHealth | "" {
  return value === PLANT_HEALTH_NOT_ASSESSED_OPTION ? "" : editablePlantHealth(value);
}

/**
 * Edit Plant health write. A chosen value is written as before. Choosing
 * "Not assessed yet" clears a recorded assessment by writing "unknown"; a
 * plant that is already unassessed (or holds an unrecognized value) writes
 * nothing, so unrelated edits never touch health.
 */
export function buildPlantHealthEditUpdate(
  stored: unknown,
  selected: unknown,
): { health: PlantHealth } | { health?: never } {
  const next = editablePlantHealth(selected);
  if (next !== "") return { health: next };
  return normalizePlantHealth(stored) === "unknown" ? {} : { health: "unknown" };
}

/**
 * True for the validate_plant_row() rejection of "unknown", i.e. a clear was
 * attempted before 20260924120000 was applied. The update is atomic, so no
 * field of that save was written.
 */
export function isPlantHealthClearRejected(message: unknown): boolean {
  return typeof message === "string" && /invalid plant health: unknown\b/.test(message);
}

export const PLANT_HEALTH_CLEAR_UNAVAILABLE_MESSAGE =
  'Setting health back to "Not assessed yet" isn\'t available yet, so nothing was saved. Choose a health value to save your other changes.';
