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
 * Move dialog hint for the tent the plant is in while the dialog is open.
 * It read "Previous Tent", which is only true after the move — so reopening
 * the dialog after a move showed the NEW tent as "Previous Tent"
 * (QA 2026-09-24).
 */
export const MOVE_PLANT_FROM_LABEL = "Moving from";

export const PHENO_UNTAG_BEFORE_CROSS_GROW_MOVE_COPY = {
  bannerTitle: "Tagged to a pheno hunt",
  bannerBody:
    "This plant is tagged to a pheno hunt. Moving it to a tent in another grow requires an explicit untag first. Untagging removes the plant from the pheno hunt. Same-grow moves keep the hunt tag.",
  untagCta: "Untag from pheno hunt",
  confirmTitle: "Untag this plant from the pheno hunt?",
  confirmBody:
    "Untagging removes this plant from the pheno hunt. It does not move the plant. After you untag, you can pick a tent in another grow and move it as a separate step.",
  confirmAction: "Untag from pheno hunt",
  confirmCancel: "Keep hunt tag",
  blockedMove:
    "This plant is still tagged to a pheno hunt. Untag it first, then move it to another grow.",
  untagSuccess: "Plant untagged from the pheno hunt",
  untagFailed: "Could not untag this plant from the pheno hunt.",
  huntTagLoadFailed:
    "Could not load this plant's pheno hunt tag. Cross-grow move stays closed until the tag can be read.",
} as const;

export function isHuntLinkedPlant(phenoHuntId: string | null | undefined): boolean {
  return typeof phenoHuntId === "string" && phenoHuntId.trim().length > 0;
}

function normalizedGrowId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Cross-grow (or no-grow → grow) destination changes `plants.grow_id`.
 * The candidate-number DB guard rejects that while `pheno_hunt_id` is set.
 * Same-grow tent changes do not require untag.
 */
export function plantMoveRequiresPhenoUntag(input: {
  phenoHuntId: string | null | undefined;
  plantGrowId: string | null | undefined;
  destinationGrowId: string | null | undefined;
}): boolean {
  if (!isHuntLinkedPlant(input.phenoHuntId)) return false;
  const destinationGrowId = normalizedGrowId(input.destinationGrowId);
  if (destinationGrowId == null) return false;
  return destinationGrowId !== normalizedGrowId(input.plantGrowId);
}

/** Dedicated untag write — never bundled with tent_id / grow_id. */
export function buildPlantPhenoUntagPayload(): {
  pheno_hunt_id: null;
  candidate_label: null;
} {
  return { pheno_hunt_id: null, candidate_label: null };
}

export interface PlantTentMoveUpdatePayload {
  tent_id: string;
  grow_id?: string;
}

/**
 * Move write. Returns null when a hunt-linked plant would change grow_id
 * (caller must untag first). Never includes pheno_hunt_id.
 */
export function buildPlantTentMoveUpdate(input: {
  tentId: string;
  plantGrowId: string | null | undefined;
  destinationGrowId: string | null | undefined;
  usedGrowFallback: boolean;
  phenoHuntId: string | null | undefined;
}): PlantTentMoveUpdatePayload | null {
  if (
    plantMoveRequiresPhenoUntag({
      phenoHuntId: input.phenoHuntId,
      plantGrowId: input.plantGrowId,
      destinationGrowId: input.destinationGrowId,
    })
  ) {
    return null;
  }
  const destinationGrowId = normalizedGrowId(input.destinationGrowId);
  const plantGrowId = normalizedGrowId(input.plantGrowId);
  const payload: PlantTentMoveUpdatePayload = { tent_id: input.tentId };
  const shouldCopyGrow =
    Boolean(input.usedGrowFallback) || plantGrowId == null || destinationGrowId !== plantGrowId;
  if (shouldCopyGrow && destinationGrowId != null && destinationGrowId !== plantGrowId) {
    payload.grow_id = destinationGrowId;
  }
  return payload;
}

export interface PlantMoveTentPartition {
  sameGrow: TentRelRow[];
  otherGrow: TentRelRow[];
  current: TentRelRow[];
}

export interface PlantMoveTentOptions {
  /**
   * After an explicit pheno untag, other-grow tents become selectable.
   * Default false — hunt-linked and ordinary same-grow moves stay grow-scoped.
   */
  includeCrossGrow?: boolean;
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
 * Split tents into same-grow selectable, other-grow (only when includeCrossGrow),
 * and the current tent (disabled). Other-grow rows are omitted until untag.
 */
export function partitionTentsForPlantMove(
  tents: readonly TentRelRow[],
  currentTentId: string | null,
  currentGrowId: string | null,
  options?: PlantMoveTentOptions,
): PlantMoveTentPartition {
  const includeCrossGrow = options?.includeCrossGrow === true;
  const sameGrow: TentRelRow[] = [];
  const otherGrow: TentRelRow[] = [];
  const current: TentRelRow[] = [];
  const scopedGrowId = normalizedGrowId(currentGrowId);
  for (const t of tents) {
    if (t.is_archived) continue;
    const tentGrowId = normalizedGrowId(t.grow_id);
    const isOtherGrow = scopedGrowId != null && tentGrowId != null && tentGrowId !== scopedGrowId;
    if (isOtherGrow && !includeCrossGrow) continue;
    if (currentTentId && t.id === currentTentId) {
      current.push(t);
      continue;
    }
    if (isOtherGrow) otherGrow.push(t);
    else sameGrow.push(t);
  }
  return { sameGrow, otherGrow, current };
}

/**
 * Tents eligible as Move targets for a plant currently in `currentTentId`.
 * Returns same-grow, non-archived tents split into others (selectable) and
 * the current tent (rendered disabled / no-op). Cross-grow tents stay out
 * unless `includeCrossGrow` is set after an explicit pheno untag.
 */
export function getEligibleTentsForPlantMove(
  tents: readonly TentRelRow[],
  currentTentId: string | null,
  currentGrowId: string | null,
  options?: PlantMoveTentOptions,
): { others: TentRelRow[]; current: TentRelRow[] } {
  const { sameGrow, otherGrow, current } = partitionTentsForPlantMove(
    tents,
    currentTentId,
    currentGrowId,
    options,
  );
  return {
    others: options?.includeCrossGrow === true ? [...sameGrow, ...otherGrow] : sameGrow,
    current,
  };
}

export function isPlantAlreadyInTent(plant: Pick<PlantRelRow, "tent_id">, tentId: string): boolean {
  return plant.tent_id === tentId;
}

/**
 * Build the minimal update payload to move a plant to a tent.
 * RLS enforces ownership; this never sets user_id / grow_id / strain / stage.
 */
export function buildPlantTentMovePayload(_plantId: string, tentId: string): { tent_id: string } {
  return { tent_id: tentId };
}

/**
 * Build the minimal update payload to detach a plant from its tent
 * without deleting the plant or its history.
 */
export function buildRemovePlantFromTentPayload(_plantId: string): { tent_id: null } {
  return { tent_id: null };
}

/**
 * Build the minimal update payload to archive (soft-delete) a plant.
 * Diary entries, photos, and sensor readings are intentionally untouched.
 */
export function buildArchivePlantPayload(_plantId: string): { is_archived: true } {
  return { is_archived: true };
}

/**
 * Build the minimal update payload to restore an archived plant to active lists.
 * Diary entries, photos, and sensor readings are intentionally untouched.
 */
export function buildRestorePlantPayload(_plantId: string): { is_archived: false } {
  return { is_archived: false };
}

export type PlantArchiveMenuAction = "archive" | "restore";

/**
 * Overflow / row action for archive state. Archived plants must never be
 * offered Archive again — they get Restore. Active plants keep Archive.
 */
export function resolvePlantArchiveMenuAction(
  isArchived: boolean | null | undefined,
): PlantArchiveMenuAction {
  return isArchived === true ? "restore" : "archive";
}
