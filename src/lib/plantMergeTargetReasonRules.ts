/**
 * Pure helpers for the Merge Duplicate target picker.
 *
 * Classifies each candidate plant against the source plant + tent
 * context so the dialog can:
 *   - show a per-option reason label (selectable or disabled),
 *   - render a concise helper line summarizing what is hidden and why,
 *   - render a clear empty state when nothing is selectable.
 *
 * Cross-grow merges remain blocked. This module never enables them; it
 * only labels them so the grower understands why a plant is missing.
 *
 * No React. No Supabase. No I/O. Safe to unit-test in isolation.
 */

import {
  getEffectivePlantGrowId,
  isInactiveDropdownPlant,
  type PlantDropdownInput,
  type TentGrowRef,
} from "./plantDropdownEligibilityRules";

export type MergeTargetReason =
  | "same_grow"
  | "legacy_same_grow"
  | "different_grow"
  | "source_plant"
  | "archived_or_merged"
  | "missing_grow_context";

export interface MergeTargetClassification {
  plant: PlantDropdownInput;
  reason: MergeTargetReason;
  /** True when the option may be chosen as the merge target. */
  selectable: boolean;
  /** True when the option should render but cannot be chosen. */
  disabled: boolean;
  /** True when the option should not render in the picker at all. */
  hidden: boolean;
  effectiveGrowId: string | null;
}

export interface MergeTargetVisibilitySummary {
  total: number;
  sameGrow: number;
  legacySameGrow: number;
  differentGrow: number;
  archivedOrMerged: number;
  missingGrowContext: number;
  sourcePlantExcluded: number;
  /** Sum of selectable options (same_grow + legacy_same_grow). */
  selectable: number;
}

export const MERGE_TARGET_REASON_LABELS: Record<MergeTargetReason, string> = {
  same_grow: "Same grow — can merge",
  legacy_same_grow: "Legacy plant — grow derived from assigned tent",
  different_grow: "Different grow — cannot merge",
  source_plant: "Source plant — cannot merge into itself",
  archived_or_merged: "Archived/merged — hidden by default",
  missing_grow_context: "Missing grow context — repair from plant page",
};

export function formatMergeTargetReason(reason: MergeTargetReason): string {
  return MERGE_TARGET_REASON_LABELS[reason];
}

/**
 * Classifies a single candidate plant against the source + tents.
 * Pure and deterministic.
 */
export function classifyMergeTargetOption(
  source: PlantDropdownInput,
  candidate: PlantDropdownInput,
  tents: readonly TentGrowRef[] = [],
): MergeTargetClassification {
  const sourceEff = getEffectivePlantGrowId(source, tents);
  const candEff = getEffectivePlantGrowId(candidate, tents);

  if (candidate.id === source.id) {
    return {
      plant: candidate,
      reason: "source_plant",
      selectable: false,
      disabled: false,
      hidden: true,
      effectiveGrowId: candEff,
    };
  }

  if (isInactiveDropdownPlant(candidate)) {
    return {
      plant: candidate,
      reason: "archived_or_merged",
      selectable: false,
      disabled: false,
      hidden: true,
      effectiveGrowId: candEff,
    };
  }

  if (!candEff) {
    // Visible-but-disabled so the grower sees the candidate and can
    // repair its grow context from the plant page.
    return {
      plant: candidate,
      reason: "missing_grow_context",
      selectable: false,
      disabled: true,
      hidden: false,
      effectiveGrowId: candEff,
    };
  }

  if (!sourceEff || candEff !== sourceEff) {
    return {
      plant: candidate,
      reason: "different_grow",
      selectable: false,
      disabled: false,
      hidden: true,
      effectiveGrowId: candEff,
    };
  }

  // Same effective grow. Legacy when raw grow_id is null but tent
  // assignment supplied the grow id.
  const rawGrowId = candidate.grow_id ?? candidate.growId ?? null;
  const isLegacy = !rawGrowId;
  return {
    plant: candidate,
    reason: isLegacy ? "legacy_same_grow" : "same_grow",
    selectable: true,
    disabled: false,
    hidden: false,
    effectiveGrowId: candEff,
  };
}

export function classifyMergeTargetOptions(
  source: PlantDropdownInput,
  candidates: readonly PlantDropdownInput[],
  tents: readonly TentGrowRef[] = [],
): MergeTargetClassification[] {
  return candidates.map((c) => classifyMergeTargetOption(source, c, tents));
}

export function summarizeMergeTargetVisibility(
  source: PlantDropdownInput,
  candidates: readonly PlantDropdownInput[],
  tents: readonly TentGrowRef[] = [],
): MergeTargetVisibilitySummary {
  const summary: MergeTargetVisibilitySummary = {
    total: candidates.length,
    sameGrow: 0,
    legacySameGrow: 0,
    differentGrow: 0,
    archivedOrMerged: 0,
    missingGrowContext: 0,
    sourcePlantExcluded: 0,
    selectable: 0,
  };
  for (const c of candidates) {
    const decision = classifyMergeTargetOption(source, c, tents);
    switch (decision.reason) {
      case "same_grow":
        summary.sameGrow += 1;
        summary.selectable += 1;
        break;
      case "legacy_same_grow":
        summary.legacySameGrow += 1;
        summary.selectable += 1;
        break;
      case "different_grow":
        summary.differentGrow += 1;
        break;
      case "archived_or_merged":
        summary.archivedOrMerged += 1;
        break;
      case "missing_grow_context":
        summary.missingGrowContext += 1;
        break;
      case "source_plant":
        summary.sourcePlantExcluded += 1;
        break;
    }
  }
  return summary;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * Builds a short helper line for under the merge target picker.
 * Returns "" when nothing notable needs to be disclosed.
 */
export function formatMergeTargetHelperText(
  summary: MergeTargetVisibilitySummary,
): string {
  const parts: string[] = [];
  const selectable = summary.selectable;
  if (selectable > 0) {
    parts.push(
      `Showing ${selectable} same-grow ${plural(selectable, "target", "targets")}.`,
    );
  }
  if (summary.archivedOrMerged > 0) {
    parts.push(`${summary.archivedOrMerged} archived/merged hidden.`);
  }
  if (summary.differentGrow > 0) {
    parts.push(
      `${summary.differentGrow} different-grow ${plural(summary.differentGrow, "plant", "plants")} hidden.`,
    );
  }
  if (summary.missingGrowContext > 0) {
    parts.push(
      `${summary.missingGrowContext} ${plural(summary.missingGrowContext, "plant", "plants")} missing grow context.`,
    );
  }
  if (summary.legacySameGrow > 0) {
    parts.push(
      `Using tent assignment to derive grow context for ${summary.legacySameGrow} legacy ${plural(summary.legacySameGrow, "plant", "plants")}.`,
    );
  }
  return parts.join(" ");
}

export const MERGE_TARGET_EMPTY_STATE =
  "No same-grow merge targets available.";

export const MERGE_TARGET_SOURCE_MISSING_GROW_CONTEXT =
  "This plant is missing grow context. Assign it to a tent in a grow before merging.";
