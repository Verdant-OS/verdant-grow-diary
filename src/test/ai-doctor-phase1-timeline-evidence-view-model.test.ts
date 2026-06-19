import { describe, it, expect } from "vitest";
import {
  buildAiDoctorPhase1TimelineEvidenceViewModel,
  isAiDoctorPhase1EvidenceEvent,
  AI_DOCTOR_PHASE1_TIMELINE_BADGE_EVIDENCE_ONLY,
  AI_DOCTOR_PHASE1_TIMELINE_BADGE_PRIMARY,
  AI_DOCTOR_PHASE1_TIMELINE_REVIEW_BASE_PATH,
} from "@/lib/aiDoctorPhase1TimelineEvidenceViewModel";
import {
  AI_DOCTOR_PHASE1_EVIDENCE_DISCLAIMER,
  AI_DOCTOR_PHASE1_EVIDENCE_LABEL,
  AI_DOCTOR_PHASE1_TIMELINE_KIND,
} from "@/lib/aiDoctorPhase1TimelineDraft";

const validEvent = {
  id: "evt-1",
  plant_id: "plant-1",
  grow_id: "grow-1",
  tent_id: "tent-1",
  occurred_at: "2026-06-19T12:00:00.000Z",
  details: {
    kind: AI_DOCTOR_PHASE1_TIMELINE_KIND,
    result: {
      summary: "Leaves yellowing on lower nodes.",
      likely_issue: "Possible early N deficiency",
      confidence: "low",
      risk_level: "low",
      evidence: ["lower-leaf chlorosis", "stable VPD"],
      missing_information: ["recent runoff EC", "feed log"],
    },
  },
};

describe("aiDoctorPhase1TimelineEvidenceViewModel", () => {
  it("detects a valid AI Doctor Phase 1 evidence event", () => {
    expect(isAiDoctorPhase1EvidenceEvent(validEvent)).toBe(true);
  });

  it("rejects a normal note event without the discriminator", () => {
    expect(
      isAiDoctorPhase1EvidenceEvent({
        id: "x",
        details: { kind: "note" },
      }),
    ).toBe(false);
    expect(isAiDoctorPhase1EvidenceEvent({ id: "x" })).toBe(false);
    expect(isAiDoctorPhase1EvidenceEvent(null)).toBe(false);
    expect(isAiDoctorPhase1EvidenceEvent(undefined)).toBe(false);
  });

  it("rejects events with malformed details (array / string / number)", () => {
    expect(isAiDoctorPhase1EvidenceEvent({ details: [] })).toBe(false);
    expect(isAiDoctorPhase1EvidenceEvent({ details: "kind" })).toBe(false);
    expect(isAiDoctorPhase1EvidenceEvent({ details: 42 })).toBe(false);
  });

  it("builds title/badges/disclaimer/sourceLabel exactly", () => {
    const vm = buildAiDoctorPhase1TimelineEvidenceViewModel(validEvent)!;
    expect(vm.title).toBe(AI_DOCTOR_PHASE1_EVIDENCE_LABEL);
    expect(vm.badges).toEqual([
      AI_DOCTOR_PHASE1_TIMELINE_BADGE_PRIMARY,
      AI_DOCTOR_PHASE1_TIMELINE_BADGE_EVIDENCE_ONLY,
    ]);
    expect(vm.disclaimer).toBe(AI_DOCTOR_PHASE1_EVIDENCE_DISCLAIMER);
    expect(vm.sourceLabel).toBe("AI Doctor Phase 1");
  });

  it("preserves plantId / growId / tentId in the link", () => {
    const vm = buildAiDoctorPhase1TimelineEvidenceViewModel(validEvent)!;
    expect(vm.link.pathname).toBe(AI_DOCTOR_PHASE1_TIMELINE_REVIEW_BASE_PATH);
    expect(vm.link.href).toContain("plantId=plant-1");
    expect(vm.link.href).toContain("growId=grow-1");
    expect(vm.link.href).toContain("tentId=tent-1");
  });

  it("returns null for non-evidence events", () => {
    expect(
      buildAiDoctorPhase1TimelineEvidenceViewModel({
        id: "x",
        details: { kind: "note" },
      }),
    ).toBeNull();
  });

  it("degrades gracefully when result fields are missing or invalid", () => {
    const vm = buildAiDoctorPhase1TimelineEvidenceViewModel({
      id: "evt",
      plant_id: null,
      grow_id: null,
      tent_id: null,
      details: { kind: AI_DOCTOR_PHASE1_TIMELINE_KIND, result: null },
    })!;
    expect(vm).not.toBeNull();
    expect(vm.summary).toBe("Saved evidence (no summary available).");
    expect(vm.likelyIssue).toBeNull();
    expect(vm.confidence).toBeNull();
    expect(vm.riskLevel).toBeNull();
    expect(vm.evidence).toEqual([]);
    expect(vm.missingInformation).toEqual([]);
    expect(vm.evidenceCount).toBe(0);
    expect(vm.missingInformationCount).toBe(0);
    expect(vm.link.href).toBe(AI_DOCTOR_PHASE1_TIMELINE_REVIEW_BASE_PATH);
  });

  it("filters non-string array entries", () => {
    const vm = buildAiDoctorPhase1TimelineEvidenceViewModel({
      details: {
        kind: AI_DOCTOR_PHASE1_TIMELINE_KIND,
        result: {
          evidence: ["ok", "", null, 5, " trimmed "],
          missing_information: [],
        },
      },
    })!;
    expect(vm.evidence).toEqual(["ok", "trimmed"]);
    expect(vm.evidenceCount).toBe(2);
  });

  it("does not surface raw payload, secrets, or model prompts", () => {
    const vm = buildAiDoctorPhase1TimelineEvidenceViewModel({
      details: {
        kind: AI_DOCTOR_PHASE1_TIMELINE_KIND,
        raw_payload: { secret: "leak-me" },
        api_key: "leak",
        model_prompt: "system: leak",
        service_role: "leak",
        result: { summary: "ok" },
      },
    })!;
    const serialized = JSON.stringify(vm);
    expect(serialized).not.toContain("leak");
    expect(serialized).not.toContain("raw_payload");
    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("model_prompt");
    expect(serialized).not.toContain("service_role");
  });

  it("does not include approve/send/execute/action_queue/device copy", () => {
    const vm = buildAiDoctorPhase1TimelineEvidenceViewModel(validEvent)!;
    const s = JSON.stringify(vm).toLowerCase();
    expect(s).not.toContain("approve");
    expect(s).not.toContain("execute");
    expect(s).not.toContain("send to");
    expect(s).not.toContain("action_queue");
    expect(s).not.toContain("action queue");
    expect(s).not.toContain("device");
    expect(s).not.toContain("equipment");
  });

  it("falls back to entry_at when occurred_at is missing", () => {
    const vm = buildAiDoctorPhase1TimelineEvidenceViewModel({
      entry_at: "2026-01-02T00:00:00.000Z",
      details: { kind: AI_DOCTOR_PHASE1_TIMELINE_KIND, result: { summary: "x" } },
    })!;
    expect(vm.occurredAt).toBe("2026-01-02T00:00:00.000Z");
  });
});
