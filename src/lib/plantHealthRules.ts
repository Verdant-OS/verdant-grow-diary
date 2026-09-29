/**
 * Recorded profile health is the grower's own assessment, never derived from
 * sensors or AI. "unknown" means not assessed: it is the database default for
 * a new plant (20260924120000) and what absent or invalid input normalizes to.
 *
 * Client writes of "unknown" are always explicit, never left to the column
 * default (which is "healthy" until 20260924120000 is applied):
 *  - Create Plant writes the grower's choice, "unknown" for "Not assessed yet".
 *  - Edit Plant writes "unknown" only when the grower clears an assessment.
 * Before 20260924120000 is applied the trigger rejects either write as a
 * whole (nothing is saved) and the dialog says so. Guided setup has no health
 * field and omits the column, so the default applies there.
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

/**
 * Create Plant health write: the grower's choice, or "unknown" when nothing
 * was chosen. Never omitted, so a new plant's stored health never comes from
 * the pre-20260924120000 column default of "healthy".
 */
export function buildPlantHealthCreateInsert(value: unknown): { health: PlantHealth } {
  const health = editablePlantHealth(value);
  return { health: health === "" ? "unknown" : health };
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
 * True for the validate_plant_row() rejection of "unknown", i.e. a create or a
 * clear was attempted before 20260924120000 was applied. The statement is
 * atomic, so nothing from that save was written.
 */
export function isPlantHealthClearRejected(message: unknown): boolean {
  return typeof message === "string" && /invalid plant health: unknown\b/.test(message);
}

export const PLANT_HEALTH_CLEAR_UNAVAILABLE_MESSAGE =
  'Setting health back to "Not assessed yet" isn\'t available yet, so nothing was saved. Choose a health value to save your other changes.';

export const PLANT_HEALTH_NOT_ASSESSED_CREATE_UNAVAILABLE_MESSAGE =
  "\"Not assessed yet\" isn't available yet, so the plant wasn't added. Choose Healthy, Watch or Issue to add it.";
