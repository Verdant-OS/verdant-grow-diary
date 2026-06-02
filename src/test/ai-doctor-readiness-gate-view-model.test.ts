/**
 * View-model tests for buildAiDoctorReadinessGate — exact gate copy,
 * primary-action descriptors, and the "partial without safe flow" fallback.
 */
import { describe, it, expect } from "vitest";
import {
  buildAiDoctorReadinessGate,
  AI_DOCTOR_READINESS_GATE_COPY,
  AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL,
  AI_DOCTOR_READINESS_GATE_REVIEW_LABEL,
} from "@/lib/aiDoctorReadinessGateViewModel";

describe("aiDoctorReadinessGateViewModel — exact copy + primary action", () => {
  it("insufficient → uses exact copy and 'Add missing context' primary", () => {
    const g = buildAiDoctorReadinessGate({ readiness: "insufficient" });
    expect(g.message).toBe(
      "More context needed before AI Doctor should give confident guidance.",
    );
    expect(g.message).toBe(AI_DOCTOR_READINESS_GATE_COPY.insufficient);
    expect(g.primary.kind).toBe("focus_anchor");
    expect(g.primary.label).toBe(AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL);
    expect(g.primary.label).toBe("Add missing context");
    expect(g.primary.anchorId).toBe("plant-ai-doctor-context-panel");
    expect(g.showQuickActions).toBe(true);
  });

  it("partial WITH safe AI Doctor flow → cautious review entry", () => {
    const g = buildAiDoctorReadinessGate({
      readiness: "partial",
      hasSafeAiDoctorFlow: true,
    });
    expect(g.message).toBe(
      "AI Doctor can review this, but confidence may be limited.",
    );
    expect(g.primary.kind).toBe("open_ai_doctor");
    expect(g.primary.label).toBe(AI_DOCTOR_READINESS_GATE_REVIEW_LABEL);
    expect(g.primary.anchorId).toBe("plant-doctor");
    expect(g.showQuickActions).toBe(true);
  });

  it("partial WITHOUT safe AI Doctor flow → falls back to 'Add missing context'", () => {
    const g = buildAiDoctorReadinessGate({
      readiness: "partial",
      hasSafeAiDoctorFlow: false,
    });
    expect(g.message).toBe(AI_DOCTOR_READINESS_GATE_COPY.partial);
    expect(g.primary.kind).toBe("focus_anchor");
    expect(g.primary.label).toBe("Add missing context");
    expect(g.showQuickActions).toBe(true);
  });

  it("strong WITH safe flow → cautious review entry, no quick actions", () => {
    const g = buildAiDoctorReadinessGate({
      readiness: "strong",
      hasSafeAiDoctorFlow: true,
    });
    expect(g.message).toBe("Ready for a cautious AI Doctor review.");
    expect(g.primary.kind).toBe("open_ai_doctor");
    expect(g.showQuickActions).toBe(false);
  });

  it("strong WITHOUT safe flow → falls back to 'Add missing context'", () => {
    const g = buildAiDoctorReadinessGate({ readiness: "strong" });
    expect(g.primary.label).toBe("Add missing context");
    expect(g.primary.kind).toBe("focus_anchor");
    expect(g.showQuickActions).toBe(false);
  });

  it("never uses banned certainty/connection words", () => {
    const banned = /\b(confirmed|certain|cured|guaranteed|live|synced|connected|imported)\b/i;
    for (const msg of Object.values(AI_DOCTOR_READINESS_GATE_COPY)) {
      expect(msg).not.toMatch(banned);
    }
    expect(AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL).not.toMatch(banned);
    expect(AI_DOCTOR_READINESS_GATE_REVIEW_LABEL).not.toMatch(banned);
  });
});
