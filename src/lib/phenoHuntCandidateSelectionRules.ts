/**
 * phenoHuntCandidateSelectionRules — pure helpers for select-all and min-2
 * preflight on Pheno Hunt candidate step.
 *
 * Create still allows 1+ candidates (tracking-only hunts). Comparison readiness
 * needs 2+. These helpers only shape UI selection + copy — they do not change
 * createPhenoHunt server contracts.
 */

export const PHENO_COMPARISON_MIN_CANDIDATES = 2 as const;

export interface CandidateSelectionPreflight {
  availableCount: number;
  selectedCount: number;
  allSelected: boolean;
  noneSelected: boolean;
  canSelectAll: boolean;
  canClear: boolean;
  /** True when selectedCount >= PHENO_COMPARISON_MIN_CANDIDATES */
  comparisonMinMet: boolean;
  /** True when at least one candidate is selected (create-eligible for tracking). */
  trackingMinMet: boolean;
  selectAllLabel: string;
  clearLabel: string;
  /** Short status line under the list / next to select-all. */
  preflightMessage: string;
  /** Stronger callout when comparison is possible but not yet met. */
  comparisonHint: string | null;
}

export function toggleIdInSet(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectAllIds(plantIds: ReadonlyArray<string>): Set<string> {
  return new Set(plantIds.filter((id) => typeof id === "string" && id.length > 0));
}

export function clearSelection(): Set<string> {
  return new Set();
}

/**
 * Whether to auto-select every available plant once the list first loads.
 * Only when there are enough plants for a comparison-ready starting set.
 */
export function shouldAutoSelectAllOnLoad(availableCount: number): boolean {
  return availableCount >= PHENO_COMPARISON_MIN_CANDIDATES;
}

export function buildCandidateSelectionPreflight(input: {
  availablePlantIds: ReadonlyArray<string>;
  selectedIds: ReadonlyArray<string> | ReadonlySet<string>;
}): CandidateSelectionPreflight {
  const available = input.availablePlantIds.filter((id) => typeof id === "string" && id.length > 0);
  const selectedRaw =
    input.selectedIds instanceof Set
      ? Array.from(input.selectedIds)
      : Array.from(input.selectedIds);
  const selected = selectedRaw.filter((id) => typeof id === "string" && id.length > 0);
  // Only count selections that still exist in the available list
  const availableSet = new Set(available);
  const selectedInList = selected.filter((id) => availableSet.has(id));
  const availableCount = available.length;
  const selectedCount = selectedInList.length;
  const allSelected = availableCount > 0 && selectedCount === availableCount;
  const noneSelected = selectedCount === 0;
  const comparisonMinMet = selectedCount >= PHENO_COMPARISON_MIN_CANDIDATES;
  const trackingMinMet = selectedCount >= 1;

  let preflightMessage: string;
  if (availableCount === 0) {
    preflightMessage = "No plants available to select.";
  } else if (noneSelected) {
    preflightMessage =
      availableCount >= PHENO_COMPARISON_MIN_CANDIDATES
        ? `Select at least ${PHENO_COMPARISON_MIN_CANDIDATES} plants for comparison, or 1 to track a single phenotype.`
        : "Select at least 1 plant to create a tracking hunt. Add another plant later for comparison.";
  } else if (!comparisonMinMet) {
    preflightMessage =
      availableCount >= PHENO_COMPARISON_MIN_CANDIDATES
        ? `1 selected — tracking only. Select ${PHENO_COMPARISON_MIN_CANDIDATES - selectedCount} more for comparison.`
        : "1 selected — tracking only (need another plant in this grow for comparison).";
  } else {
    preflightMessage = `${selectedCount} selected — comparison-eligible.`;
  }

  const comparisonHint =
    availableCount >= PHENO_COMPARISON_MIN_CANDIDATES && !comparisonMinMet
      ? `Tip: select ${PHENO_COMPARISON_MIN_CANDIDATES}+ candidates to compare phenotypes side by side.`
      : null;

  return {
    availableCount,
    selectedCount,
    allSelected,
    noneSelected,
    canSelectAll: availableCount > 0 && !allSelected,
    canClear: selectedCount > 0,
    comparisonMinMet,
    trackingMinMet,
    selectAllLabel: allSelected ? "All selected" : "Select all",
    clearLabel: "Clear",
    preflightMessage,
    comparisonHint,
  };
}
