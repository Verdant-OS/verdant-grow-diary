import { describe, it, expect } from "vitest";
import type { QuickLogTimelineEntry } from "@/lib/quickLogTimelineGroupingViewModel";
import { AI_DOCTOR_PHASE1_TIMELINE_KIND } from "@/lib/aiDoctorPhase1TimelineDraft";
import {
  QUICK_LOG_GROUPED_TIMELINE_FILTERS,
  QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS,
  QUICK_LOG_GROUPED_TIMELINE_EMPTY_FILTERED_TEXT,
  QUICK_LOG_GROUPED_TIMELINE_EMPTY_OVERALL_TEXT,
  QUICK_LOG_GROUPED_TIMELINE_CREATE_BUTTON_LABEL,
  QUICK_LOG_GROUPED_TIMELINE_AI_EVIDENCE_EMPTY_TITLE_TEXT,
  QUICK_LOG_GROUPED_TIMELINE_AI_EVIDENCE_RESULTS_BUTTON_LABEL,
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
const aiEvidenceNote: QuickLogTimelineEntry = {
  kind: "action",
  occurredAt: "2026-03-01T11:30:00.000Z",
  actionSourceLabel: "Manual",
  action: {
    ...actionNote.action,
    id: "ai-1",
    occurredAt: "2026-03-01T11:30:00.000Z",
    aiDoctorPhase1Evidence: {
      diaryEntryId: "diary-1",
      entryAt: "2026-03-01T11:30:00.000Z",
      plantId: "p1",
      tentId: "t1",
      growId: "g1",
      details: { kind: AI_DOCTOR_PHASE1_TIMELINE_KIND },
    },
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
const groupedAiEvidenceNote: QuickLogTimelineEntry = {
  ...groupedNote,
  occurredAt: "2026-03-01T15:00:00.000Z",
  action: {
    ...groupedNote.action,
    id: "ai-2",
    aiDoctorPhase1Evidence: aiEvidenceNote.action.aiDoctorPhase1Evidence,
  },
};

const ALL = [
  actionWater,
  actionNote,
  aiEvidenceNote,
  envOnly,
  groupedWater,
  groupedNote,
  groupedAiEvidenceNote,
];

describe("quickLogGroupedTimelineFilterViewModel", () => {
  it("constants are exported and stable", () => {
    expect(QUICK_LOG_GROUPED_TIMELINE_FILTERS).toEqual([
      "all",
      "water",
      "note",
      "environment",
      "ai-doctor-evidence",
    ]);
    expect(QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS.all).toBe("All");
    expect(QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS.water).toBe("Water");
    expect(QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS.note).toBe("Note");
    expect(QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS.environment).toBe("Environment");
    expect(QUICK_LOG_GROUPED_TIMELINE_FILTER_LABELS["ai-doctor-evidence"]).toBe(
      "AI Doctor evidence",
    );
    expect(QUICK_LOG_GROUPED_TIMELINE_EMPTY_OVERALL_TEXT).toBe(
      "No QuickLog entries yet.",
    );
    expect(QUICK_LOG_GROUPED_TIMELINE_EMPTY_FILTERED_TEXT).toBe(
      "No QuickLog entries match this filter.",
    );
    expect(QUICK_LOG_GROUPED_TIMELINE_CREATE_BUTTON_LABEL).toBe("Create Quick Log");
    expect(QUICK_LOG_GROUPED_TIMELINE_AI_EVIDENCE_EMPTY_TITLE_TEXT).toBe(
      "No AI Doctor Phase 1 evidence yet.",
    );
    expect(QUICK_LOG_GROUPED_TIMELINE_AI_EVIDENCE_RESULTS_BUTTON_LABEL).toBe(
      "Open AI Doctor Results",
    );
  });

  it("isQuickLogGroupedTimelineFilter validates strings", () => {
    expect(isQuickLogGroupedTimelineFilter("all")).toBe(true);
    expect(isQuickLogGroupedTimelineFilter("water")).toBe(true);
    expect(isQuickLogGroupedTimelineFilter("ai-doctor-evidence")).toBe(true);
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

  it("'note' returns grouped note + standalone note, including evidence-backed notes", () => {
    const out = filterQuickLogGroupedTimelineEntries(ALL, "note");
    expect(out).toEqual([actionNote, aiEvidenceNote, groupedNote, groupedAiEvidenceNote]);
  });

  it("'environment' returns standalone env + grouped entries", () => {
    const out = filterQuickLogGroupedTimelineEntries(ALL, "environment");
    expect(out).toEqual([envOnly, groupedWater, groupedNote, groupedAiEvidenceNote]);
  });

  it("'ai-doctor-evidence' returns only entries with saved Phase 1 evidence", () => {
    const out = filterQuickLogGroupedTimelineEntries(ALL, "ai-doctor-evidence");
    expect(out).toEqual([aiEvidenceNote, groupedAiEvidenceNote]);
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
    filterQuickLogGroupedTimelineEntries(ALL, "ai-doctor-evidence");
    expect(JSON.stringify(ALL)).toBe(snap);
  });
});
