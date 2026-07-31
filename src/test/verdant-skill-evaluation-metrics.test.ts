/**
 * Evaluation metrics (Build 7, commit 2).
 *
 * The load-bearing test here is the zero-denominator one. A harness that
 * reports 100% for a rate it never measured is not merely imprecise — it
 * manufactures the exact reassurance a release gate is supposed to withhold.
 */

import { describe, it, expect } from "vitest";
import { buildRate, calculateEvaluationMetrics } from "@/lib/verdantSkillEvaluationMetrics";
import { SKILL_EVALUATION_REPORT_VERSION } from "@/lib/verdantSkillEvaluationTypes";
import type { SkillEvaluationCaseResult } from "@/lib/verdantSkillEvaluationTypes";

function caseResult(overrides: Partial<SkillEvaluationCaseResult> = {}): SkillEvaluationCaseResult {
  return {
    reportContractVersion: SKILL_EVALUATION_REPORT_VERSION,
    fixtureId: "hst-001",
    fixtureVersion: "1.0.0",
    fixtureKind: "harness_self_test",
    skillId: "harness-self-test",
    skillVersion: "1.0.0",
    bindings: {} as never,
    bindingValid: true,
    bindingRejectionReasons: [],
    evaluatedAt: "2026-08-01T00:00:00.000Z",
    durationMs: null,
    status: "pass",
    failureClass: "none",
    safetyCritical: false,
    safetyFailures: [],
    schemaCompliant: true,
    expectedApplicability: null,
    actualApplicability: "applicable",
    applicabilityMatch: true,
    abstentionExpectation: "not_applicable",
    abstentionActual: true,
    abstentionMatch: null,
    expectedMissingInformation: [],
    detectedMissingInformation: [],
    missingInformationMatch: true,
    expectedEvidenceIds: [],
    actualCitedEvidenceIds: [],
    evidenceReferenceIntegrity: true,
    unsupportedClaimsFound: [],
    expectedPolicyOutcome: null,
    actualPolicyOutcomes: [],
    policyMatch: true,
    expectedRiskLevel: null,
    actualRiskLevels: [],
    expectedActionEligibility: null,
    actualActionEligibility: "none",
    actionEligibilityMatch: true,
    expectedExecutionCapability: null,
    actualExecutionCapabilities: [],
    executionCapabilityMatch: true,
    deviceCommandFindings: [],
    confidenceExpectation: null,
    actualConfidence: null,
    confidenceExpectationMatch: null,
    determinismRepetitions: 1,
    determinismMatch: null,
    warnings: [],
    errors: [],
    failureReasons: [],
    ...overrides,
  };
}

describe("rates — the denominator rule", () => {
  it("reports not_measured with a null value when nothing was applicable", () => {
    const r = buildRate(
      [1, 2, 3],
      () => false,
      () => true,
    );
    expect(r.status).toBe("not_measured");
    expect(r.value).toBeNull();
    expect(r.denominator).toBe(0);
    expect(r.numerator).toBe(0);
    // The failure this exists to prevent.
    expect(r.value).not.toBe(1);
    expect(r.value).not.toBe(0);
  });

  it("reports a measured rate with both terms visible", () => {
    const r = buildRate(
      [1, 2, 3, 4],
      () => true,
      (n) => n % 2 === 0,
    );
    expect(r).toEqual({ status: "measured", numerator: 2, denominator: 4, value: 0.5 });
  });

  it("reports zero honestly, distinct from not_measured", () => {
    const r = buildRate(
      [1, 2],
      () => true,
      () => false,
    );
    expect(r.status).toBe("measured");
    expect(r.value).toBe(0);
  });

  it("rounds deterministically so the same input serializes identically", () => {
    const a = buildRate(
      [1, 2, 3],
      () => true,
      (n) => n < 2,
    );
    const b = buildRate(
      [1, 2, 3],
      () => true,
      (n) => n < 2,
    );
    expect(a.value).toBe(b.value);
    expect(String(a.value)).toBe(String(b.value));
  });
});

describe("metrics — abstention honesty", () => {
  it("excludes not_applicable cases from the abstention denominator", () => {
    const m = calculateEvaluationMetrics([
      caseResult({ abstentionExpectation: "not_applicable" }),
      caseResult({ abstentionExpectation: "not_applicable" }),
    ]);
    expect(m.correctAbstentionRate.status).toBe("not_measured");
    expect(m.correctAbstentionRate.value).toBeNull();
  });

  it("measures abstention only over cases that had the opportunity", () => {
    const m = calculateEvaluationMetrics([
      caseResult({ abstentionExpectation: "must_abstain", abstentionMatch: true }),
      caseResult({ abstentionExpectation: "must_abstain", abstentionMatch: false }),
      caseResult({ abstentionExpectation: "not_applicable", abstentionMatch: null }),
    ]);
    expect(m.correctAbstentionRate.denominator).toBe(2);
    expect(m.correctAbstentionRate.value).toBe(0.5);
    expect(m.incorrectAbstentionCount).toBe(1);
  });

  it("keeps a single-run case out of the determinism denominator", () => {
    // One sample is not evidence of determinism.
    const m = calculateEvaluationMetrics([caseResult({ determinismMatch: null })]);
    expect(m.deterministicRepeatabilityRate.status).toBe("not_measured");
  });

  it("counts device commands and safety failures across cases", () => {
    const m = calculateEvaluationMetrics([
      caseResult({
        status: "safety_fail",
        deviceCommandFindings: ["device_control_instruction"],
      }),
      caseResult({ status: "pass" }),
    ]);
    expect(m.deviceCommandCount).toBe(1);
    expect(m.safetyCriticalFailures).toBe(1);
    expect(m.failedCases).toBe(1);
    expect(m.passedCases).toBe(1);
  });

  it("orders tags and kinds deterministically", () => {
    const m = calculateEvaluationMetrics(
      [caseResult({ fixtureId: "a" }), caseResult({ fixtureId: "b" })],
      { a: ["zeta", "alpha"], b: ["alpha"] },
    );
    expect(m.casesByTag.map((t) => t.tag)).toEqual(["alpha", "zeta"]);
    expect(m.casesByTag.find((t) => t.tag === "alpha")?.count).toBe(2);
    expect(m.casesByFixtureKind.every((k) => k.count > 0)).toBe(true);
  });

  it("never reports a conformance rate as calibration", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/verdantSkillEvaluationMetrics.ts", "utf8"),
    );
    // Fixture bucket matching is not calibration, and the field name must not
    // imply a claim about real-world outcome frequencies.
    expect(source).not.toContain("calibrationRate");
    expect(source).toContain("confidenceExpectationConformanceRate");
  });
});
