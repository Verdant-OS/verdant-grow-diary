/**
 * Focused tests for the pure review-result -> saved Diagnosis adapter.
 */
import { describe, expect, it } from "vitest";
import {
  AI_DOCTOR_REVIEW_CONFIDENCE_SCORE,
  AI_DOCTOR_REVIEW_DIAGNOSIS_RISK,
  adaptAiDoctorReviewResultToDiagnosis,
  numericConfidenceForAiDoctorReview,
} from "@/lib/aiDoctorReviewHistoryRules";
import {
  validateAiDoctorReviewResult,
  type AiDoctorReviewResult,
} from "@/lib/aiDoctorReviewResultContract";

const baseResult = (): Record<string, unknown> => ({
  summary: "Plant shows mild leaf curl on lower fan leaves.",
  likely_issue: "Possible early heat stress.",
  confidence: "medium",
  evidence: ["Tent temperature was above target", "Lower leaves are curling"],
  missing_information: ["No recent VPD snapshot"],
  possible_causes: ["High tent temperature", "Low humidity"],
  immediate_action: "Move the light farther from the canopy and observe.",
  what_not_to_do: "Do not increase nutrient strength from this review alone.",
  twenty_four_hour_follow_up: "Recheck leaf posture after 24 hours.",
  three_day_recovery_plan: "Hold inputs steady and monitor the canopy daily.",
  risk_level: "watch",
});

function validated(overrides: Record<string, unknown> = {}): AiDoctorReviewResult {
  const validation = validateAiDoctorReviewResult({
    ...baseResult(),
    ...overrides,
  });
  expect(validation.ok).toBe(true);
  if (validation.ok === false) {
    throw new Error(`Test fixture was not valid: ${validation.reason}`);
  }
  return validation.result;
}

describe("AI Doctor review history adapter", () => {
  it("maps every review field into a sanitized Diagnosis snapshot", () => {
    const result = validated();
    const { diagnosis, notes } = adaptAiDoctorReviewResultToDiagnosis(result);

    expect(notes).toEqual([]);
    expect(diagnosis).toEqual({
      summary: result.summary,
      likelyIssue: result.likely_issue,
      confidence: 0.5,
      evidence: result.evidence,
      missingInformation: result.missing_information,
      possibleCauses: result.possible_causes,
      immediateAction: result.immediate_action,
      whatNotToDo: [result.what_not_to_do],
      followUp24h: {
        summary: result.twenty_four_hour_follow_up,
        checklist: [],
      },
      recoveryPlan3d: {
        summary: result.three_day_recovery_plan,
        checklist: [],
      },
      riskLevel: "medium",
      suggestedActions: [],
    });
  });

  it.each([
    ["low", 0.25],
    ["medium", 0.5],
    ["high", 0.75],
  ] as const)("maps %s confidence deterministically to %s", (input, expected) => {
    expect(numericConfidenceForAiDoctorReview(input)).toBe(expected);
    expect(AI_DOCTOR_REVIEW_CONFIDENCE_SCORE[input]).toBe(expected);
    expect(adaptAiDoctorReviewResultToDiagnosis(validated({ confidence: input }))).toMatchObject({
      diagnosis: { confidence: expected },
    });
  });

  it.each([
    ["low", "low"],
    ["watch", "medium"],
    ["elevated", "medium"],
    ["high", "high"],
  ] as const)("maps %s review risk conservatively to %s", (input, expected) => {
    expect(AI_DOCTOR_REVIEW_DIAGNOSIS_RISK[input]).toBe(expected);
    expect(
      adaptAiDoctorReviewResultToDiagnosis(validated({ risk_level: input })).diagnosis?.riskLevel,
    ).toBe(expected);
  });

  it("converts the optional suggestion into one approval-required snapshot", () => {
    const { diagnosis } = adaptAiDoctorReviewResultToDiagnosis(
      validated({
        risk_level: "elevated",
        action_queue_suggestion: {
          title: "Review canopy temperature target",
          rationale: "The temperature trend is above the current target.",
        },
      }),
    );

    expect(diagnosis?.suggestedActions).toEqual([
      {
        type: "task",
        title: "Review canopy temperature target",
        detail: "The temperature trend is above the current target.",
        priority: "medium",
        reason: "The temperature trend is above the current target.",
        approvalRequired: true,
      },
    ]);
  });

  it("keeps the saved suggestion list empty when none was reviewed", () => {
    const { diagnosis } = adaptAiDoctorReviewResultToDiagnosis(validated());
    expect(diagnosis?.suggestedActions).toEqual([]);
  });

  it("retains canonical Diagnosis safety behavior after mapping", () => {
    const { diagnosis, notes } = adaptAiDoctorReviewResultToDiagnosis(
      validated({
        confidence: "low",
        summary: "The plant will fully recover after this adjustment.",
        missing_information: [],
      }),
    );

    expect(diagnosis?.summary).not.toMatch(/will fully recover/i);
    expect(diagnosis?.summary).toContain("[removed: over-promising language]");
    expect(diagnosis?.missingInformation[0]).toMatch(/evidence is limited/i);
    expect(notes).toContain("Low confidence: injected default missing-information note.");
  });

  it("is repeatable and does not mutate the validated review result", () => {
    const result = validated({
      action_queue_suggestion: {
        title: "Log another observation",
        rationale: "A second observation would improve the evidence baseline.",
      },
    });
    const before = structuredClone(result);

    const first = adaptAiDoctorReviewResultToDiagnosis(result);
    const second = adaptAiDoctorReviewResultToDiagnosis(result);

    expect(second).toEqual(first);
    expect(result).toEqual(before);
  });
});
