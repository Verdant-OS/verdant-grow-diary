import { describe, expect, it } from "vitest";
import {
  resolveTimelineEmptyState,
  TIMELINE_EMPTY_STATE_ACTIONS,
  TIMELINE_EMPTY_STATE_FALLBACK,
  TIMELINE_EMPTY_LIGHTING_RESOURCE,
  TIMELINE_EMPTY_NO_ENTRIES_TITLE,
  TIMELINE_EMPTY_NO_ENTRIES_DESC,
  TIMELINE_EMPTY_NO_ENTRIES_NEEDS_CONTEXT_DESC,
  TIMELINE_EMPTY_FILTERED_TITLE,
  TIMELINE_EMPTY_EVIDENCE_TITLE,
  TIMELINE_EMPTY_EVIDENCE_DESC,
} from "@/lib/timelineEmptyStateRules";
import {
  TIMELINE_EVIDENCE_EMPTY_DESC,
  TIMELINE_EVIDENCE_EMPTY_TITLE,
} from "@/lib/timelineEvidenceFilterRules";
import { FAST_ADD_ACTIONS } from "@/lib/fastAddActionRules";

const base = {
  totalEntryCount: 0,
  filteredEntryCount: 0,
  evidenceFilterActive: false,
  otherFiltersActive: false,
};

const withPlant = { plantId: "p1", tentId: null, growId: "g1" };

describe("resolveTimelineEmptyState", () => {
  it("returns null when entries survive filtering", () => {
    expect(
      resolveTimelineEmptyState({ ...base, totalEntryCount: 5, filteredEntryCount: 3 }),
    ).toBeNull();
  });

  it("returns the no-entries state with fast-add actions when nothing is logged", () => {
    const view = resolveTimelineEmptyState({ ...base, context: withPlant });
    expect(view?.kind).toBe("no_entries");
    expect(view?.title).toBe(TIMELINE_EMPTY_NO_ENTRIES_TITLE);
    expect(view?.description).toBe(TIMELINE_EMPTY_NO_ENTRIES_DESC);
    expect(view?.actions).toEqual(TIMELINE_EMPTY_STATE_ACTIONS);
    expect(view?.needsContext).toBe(false);
    expect(view?.offersClearFilters).toBe(false);
    expect(view?.resourceLink).toEqual(TIMELINE_EMPTY_LIGHTING_RESOURCE);
  });

  it("flags needs-context and swaps copy when no plant or tent is selected", () => {
    const view = resolveTimelineEmptyState({ ...base, context: null });
    expect(view?.needsContext).toBe(true);
    expect(view?.description).toBe(TIMELINE_EMPTY_NO_ENTRIES_NEEDS_CONTEXT_DESC);
  });

  it("treats a tent-only selection as sufficient context", () => {
    const view = resolveTimelineEmptyState({
      ...base,
      context: { plantId: null, tentId: "t1", growId: null },
    });
    expect(view?.needsContext).toBe(false);
  });

  it("prioritises the evidence filter over generic filters", () => {
    const view = resolveTimelineEmptyState({
      ...base,
      totalEntryCount: 12,
      evidenceFilterActive: true,
      otherFiltersActive: true,
    });
    expect(view?.kind).toBe("evidence_filtered");
    expect(view?.title).toBe(TIMELINE_EMPTY_EVIDENCE_TITLE);
    expect(view?.offersClearFilters).toBe(true);
    expect(view?.resourceLink).toBeNull();
  });

  it("does not fork the pinned evidence-filter copy", () => {
    expect(TIMELINE_EMPTY_EVIDENCE_TITLE).toBe(TIMELINE_EVIDENCE_EMPTY_TITLE);
    expect(TIMELINE_EMPTY_EVIDENCE_DESC).toBe(TIMELINE_EVIDENCE_EMPTY_DESC);
  });

  it("returns the filtered-out state when other filters excluded everything", () => {
    const view = resolveTimelineEmptyState({
      ...base,
      totalEntryCount: 4,
      otherFiltersActive: true,
    });
    expect(view?.kind).toBe("filtered_out");
    expect(view?.title).toBe(TIMELINE_EMPTY_FILTERED_TITLE);
    expect(view?.offersClearFilters).toBe(true);
    expect(view?.resourceLink).toBeNull();
  });

  it("withholds the clear-filters control when no filter is actually active", () => {
    const view = resolveTimelineEmptyState({ ...base, totalEntryCount: 4 });
    expect(view?.kind).toBe("filtered_out");
    expect(view?.offersClearFilters).toBe(false);
  });

  it("never offers logging actions for a filter-caused empty view", () => {
    for (const evidence of [true, false]) {
      const view = resolveTimelineEmptyState({
        ...base,
        totalEntryCount: 9,
        evidenceFilterActive: evidence,
        otherFiltersActive: true,
        context: withPlant,
      });
      expect(view?.actions).toEqual([]);
    }
  });

  it("coerces NaN and negative counts instead of trusting them", () => {
    const view = resolveTimelineEmptyState({
      ...base,
      totalEntryCount: Number.NaN,
      filteredEntryCount: -3,
    });
    expect(view?.kind).toBe("no_entries");
  });

  it("is deterministic across repeated calls", () => {
    const input = { ...base, totalEntryCount: 7, otherFiltersActive: true };
    expect(resolveTimelineEmptyState(input)).toEqual(resolveTimelineEmptyState(input));
  });

  it("only offers presets that exist in the fast-add catalogue", () => {
    const known = new Set(FAST_ADD_ACTIONS.map((a) => a.id));
    for (const action of TIMELINE_EMPTY_STATE_ACTIONS) {
      expect(known.has(action.actionId)).toBe(true);
    }
  });

  it("exposes a non-null fallback shaped like a filtered-out view", () => {
    expect(TIMELINE_EMPTY_STATE_FALLBACK.kind).toBe("filtered_out");
    expect(TIMELINE_EMPTY_STATE_FALLBACK.actions).toEqual([]);
    expect(TIMELINE_EMPTY_STATE_FALLBACK.resourceLink).toBeNull();
  });

  it("never promises automation or device control in its copy", () => {
    const copy = [
      TIMELINE_EMPTY_NO_ENTRIES_DESC,
      TIMELINE_EMPTY_NO_ENTRIES_NEEDS_CONTEXT_DESC,
      TIMELINE_EMPTY_FILTERED_TITLE,
    ].join(" ");
    expect(copy).not.toMatch(/automat|auto-?log|we'll log|relay|actuator|controller/i);
  });
});
