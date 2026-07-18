import { isInactiveQuickLogPlant, type MinimalQuickLogPlant } from "@/lib/quickLogPlantOptionRules";

/**
 * One canonical grow/tent/plant identity for the legacy Quick Log editor.
 * The target exists only after the stored relationships agree; callers must
 * never assemble a write target from partially validated ids.
 */
export type QuickLogResolvedTarget = Readonly<{
  plantId: string;
  growId: string;
  tentId: string;
}>;

export type QuickLogTargetBlockReason =
  | "missing_active_grow"
  | "missing_plant"
  | "plant_not_found"
  | "plant_inactive"
  | "plant_grow_unassigned"
  | "plant_tent_unassigned"
  | "prefill_grow_mismatch"
  | "prefill_tent_mismatch"
  | "active_grow_mismatch"
  | "tent_not_found"
  | "tent_inactive"
  | "selected_tent_mismatch"
  | "tent_grow_unassigned"
  | "tent_grow_mismatch";

export type QuickLogTargetResolution =
  | Readonly<{ status: "ready"; target: QuickLogResolvedTarget }>
  | Readonly<{ status: "blocked"; reason: QuickLogTargetBlockReason }>;

export const QUICK_LOG_TARGET_BLOCKED_COPY: Readonly<Record<QuickLogTargetBlockReason, string>> = {
  missing_active_grow: "Choose a grow before saving.",
  missing_plant: "Choose a plant before saving this entry.",
  plant_not_found: "That plant is no longer available. Choose another plant.",
  plant_inactive: "That plant is archived or merged. Choose an active plant.",
  plant_grow_unassigned: "Assign this plant to a grow and tent before saving.",
  plant_tent_unassigned: "Assign this plant to a grow and tent before saving.",
  prefill_grow_mismatch: "The Quick Log grow context changed. Reopen it from the plant.",
  prefill_tent_mismatch: "The Quick Log tent context changed. Reopen it from the plant.",
  active_grow_mismatch: "This plant belongs to another grow. Review the target before saving.",
  tent_not_found: "The assigned tent is unavailable. Review the plant assignment before saving.",
  tent_inactive: "The assigned tent is archived. Choose an active tent before saving.",
  selected_tent_mismatch:
    "The selected plant and tent do not match. Review the target before saving.",
  tent_grow_unassigned: "Assign this tent to a grow before saving.",
  tent_grow_mismatch: "The selected tent belongs to another grow. Review the target before saving.",
};

export interface QuickLogTargetPlant extends MinimalQuickLogPlant {
  id: string;
}

export interface QuickLogTargetTent {
  id: string;
  grow_id?: string | null;
  is_archived?: boolean | null;
  archived_at?: string | null;
}

export interface QuickLogPrefillTargetRequest {
  plantId?: string | null;
  growId?: string | null;
  tentId?: string | null;
}

export interface ResolveQuickLogPrefillTargetInput {
  prefill?: QuickLogPrefillTargetRequest | null;
  plants?: ReadonlyArray<QuickLogTargetPlant> | null;
  tents?: ReadonlyArray<QuickLogTargetTent> | null;
}

export interface ResolveQuickLogWriteTargetInput {
  activeGrowId?: string | null;
  selectedPlant?: QuickLogTargetPlant | null;
  selectedTent?: QuickLogTargetTent | null;
}

const blocked = (reason: QuickLogTargetBlockReason): QuickLogTargetResolution => ({
  status: "blocked",
  reason,
});

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function ready(plantId: string, growId: string, tentId: string): QuickLogTargetResolution {
  return {
    status: "ready",
    target: Object.freeze({ plantId, growId, tentId }),
  };
}

function tentIsInactive(tent: QuickLogTargetTent): boolean {
  return tent.is_archived === true || normalizeId(tent.archived_at) !== null;
}

/**
 * Validate a route/event prefill against stored plant and tent relationships.
 * The full plant list is deliberate: a cross-grow handoff must be proven
 * before the active-grow store finishes switching and re-scopes the picker.
 */
export function resolveQuickLogPrefillTarget(
  input: ResolveQuickLogPrefillTargetInput,
): QuickLogTargetResolution {
  const requestedPlantId = normalizeId(input.prefill?.plantId);
  if (!requestedPlantId) return blocked("missing_plant");

  const plant = (input.plants ?? []).find(
    (candidate) => normalizeId(candidate.id) === requestedPlantId,
  );
  if (!plant) return blocked("plant_not_found");
  if (isInactiveQuickLogPlant(plant)) return blocked("plant_inactive");

  const growId = normalizeId(plant.grow_id);
  if (!growId) return blocked("plant_grow_unassigned");
  const tentId = normalizeId(plant.tent_id);
  if (!tentId) return blocked("plant_tent_unassigned");

  const requestedGrowId = normalizeId(input.prefill?.growId);
  if (requestedGrowId && requestedGrowId !== growId) {
    return blocked("prefill_grow_mismatch");
  }
  const requestedTentId = normalizeId(input.prefill?.tentId);
  if (requestedTentId && requestedTentId !== tentId) {
    return blocked("prefill_tent_mismatch");
  }

  const tent = (input.tents ?? []).find((candidate) => normalizeId(candidate.id) === tentId);
  if (!tent) return blocked("tent_not_found");
  if (tentIsInactive(tent)) return blocked("tent_inactive");
  const tentGrowId = normalizeId(tent.grow_id);
  if (!tentGrowId) return blocked("tent_grow_unassigned");
  if (tentGrowId !== growId) return blocked("tent_grow_mismatch");

  return ready(requestedPlantId, growId, tentId);
}

/**
 * Resolve the only identity that may be displayed as save-ready or sent to
 * quicklog_save_manual. Missing and contradictory legacy relationships fail
 * closed; the active grow is never used to repair a plant row implicitly.
 */
export function resolveQuickLogWriteTarget(
  input: ResolveQuickLogWriteTargetInput,
): QuickLogTargetResolution {
  const activeGrowId = normalizeId(input.activeGrowId);
  if (!activeGrowId) return blocked("missing_active_grow");

  const plant = input.selectedPlant;
  const plantId = normalizeId(plant?.id);
  if (!plant || !plantId) return blocked("missing_plant");
  if (isInactiveQuickLogPlant(plant)) return blocked("plant_inactive");

  const plantGrowId = normalizeId(plant.grow_id);
  if (!plantGrowId) return blocked("plant_grow_unassigned");
  const plantTentId = normalizeId(plant.tent_id);
  if (!plantTentId) return blocked("plant_tent_unassigned");
  if (plantGrowId !== activeGrowId) return blocked("active_grow_mismatch");

  const tent = input.selectedTent;
  const selectedTentId = normalizeId(tent?.id);
  if (!tent || !selectedTentId) return blocked("tent_not_found");
  if (tentIsInactive(tent)) return blocked("tent_inactive");
  if (selectedTentId !== plantTentId) return blocked("selected_tent_mismatch");

  const tentGrowId = normalizeId(tent.grow_id);
  if (!tentGrowId) return blocked("tent_grow_unassigned");
  if (tentGrowId !== plantGrowId) return blocked("tent_grow_mismatch");

  return ready(plantId, plantGrowId, plantTentId);
}
