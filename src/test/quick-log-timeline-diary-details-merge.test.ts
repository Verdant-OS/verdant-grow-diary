import { describe, it, expect } from "vitest";
import {
  attachAiDoctorPhase1EvidenceToActionEvents,
  buildAiDoctorPhase1EvidenceIndex,
  type RawDiaryEntryRow,
} from "@/lib/quickLogTimelineDiaryDetailsMerge";
import { AI_DOCTOR_PHASE1_TIMELINE_KIND } from "@/lib/aiDoctorPhase1TimelineDraft";
import type { QuickLogActionEvent } from "@/lib/quickLogTimelineGroupingViewModel";

const ISO = "2026-06-19T12:00:00.000Z";

const aiDiary: RawDiaryEntryRow = {
  id: "diary-1",
  plant_id: "plant-1",
  tent_id: "tent-1",
  grow_id: "grow-1",
  entry_at: ISO,
  details: {
    kind: AI_DOCTOR_PHASE1_TIMELINE_KIND,
    result: { summary: "ok" },
  },
};
const normalDiary: RawDiaryEntryRow = {
  id: "diary-2",
  plant_id: "plant-1",
  tent_id: "tent-1",
  grow_id: "grow-1",
  entry_at: ISO,
  details: { kind: "note" },
};

const baseNote = (id: string, occurredAt: string): QuickLogActionEvent => ({
  id,
  kind: "note",
  source: "manual",
  plantId: "plant-1",
  tentId: "tent-1",
  occurredAt,
  noteText: "n",
});

describe("quickLogTimelineDiaryDetailsMerge", () => {
  it("builds index containing only AI Doctor Phase 1 diary entries", () => {
    const idx = buildAiDoctorPhase1EvidenceIndex([aiDiary, normalDiary]);
    expect(idx.size).toBe(1);
    expect([...idx.values()][0].diaryEntryId).toBe("diary-1");
  });

  it("ignores malformed details (array / string / null / number)", () => {
    const rows: RawDiaryEntryRow[] = [
      { ...aiDiary, id: "a", details: null },
      { ...aiDiary, id: "b", details: "x" },
      { ...aiDiary, id: "c", details: [{ kind: AI_DOCTOR_PHASE1_TIMELINE_KIND }] },
      { ...aiDiary, id: "d", details: 42 },
    ];
    expect(buildAiDoctorPhase1EvidenceIndex(rows).size).toBe(0);
  });

  it("ignores diary rows with invalid entry_at", () => {
    const idx = buildAiDoctorPhase1EvidenceIndex([
      { ...aiDiary, entry_at: "not-a-date" },
    ]);
    expect(idx.size).toBe(0);
  });

  it("handles null/empty/undefined diary input", () => {
    expect(buildAiDoctorPhase1EvidenceIndex(null).size).toBe(0);
    expect(buildAiDoctorPhase1EvidenceIndex(undefined).size).toBe(0);
    expect(buildAiDoctorPhase1EvidenceIndex([]).size).toBe(0);
  });

  it("attaches evidence onto the matching note action only", () => {
    const idx = buildAiDoctorPhase1EvidenceIndex([aiDiary]);
    const actions = [
      baseNote("evt-match", ISO),
      baseNote("evt-other-time", "2026-06-19T13:00:00.000Z"),
      { ...baseNote("evt-other-plant", ISO), plantId: "plant-2" },
    ];
    const out = attachAiDoctorPhase1EvidenceToActionEvents(actions, idx);
    expect(out).toHaveLength(3);
    expect(out[0].aiDoctorPhase1Evidence?.diaryEntryId).toBe("diary-1");
    expect(out[1].aiDoctorPhase1Evidence).toBeUndefined();
    expect(out[2].aiDoctorPhase1Evidence).toBeUndefined();
  });

  it("does not mutate input actions and preserves ordering/length", () => {
    const idx = buildAiDoctorPhase1EvidenceIndex([aiDiary]);
    const original = [
      baseNote("a", "2026-06-19T11:00:00.000Z"),
      baseNote("b", ISO),
      baseNote("c", "2026-06-19T13:00:00.000Z"),
    ];
    const snapshot = JSON.stringify(original);
    const out = attachAiDoctorPhase1EvidenceToActionEvents(original, idx);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(out.map((a) => a.id)).toEqual(["a", "b", "c"]);
    expect(out.length).toBe(original.length);
  });

  it("never attaches evidence to water actions", () => {
    const idx = buildAiDoctorPhase1EvidenceIndex([aiDiary]);
    const water: QuickLogActionEvent = { ...baseNote("w", ISO), kind: "water" };
    const out = attachAiDoctorPhase1EvidenceToActionEvents([water], idx);
    expect(out[0].aiDoctorPhase1Evidence).toBeUndefined();
  });

  it("normalizes ISO timestamps so equivalent strings match", () => {
    const idx = buildAiDoctorPhase1EvidenceIndex([
      { ...aiDiary, entry_at: "2026-06-19T12:00:00Z" },
    ]);
    const out = attachAiDoctorPhase1EvidenceToActionEvents(
      [baseNote("e", "2026-06-19T12:00:00.000Z")],
      idx,
    );
    expect(out[0].aiDoctorPhase1Evidence?.diaryEntryId).toBe("diary-1");
  });

  it("returns same actions when index is empty (no over-attachment)", () => {
    const out = attachAiDoctorPhase1EvidenceToActionEvents(
      [baseNote("a", ISO)],
      new Map(),
    );
    expect(out[0].aiDoctorPhase1Evidence).toBeUndefined();
  });
});
