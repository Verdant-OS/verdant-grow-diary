/**
 * AI Doctor Output Evaluation — Commit 1 unit tests (contract / shape).
 *
 * Pure & deterministic. No I/O, no Supabase, no model calls. Exercises the
 * required-field/shape rules, deterministic finding ordering, determinism
 * across repeated runs, input immutability, and malformed-input tolerance.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateAiDoctorOutput,
  AI_DOCTOR_OUTPUT_CONTRACT_VERSION,
  type AiDoctorOutputEvaluationInput,
  type AiDoctorEvaluationCode,
} from "@/lib/aiDoctorOutputEvaluation";
import {
  compilePlantContextFromRows,
  type PlantContextPayload,
} from "@/lib/aiDoctorContextCompiler";
import type { AiDoctorContextResult } from "@/lib/aiDoctorContextRules";
import type { Phase1DiagnosisResult } from "@/lib/aiDoctorEngine";

// ---------------------------------------------------------------------------
// Builders — real context via the compiler; readiness as a typed literal.
// ---------------------------------------------------------------------------

function makeContext(): PlantContextPayload {
  return compilePlantContextFromRows({
    plant: {
      id: "plant-eval-1",
      tent_id: "tent-eval-1",
      grow_id: "grow-eval-1",
      name: "Eval Plant",
      strain: "Northern Lights Auto",
      stage: "veg",
    },
    growEvents: [],
    sensorReadings: [],
    now: new Date("2026-06-04T12:00:00Z"),
  });
}

function makeReadiness(
  readiness: AiDoctorContextResult["readiness"] = "strong",
): AiDoctorContextResult {
  return {
    readiness,
    missing: [],
    evidence: ["plant-profile", "stage"],
    counts: {
      recentEvents: 0,
      recentWateringOrFeeding: 0,
      recentManualSnapshots: 0,
      recentWarnings: 0,
    },
    latest: { manualSnapshotAt: null },
    safeNextStep: "Ready for a cautious AI Doctor review.",
    diagnosisClaimed: false,
  };
}

function makeValidResult(): Phase1DiagnosisResult {
  return {
    summary: "Canopy looks generally healthy; no urgent concern identified.",
    likely_issue: "",
    confidence: 0.25,
    evidence: ["Recent watering entry logged 2 days ago."],
    missing_information: ["No manual sensor snapshot in the last 48 hours."],
    possible_causes: ["Normal variation for this stage."],
    immediate_action: "Observe and re-check in 24 hours before changing anything.",
    what_not_to_do: ["Do not change the feeding schedule based on a single reading."],
    twenty_four_hour_follow_up: "Check leaf turgor and take a clear photo tomorrow.",
    three_day_recovery_plan:
      "Continue current routine; note any new symptoms across the next three checkpoints.",
    risk_level: "low",
    action_queue_suggestion: null,
  };
}

function makeInput(
  result: Phase1DiagnosisResult,
  readiness: AiDoctorContextResult["readiness"] = "strong",
): AiDoctorOutputEvaluationInput {
  return {
    result,
    context: makeContext(),
    readiness: makeReadiness(readiness),
  };
}

function codesOf(findings: readonly { code: AiDoctorEvaluationCode }[]): AiDoctorEvaluationCode[] {
  return findings.map((f) => f.code);
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[key]);
    }
    Object.freeze(obj);
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Valid path
// ---------------------------------------------------------------------------

describe("evaluateAiDoctorOutput — valid contract", () => {
  it("a complete, well-formed result passes with no findings", () => {
    const evaluation = evaluateAiDoctorOutput(makeInput(makeValidResult()));
    expect(evaluation.status).toBe("pass");
    expect(evaluation.findings).toEqual([]);
    expect(evaluation.errorCount).toBe(0);
    expect(evaluation.warningCount).toBe(0);
    expect(evaluation.infoCount).toBe(0);
    expect(evaluation.contractVersion).toBe(AI_DOCTOR_OUTPUT_CONTRACT_VERSION);
  });

  it("a valid advisory action_queue_suggestion passes", () => {
    const result = makeValidResult();
    result.action_queue_suggestion = {
      action_type: "advisory",
      status: "pending_approval",
      reason: "Consider reviewing recent watering cadence with a grower.",
      risk_level: "low",
    };
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(evaluation.status).toBe("pass");
    expect(evaluation.findings).toEqual([]);
  });

  it("an empty likely_issue is allowed (weak context ⇒ no certain issue)", () => {
    const result = makeValidResult();
    result.likely_issue = "";
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(evaluation.status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// Required-field / shape failures
// ---------------------------------------------------------------------------

describe("evaluateAiDoctorOutput — required fields", () => {
  it("flags a missing required field", () => {
    const result = makeValidResult() as unknown as Record<string, unknown>;
    delete result.summary;
    const evaluation = evaluateAiDoctorOutput(
      makeInput(result as unknown as Phase1DiagnosisResult),
    );
    expect(evaluation.status).toBe("fail");
    expect(codesOf(evaluation.findings)).toContain("required_field_missing");
    expect(
      evaluation.findings.some((f) => f.code === "required_field_missing" && f.field === "summary"),
    ).toBe(true);
  });

  it("flags an empty required text field", () => {
    const result = makeValidResult();
    result.immediate_action = "   ";
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(evaluation.status).toBe("fail");
    expect(
      evaluation.findings.some(
        (f) => f.code === "required_field_empty" && f.field === "immediate_action",
      ),
    ).toBe(true);
  });

  it("flags an empty what_not_to_do array", () => {
    const result = makeValidResult();
    result.what_not_to_do = [];
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(evaluation.status).toBe("fail");
    expect(
      evaluation.findings.some(
        (f) => f.code === "required_field_empty" && f.field === "what_not_to_do",
      ),
    ).toBe(true);
  });

  it("flags a missing required array field", () => {
    const result = makeValidResult() as unknown as Record<string, unknown>;
    delete result.evidence;
    const evaluation = evaluateAiDoctorOutput(
      makeInput(result as unknown as Phase1DiagnosisResult),
    );
    expect(
      evaluation.findings.some(
        (f) => f.code === "required_field_missing" && f.field === "evidence",
      ),
    ).toBe(true);
  });

  it("flags an absent 24-hour follow-up with follow_up_absent", () => {
    const result = makeValidResult();
    result.twenty_four_hour_follow_up = "";
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(
      evaluation.findings.some(
        (f) => f.code === "follow_up_absent" && f.field === "twenty_four_hour_follow_up",
      ),
    ).toBe(true);
  });

  it("flags an absent 3-day recovery plan with follow_up_absent", () => {
    const result = makeValidResult();
    result.three_day_recovery_plan = "   ";
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(
      evaluation.findings.some(
        (f) => f.code === "follow_up_absent" && f.field === "three_day_recovery_plan",
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scalar validation
// ---------------------------------------------------------------------------

describe("evaluateAiDoctorOutput — confidence & risk", () => {
  it.each([1.5, -0.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "flags out-of-range/non-finite confidence %s",
    (bad) => {
      const result = makeValidResult();
      (result as unknown as Record<string, unknown>).confidence = bad;
      const evaluation = evaluateAiDoctorOutput(makeInput(result));
      expect(evaluation.findings.some((f) => f.code === "invalid_confidence")).toBe(true);
    },
  );

  it("flags a non-numeric confidence", () => {
    const result = makeValidResult();
    (result as unknown as Record<string, unknown>).confidence = "high";
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(evaluation.findings.some((f) => f.code === "invalid_confidence")).toBe(true);
  });

  it("flags an invalid risk_level", () => {
    const result = makeValidResult();
    (result as unknown as Record<string, unknown>).risk_level = "watch";
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(evaluation.findings.some((f) => f.code === "invalid_risk_level")).toBe(true);
  });

  it("flags a structurally broken advisory suggestion (empty reason)", () => {
    const result = makeValidResult();
    result.action_queue_suggestion = {
      action_type: "advisory",
      status: "pending_approval",
      reason: "   ",
      risk_level: "low",
    };
    const evaluation = evaluateAiDoctorOutput(makeInput(result));
    expect(
      evaluation.findings.some(
        (f) => f.code === "required_field_empty" && f.field === "action_queue_suggestion.reason",
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Determinism, ordering, immutability, robustness
// ---------------------------------------------------------------------------

describe("evaluateAiDoctorOutput — determinism & ordering", () => {
  function multiViolationResult(): Phase1DiagnosisResult {
    const result = makeValidResult();
    result.summary = ""; // required_field_empty (field summary)
    result.twenty_four_hour_follow_up = ""; // follow_up_absent
    (result as unknown as Record<string, unknown>).confidence = 2; // invalid_confidence
    (result as unknown as Record<string, unknown>).risk_level = "urgent"; // invalid_risk_level
    return result;
  }

  it("sorts findings by severity, then code, then field, then message", () => {
    const evaluation = evaluateAiDoctorOutput(makeInput(multiViolationResult()));
    // All are severity=error, so ordering is purely by code (lexicographic).
    expect(codesOf(evaluation.findings)).toEqual([
      "follow_up_absent",
      "invalid_confidence",
      "invalid_risk_level",
      "required_field_empty",
    ]);
  });

  it("returns byte-identical output across repeated runs", () => {
    const input = makeInput(multiViolationResult());
    const a = evaluateAiDoctorOutput(input);
    const b = evaluateAiDoctorOutput(input);
    const c = evaluateAiDoctorOutput(input);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("does not mutate its inputs", () => {
    const input = makeInput(multiViolationResult());
    const before = JSON.stringify(input);
    deepFreeze(input);
    // A frozen input would throw on any mutation attempt (ESM strict mode).
    expect(() => evaluateAiDoctorOutput(input)).not.toThrow();
    expect(JSON.stringify(input)).toBe(before);
  });

  it("tolerates unknown / malformed input without throwing", () => {
    const junk = {
      ...makeValidResult(),
      unexpected_extra_field: { nested: true },
    } as unknown as Record<string, unknown>;
    delete junk.risk_level;
    delete junk.confidence;
    let evaluation;
    expect(() => {
      evaluation = evaluateAiDoctorOutput(makeInput(junk as unknown as Phase1DiagnosisResult));
    }).not.toThrow();
    expect(evaluation).toBeDefined();
    expect(evaluation!.status).toBe("fail");
    expect(codesOf(evaluation!.findings)).toContain("invalid_confidence");
    expect(codesOf(evaluation!.findings)).toContain("invalid_risk_level");
  });

  it("returns findings whose count fields match the findings array", () => {
    const evaluation = evaluateAiDoctorOutput(makeInput(multiViolationResult()));
    expect(evaluation.errorCount).toBe(
      evaluation.findings.filter((f) => f.severity === "error").length,
    );
    expect(evaluation.errorCount + evaluation.warningCount + evaluation.infoCount).toBe(
      evaluation.findings.length,
    );
  });
});
