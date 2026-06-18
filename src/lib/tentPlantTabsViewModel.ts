/**
 * tentPlantTabsViewModel — pure helper that drives the read-only plant
 * tab strip on Tent Detail.
 *
 * Deterministic. No React, no I/O, no Supabase, no AI/model calls, no
 * alerts, no Action Queue writes, no device control.
 *
 * Resolves an "All plants" tab plus one tab per visible plant in the tent
 * and a safe, deterministic selection (auto-resets when the selected
 * plant is archived but archived is hidden, or when the selection refers
 * to a plant that is not in the tent's plant list).
 */

export interface TentPlantTabsPlantInput {
  id: string;
  name?: string | null;
  isArchived?: boolean | null;
}

export interface TentPlantTabsInput {
  plants: ReadonlyArray<TentPlantTabsPlantInput>;
  includeArchived: boolean;
  /** Caller's desired selection — null means "All plants". */
  selectedPlantId: string | null;
}

export interface TentPlantTabOption {
  /** null for the "All plants" tab; otherwise the plant id. */
  id: string | null;
  label: string;
  isSelected: boolean;
  isArchived: boolean;
  ariaLabel: string;
  testId: string;
}

export type TentPlantTabsSelectionResetReason =
  | "no-plants"
  | "archived-hidden"
  | "missing";

export interface TentPlantTabsViewModel {
  tabs: TentPlantTabOption[];
  selectedPlantId: string | null;
  selectedPlantName: string | null;
  filteredPlantIds: string[];
  allPlantsCopy: string;
  selectedPlantCopy: string | null;
  sharedEnvironmentReminderCopy: string;
  emptyNoPlantsCopy: string;
  emptySelectedPlantActivityCopy: string;
  /** True when the caller's selectedPlantId could not be honored. */
  selectionWasReset: boolean;
  selectionResetReason: TentPlantTabsSelectionResetReason | null;
}

export const TENT_PLANT_TABS_ALL_COPY = "Viewing all plants in this tent.";
export const TENT_PLANT_TABS_SHARED_ENV_COPY =
  "Tent environment is shared. Plant response is tracked per plant.";
export const TENT_PLANT_TABS_EMPTY_NO_PLANTS_COPY =
  "No plants assigned to this tent yet.";
export const TENT_PLANT_TABS_EMPTY_SELECTED_PLANT_COPY =
  "No plant-specific activity found for this plant yet.";
export const TENT_PLANT_TABS_ALL_LABEL = "All plants";

function plantDisplayName(p: TentPlantTabsPlantInput): string {
  const name = typeof p.name === "string" ? p.name.trim() : "";
  return name.length > 0 ? name : "Unnamed plant";
}

function selectedPlantCopyFor(name: string): string {
  return `Viewing plant-specific activity for ${name}.`;
}

export function buildTentPlantTabsViewModel(
  input: TentPlantTabsInput,
): TentPlantTabsViewModel {
  const includeArchived = input.includeArchived === true;
  const allPlants = Array.isArray(input.plants) ? input.plants : [];

  // Stable order preserved from caller; archived filtering only.
  const visible = allPlants.filter((p) =>
    includeArchived ? true : p.isArchived !== true,
  );

  // Resolve selection deterministically.
  let resolvedSelection: string | null = null;
  let selectionWasReset = false;
  let selectionResetReason: TentPlantTabsSelectionResetReason | null = null;

  if (input.selectedPlantId == null) {
    resolvedSelection = null;
  } else {
    const inAll = allPlants.find((p) => p.id === input.selectedPlantId) ?? null;
    const inVisible =
      visible.find((p) => p.id === input.selectedPlantId) ?? null;
    if (inVisible) {
      resolvedSelection = input.selectedPlantId;
    } else if (inAll && inAll.isArchived === true && !includeArchived) {
      resolvedSelection = null;
      selectionWasReset = true;
      selectionResetReason = "archived-hidden";
    } else {
      resolvedSelection = null;
      selectionWasReset = true;
      selectionResetReason = "missing";
    }
  }

  const tabs: TentPlantTabOption[] = [
    {
      id: null,
      label: TENT_PLANT_TABS_ALL_LABEL,
      isSelected: resolvedSelection === null,
      isArchived: false,
      ariaLabel: `${TENT_PLANT_TABS_ALL_LABEL} (${visible.length})`,
      testId: "tent-plant-tabs-tab-all",
    },
    ...visible.map<TentPlantTabOption>((p) => {
      const name = plantDisplayName(p);
      const isArchived = p.isArchived === true;
      return {
        id: p.id,
        label: name,
        isSelected: resolvedSelection === p.id,
        isArchived,
        ariaLabel: isArchived ? `${name} (archived)` : name,
        testId: `tent-plant-tabs-tab-${p.id}`,
      };
    }),
  ];

  const selectedPlant =
    resolvedSelection == null
      ? null
      : visible.find((p) => p.id === resolvedSelection) ?? null;
  const selectedPlantName = selectedPlant ? plantDisplayName(selectedPlant) : null;

  const filteredPlantIds =
    resolvedSelection == null
      ? visible.map((p) => p.id)
      : selectedPlant
        ? [selectedPlant.id]
        : [];

  if (visible.length === 0 && allPlants.length === 0 && !selectionWasReset) {
    selectionResetReason = "no-plants";
  }

  return {
    tabs,
    selectedPlantId: resolvedSelection,
    selectedPlantName,
    filteredPlantIds,
    allPlantsCopy: TENT_PLANT_TABS_ALL_COPY,
    selectedPlantCopy: selectedPlantName
      ? selectedPlantCopyFor(selectedPlantName)
      : null,
    sharedEnvironmentReminderCopy: TENT_PLANT_TABS_SHARED_ENV_COPY,
    emptyNoPlantsCopy: TENT_PLANT_TABS_EMPTY_NO_PLANTS_COPY,
    emptySelectedPlantActivityCopy: TENT_PLANT_TABS_EMPTY_SELECTED_PLANT_COPY,
    selectionWasReset,
    selectionResetReason,
  };
}
