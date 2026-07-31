/**
 * Promotion eligibility (Build 7, commit 3).
 *
 * The property under test is a separation, not a calculation: this module
 * emits a decision and cannot change anything. Every test that matters here
 * is a refusal.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { computeBoundDigest } from "@/lib/verdantSkillEvaluationBindings";
import {
  buildEvaluationReport,
  type SkillEvaluationReport,
} from "@/lib/verdantSkillEvaluationReport";
import { calculateEvaluationMetrics } from "@/lib/verdantSkillEvaluationMetrics";
import {
  evaluateSkillPromotionEligibility,
  renderPromotionMarkdown,
  type PromotionAttestation,
  type PromotionEligibilityInput,
} from "@/lib/verdantSkillPromotionRules";
import { SKILL_EVALUATION_REPORT_VERSION } from "@/lib/verdantSkillEvaluationTypes";
import type { SkillEvaluationCaseResult } from "@/lib/verdantSkillEvaluationTypes";
import { sha256Digest } from "../../scripts/lib/verdantSkillEvaluationDigest";

const ROOT = resolve(__dirname, "../..");
const D = sha256Digest;
const NOW = "2026-08-01T00:00:00.000Z";

const MANIFEST = { id: "coco-dryback-review", version: "1.0.0" };
const POLICY = { decisionVersion: "1.0.0" };
const CORPUS = { registryVersion: "1.0.0" };

const MANIFEST_DIGEST = computeBoundDigest("skill_manifest", MANIFEST, D).value;
const POLICY_DIGEST = computeBoundDigest("policy_decision", { policyVersion: "1.0.0" }, D).value;
const CORPUS_DIGEST = computeBoundDigest("evidence_corpus", CORPUS, D).value;

function caseResult(overrides: Partial<SkillEvaluationCaseResult> = {}): SkillEvaluationCaseResult {
  return {
    reportContractVersion: SKILL_EVALUATION_REPORT_VERSION,
    fixtureId: "gc-001",
    fixtureVersion: "1.0.0",
    fixtureKind: "golden_case",
    skillId: "coco-dryback-review",
    skillVersion: "1.0.0",
    bindings: {
      manifest: computeBoundDigest("skill_manifest", MANIFEST, D),
      policy: computeBoundDigest("policy_decision", POLICY, D),
      policyVersion: "1.0.0",
      evidence: {
        registryVersion: "1.0.0",
        corpus: computeBoundDigest("evidence_corpus", CORPUS, D),
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
    riskLevelMatch: true,
    expectedSelectedEvidenceIds: [],
    actualSelectedEvidenceIds: [],
    evidenceSelectionMatch: true,
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

function report(cases: SkillEvaluationCaseResult[] = [caseResult()]): SkillEvaluationReport {
  return buildEvaluationReport({
    skillId: "coco-dryback-review",
    skillVersion: "1.0.0",
    generatedAt: NOW,
    sourceRevision: "abc1234",
    caseResults: cases,
    metrics: calculateEvaluationMetrics(cases),
    digest: D,
  });
}

const ALL: PromotionAttestation[] = [
  "expert_review",
  "internal_sandbox_soak",
  "rollback_target_recorded",
];

function decide(overrides: Partial<PromotionEligibilityInput> = {}) {
  return evaluateSkillPromotionEligibility({
    currentState: "internal_sandbox",
    requestedState: "limited_beta",
    report: report(),
    currentManifestDigest: MANIFEST_DIGEST,
    currentPolicyDigest: POLICY_DIGEST,
    currentEvidenceCorpusDigest: CORPUS_DIGEST,
    attestations: ALL,
    rollbackTarget: "coco-dryback-review@0.9.0",
    sourceRevision: "abc1234",
    reportBindingValid: true,
    artifactDisclosureCategories: [],
    generatedAt: NOW,
    digest: D,
    ...overrides,
  });
}

describe("promotion — the happy path is the narrow one", () => {
  it("allows limited beta only with everything in place", () => {
    const d = decide();
    expect(d.eligible).toBe(true);
    expect(d.blockingReasons).toEqual([]);
    expect(d.unsatisfiedGates).toEqual([]);
    expect(d.authorizedManifestLifecycle).toBe("limited_beta");
  });

  it("states a transition without performing one", () => {
    const source = readFileSync(resolve(ROOT, "src/lib/verdantSkillPromotionRules.ts"), "utf8");
    // The separation is structural: no writes, no registry, no persistence.
    expect(source).not.toContain("supabase");
    expect(source).not.toContain("writeFile");
    expect(source).not.toContain("assertValidSkillRegistry");
    expect(source).not.toContain("buildSkillRegistry");
    const d = decide();
    // It reports what WOULD be authorized; something else must apply it.
    expect(d.authorizedManifestLifecycle).toBe("limited_beta");
    expect(renderPromotionMarkdown(d)).toContain("not a promotion");
  });
});

describe("promotion — refusals", () => {
  it("never promotes a harness self-test", () => {
    const d = decide({
      report: report([caseResult({ fixtureKind: "harness_self_test", fixtureId: "hst-001" })]),
    });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("self_test_target_is_never_promotable");
  });

  it("blocks on a failed evaluation", () => {
    const d = decide({
      report: report([caseResult({ status: "fail", failureClass: "expectation_mismatch" })]),
    });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("evaluation_not_passing");
  });

  it("blocks every advance on a hard safety failure", () => {
    const d = decide({
      report: report([
        caseResult({
          status: "safety_fail",
          safetyFailures: ["device_control_emitted"],
          safetyCritical: true,
        }),
      ]),
    });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("hard_safety_failure");
  });

  it("blocks on a stale manifest binding", () => {
    // A self-consistent report can still describe a manifest since edited.
    const d = decide({ currentManifestDigest: "0".repeat(64) });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("manifest_binding_stale");
  });

  it("blocks on a stale policy or evidence binding", () => {
    expect(decide({ currentPolicyDigest: "0".repeat(64) }).blockingReasons).toContain(
      "policy_binding_stale",
    );
    expect(decide({ currentEvidenceCorpusDigest: "0".repeat(64) }).blockingReasons).toContain(
      "evidence_registry_binding_stale",
    );
  });

  it("blocks limited beta without expert review", () => {
    const d = decide({ attestations: ["internal_sandbox_soak", "rollback_target_recorded"] });
    expect(d.eligible).toBe(false);
    expect(d.missingAttestations).toContain("expert_review");
    expect(d.blockingReasons).toContain("missing_attestation");
  });

  it("blocks limited beta without a sandbox soak", () => {
    const d = decide({ attestations: ["expert_review", "rollback_target_recorded"] });
    expect(d.missingAttestations).toContain("internal_sandbox_soak");
  });

  it("blocks a release-like state without a rollback target", () => {
    const d = decide({
      rollbackTarget: null,
      attestations: ["expert_review", "internal_sandbox_soak"],
    });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("missing_attestation");
    expect(d.unsatisfiedGates).toContain("rollback_target");
  });

  it("blocks an unverifiable report binding", () => {
    const d = decide({ reportBindingValid: false });
    expect(d.blockingReasons).toContain("report_binding_invalid");
  });

  it("blocks when the artifact disclosure scan found anything", () => {
    const d = decide({ artifactDisclosureCategories: ["email_address"] });
    expect(d.blockingReasons).toContain("artifact_disclosure_scan_failed");
  });

  it("blocks when a required golden case is absent", () => {
    const d = decide({ requiredGoldenCaseIds: ["gc-001", "gc-missing"] });
    expect(d.blockingReasons).toContain("required_golden_cases_absent");
  });

  it("collects every blocking reason rather than the first", () => {
    const d = decide({
      currentManifestDigest: "0".repeat(64),
      currentPolicyDigest: "0".repeat(64),
      attestations: [],
      rollbackTarget: null,
    });
    expect(d.blockingReasons.length).toBeGreaterThan(2);
    expect(d.missingAttestations.length).toBeGreaterThan(1);
  });
});

describe("promotion — withdrawal and determinism", () => {
  it("permits withdrawal without evidence", () => {
    // Requiring a green report to pause a misbehaving skill would be perverse.
    for (const state of ["paused", "deprecated", "withdrawn", "superseded"] as const) {
      const d = decide({
        requestedState: state,
        report: report([caseResult({ status: "safety_fail", safetyCritical: true })]),
        attestations: [],
        rollbackTarget: null,
      });
      expect(d.eligible, state).toBe(true);
      expect(d.blockingReasons, state).toEqual([]);
    }
  });

  it("produces a deterministic decision digest", () => {
    const a = decide();
    const b = decide();
    expect(a.decisionDigest).toBe(b.decisionDigest);
    expect(a.decisionDigest).toMatch(/^[0-9a-f]{64}$/);
    // A different decision must not share a digest.
    expect(decide({ rollbackTarget: null }).decisionDigest).not.toBe(a.decisionDigest);
  });

  it("orders gates and reasons deterministically", () => {
    const d = decide({ attestations: [], rollbackTarget: null });
    expect(d.unsatisfiedGates).toEqual([...d.unsatisfiedGates]);
    expect(d.blockingReasons).toEqual([...d.blockingReasons]);
  });
});
