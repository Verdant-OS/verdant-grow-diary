import { describe, it, expect } from "vitest";
import { AI_DOCTOR_PHASE1_TIMELINE_KIND } from "@/lib/aiDoctorPhase1TimelineDraft";
import {
  attachAiDoctorPhase1EvidenceToActionEvents,
  buildAiDoctorPhase1EvidenceIndex,
  type RawDiaryEntryRow,
} from "@/lib/quickLogTimelineDiaryDetailsMerge";
import type { QuickLogActionEvent } from "@/lib/quickLogTimelineGroupingViewModel";

function diaryRow(entry_at: string): RawDiaryEntryRow {
  return {
    id: "diary-1",
    plant_id: "plant-1",
    tent_id: "tent-1",
    grow_id: "grow-1",
    entry_at,
    details: { kind: AI_DOCTOR_PHASE1_TIMELINE_KIND, result: { summary: "Saved." } },
  };
}

function noteAction(occurredAt: string): QuickLogActionEvent {
  return {
    id: "event-1",
    kind: "note",
    source: "manual",
    plantId: "plant-1",
    tentId: "tent-1",
    occurredAt,
    noteText: "AI Doctor evidence note",
  };
}

describe("AI Doctor Phase 1 evidence timezone matching", () => {
  it("matches diary entry_at and action occurredAt across equivalent timezone offsets", () => {
    const index = buildAiDoctorPhase1EvidenceIndex([
      diaryRow("2026-06-19T08:00:00-04:00"),
    ]);

    const [attached] = attachAiDoctorPhase1EvidenceToActionEvents(
      [noteAction("2026-06-19T12:00:00.000Z")],
      index,
    );

    expect(attached.aiDoctorPhase1Evidence?.diaryEntryId).toBe("diary-1");
    expect(attached.aiDoctorPhase1Evidence?.entryAt).toBe(
      "2026-06-19T12:00:00.000Z",
    );
  });

  it("does not attach when offset timestamps represent different instants", () => {
    const index = buildAiDoctorPhase1EvidenceIndex([
      diaryRow("2026-06-19T09:00:00-04:00"),
    ]);

    const [attached] = attachAiDoctorPhase1EvidenceToActionEvents(
      [noteAction("2026-06-19T12:00:00.000Z")],
      index,
    );

    expect(attached.aiDoctorPhase1Evidence).toBeUndefined();
  });

  it("keeps plant and tent scope in the match key even when timestamps normalize", () => {
    const index = buildAiDoctorPhase1EvidenceIndex([
      { ...diaryRow("2026-06-19T08:00:00-04:00"), plant_id: "plant-2" },
    ]);

    const [attached] = attachAiDoctorPhase1EvidenceToActionEvents(
      [noteAction("2026-06-19T12:00:00.000Z")],
      index,
    );

    expect(attached.aiDoctorPhase1Evidence).toBeUndefined();
  });
});
