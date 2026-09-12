/**
 * Pure helpers for Edit Plant save / tent picker.
 *
 * Production symptom (measured): changing stage to Flowering toast
 * "Could not save changes. Please try again." while stage stays Vegetative.
 * Assign to tent can also show "No tents available in this grow" after a
 * Vegetation cleanup leaves the plant grow-scoped to an empty tent set.
 *
 * RLS on plants UPDATE WITH CHECK requires that tent_id (when set) exists
 * and is owned by the caller. A stale tent_id after tent cleanup fails that
 * check on EVERY field update — including stage — and Edit Plant previously
 * swallowed the PostgREST message.
 *
 * No React, no Supabase, no I/O. Safe to unit-test in isolation.
 */

export interface PlantEditTentOption {
  id: string;
  name: string;
  grow_id?: string | null;
  is_archived?: boolean | null;
}

export interface ResolvePlantEditTentOptionsResult {
  tents: PlantEditTentOption[];
  /** True when the plant's grow had zero selectable tents and we fell back. */
  usedGrowFallback: boolean;
}

/**
 * Tent options for Edit Plant.
 * - No grow → all non-archived owner tents.
 * - Grow with matching tents → those tents only (cross-grow fence).
 * - Grow with zero matching tents → fall back to all non-archived owner tents
 *   so an orphaned / empty-grow plant can re-home instead of a dead end.
 */
export function resolvePlantEditTentOptions(
  allTents: readonly PlantEditTentOption[],
  growId: string | null | undefined,
): ResolvePlantEditTentOptionsResult {
  const active = allTents.filter((t) => !t.is_archived);
  if (!growId) {
    return { tents: active, usedGrowFallback: false };
  }
  const sameGrow = active.filter((t) => t.grow_id === growId);
  if (sameGrow.length > 0) {
    return { tents: sameGrow, usedGrowFallback: false };
  }
  return { tents: active, usedGrowFallback: true };
}

/**
 * If the plant's stored tent_id is missing from the selectable list
 * (deleted / archived / cross-grow after cleanup), coerce to "none" so the
 * save payload does not re-submit a stale tent_id that RLS will reject.
 */
export function normalizePlantEditTentSelectValue(
  tentId: string | null | undefined,
  availableTentIds: readonly string[],
): string {
  if (!tentId) return "none";
  if (availableTentIds.includes(tentId)) return tentId;
  return "none";
}

export interface PlantEditSaveErrorLike {
  message?: string | null;
  code?: string | null;
  details?: string | null;
}

const FALLBACK_SAVE_ERROR = "Could not save changes. Please try again.";

/**
 * Fail-closed grower-facing save error. Prefer the PostgREST / trigger
 * message so RLS and constraint failures are diagnosable; never return an
 * empty string.
 */
export function formatPlantEditSaveError(error: PlantEditSaveErrorLike | null | undefined): string {
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  if (message) return message;
  return FALLBACK_SAVE_ERROR;
}

/**
 * When the grower picks a tent during an empty-grow fallback (or the plant
 * has no grow_id), carry the tent's grow_id onto the plant so Quick Log /
 * timeline regain grow context. Never invent a grow; only copy from the tent.
 * Cross-grow moves that still have same-grow options do not use this path
 * (usedGrowFallback stays false).
 */
export function buildPlantEditGrowIdFromTent(input: {
  selectedTentId: string | null;
  selectedTentGrowId: string | null | undefined;
  plantGrowId: string | null | undefined;
  usedGrowFallback: boolean;
}): { grow_id: string } | { grow_id: null } | null {
  const { selectedTentId, selectedTentGrowId, plantGrowId, usedGrowFallback } = input;
  if (!selectedTentId) {
    // Clearing tent does not clear grow_id here — grow detach is a separate action.
    return null;
  }
  if (!usedGrowFallback && plantGrowId) {
    return null;
  }
  if (typeof selectedTentGrowId === "string" && selectedTentGrowId.length > 0) {
    if (selectedTentGrowId === plantGrowId) return null;
    return { grow_id: selectedTentGrowId };
  }
  // Tent has no grow — leave plant grow_id untouched.
  return null;
}
