/**
 * QuickLog grouped timeline filter view-model — pure unit tests.
 */
import { describe, it, expect } from "vitest";
import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";
import {
  QUICK_LOG_GROUPED_TIMELINE_FILTERS,
  QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS,
  QUICK_LOG_GROUPED_TIMELINE_EMPTY_FILTERED_TEXT,
  QUICK_LOG_GROUPED_TIMELINE_EMPTY_OVERALL_TEXT,
  QUICK_LOG_GROUPED_TIMELINE_CREATE_BUTTON_LABEL,
  filterQuickLogGroupedTimelineEntries,
  entryMatchesQuickLogGroupedTimelineFilter,
  isQuickLogGroupedTimelineFilter,
} from "@/lib/quickLogGroupedTimelineFilterViewModel";

const actionWater: QuickLogTimelineEntry = {
  kind: "action",
  occurredAt: "2026-03-01T10:00:00.000Z",
  actionSourceLabel: "Manual",
  action: {
    id: "w1",
    kind: "water",
    source: "manual",
    plantId: "p1",
    tentId: "t1",
    occurredAt: "2026-03-01T10:00:00.000Z",
    volumeMl: 500,
  },
};
const actionNote: QuickLogTimelineEntry = {
  kind: "action",
  occurredAt: "2026-03-01T11:00:00.000Z",
  actionSourceLabel: "Manual",
  action: {
    id: "n1",
    kind: "note",
    source: "manual",
    plantId: "p1",
    tentId: "t1",
    occurredAt: "2026-03-01T11:00:00.000Z",
    noteText: "ok",
  },
};
const envOnly: QuickLogTimelineEntry = {
  kind: "environment",
  occurredAt: "2026-03-01T12:00:00.000Z",
  environmentSourceLabel: "Manual",
  environment: {
    id: "e1",
    plant_id: "p1",
    tent_id: "t1",
    occurred_at: "2026-03-01T12:00:00.000Z",
    source: "manual",
    environment_event: { temperature_c: 24, humidity_pct: 55, vpd_kpa: null },
  } as unknown as QuickLogTimelineEntry extends { environment: infer E } ? E : never,
  environmentCard: {} as never,
};
const groupedWater: QuickLogTimelineEntry = {
  kind: "grouped",
  occurredAt: "2026-03-01T13:00:00.000Z",
  actionSourceLabel: "Manual",
  environmentSourceLabel: "Manual",
  action: { ...actionWater.action, id: "w2" },
  environment: envOnly.environment,
  environmentCard: {} as never,
};
const groupedNote: QuickLogTimelineEntry = {
  kind: "grouped",
  occurredAt: "2026-03-01T14:00:00.000Z",
  actionSourceLabel: "Manual",
  environmentSourceLabel: "Manual",
  action: { ...actionNote.action, id: "n2" },
  environment: envOnly.environment,
  environmentCard: {} as never,
};

const ALL = [actionWater, actionNote, envOnly, groupedWater, groupedNote];

describe("quickLogGroupedTimelineFilterViewModel", () => {
  it("constants are exported and stable", () => {
    expect(QUICK_LOG_GROUPED_TIMELINE_FILTERS).toEqual([
      "all",
      "water",
      "note",
      "environment",
    ]);
    expect(QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS.all).toBe("All");
    expect(QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS.water).toBe("Water");
    expect(QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS.note).toBe("Note");
    expect(QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS.environment).toBe("Environment");
    expect(QUICK_LOG_GROUPED_TIMELINE_EMPTY_OVERALL_TEXT).toBe(
      "No QuickLog entries yet.",
    );
    expect(QUICK_LOG_GROUPED_TIMELINE_EMPTY_FILTERED_TEXT).toBe(
      "No QuickLog entries match this filter.",
    );
    expect(QUICK_LOG_GROUPED_TIMELINE_CREATE_BUTTON_LABEL).toBe("Create Quick Log");
  });

  it("isQuickLogGroupedTimelineFilter validates strings", () => {
    expect(isQuickLogGroupedTimelineFilter("all")).toBe(true);
    expect(isQuickLogGroupedTimelineFilter("water")).toBe(true);
    expect(isQuickLogGroupedTimelineFilter("xyz")).toBe(false);
    expect(isQuickLogGroupedTimelineFilter(null)).toBe(false);
  });

  it("'all' returns every entry", () => {
    expect(filterQuickLogGroupedTimelineEntries(ALL, "all")).toEqual(ALL);
  });

  it("'water' returns grouped water + standalone water only", () => {
    const out = filterQuickLogGroupedTimelineEntries(ALL, "water");
    expect(out).toEqual([actionWater, groupedWater]);
  });

  it("'note' returns grouped note + standalone note only", () => {
    const out = filterQuickLogGroupedTimelineEntries(ALL, "note");
    expect(out).toEqual([actionNote, groupedNote]);
  });

  it("'environment' returns standalone env + grouped (which always carry env context)", () => {
    const out = filterQuickLogGroupedTimelineEntries(ALL, "environment");
    expect(out).toEqual([envOnly, groupedWater, groupedNote]);
  });

  it("entryMatchesQuickLogGroupedTimelineFilter mirrors filter()", () => {
    for (const f of QUICK_LOG_GROUPED_TIMELINE_FILTERS) {
      const a = filterQuickLogGroupedTimelineEntries(ALL, f);
      const b = ALL.filter((e) => entryMatchesQuickLogGroupedTimelineFilter(e, f));
      expect(a).toEqual(b);
    }
  });

  it("filter is pure — does not mutate input", () => {
    const snap = JSON.stringify(ALL);
    filterQuickLogGroupedTimelineEntries(ALL, "water");
    filterQuickLogGroupedTimelineEntries(ALL, "note");
    filterQuickLogGroupedTimelineEntries(ALL, "environment");
    expect(JSON.stringify(ALL)).toBe(snap);
  });
});
