/**
 * Targeted: buildAiDoctorReadinessBlockedExplanation — pure copy helper
 * that names the exact missing evidence category and the exact next button.
 *
 * Pure: no React, no I/O.
 */
import { describe, it, expect } from "vitest";
import {
  buildAiDoctorReadinessBlockedExplanation,
  AI_DOCTOR_READINESS_BLOCKING_CODES,
  AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL,
} from "@/lib/aiDoctorReadinessGateViewModel";

describe("buildAiDoctorReadinessBlockedExplanation", () => {
  it("returns empty when readiness is not insufficient", () => {
    const r = buildAiDoctorReadinessBlockedExplanation({
      readiness: "partial",
      missing: ["recent-manual-sensor-snapshot"],
      nextActionLabel: "Add snapshot",
    });
    expect(r).toEqual({ blockingCodes: [], blockingLabels: [], sentence: "" });
  });

  it("names the single missing category and the exact next button (snapshot only)", () => {
    const r = buildAiDoctorReadinessBlockedExplanation({
      readiness: "insufficient",
      missing: ["recent-manual-sensor-snapshot"],
      nextActionLabel: "Add sensor snapshot",
    });
    expect(r.blockingCodes).toEqual(["recent-manual-sensor-snapshot"]);
    expect(r.blockingLabels).toEqual([
      "a recent manual sensor snapshot (last 7 days)",
    ]);
    expect(r.sentence).toBe(
      'AI Doctor is blocked until you add a recent manual sensor snapshot (last 7 days). Tap "Add sensor snapshot" to add it now.',
    );
  });

  it("joins two blocking categories with 'and'", () => {
    const r = buildAiDoctorReadinessBlockedExplanation({
      readiness: "insufficient",
      missing: ["recent-timeline-activity", "recent-manual-sensor-snapshot"],
      nextActionLabel: "Quick log",
    });
    expect(r.blockingCodes).toEqual([
      "recent-timeline-activity",
      "recent-manual-sensor-snapshot",
    ]);
    expect(r.sentence).toContain(
      "a recent note, watering, feeding, or photo (last 7 days) and a recent manual sensor snapshot (last 7 days)",
    );
    expect(r.sentence).toContain('Tap "Quick log" to add it now.');
  });

  it("handles all three blocking categories with Oxford comma", () => {
    const r = buildAiDoctorReadinessBlockedExplanation({
      readiness: "insufficient",
      missing: [...AI_DOCTOR_READINESS_BLOCKING_CODES],
      nextActionLabel: "Set up plant",
    });
    expect(r.blockingCodes).toEqual([...AI_DOCTOR_READINESS_BLOCKING_CODES]);
    expect(r.sentence).toMatch(/a plant profile, .*, and a recent manual sensor snapshot/);
  });

  it("ignores soft-miss codes (strain/stage/medium/plant-photo)", () => {
    const r = buildAiDoctorReadinessBlockedExplanation({
      readiness: "insufficient",
      missing: ["strain", "stage", "medium", "plant-photo"],
      nextActionLabel: "Edit plant",
    });
    // No blocking codes present — falls back to defensive "more context".
    expect(r.blockingCodes).toEqual([]);
    expect(r.sentence).toBe(
      'AI Doctor is blocked until you add more context. Tap "Edit plant" to add it now.',
    );
  });

  it("falls back to the default add-context label when nextActionLabel is blank", () => {
    const r = buildAiDoctorReadinessBlockedExplanation({
      readiness: "insufficient",
      missing: ["plant-profile"],
      nextActionLabel: "   ",
    });
    expect(r.sentence).toContain(`Tap "${AI_DOCTOR_READINESS_GATE_ADD_CONTEXT_LABEL}"`);
  });

  it("is deterministic for the same input", () => {
    const args = {
      readiness: "insufficient" as const,
      missing: ["recent-timeline-activity", "recent-manual-sensor-snapshot"],
      nextActionLabel: "Quick log",
    };
    expect(buildAiDoctorReadinessBlockedExplanation(args)).toEqual(
      buildAiDoctorReadinessBlockedExplanation(args),
    );
  });
});
