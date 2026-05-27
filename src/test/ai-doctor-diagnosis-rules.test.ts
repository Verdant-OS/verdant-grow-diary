/**
 * Tests for validateAndSanitizeDiagnosis — the pure safety envelope for
 * Structured AI Doctor v1.
 *
 * Guarantees verified:
 *   - Complete payload validates and round-trips its fields.
 *   - Malformed input falls back to CAUTIOUS_FALLBACK.
 *   - Confidence clamps to [0, 1].
 *   - Suggested actions are capped to MAX_SUGGESTED_ACTIONS (2).
 *   - approvalRequired is forced true on every suggested action.
 *   - Device-control language is stripped from text and drops suggestions.
 *   - Over-promising yield/recovery language is redacted.
 *   - Low confidence injects a default missingInformation note.
 */
import { describe, it, expect } from "vitest";
import {
  CAUTIOUS_FALLBACK,
  LOW_CONFIDENCE_THRESHOLD,
  MAX_SUGGESTED_ACTIONS,
  validateAndSanitizeDiagnosis,
} from "@/lib/aiDoctorDiagnosisRules";

const completeInput = {
  summary: "Leaf curl consistent with mild heat stress.",
  likelyIssue: "Heat stress",
  confidence: 0.7,
  evidence: ["Tip curl on upper canopy", "Tent temp 31C at lights-on"],
  missingInformation: ["No reservoir EC reading in last 48h"],
  possibleCauses: ["Light too close", "Insufficient airflow"],
  immediateAction: "Raise the light by 10cm and re-check in 6 hours.",
  whatNotToDo: ["Do not defoliate", "Do not increase nutrients"],
  followUp24h: {
    summary: "Re-check canopy temp and leaf posture.",
    checklist: ["Log a photo", "Capture sensor snapshot"],
  },
  recoveryPlan3d: {
    summary: "Stabilize VPD and confirm recovery.",
    checklist: ["Daily photo", "Daily VPD note"],
  },
  riskLevel: "medium",
  suggestedActions: [
    {
      type: "task",
      title: "Raise light",
      detail: "Raise grow light by 10cm and re-check canopy temp in 6h.",
      priority: "medium",
      reason: "Reduces radiant load on the upper canopy.",
      approvalRequired: true,
    },
  ],
};

describe("validateAndSanitizeDiagnosis — schema", () => {
  it("validates a complete payload and preserves fields", () => {
    const { diagnosis, notes } = validateAndSanitizeDiagnosis(completeInput);
    expect(diagnosis).not.toBeNull();
    expect(diagnosis!.summary).toContain("heat stress");
    expect(diagnosis!.likelyIssue).toBe("Heat stress");
    expect(diagnosis!.confidence).toBe(0.7);
    expect(diagnosis!.riskLevel).toBe("medium");
    expect(diagnosis!.evidence).toHaveLength(2);
    expect(diagnosis!.possibleCauses).toHaveLength(2);
    expect(diagnosis!.followUp24h.checklist).toContain("Log a photo");
    expect(diagnosis!.recoveryPlan3d.summary).toMatch(/stabilize/i);
    expect(diagnosis!.suggestedActions).toHaveLength(1);
    expect(diagnosis!.suggestedActions[0].approvalRequired).toBe(true);
    expect(notes).toEqual([]);
  });

  it("returns CAUTIOUS_FALLBACK for malformed input", () => {
    for (const bad of [null, undefined, 42, "nope", []]) {
      const { diagnosis } = validateAndSanitizeDiagnosis(bad);
      expect(diagnosis).toEqual(CAUTIOUS_FALLBACK);
    }
  });
});

describe("validateAndSanitizeDiagnosis — safety clamps", () => {
  it("clamps confidence to [0, 1]", () => {
    const high = validateAndSanitizeDiagnosis({ ...completeInput, confidence: 1.7 });
    expect(high.diagnosis!.confidence).toBe(1);
    expect(high.notes.join(" ")).toMatch(/clamped/i);

    const low = validateAndSanitizeDiagnosis({ ...completeInput, confidence: -0.4 });
    expect(low.diagnosis!.confidence).toBe(0);

    const nan = validateAndSanitizeDiagnosis({ ...completeInput, confidence: NaN });
    expect(nan.diagnosis!.confidence).toBe(0);
  });

  it("trims suggestedActions to MAX_SUGGESTED_ACTIONS", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      type: "note",
      title: `Suggestion ${i}`,
      detail: `Conservative note ${i}.`,
      priority: "low",
      reason: "Reasoning",
    }));
    const { diagnosis, notes } = validateAndSanitizeDiagnosis({
      ...completeInput,
      suggestedActions: many,
    });
    expect(diagnosis!.suggestedActions.length).toBe(MAX_SUGGESTED_ACTIONS);
    expect(notes.join(" ")).toMatch(/trimmed/i);
  });

  it("forces approvalRequired=true even if model returns false", () => {
    const { diagnosis } = validateAndSanitizeDiagnosis({
      ...completeInput,
      suggestedActions: [
        {
          type: "task",
          title: "Add a note",
          detail: "Log canopy posture in the diary.",
          priority: "low",
          reason: "Build a baseline.",
          approvalRequired: false,
        },
      ],
    });
    expect(diagnosis!.suggestedActions[0].approvalRequired).toBe(true);
  });

  it("strips device-control language from text fields", () => {
    const { diagnosis } = validateAndSanitizeDiagnosis({
      ...completeInput,
      summary: "Turn on the dehumidifier and switch off the heater.",
      evidence: ["MQTT bridge reported high humidity"],
    });
    expect(diagnosis!.summary).not.toMatch(/turn on|switch off/i);
    expect(diagnosis!.summary).toMatch(/\[removed: device-control language\]/);
    expect(diagnosis!.evidence.join(" ")).not.toMatch(/\bmqtt\b/i);
  });

  it("drops suggestedActions that contain device-control language", () => {
    const { diagnosis, notes } = validateAndSanitizeDiagnosis({
      ...completeInput,
      suggestedActions: [
        {
          type: "task",
          title: "Turn on the fan",
          detail: "Send a command via MQTT to start the exhaust.",
          priority: "high",
          reason: "Cool the tent.",
        },
        {
          type: "task",
          title: "Open the tent flap",
          detail: "Manually crack the tent flap for passive airflow.",
          priority: "low",
          reason: "Reduce stagnant air.",
        },
      ],
    });
    expect(diagnosis!.suggestedActions).toHaveLength(1);
    expect(diagnosis!.suggestedActions[0].title).toBe("Open the tent flap");
    expect(notes.join(" ")).toMatch(/device-control/i);
  });

  it("rejects immediateAction containing device-control language", () => {
    const { diagnosis, notes } = validateAndSanitizeDiagnosis({
      ...completeInput,
      immediateAction: "Automatically turn off the heater immediately.",
    });
    expect(diagnosis!.immediateAction).toBeNull();
    expect(notes.join(" ")).toMatch(/device-control/i);
  });

  it("strips over-promising yield/recovery language", () => {
    const { diagnosis } = validateAndSanitizeDiagnosis({
      ...completeInput,
      summary:
        "This plant will fully recover and we guarantee maximize yield within days.",
      whatNotToDo: ["Do not 100% certain over-prune."],
    });
    expect(diagnosis!.summary).not.toMatch(/guarantee|will fully recover|maximize yield/i);
    expect(diagnosis!.summary).toMatch(/\[removed: over-promising language\]/);
    expect(diagnosis!.whatNotToDo.join(" ")).not.toMatch(/100% certain/);
  });

  it("injects missingInformation when confidence is below threshold", () => {
    const { diagnosis, notes } = validateAndSanitizeDiagnosis({
      ...completeInput,
      confidence: LOW_CONFIDENCE_THRESHOLD - 0.1,
      missingInformation: [],
    });
    expect(diagnosis!.missingInformation.length).toBeGreaterThan(0);
    expect(diagnosis!.missingInformation[0]).toMatch(/evidence is limited/i);
    expect(notes.join(" ")).toMatch(/low confidence/i);
  });
});
