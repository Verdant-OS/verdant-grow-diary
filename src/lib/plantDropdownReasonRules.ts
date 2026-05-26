/**
 * Pure, deterministic helpers that turn plant-dropdown eligibility data
 * into grower-facing copy: helper text under a dropdown, disabled
 * reason strings on individual options, and empty-state messages.
 *
 * No I/O. No React. No Supabase. No writes. Safe to unit test in
 * isolation. Builds on top of `plantDropdownEligibilityRules.ts`.
 */

import type {
  ExclusionReason,
  PlantDropdownContext,
  PlantDropdownExclusionSummary,
  PlantDropdownOption,
} from "./plantDropdownEligibilityRules";

export const REASON_LABELS: Record<ExclusionReason, string> = {
  archived_or_merged: "Archived or merged — kept for history.",
  missing_grow_context: "Missing grow context — repair from plant page.",
  cross_grow: "Different grow — cannot merge.",
  source_plant: "Source plant — cannot merge into itself.",
  already_in_tent: "Already in this tent.",
  no_tent_assigned: "No tent assignment.",
};

export type PlantDropdownVisibility = PlantDropdownExclusionSummary;

/** Pass-through alias so dialogs can rename for clarity at call sites. */
export function summarizePlantDropdownVisibility(
  summary: PlantDropdownExclusionSummary,
): PlantDropdownVisibility {
  return { ...summary };
}

/**
 * Reason text for a disabled option. Returns null when the option is
 * not disabled. Used as visible suffix AND aria-label so screen readers
 * hear it (no hover-only tooltip).
 */
export function getPlantOptionDisabledReason(option: PlantDropdownOption): string | null {
  if (!option.disabled) return null;
  if (option.reason) return option.reason;
  if (option.reasonCode) return REASON_LABELS[option.reasonCode];
  return null;
}

/**
 * Short, count-aware copy for a single hidden-bucket reason.
 * Returns "" when count <= 0.
 */
export function formatHiddenPlantReason(reason: ExclusionReason, count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  const n = Math.trunc(count);
  const plural = n === 1 ? "plant" : "plants";
  switch (reason) {
    case "archived_or_merged":
      return `${n} archived/merged hidden.`;
    case "missing_grow_context":
      return `${n} ${plural} missing grow context.`;
    case "cross_grow":
      return `${n} in another grow.`;
    case "source_plant":
      return `${n} source ${plural} excluded.`;
    case "already_in_tent":
      return `${n} ${plural} already in this tent.`;
    case "no_tent_assigned":
      return `${n} ${plural} without a tent.`;
  }
}

export interface PlantDropdownHelperOptions {
  growName?: string | null;
  /** When false, omit "from {Grow Name}" suffix even if growName is set. */
  showGrowName?: boolean;
}

/**
 * Builds a short helper line for under a dropdown:
 *   "Showing 2 active plants from Tent A. 1 archived/merged hidden."
 * Returns "" when there is nothing notable to disclose.
 */
export function getPlantDropdownHelperText(
  visibility: PlantDropdownVisibility,
  opts: PlantDropdownHelperOptions = {},
): string {
  const v = visibility.visible;
  const verb = v === 1 ? "plant" : "plants";
  let head = `Showing ${v} active ${verb}`;
  if (opts.growName && opts.showGrowName !== false) {
    head += ` from ${opts.growName}`;
  }
  head += ".";
  const parts: string[] = [head];
  const add = (reason: ExclusionReason, n: number) => {
    const t = formatHiddenPlantReason(reason, n);
    if (t) parts.push(t);
  };
  add("archived_or_merged", visibility.hiddenArchived);
  add("missing_grow_context", visibility.hiddenMissingGrow);
  add("cross_grow", visibility.hiddenCrossGrow);
  add("already_in_tent", visibility.hiddenAlreadyInTent);
  return parts.join(" ");
}

/** Empty-state copy when a dropdown has zero selectable options. */
export function formatPlantDropdownEmptyState(context: PlantDropdownContext): string {
  switch (context) {
    case "add_existing_to_tent":
      return "No eligible plants available for this tent.";
    case "merge_target":
      return "No same-grow merge targets available.";
    case "quick_log":
    case "daily_check":
    case "generic_active_plant":
      return "No plants available in this grow yet.";
    case "move_to_tent":
    case "edit_plant_tent":
      return "No other tents available for this plant.";
    case "logs_filter":
      return "No plants match the current filters.";
  }
}
