/**
 * Tent Plant Tabs URL state — pure helpers for deep-linking the selected
 * plant tab on Tent Detail via a query parameter.
 *
 * Read-only, deterministic, null-safe. No React, no I/O, no Supabase,
 * no AI/model calls, no alerts, no Action Queue writes, no device control.
 *
 * URL contract:
 *   /tents/:tentId?plant=<plantId>
 *
 * Precedence on initial load:
 *   1. URL ?plant=<id> if it resolves to a visible plant in the tent → wins.
 *   2. URL ?plant=<id> referencing a non-visible/missing plant → "All plants".
 *   3. URL param absent → localStorage selected plant id if visible.
 *   4. Otherwise → "All plants" (null).
 */

export const TENT_PLANT_TABS_URL_PARAM = "plant";

const MAX_VALUE_LENGTH = 200;

export interface TentPlantTabsUrlPlantInput {
  id: string;
  isArchived?: boolean | null;
}

export type TentPlantTabsUrlResolutionSource = "url" | "storage" | "default";

export interface TentPlantTabsUrlResolution {
  selectedPlantId: string | null;
  source: TentPlantTabsUrlResolutionSource;
}

function normalizePlantId(plantId: unknown): string | null {
  if (typeof plantId !== "string") return null;
  const trimmed = plantId.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_VALUE_LENGTH) return null;
  return trimmed;
}

function toSearchParams(
  search: string | URLSearchParams | null | undefined,
): URLSearchParams {
  if (search == null) return new URLSearchParams();
  if (search instanceof URLSearchParams) return new URLSearchParams(search);
  try {
    return new URLSearchParams(search);
  } catch {
    return new URLSearchParams();
  }
}

export function readTentPlantTabsUrlPlantId(
  search: string | URLSearchParams | null | undefined,
): string | null {
  const params = toSearchParams(search);
  const raw = params.get(TENT_PLANT_TABS_URL_PARAM);
  return normalizePlantId(raw);
}

/**
 * Returns a new URLSearchParams with the `plant` param set or removed.
 * Preserves all other params. Never mutates the input.
 */
export function applyTentPlantTabsUrlPlantId(
  search: string | URLSearchParams | null | undefined,
  plantId: string | null | undefined,
): URLSearchParams {
  const next = toSearchParams(search);
  const normalized = normalizePlantId(plantId);
  if (normalized == null) {
    next.delete(TENT_PLANT_TABS_URL_PARAM);
  } else {
    next.set(TENT_PLANT_TABS_URL_PARAM, normalized);
  }
  return next;
}

function isVisiblePlant(
  plantId: string,
  plants: ReadonlyArray<TentPlantTabsUrlPlantInput>,
  includeArchived: boolean,
): boolean {
  const match = plants.find((p) => p && p.id === plantId);
  if (!match) return false;
  if (match.isArchived === true && !includeArchived) return false;
  return true;
}

export interface ResolveInitialSelectionInput {
  urlPlantId: string | null;
  storedPlantId: string | null;
  plants: ReadonlyArray<TentPlantTabsUrlPlantInput>;
  includeArchived: boolean;
}

export function resolveInitialTentPlantTabsSelection(
  input: ResolveInitialSelectionInput,
): TentPlantTabsUrlResolution {
  const plants = Array.isArray(input.plants) ? input.plants : [];
  const includeArchived = input.includeArchived === true;

  const urlId = normalizePlantId(input.urlPlantId);
  if (urlId != null) {
    if (isVisiblePlant(urlId, plants, includeArchived)) {
      return { selectedPlantId: urlId, source: "url" };
    }
    // URL provided but invalid: do NOT fall back to localStorage.
    return { selectedPlantId: null, source: "default" };
  }

  const storedId = normalizePlantId(input.storedPlantId);
  if (storedId != null && isVisiblePlant(storedId, plants, includeArchived)) {
    return { selectedPlantId: storedId, source: "storage" };
  }

  return { selectedPlantId: null, source: "default" };
}
