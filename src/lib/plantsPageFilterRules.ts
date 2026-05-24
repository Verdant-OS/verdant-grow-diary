/**
 * Pure helpers for the Plants page filter/search controls.
 *
 * These helpers exist to keep the Plants page's grow filter and plant
 * search behavior deterministic and unit-testable, and to make it obvious
 * that the grow switcher and the plant search are two different concerns:
 *
 *   - Grow filter: narrows which plants are eligible to show (by grow_id).
 *   - Plant search: filters the already-eligible plants by free text
 *     against name / strain / tent label.
 *
 * Read-only UI rules. No I/O, no writes, no device control, no privileged
 * access. Safe to use anywhere in the client.
 */

export interface PlantsPageGrowOption {
  /** "" represents the "All grows" pseudo-option. */
  id: string;
  name: string;
  /** Number of *active* (non-archived/non-merged) plants in this grow. */
  plantCount: number;
  /** Display label, e.g. "Sour Diesel Auto (3 plants)" or "All grows (5 plants)". */
  label: string;
}

export interface PlantsPageFilterInputs {
  selectedGrowId: string | null;
  selectedGrowName: string | null;
  search: string;
}

export interface PlantsPageFilterSummary {
  activeCount: number;
  archivedHiddenCount: number;
  scopeLabel: string; // "across all grows" | "in {Grow Name}"
  searchActive: boolean;
}

interface MinimalGrow {
  id: string;
  name?: string | null;
}

interface MinimalTent {
  id: string;
  name?: string | null;
}

interface MinimalPlant {
  id: string;
  name?: string | null;
  strain?: string | null;
  growId?: string | null;
  tentId?: string | null;
  isArchived?: boolean | null;
  archivedAt?: string | null;
  mergedIntoPlantId?: string | null;
}

function isInactive(p: MinimalPlant): boolean {
  return !!(p.isArchived || p.archivedAt || p.mergedIntoPlantId);
}

function pluralPlants(n: number): string {
  return n === 1 ? "1 plant" : `${n} plants`;
}

/**
 * Build the options for the grow filter control. Always includes a leading
 * "All grows" option whose count reflects every *active* plant the user
 * can see. Counts always reflect active plants only — archived/merged
 * plants are handled separately by the archived toggle.
 */
export function buildGrowFilterOptions(
  grows: ReadonlyArray<MinimalGrow>,
  plants: ReadonlyArray<MinimalPlant>,
): PlantsPageGrowOption[] {
  const activePlants = plants.filter((p) => !isInactive(p));
  const totalActive = activePlants.length;

  const perGrow: PlantsPageGrowOption[] = grows.map((g) => {
    const count = activePlants.filter((p) => p.growId === g.id).length;
    const name = g.name ?? "Untitled grow";
    return {
      id: g.id,
      name,
      plantCount: count,
      label: `${name} (${pluralPlants(count)})`,
    };
  });

  return [
    {
      id: "",
      name: "All grows",
      plantCount: totalActive,
      label: `All grows (${pluralPlants(totalActive)})`,
    },
    ...perGrow,
  ];
}

/**
 * Filter plants to those belonging to the selected grow. A null/empty
 * selectedGrowId means "All grows" — return the input untouched.
 */
export function filterPlantsByGrow<T extends MinimalPlant>(
  plants: ReadonlyArray<T>,
  selectedGrowId: string | null,
): T[] {
  if (!selectedGrowId) return [...plants];
  return plants.filter((p) => p.growId === selectedGrowId);
}

/**
 * Filter plants by a free-text query against plant name, strain, and the
 * resolved tent label. Empty/whitespace queries return the input untouched.
 * Matching is case-insensitive and tolerant of missing fields.
 */
export function filterPlantsBySearch<T extends MinimalPlant>(
  plants: ReadonlyArray<T>,
  query: string,
  tents: ReadonlyArray<MinimalTent>,
): T[] {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return [...plants];
  const tentNameById = new Map<string, string>();
  for (const t of tents) tentNameById.set(t.id, (t.name ?? "").toLowerCase());
  return plants.filter((p) => {
    const haystacks = [
      (p.name ?? "").toLowerCase(),
      (p.strain ?? "").toLowerCase(),
      p.tentId ? tentNameById.get(p.tentId) ?? "" : "",
    ];
    return haystacks.some((h) => h.includes(q));
  });
}

/**
 * Summarize the current filter state for the helper line under the
 * Plants page filter controls.
 */
export function summarizePlantsPageFilters(
  plants: ReadonlyArray<MinimalPlant>,
  filters: PlantsPageFilterInputs,
): PlantsPageFilterSummary {
  const active = plants.filter((p) => !isInactive(p));
  const archivedHidden = plants.filter(isInactive).length;
  const scopeLabel = filters.selectedGrowId
    ? `in ${filters.selectedGrowName ?? "this grow"}`
    : "across all grows";
  return {
    activeCount: active.length,
    archivedHiddenCount: archivedHidden,
    scopeLabel,
    searchActive: (filters.search ?? "").trim().length > 0,
  };
}

/**
 * Format the filter summary into a single line of helper copy.
 * Examples:
 *   - "Showing 3 active plants across all grows"
 *   - "Showing 1 active plant in Sour Diesel Auto"
 *   - "Showing 0 active plants in this grow"
 */
export function formatPlantsPageFilterSummary(
  summary: PlantsPageFilterSummary,
): string {
  return `Showing ${pluralPlants(summary.activeCount)} ${summary.scopeLabel}`;
}

/**
 * Empty-state copy for the visible plant list, given filter state and the
 * number of plants visible after both filters are applied.
 */
export function plantsPageEmptyStateCopy(
  visibleCount: number,
  filters: PlantsPageFilterInputs,
): string | null {
  if (visibleCount > 0) return null;
  if ((filters.search ?? "").trim().length > 0) {
    return "No plants match this search.";
  }
  if (filters.selectedGrowId) {
    return "No plants in this grow yet.";
  }
  return "No plants yet.";
}
