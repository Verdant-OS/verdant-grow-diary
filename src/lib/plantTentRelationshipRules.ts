/**
 * Pure helpers for Plant/Tent relationship UX.
 *
 * Used by AddExistingPlantDialog, AssignTentDialog, PlantCardActionsMenu,
 * and EditPlantDialog so eligibility logic isn't duplicated in JSX.
 *
 * No I/O, no React, no Supabase imports. Safe to unit-test in isolation.
 *
 * Out of scope: alerts, Action Queue, sensors, automation, device control.
 */

export interface PlantRelRow {
  id: string;
  name: string;
  strain?: string | null;
  tent_id: string | null;
  grow_id?: string | null;
  is_archived?: boolean | null;
}

export interface TentRelRow {
  id: string;
  name: string;
  grow_id?: string | null;
  is_archived?: boolean | null;
}

/**
 * Plants eligible to attach to `currentTentId` from the same grow:
 *   - unassigned plants (tent_id == null), AND
 *   - plants assigned to a different tent in the same grow (move candidates).
 * Excludes archived plants, plants already in the current tent, and
 * cross-grow plants.
 */
export function getEligiblePlantsForTentAttach(
  plants: readonly PlantRelRow[],
  currentTentId: string,
  currentGrowId: string | null,
): { unassigned: PlantRelRow[]; otherTent: PlantRelRow[]; currentTent: PlantRelRow[] } {
  const unassigned: PlantRelRow[] = [];
  const otherTent: PlantRelRow[] = [];
  const currentTent: PlantRelRow[] = [];
  for (const p of plants) {
    if (p.is_archived) continue;
    if (currentGrowId != null && p.grow_id != null && p.grow_id !== currentGrowId) continue;
    if (p.tent_id == null) unassigned.push(p);
    else if (p.tent_id === currentTentId) currentTent.push(p);
    else otherTent.push(p);
  }
  return { unassigned, otherTent, currentTent };
}

/**
 * Tents eligible as Move targets for a plant currently in `currentTentId`.
 * Returns same-grow, non-archived tents split into others (selectable) and
 * the current tent (rendered disabled / no-op).
 */
export function getEligibleTentsForPlantMove(
  tents: readonly TentRelRow[],
  currentTentId: string | null,
  currentGrowId: string | null,
): { others: TentRelRow[]; current: TentRelRow[] } {
  const others: TentRelRow[] = [];
  const current: TentRelRow[] = [];
  for (const t of tents) {
    if (t.is_archived) continue;
    if (currentGrowId != null && t.grow_id != null && t.grow_id !== currentGrowId) continue;
    if (currentTentId && t.id === currentTentId) current.push(t);
    else others.push(t);
  }
  return { others, current };
}

export function isPlantAlreadyInTent(
  plant: Pick<PlantRelRow, "tent_id">,
  tentId: string,
): boolean {
  return plant.tent_id === tentId;
}

/**
 * Build the minimal update payload to move a plant to a tent.
 * RLS enforces ownership; this never sets user_id / grow_id / strain / stage.
 */
export function buildPlantTentMovePayload(
  _plantId: string,
  tentId: string,
): { tent_id: string } {
  return { tent_id: tentId };
}

/**
 * Build the minimal update payload to detach a plant from its tent
 * without deleting the plant or its history.
 */
export function buildRemovePlantFromTentPayload(
  _plantId: string,
): { tent_id: null } {
  return { tent_id: null };
}

/**
 * Build the minimal update payload to archive (soft-delete) a plant.
 * Diary entries, photos, and sensor readings are intentionally untouched.
 */
export function buildArchivePlantPayload(
  _plantId: string,
): { is_archived: true } {
  return { is_archived: true };
}
