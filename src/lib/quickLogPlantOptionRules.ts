/**
 * Pure helper for the QuickLog "Plant (optional)" picker.
 *
 * Audit finding: the QuickLog picker was sourced from a workspace-wide
 * `usePlants()` query, but the visible helper text claimed
 * "Showing plants from {activeGrow.name}". That made the picker appear to
 * hide plants from other grows even though it actually listed every active
 * plant across the entire workspace, which was the same shape of confusion
 * the Plants page suffered from.
 *
 * This helper scopes the picker deterministically:
 *   - When `activeGrowId` is null/empty → returns every active plant
 *     (the helper text path also switches to "across all grows").
 *   - When `activeGrowId` is set → returns plants whose `grow_id` matches
 *     OR whose `grow_id` is null (legacy plants, consistent with how
 *     `plantDropdownEligibilityRules` widens eligibility — we never silently
 *     hide a plant that has no grow assignment from a scoped picker).
 *   - Archived / merged plants are always excluded.
 *
 * Read-only, pure logic. No I/O, no writes, no device control.
 */

interface MinimalQuickLogPlant {
  id: string;
  name?: string | null;
  strain?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  is_archived?: boolean | null;
  archived_at?: string | null;
  merged_into_plant_id?: string | null;
}

function isInactive(p: MinimalQuickLogPlant): boolean {
  return !!(p.is_archived || p.archived_at || p.merged_into_plant_id);
}

export function filterQuickLogPlantOptions<T extends MinimalQuickLogPlant>(
  plants: ReadonlyArray<T>,
  activeGrowId: string | null | undefined,
): T[] {
  const active = plants.filter((p) => !isInactive(p));
  if (!activeGrowId) return active;
  return active.filter(
    (p) => p.grow_id === activeGrowId || p.grow_id == null,
  );
}

/**
 * Helper-text builder that always tells the truth about scope.
 */
export function quickLogPlantHelperText(
  activeGrowName: string | null | undefined,
  hasActiveGrowId: boolean,
): string {
  if (!hasActiveGrowId) {
    return "Showing plants across all grows. Archived/merged plants hidden.";
  }
  return `Showing plants from ${activeGrowName ?? "this grow"}. Archived/merged plants hidden.`;
}

/**
 * Picks the default Quick Log plant id to apply when the picker is empty.
 *
 * Resolution order (pure, deterministic, no I/O):
 *   1. If the grower has already chosen a plant in this session
 *      (`currentPlantId` is set AND matches a scoped plant), keep it.
 *   2. If `prefillPlantId` is set AND matches a scoped plant, use it.
 *   3. If exactly one scoped plant exists, auto-select it.
 *   4. Otherwise return "" (no auto-pick — grower must choose).
 *
 * Notes:
 *   - `scopedPlants` is already filtered by `filterQuickLogPlantOptions`,
 *     so archived/merged/out-of-scope plants are not reachable here.
 *   - Returns "" (not null) so the caller can pass it straight to
 *     `setPlantId(...)` without a null-coalesce branch.
 *   - Never overrides a valid current selection — this preserves the
 *     verified validation/save contract (plant required, grower chosen).
 */
export function pickDefaultQuickLogPlant<T extends MinimalQuickLogPlant>(
  scopedPlants: ReadonlyArray<T>,
  prefillPlantId?: string | null,
  currentPlantId?: string | null,
): string {
  if (currentPlantId && scopedPlants.some((p) => p.id === currentPlantId)) {
    return currentPlantId;
  }
  if (prefillPlantId && scopedPlants.some((p) => p.id === prefillPlantId)) {
    return prefillPlantId;
  }
  if (scopedPlants.length === 1) return scopedPlants[0].id;
  return "";
}
