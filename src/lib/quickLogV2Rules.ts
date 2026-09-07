/**
 * QuickLog v2 — pure target/scope derivation.
 * No I/O, no JSX, deterministic.
 */

import { isInactiveQuickLogPlant } from "./quickLogPlantOptionRules";

export type QuickLogV2TargetType = "tent" | "plant";
export type QuickLogV2Action = "water" | "note" | "feed";

export interface QuickLogV2TargetOption {
  type: QuickLogV2TargetType;
  id: string;
  label: string;
  tentId: string | null;
  growId: string | null;
}

export interface PlantLike {
  id: string;
  name: string;
  tent_id: string | null;
  grow_id: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
  merged_into_plant_id?: string | null;
}
export interface TentLike {
  id: string;
  name: string;
  grow_id: string | null;
  is_archived?: boolean;
}

function hasLinkedGrowId(growId: string | null | undefined): boolean {
  return typeof growId === "string" && growId.trim().length > 0;
}

export function buildQuickLogV2TargetOptions(
  tents: TentLike[],
  plants: PlantLike[],
): QuickLogV2TargetOption[] {
  const out: QuickLogV2TargetOption[] = [];
  for (const t of tents) {
    if (t?.is_archived) continue;
    if (!t?.id) continue;
    // Fail closed: orphan tents with no grow cannot be selected (live FAIL:
    // "Tent · Flower" showed Grow "No grow linked" and accepted env saves).
    if (!hasLinkedGrowId(t.grow_id)) continue;
    out.push({
      type: "tent",
      id: t.id,
      label: t.name || "Tent",
      tentId: t.id,
      growId: t.grow_id ?? null,
    });
  }
  for (const p of plants) {
    // Canonical Quick Log rule (shared with the v1 picker): archived,
    // soft-archived (archived_at), and merged plants are never targets.
    if (!p?.id) continue;
    if (isInactiveQuickLogPlant(p)) continue;
    // Same grow-link fence as tents — plant rows without a grow are not
    // selectable write targets.
    if (!hasLinkedGrowId(p.grow_id)) continue;
    out.push({
      type: "plant",
      id: p.id,
      label: p.name || "Plant",
      tentId: p.tent_id ?? null,
      growId: p.grow_id ?? null,
    });
  }
  return out;
}

export interface ResolvedQuickLogV2Target {
  ok: boolean;
  reason?: string;
  targetType?: QuickLogV2TargetType;
  targetId?: string;
  tentId?: string | null;
  plantId?: string | null;
  growId?: string | null;
}

/**
 * Resolve the target the user actually selected. NEVER fall back to the
 * first loaded plant/tent.
 */
export function resolveQuickLogV2Target(
  options: QuickLogV2TargetOption[],
  selectedKey: string | null | undefined,
): ResolvedQuickLogV2Target {
  if (!selectedKey) return { ok: false, reason: "no_selection" };
  const match = options.find((o) => `${o.type}:${o.id}` === selectedKey);
  if (!match) return { ok: false, reason: "selection_not_found" };
  if (match.type === "plant") {
    return {
      ok: true,
      targetType: "plant",
      targetId: match.id,
      tentId: match.tentId ?? null,
      plantId: match.id,
      growId: match.growId ?? null,
    };
  }
  return {
    ok: true,
    targetType: "tent",
    targetId: match.id,
    tentId: match.id,
    plantId: null,
    growId: match.growId ?? null,
  };
}

/**
 * A missing selection is an incomplete draft; a selection that no longer
 * exists is stale context and must keep persistence controls fail-closed.
 */
export function isStaleQuickLogV2TargetSelection(resolved: ResolvedQuickLogV2Target): boolean {
  return resolved.ok === false && resolved.reason === "selection_not_found";
}

export interface QuickLogV2FormState {
  selectedKey: string | null;
  action: QuickLogV2Action;
  volumeMl: string;
  note: string;
  temperatureC: string;
  humidityPct: string;
  vpdKpa: string;
}

export const EMPTY_QUICKLOG_V2_FORM: QuickLogV2FormState = {
  selectedKey: null,
  action: "note",
  volumeMl: "",
  note: "",
  temperatureC: "",
  humidityPct: "",
  vpdKpa: "",
};

export function shouldShowVolumeField(action: QuickLogV2Action): boolean {
  return action === "water";
}

export function isPhotoSavingSupported(): boolean {
  return true;
}

/** Show type-to-filter inside Target Select when the list is this long or longer. */
export const QUICK_LOG_V2_TARGET_FILTER_THRESHOLD = 8;

export function formatQuickLogV2TargetOptionLabel(option: QuickLogV2TargetOption): string {
  return `${option.type === "tent" ? "Tent" : "Plant"} · ${option.label}`;
}

/**
 * Tent-scoped Target context from open intent / selected key.
 * Route registration already lands as `defaultTargetKey` (`tent:<id>`).
 */
export function resolveQuickLogV2TentContextId(
  openOrSelectedKey: string | null | undefined,
): string | null {
  if (typeof openOrSelectedKey !== "string") return null;
  const match = /^tent:(.+)$/.exec(openOrSelectedKey.trim());
  if (!match) return null;
  const tentId = match[1];
  return tentId.length > 0 ? tentId : null;
}

export interface TentScopedQuickLogV2TargetPartitions {
  tentId: string | null;
  inTentPlants: QuickLogV2TargetOption[];
  other: QuickLogV2TargetOption[];
  /** Flat order: in-tent plants first, then remaining options (tents kept). */
  ordered: QuickLogV2TargetOption[];
}

/**
 * Prioritize plants assigned to `tentId` without dropping tent targets.
 * When `tentId` is null, returns the input order unchanged.
 */
export function partitionQuickLogV2TargetOptionsForTent(
  options: QuickLogV2TargetOption[],
  tentId: string | null | undefined,
): TentScopedQuickLogV2TargetPartitions {
  if (!tentId) {
    return {
      tentId: null,
      inTentPlants: [],
      other: options.slice(),
      ordered: options.slice(),
    };
  }
  const inTentPlants: QuickLogV2TargetOption[] = [];
  const other: QuickLogV2TargetOption[] = [];
  for (const option of options) {
    if (option.type === "plant" && option.tentId === tentId) {
      inTentPlants.push(option);
    } else {
      other.push(option);
    }
  }
  return {
    tentId,
    inTentPlants,
    other,
    ordered: [...inTentPlants, ...other],
  };
}

/** Case-insensitive type-to-filter against the visible Target label. */
export function filterQuickLogV2TargetOptions(
  options: QuickLogV2TargetOption[],
  query: string | null | undefined,
): QuickLogV2TargetOption[] {
  const needle = typeof query === "string" ? query.trim().toLowerCase() : "";
  if (!needle) return options.slice();
  return options.filter((option) =>
    formatQuickLogV2TargetOptionLabel(option).toLowerCase().includes(needle),
  );
}

export interface ResolveTentScopedQuickLogPlantSelectionInput {
  tentId: string | null | undefined;
  options: QuickLogV2TargetOption[];
  /**
   * Current draft key. Auto-select only fills an empty/unset key.
   * Explicit `tent:<id>` (or any non-empty selection) is never rewritten.
   */
  selectedKey: string | null | undefined;
  /** Recent plant id when it should be preferred inside this tent. */
  recentPlantId?: string | null;
}

/**
 * When tent context is active and selectedKey is still empty/unset:
 * 1) prefer a recent plant that belongs to the tent
 * 2) else auto-select when exactly one plant is in that tent
 *
 * Fence: never rewrite an explicit `tent:<id>` (or plant:/any non-empty key).
 * Tent open intent may still supply tentContextId via defaultTargetKey while
 * the draft target stays a tent the grower (or test) chose.
 */
export function resolveTentScopedQuickLogPlantSelection(
  input: ResolveTentScopedQuickLogPlantSelectionInput,
): string | null {
  const tentId = typeof input.tentId === "string" && input.tentId.length > 0 ? input.tentId : null;
  if (!tentId) return null;

  const selected = typeof input.selectedKey === "string" ? input.selectedKey.trim() : "";
  // Explicit tent/plant (or any other) selection must not be rewritten.
  if (selected.length > 0) return null;

  const plantsInTent = input.options.filter(
    (option) => option.type === "plant" && option.tentId === tentId,
  );
  if (plantsInTent.length === 0) return null;

  const recentPlantId =
    typeof input.recentPlantId === "string" && input.recentPlantId.length > 0
      ? input.recentPlantId
      : null;
  if (recentPlantId && plantsInTent.some((plant) => plant.id === recentPlantId)) {
    return `plant:${recentPlantId}`;
  }

  if (plantsInTent.length === 1) {
    return `plant:${plantsInTent[0].id}`;
  }

  return null;
}
