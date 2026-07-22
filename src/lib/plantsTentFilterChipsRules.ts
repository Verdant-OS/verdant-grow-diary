/**
 * Pure helper for the Plants page tent filter chips (AUD-005).
 *
 * The chip row IS the tent picker — so each chip's count must reflect
 * exactly what the user would see in the grid if they clicked that chip,
 * given the *other* active filters (archived toggle + search). Previously
 * chip counts ignored the search input, producing chip totals that did
 * not match the rendered card count.
 *
 * Pipeline applied here (mirrors src/pages/Plants.tsx):
 *
 *   allPlants
 *     -> archived visibility (showArchived ? all : active-only)
 *     -> search (name / strain / tent label, case-insensitive)
 *     -> per-tent bucket
 *
 * Read-only. No I/O, no React, no Supabase, no schema, no RLS.
 */

import {
  filterVisiblePlants,
  type ArchivedPlantLike,
} from "./archivedPlantVisibilityRules";
import { filterPlantsBySearch } from "./plantsPageFilterRules";

interface ChipPlantLike extends ArchivedPlantLike {
  id: string;
  name?: string | null;
  strain?: string | null;
  tentId?: string | null;
}

interface ChipTentLike {
  id: string;
  name?: string | null;
}

/**
 * Sentinel id for the "No tent" chip. plants.tent_id is legitimately
 * nullable, so plants outside every tent need their own bucket or the
 * per-tent chip counts never sum to the "All tents" total. Deliberately
 * non-UUID so it can never collide with a real tent id.
 */
export const NO_TENT_FILTER_CHIP_ID = "__no_tent__";

/** Display name for the no-tent bucket chip. */
export const NO_TENT_FILTER_CHIP_NAME = "No tent";

/**
 * True when the plant belongs to no tent. The adapter maps a null tent_id
 * to "" (see mapPlantRow), so both null/undefined and "" count.
 */
function hasNoTent(p: { tentId?: string | null }): boolean {
  return !p.tentId;
}

export interface PlantsTentFilterChip {
  /** "all", a tent id, or the NO_TENT_FILTER_CHIP_ID sentinel. */
  id: string;
  /** Display label, e.g. "All tents" or the tent name. */
  name: string;
  /** Number of plants visible in this bucket under the current filters. */
  count: number;
}

export interface BuildPlantsTentFilterChipsOptions {
  showArchived: boolean;
  search: string;
}

/**
 * Build the tent filter chips so each chip's count matches what the grid
 * would render if that chip were selected. Archived visibility and the
 * current search query are applied first; per-tent buckets are derived
 * from the resulting set.
 */
export function buildPlantsTentFilterChips(
  plants: ReadonlyArray<ChipPlantLike>,
  tents: ReadonlyArray<ChipTentLike>,
  opts: BuildPlantsTentFilterChipsOptions,
): PlantsTentFilterChip[] {
  const afterArchive = filterVisiblePlants(plants, { showArchived: opts.showArchived });
  const afterSearch = filterPlantsBySearch(afterArchive, opts.search ?? "", tents);

  const all: PlantsTentFilterChip = {
    id: "all",
    name: "All tents",
    count: afterSearch.length,
  };

  const perTent: PlantsTentFilterChip[] = tents.map((t) => ({
    id: t.id,
    name: t.name ?? "Untitled tent",
    count: afterSearch.filter((p) => p.tentId === t.id).length,
  }));

  // "No tent" bucket — plants.tent_id is nullable, so unassigned plants
  // would otherwise be countable under "All tents" but reachable from no
  // chip. The chip exists while the archive-visible set has unassigned
  // plants; its count follows the same post-search pipeline as every
  // other chip so totals keep reconciling while the user types.
  const noTent: PlantsTentFilterChip[] = afterArchive.some(hasNoTent)
    ? [
        {
          id: NO_TENT_FILTER_CHIP_ID,
          name: NO_TENT_FILTER_CHIP_NAME,
          count: afterSearch.filter(hasNoTent).length,
        },
      ]
    : [];

  return [all, ...perTent, ...noTent];
}

/**
 * Filter plants to the bucket a chip selects: "all" returns the input
 * untouched, the NO_TENT_FILTER_CHIP_ID sentinel selects plants with no
 * tent, and any other id selects that tent's plants.
 */
export function filterPlantsByTentChip<T extends { tentId?: string | null }>(
  plants: ReadonlyArray<T>,
  chipId: string,
): T[] {
  if (chipId === "all") return [...plants];
  if (chipId === NO_TENT_FILTER_CHIP_ID) return plants.filter(hasNoTent);
  return plants.filter((p) => p.tentId === chipId);
}
