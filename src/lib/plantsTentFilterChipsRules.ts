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

export interface PlantsTentFilterChip {
  /** "all" or a tent id. */
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

  return [all, ...perTent];
}
