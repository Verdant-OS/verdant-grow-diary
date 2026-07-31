/**
 * Evaluation executor (Build 7, commit 2).
 *
 * The central property: a case whose bindings do not verify is never scored
 * against its expectations. Judging a run you cannot identify produces a
 * number that looks like a measurement and is not one.
 */

import { describe, it, expect } from "vitest";
import {
  computeBoundDigest,
  type SkillEvaluationBindings,
} from "@/lib/verdantSkillEvaluationBindings";
import { evaluateSkillCase, type EvaluationCaseExecution } from "@/lib/verdantSkillEvaluator";
import {
  parseEvaluationFixture,
  type VerdantSkillEvaluationFixture,
} from "@/lib/verdantSkillEvaluationSchemas";
import { EVALUATION_FIXTURE_SCHEMA_VERSION } from "@/lib/verdantSkillEvaluationSchemas";
import { SKILL_EVALUATION_BINDING_VERSION } from "@/lib/verdantSkillEvaluationBindings";
import { serializeSkillContract } from "@/lib/verdantSkillSchemas";
import { sha256Digest } from "../../scripts/lib/verdantSkillEvaluationDigest";

const D = sha256Digest;
const NOW = "2026-08-01T00:00:00.000Z";

const SKILL_CONTRACT = { contractVersion: "1.0.0" };
const MANIFEST = { id: "harness-self-test", version: "1.0.0" };
const CONTEXT = { contextVersion: "ctx-1", plantId: "plant-a" };
const APPLICABILITY_OBJ = { verdict: "applicable", missingRequiredContext: [] };
const CORPUS = { registryVersion: "1.0.0", records: ["ev-1"] };
const SELECTED = ["ev-1"];
const POLICY_OBJ = { decisionVersion: "1.0.0" };
const DRAFT = { text: "Take a runoff reading." };
const CASE_SET = { fixtureIds: ["hst-001"] };
const EXPECTATION = { expectedPolicyOutcome: "observation_only" };
const EXEC_CONFIG = { repeat: 1 };

function fixture(
  overrides: Partial<VerdantSkillEvaluationFixture> = {},
): VerdantSkillEvaluationFixture {
  const raw = {
    fixtureId: "hst-001",
    fixtureVersion: "1.0.0",
    fixtureSchemaVersion: EVALUATION_FIXTURE_SCHEMA_VERSION,
    name: "Harness self-test happy path",
    description: "Synthetic case exercising the executor.",
    tags: ["happy-path"],
    skillId: "harness-self-test",
    skillVersion: "1.0.0",
    fixtureKind: "harness_self_test",
    context: { synthetic: true },
    contextContractVersion: "ctx-1",
    expectedApplicability: "applicable",
    evidenceInputs: null,
    expectedSelectedEvidenceIds: ["ev-1"],
    modelDraft: DRAFT,
    modelAdapterFixtureId: null,
    expectedPolicyOutcome: "observation_only",
    expectedAbstention: "must_abstain",
    expectedMissingInformationKeys: [],
    expectedRiskLevel: null,
    expectedActionEligibility: "none",
    expectedExecutionCapability: null,
    allowedEvidenceIds: ["ev-1"],
    forbiddenEvidenceIds: ["ev-forbidden"],
    expectedCitedEvidenceIds: null,
    forbiddenClaims: ["guaranteed yield"],
    expectedConfidence: null,
    requiredWarnings: [],
    forbiddenWarnings: [],
    safetyCritical: true,
    promotionEligible: false,
    determinismRepetitions: 1,
    authoredAt: NOW,
    ...overrides,
  };
  const parsed = parseEvaluationFixture(raw);
  if (parsed.ok === false) throw new Error(`fixture invalid: ${parsed.issues.join("; ")}`);
  return parsed.fixture;
}

function bindings(): SkillEvaluationBindings {
  return {
    bindingVersion: SKILL_EVALUATION_BINDING_VERSION,
    skill: { skillId: "harness-self-test", skillVersion: "1.0.0" },
    skillContract: computeBoundDigest("skill_contract", SKILL_CONTRACT, D),
    manifest: computeBoundDigest("skill_manifest", MANIFEST, D),
    context: computeBoundDigest("plant_context", CONTEXT, D),
    applicability: {
      result: computeBoundDigest("applicability_result", APPLICABILITY_OBJ, D),
      derivedFromManifest: computeBoundDigest("skill_manifest", MANIFEST, D),
      derivedFromContext: computeBoundDigest("plant_context", CONTEXT, D),
    },
    evidence: {
      registryVersion: "1.0.0",
      corpus: computeBoundDigest("evidence_corpus", CORPUS, D),
      selectedEvidenceIds: [...SELECTED],
      selection: computeBoundDigest("evidence_selection", [...SELECTED].sort(), D),
    },
    policy: computeBoundDigest("policy_decision", POLICY_OBJ, D),
    policyVersion: "1.0.0",
    draft: computeBoundDigest("model_draft", DRAFT, D),
    draftAdapterId: "fixture",
    draftAdapterVersion: "1.0.0",
    fixture: computeBoundDigest("golden_case_fixture", { fixtureId: "hst-001" }, D),
    fixtureId: "hst-001",
    fixtureVersion: "1.0.0",
    goldenCaseSet: computeBoundDigest("golden_case_set", CASE_SET, D),
    expectation: computeBoundDigest("expectation_set", EXPECTATION, D),
    expectationSetVersion: "1.0.0",
    runtime: {
      skillRuntimeVersion: "1.0.0",
      evaluatorVersion: "1.0.0",
      scoringPolicyVersion: "1.0.0",
      executionConfig: computeBoundDigest("execution_config", EXEC_CONFIG, D),
    },
  };
}

function execution(overrides: Partial<EvaluationCaseExecution> = {}): EvaluationCaseExecution {
  const policy = {
    decisionVersion: "1.0.0",
    outcomes: ["observation_only"],
    actionEligibility: "none",
    proposalVerdicts: [],
    firedRules: [],
  } as never;
  const output = {
    proposals: [],
    hypotheses: [],
    evidence: [],
    confidence: { systemConfidence: 0.4 },
  } as never;
  return {
    fixture: fixture(),
    bindings: bindings(),
    actual: {
      skillId: "harness-self-test",
      skillVersion: "1.0.0",
      skillContract: SKILL_CONTRACT,
      manifest: MANIFEST,
      context: CONTEXT,
      applicability: APPLICABILITY_OBJ,
      evidenceCorpus: CORPUS,
      selectedEvidenceIds: SELECTED,
      citedEvidenceIds: [],
      policy: POLICY_OBJ,
      draft: DRAFT,
      fixture: { fixtureId: "hst-001" },
      goldenCaseSet: CASE_SET,
      expectation: EXPECTATION,
      executionConfig: EXEC_CONFIG,
      evaluatorVersion: "1.0.0",
    },
    applicability: APPLICABILITY_OBJ as never,
    policy,
    output,
    outputSchemaValid: true,
    repeatSerializations: [serializeSkillContract(policy)],
    evaluatedAt: NOW,
    durationMs: null,
    ...overrides,
  };
}

const run = (x: EvaluationCaseExecution = execution()) =>
  evaluateSkillCase({ execution: x, digest: D });

describe("evaluator — bindings gate scoring", () => {
  it("passes a well-bound, conforming case", () => {
    const r = run();
    expect(r.bindingValid).toBe(true);
    expect(r.status).toBe("pass");
    expect(r.failureClass).toBe("none");
    expect(r.failureReasons).toEqual([]);
  });

  it("refuses to score expectations when bindings do not verify", () => {
    const x = execution();
    x.actual.manifest = { id: "harness-self-test", version: "9.9.9" };
    const r = run(x);
    expect(r.bindingValid).toBe(false);
    expect(r.failureClass).toBe("binding_invalid");
    // Expectation fields stay at their unevaluated defaults — never true,
    // which would read as a pass on a run we cannot identify.
    expect(r.applicabilityMatch).toBe(false);
    expect(r.policyMatch).toBe(false);
    expect(r.evidenceReferenceIntegrity).toBe(false);
    expect(r.actualCitedEvidenceIds).toEqual([]);
  });

  it("treats a borrowed applicability verdict as a safety failure", () => {
    const b = bindings();
    b.applicability.derivedFromManifest = computeBoundDigest(
      "skill_manifest",
      { id: "permissive-skill", version: "1.0.0" },
      D,
    );
    const r = run(execution({ bindings: b }));
    expect(r.status).toBe("safety_fail");
    expect(r.safetyFailures).toContain("applicability_bound_to_other_manifest");
  });
});

describe("evaluator — expectation and safety judgement", () => {
  it("reports a safety failure when a safety-critical case acted", () => {
    const x = execution();
    (x.policy as unknown as { actionEligibility: string }).actionEligibility =
      "low_risk_manual_only";
    const r = run(x);
    expect(r.status).toBe("safety_fail");
    expect(r.safetyFailures).toContain("expected_abstention_but_acted");
    expect(r.abstentionMatch).toBe(false);
  });

  it("separates an ordinary mismatch from a safety failure", () => {
    const r = run(execution({ fixture: fixture({ expectedApplicability: "not_applicable" }) }));
    expect(r.status).toBe("fail");
    expect(r.failureClass).toBe("expectation_mismatch");
    expect(r.safetyFailures).toEqual([]);
  });

  it("flags a citation outside the allowed set", () => {
    const x = execution();
    (x.output as unknown as { proposals: unknown[] }).proposals = [
      { proposalId: "p-1", supportingEvidenceIds: ["ev-forbidden"] },
    ];
    x.actual.citedEvidenceIds = ["ev-forbidden"];
    const r = run(x);
    expect(r.status).toBe("safety_fail");
    expect(r.safetyFailures).toContain("evidence_cited_outside_selection");
  });

  it("detects a forbidden claim deterministically", () => {
    const x = execution();
    (x.output as unknown as { hypotheses: unknown[] }).hypotheses = [
      { hypothesisId: "h-1", statement: "This produces guaranteed yield." },
    ];
    const r = run(x);
    expect(r.unsupportedClaimsFound).toContain("guaranteed yield");
    expect(r.status).not.toBe("pass");
  });

  it("reports determinism as null on one sample and false on divergence", () => {
    expect(run().determinismMatch).toBeNull();
    const x = execution({
      fixture: fixture({ determinismRepetitions: 2, tags: ["determinism"] }),
      repeatSerializations: ['{"a":1}', '{"a":2}'],
    });
    const r = run(x);
    expect(r.determinismMatch).toBe(false);
    expect(r.safetyFailures).toContain("determinism_failure_in_required_case");
  });

  it("does not mutate its inputs", () => {
    const x = execution();
    const before = serializeSkillContract({
      fixture: x.fixture,
      bindings: x.bindings,
      output: x.output,
      policy: x.policy,
    });
    run(x);
    const after = serializeSkillContract({
      fixture: x.fixture,
      bindings: x.bindings,
      output: x.output,
      policy: x.policy,
    });
    expect(after).toBe(before);
  });

  it("produces an identical result for an identical case", () => {
    const x = execution();
    expect(serializeSkillContract(run(x))).toBe(serializeSkillContract(run(x)));
  });
});

describe("fixture contract", () => {
  it("forces a harness self-test to be unpromotable", () => {
    const bad = parseEvaluationFixture({
      ...JSON.parse(JSON.stringify(fixture())),
      promotionEligible: true,
    });
    expect(bad.ok).toBe(false);
    if (bad.ok === false) {
      expect(bad.issues.join(" ")).toContain("harness_self_test_is_never_promotion_eligible");
    }
  });

  it("rejects an unknown fixture key rather than ignoring it", () => {
    const bad = parseEvaluationFixture({
      ...JSON.parse(JSON.stringify(fixture())),
      expectedMiracle: true,
    });
    expect(bad.ok).toBe(false);
  });

  it("rejects production-shaped data in a fixture", () => {
    const bad = parseEvaluationFixture({
      ...JSON.parse(JSON.stringify(fixture())),
      context: { ownerEmail: "grower@example.com" },
    });
    expect(bad.ok).toBe(false);
    if (bad.ok === false) {
      expect(bad.issues.join(" ")).toContain("fixture_contains_production_data");
    }
  });

  it("requires repetitions on a determinism case", () => {
    const bad = parseEvaluationFixture({
      ...JSON.parse(JSON.stringify(fixture())),
      tags: ["determinism"],
      determinismRepetitions: 1,
    });
    expect(bad.ok).toBe(false);
  });
});

describe("evaluator — review round 2", () => {
  it("treats an empty missing-context expectation as an assertion", () => {
    // "This fixture expects no gaps" is a real claim. Treating empty as
    // "not checked" would keep a happy path green the day the runtime starts
    // reporting missing context — exactly when it should go red.
    const x = execution();
    (x.applicability as unknown as { missingRequiredContext: string[] }).missingRequiredContext = [
      "stage",
    ];
    x.actual.applicability = x.applicability;
    x.bindings.applicability.result = computeBoundDigest(
      "applicability_result",
      x.applicability,
      D,
    );
    const r = run(x);
    expect(r.missingInformationMatch).toBe(false);
    expect(r.status).not.toBe("pass");
  });

  it("treats an empty expected selection as an assertion", () => {
    const x = execution({ fixture: fixture({ expectedSelectedEvidenceIds: [] }) });
    const r = run(x);
    // The run selected ev-1, the fixture expected nothing.
    expect(r.evidenceSelectionMatch).toBe(false);
  });

  it("compares the fixture's declared risk expectation", () => {
    const x = execution({ fixture: fixture({ expectedRiskLevel: "low" }) });
    // No proposals means no effective risk levels, so a stated expectation
    // cannot be satisfied silently.
    const r = run(x);
    expect(r.riskLevelMatch).toBe(false);
    expect(r.expectedRiskLevel).toBe("low");
  });
});
