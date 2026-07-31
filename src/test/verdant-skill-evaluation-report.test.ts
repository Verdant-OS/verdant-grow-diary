/**
 * Evaluation report artifact (Build 7, commit 3).
 *
 * An artifact is read by people who were not present when it was produced.
 * Its job is to be honest about what it measured, what it did not, and which
 * bytes it judged — so the tests here are mostly about what it must NOT say.
 */

import { describe, it, expect } from "vitest";
import { computeBoundDigest } from "@/lib/verdantSkillEvaluationBindings";
import { calculateEvaluationMetrics } from "@/lib/verdantSkillEvaluationMetrics";
import {
  EVALUATION_REPORT_LIMITATIONS,
  buildEvaluationReport,
  renderEvaluationMarkdown,
  scanArtifactForDisclosure,
  verifyReportBinding,
} from "@/lib/verdantSkillEvaluationReport";
import { SKILL_EVALUATION_REPORT_VERSION } from "@/lib/verdantSkillEvaluationTypes";
import type { SkillEvaluationCaseResult } from "@/lib/verdantSkillEvaluationTypes";
import { serializeSkillContract } from "@/lib/verdantSkillSchemas";
import { sha256Digest } from "../../scripts/lib/verdantSkillEvaluationDigest";

const D = sha256Digest;
const NOW = "2026-08-01T00:00:00.000Z";

function caseResult(overrides: Partial<SkillEvaluationCaseResult> = {}): SkillEvaluationCaseResult {
  return {
    reportContractVersion: SKILL_EVALUATION_REPORT_VERSION,
    fixtureId: "gc-001",
    fixtureVersion: "1.0.0",
    fixtureKind: "golden_case",
    skillId: "coco-dryback-review",
    skillVersion: "1.0.0",
    bindings: {
      manifest: computeBoundDigest("skill_manifest", { id: "x" }, D),
      policy: computeBoundDigest("policy_decision", { v: 1 }, D),
      evidence: {
        registryVersion: "1.0.0",
        corpus: computeBoundDigest("evidence_corpus", { r: 1 }, D),
        selectedEvidenceIds: [],
        selection: computeBoundDigest("evidence_selection", [], D),
      },
      goldenCaseSet: computeBoundDigest("golden_case_set", { ids: ["gc-001"] }, D),
    } as never,
    bindingValid: true,
    bindingRejectionReasons: [],
    evaluatedAt: NOW,
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
    determinismRepetitions: 2,
    determinismMatch: true,
    warnings: [],
    errors: [],
    failureReasons: [],
    ...overrides,
  };
}

function report(cases: SkillEvaluationCaseResult[] = [caseResult()], generatedAt = NOW) {
  return buildEvaluationReport({
    skillId: "coco-dryback-review",
    skillVersion: "1.0.0",
    generatedAt,
    sourceRevision: "abc1234",
    caseResults: cases,
    metrics: calculateEvaluationMetrics(cases),
    digest: D,
    artifactPaths: ["artifacts/skills/coco-dryback-review/1.0.0/evaluation.json"],
  });
}

describe("report — proves itself", () => {
  it("carries a verifiable self-digest", () => {
    const r = report();
    expect(r.reportBinding?.value).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyReportBinding(r, D)).toBe(true);
  });

  it("fails self-verification after any edit", () => {
    const r = report();
    const tampered = { ...r, overallStatus: "pass" as const, skillVersion: "9.9.9" };
    expect(verifyReportBinding(tampered, D)).toBe(false);
  });

  it("refuses to self-verify without a binding", () => {
    const r = { ...report(), reportBinding: null };
    expect(verifyReportBinding(r, D)).toBe(false);
  });

  it("is byte-identical for identical inputs under a fixed clock", () => {
    expect(serializeSkillContract(report())).toBe(serializeSkillContract(report()));
  });
});

describe("report — honest status", () => {
  it("reports blocked, not failed, when a binding did not verify", () => {
    // We cannot say what an unbound run measured, so "fail" would overstate.
    const r = report([caseResult({ bindingValid: false, status: "fail" })]);
    expect(r.overallStatus).toBe("blocked");
  });

  it("reports safety_fail above every other status", () => {
    const r = report([
      caseResult({
        status: "safety_fail",
        safetyCritical: true,
        safetyFailures: ["device_control_emitted"],
      }),
      caseResult({ fixtureId: "gc-002", bindingValid: false }),
    ]);
    expect(r.overallStatus).toBe("safety_fail");
    expect(r.hardSafetyStatus).toBe("failed");
  });

  it("never marks a self-test report promotion-eligible", () => {
    const r = report([caseResult({ fixtureKind: "harness_self_test", fixtureId: "hst-001" })]);
    expect(r.overallStatus).toBe("pass");
    expect(r.promotionEligible).toBe(false);
  });

  it("states its own limitations in the artifact", () => {
    const r = report();
    expect(r.limitations).toEqual([...EVALUATION_REPORT_LIMITATIONS]);
    expect(r.limitations.join(" ")).toContain("not calibration");
    expect(r.limitations.join(" ")).toContain("No provider was called");
  });
});

describe("report — markdown", () => {
  it("renders not_measured as a word, never as a percentage", () => {
    const md = renderEvaluationMarkdown(report());
    expect(md).toContain("not_measured (0/0)");
    // The falsehood this rule exists to prevent.
    expect(md).not.toMatch(/Correct abstention \| 100\.0%/);
  });

  it("shows bound digests and counts that match the JSON", () => {
    const r = report([caseResult(), caseResult({ fixtureId: "gc-002", status: "fail" })]);
    const md = renderEvaluationMarkdown(r);
    expect(md).toContain(r.reportBinding!.value.slice(0, 16));
    expect(md).toContain(`Cases: ${r.metrics.totalCases}`);
    expect(md).toContain(`${r.metrics.passedCases} passed, ${r.metrics.failedCases} failed`);
    expect(md).toContain("gc-002");
  });

  it("makes safety failures prominent", () => {
    const r = report([
      caseResult({
        status: "safety_fail",
        safetyCritical: true,
        safetyFailures: ["device_control_emitted"],
        failureReasons: ["Device-control content was present while an action remained eligible."],
      }),
    ]);
    const md = renderEvaluationMarkdown(r);
    expect(md).toContain("## Safety failures");
    expect(md).toContain("device_control_emitted");
    expect(md).toContain("SAFETY_FAIL");
  });

  it("distinguishes an evaluation precondition from a promotion decision", () => {
    const md = renderEvaluationMarkdown(report());
    expect(md).toContain("NOT a promotion decision");
  });

  it("orders cases deterministically", () => {
    const a = report([caseResult({ fixtureId: "b" }), caseResult({ fixtureId: "a" })]);
    expect(a.caseResults.map((c) => c.fixtureId)).toEqual(["a", "b"]);
  });
});

describe("report — disclosure", () => {
  it("passes a clean artifact", () => {
    expect(scanArtifactForDisclosure(report())).toEqual([]);
  });

  it("detects production-shaped data by category, never by value", () => {
    const r = report([caseResult({ failureReasons: ["contact grower@example.com"] })]);
    const categories = scanArtifactForDisclosure(r);
    expect(categories).toContain("email_address");
    // The category name must not carry the value it found.
    expect(categories.join(" ")).not.toContain("grower@example.com");
  });

  it("carries no compiled plant context", () => {
    // Redaction is structural: the field is never copied in.
    const serialized = serializeSkillContract(report());
    expect(serialized).not.toContain("photoSummary");
    expect(serialized).not.toContain("recentActions");
    expect(serialized).not.toContain("sensorSummary");
  });
});
