/**
 * plantTentMovementRules — pure helpers for plant→tent movement events.
 *
 * Movement is recorded as a diary_entries row using the existing schema —
 * no new tables, no sensor_readings writes, no alerts, no action_queue.
 * Past diary entries / sensor readings / alerts / actions are never
 * rewritten by a move; only the plant's current tent_id changes and a
 * single timeline event is appended.
 */

export const PLANT_TENT_MOVE_KIND = "plant_tent_move" as const;

export interface PlantTentMovementInput {
  previousTentName: string | null | undefined;
  nextTentName: string | null | undefined;
}

const safeName = (n: string | null | undefined, fallback: string): string => {
  const trimmed = typeof n === "string" ? n.trim() : "";
  return trimmed.length > 0 ? trimmed : fallback;
};

/**
 * Deterministic, human-readable timeline note for a plant move.
 * Examples:
 *   "Moved plant from Seedling Clone Tent to Veg Tent."
 *   "Assigned plant to Veg Tent."
 */
export function formatPlantTentMovementNote(input: PlantTentMovementInput): string {
  const next = safeName(input.nextTentName, "another tent");
  const hadPrev =
    typeof input.previousTentName === "string" &&
    input.previousTentName.trim().length > 0;
  if (!hadPrev) {
    return `Assigned plant to ${next}.`;
  }
  const prev = safeName(input.previousTentName, "previous tent");
  return `Moved plant from ${prev} to ${next}.`;
}

export interface PlantTentMovementDetails {
  kind: typeof PLANT_TENT_MOVE_KIND;
  previous_tent_id: string | null;
  next_tent_id: string;
  previous_tent_name: string | null;
  next_tent_name: string | null;
}

export function buildPlantTentMovementDetails(args: {
  previousTentId: string | null | undefined;
  nextTentId: string;
  previousTentName: string | null | undefined;
  nextTentName: string | null | undefined;
}): PlantTentMovementDetails {
  return {
    kind: PLANT_TENT_MOVE_KIND,
    previous_tent_id: args.previousTentId ?? null,
    next_tent_id: args.nextTentId,
    previous_tent_name:
      typeof args.previousTentName === "string" && args.previousTentName.trim()
        ? args.previousTentName.trim()
        : null,
    next_tent_name:
      typeof args.nextTentName === "string" && args.nextTentName.trim()
        ? args.nextTentName.trim()
        : null,
  };
}
