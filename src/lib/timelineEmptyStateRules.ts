/**
 * timelineEmptyStateRules — pure rules for the Operator Mode diary timeline
 * empty states.
 *
 * The timeline is the grower's central hub. When it has nothing to show, the
 * page must say exactly WHY it is empty and offer the fastest honest next
 * step — never a generic shrug, and never an implication that Verdant will
 * log something on the grower's behalf.
 *
 * Hard constraints:
 *  - No I/O, no React, no Supabase, no clock reads. Deterministic.
 *  - Never claims data is missing when a read actually failed. The
 *    "read incomplete" case is owned by the caller and is NOT an empty state.
 *  - Fast-add affordances resolve through `fastAddActionRules`; this module
 *    only decides WHICH presets to surface and what to say.
 *  - Copy never promises automation. The grower logs; Verdant records.
 */

import type { FastAddActionId, FastAddSelectionContext } from "./fastAddActionRules";

/**
 * Which empty situation the timeline is in. These are mutually exclusive and
 * are resolved in priority order by `resolveTimelineEmptyState`.
 */
export type TimelineEmptyStateKind =
  /** The grower has no diary entries at all in this scope. */
  | "no_entries"
  /** Entries exist, but the evidence-only filter excluded all of them. */
  | "evidence_filtered"
  /** Entries exist, but the active filters excluded all of them. */
  | "filtered_out";

export interface TimelineEmptyStateInput {
  /** Total entries loaded for the current scope, before filtering. */
  totalEntryCount: number;
  /** Entries remaining after all active filters are applied. */
  filteredEntryCount: number;
  /** True when the evidence-only filter is active. */
  evidenceFilterActive: boolean;
  /** True when any non-evidence filter (search, stage, event, date, plant, tent) is set. */
  otherFiltersActive: boolean;
  /** Current plant/tent selection, used to decide if fast add can act. */
  context?: FastAddSelectionContext | null;
}

export interface TimelineEmptyStateAction {
  /** Fast-add preset to run. Resolved by the caller via resolveFastAddIntent. */
  actionId: FastAddActionId;
  label: string;
}

export interface TimelineEmptyStateView {
  kind: TimelineEmptyStateKind;
  title: string;
  description: string;
  /**
   * Fast-add presets to offer inline. Empty when the situation is a filter
   * problem rather than a "nothing logged yet" problem — offering a log
   * button there would be answering the wrong question.
   */
  actions: readonly TimelineEmptyStateAction[];
  /**
   * True when the grower must pick a plant or tent before the offered
   * actions can do anything. The caller renders the picker CTAs.
   */
  needsContext: boolean;
  /** True when the caller should offer a "Clear filters" control. */
  offersClearFilters: boolean;
}

/**
 * The three presets a grower reaches for first on an empty timeline. Kept
 * deliberately short — a wall of eight buttons is not a fast path.
 */
export const TIMELINE_EMPTY_STATE_ACTIONS: readonly TimelineEmptyStateAction[] = [
  { actionId: "photo", label: "Log a photo" },
  { actionId: "diary_note", label: "Log a note" },
  { actionId: "watering", label: "Log a watering" },
] as const;

export const TIMELINE_EMPTY_NO_ENTRIES_TITLE = "No entries yet";
export const TIMELINE_EMPTY_NO_ENTRIES_DESC =
  "Your diary starts with one entry. Log a photo and a short note today, then again tomorrow — that repeated record is what makes the next grow easier to read.";
export const TIMELINE_EMPTY_NO_ENTRIES_NEEDS_CONTEXT_DESC =
  "Your diary starts with one entry. Choose a plant or tent first, then log a photo and a short note.";

export const TIMELINE_EMPTY_FILTERED_TITLE = "No entries match these filters";
export const TIMELINE_EMPTY_FILTERED_DESC =
  "Entries exist in this grow, but none match the current filters. Widen the date range or clear a filter to see them.";

export const TIMELINE_EMPTY_EVIDENCE_TITLE = "No evidence-backed entries match";
export const TIMELINE_EMPTY_EVIDENCE_DESC =
  "The evidence-only filter hides entries without an attached photo or sensor reading. Those entries are still in your diary — clear the filter to see them.";

function hasSelectionContext(ctx: FastAddSelectionContext | null | undefined): boolean {
  if (!ctx) return false;
  return Boolean(ctx.plantId || ctx.tentId);
}

/**
 * Resolve which empty state the timeline should render.
 *
 * Returns null when the timeline is NOT empty — the caller renders entries.
 * Priority: nothing logged at all > evidence filter > other filters.
 */
export function resolveTimelineEmptyState(
  input: TimelineEmptyStateInput,
): TimelineEmptyStateView | null {
  const total = Number.isFinite(input.totalEntryCount) ? Math.max(0, input.totalEntryCount) : 0;
  const filtered = Number.isFinite(input.filteredEntryCount)
    ? Math.max(0, input.filteredEntryCount)
    : 0;

  if (filtered > 0) return null;

  if (total === 0) {
    const needsContext = !hasSelectionContext(input.context);
    return {
      kind: "no_entries",
      title: TIMELINE_EMPTY_NO_ENTRIES_TITLE,
      description: needsContext
        ? TIMELINE_EMPTY_NO_ENTRIES_NEEDS_CONTEXT_DESC
        : TIMELINE_EMPTY_NO_ENTRIES_DESC,
      actions: TIMELINE_EMPTY_STATE_ACTIONS,
      needsContext,
      offersClearFilters: false,
    };
  }

  if (input.evidenceFilterActive) {
    return {
      kind: "evidence_filtered",
      title: TIMELINE_EMPTY_EVIDENCE_TITLE,
      description: TIMELINE_EMPTY_EVIDENCE_DESC,
      actions: [],
      needsContext: false,
      offersClearFilters: true,
    };
  }

  return {
    kind: "filtered_out",
    title: TIMELINE_EMPTY_FILTERED_TITLE,
    description: TIMELINE_EMPTY_FILTERED_DESC,
    actions: [],
    needsContext: false,
    offersClearFilters: input.otherFiltersActive,
  };
}
