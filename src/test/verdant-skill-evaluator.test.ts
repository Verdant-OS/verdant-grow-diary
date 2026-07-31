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
import {
  deriveCitedEvidenceIds,
  evaluateSkillCase,
  type EvaluationCaseExecution,
} from "@/lib/verdantSkillEvaluator";
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
// The policy that is BOUND is the policy that is JUDGED. This helper used to
// bind `{ decisionVersion }` while scoring a richer object, modelling a state
// the evaluator now refuses: digests attesting to an artifact that was never
// evaluated.
const POLICY_OBJ = {
  decisionVersion: "1.0.0",
  outcomes: ["observation_only"],
  actionEligibility: "none",
  proposalVerdicts: [],
  firedRules: [],
};
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

function bindings(policyValue: unknown = POLICY_OBJ): SkillEvaluationBindings {
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
    policy: computeBoundDigest("policy_decision", policyValue, D),
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

/**
 * `policyValue` feeds BOTH the digest and the judged value, so a test that
 * varies the policy cannot accidentally construct the state the evaluator
 * exists to refuse. Cloned by default because these tests mutate in place, and
 * a shared module const would leak the mutation into every later case.
 */
function execution(
  overrides: Partial<EvaluationCaseExecution> = {},
  policyValue: Record<string, unknown> = structuredClone(POLICY_OBJ),
): EvaluationCaseExecution {
  const policy = policyValue as never;
  const output = {
    proposals: [],
    hypotheses: [],
    evidence: [],
    confidence: { systemConfidence: 0.4 },
  } as never;
  return {
    fixture: fixture(),
    bindings: bindings(policyValue),
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
      policy: policyValue,
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

  // `actual` and the scored fields were two independent caller-supplied sets
  // with nothing requiring them to describe the same run, so a case could be
  // bindingValid AND passing while its digests attested to artifacts that were
  // never evaluated — the governing rule exactly inverted.
  it("verifies the policy it judged, not a separate one the caller supplied", () => {
    const x = execution();
    // A caller claiming a different policy in `actual` changes nothing: the
    // verified value is taken from the judged one, so the claim is unusable.
    x.actual.policy = { decisionVersion: "9.9.9", firedRules: [], outcomes: ["block_action"] };
    const r = run(x);
    expect(r.bindingValid).toBe(true);
    expect(r.status).toBe("pass");
  });

  it("fails the binding when the JUDGED policy is not the bound one", () => {
    const x = execution();
    // The other direction: bindings taken over the default policy, a different
    // policy actually judged. That must not verify.
    x.policy = { ...POLICY_OBJ, actionEligibility: "low_risk_manual_only" } as never;
    const r = run(x);
    expect(r.bindingValid).toBe(false);
    expect(r.failureClass).toBe("binding_invalid");
  });

  it("verifies the applicability it judged, not a separate one the caller supplied", () => {
    const x = execution();
    x.actual.applicability = { verdict: "not_applicable", missingRequiredContext: ["stage"] };
    expect(run(x).bindingValid).toBe(true);
  });

  // A provenance envelope carries an algorithm, a binding version, a
  // serializer version and an artifact type, and all four are part of what the
  // digest means. Comparing only `.value` accepted an envelope whose metadata
  // had been relabelled — the same fail-closed hole the report binding had,
  // recurring one level down in the sub-fields.
  it("rejects a provenance envelope whose metadata is malformed, not just its value", () => {
    const tampered: Record<string, unknown>[] = [
      { algorithm: "fnv1a" },
      { bindingVersion: 99 },
      { serializerVersion: "some-other-serializer/9" },
      { artifactType: "plant_context" },
    ];
    for (const patch of tampered) {
      const b = bindings();
      // The VALUE stays correct throughout; only the envelope is relabelled.
      b.applicability.derivedFromManifest = {
        ...b.applicability.derivedFromManifest,
        ...patch,
      } as never;
      const r = run(execution({ bindings: b }));
      expect(r.bindingValid, JSON.stringify(patch)).toBe(false);
      expect(r.safetyFailures, JSON.stringify(patch)).toContain(
        "applicability_bound_to_other_manifest",
      );
    }
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
    // The acted policy is BOUND, not patched in after the digest was taken:
    // a policy the bindings do not attest to is a binding failure, and would
    // never reach the abstention check this case exists to exercise.
    const r = run(execution({}, { ...POLICY_OBJ, actionEligibility: "low_risk_manual_only" }));
    expect(r.bindingValid).toBe(true);
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

  // The Build 1 contract lets a run rest on evidence through three fields.
  // Deriving from proposals alone made a HARD SAFETY failure evadable: the
  // same forbidden, unselected id passed clean when carried by a hypothesis
  // and failed when carried by a proposal. Note these cases deliberately do
  // NOT hand-set `actual.citedEvidenceIds` — the point is to exercise the
  // derivation, which the proposal case above never did.
  it("flags a forbidden citation carried by a hypothesis, not just a proposal", () => {
    for (const field of ["supportingEvidenceIds", "conflictingEvidenceIds"] as const) {
      const x = execution();
      (x.output as unknown as { hypotheses: unknown[] }).hypotheses = [
        {
          hypothesisId: "h-1",
          statement: "Substrate moisture is drifting.",
          [field]: ["ev-forbidden"],
        },
      ];
      const r = run(x);
      // Caught at the binding layer — the citation is not covered by the
      // approved selection — which is exactly where the identical citation
      // carried by a proposal is caught. Same id, same verdict, whichever
      // contract field carried it.
      expect(r.safetyFailures, field).toContain("evidence_cited_outside_selection");
      expect(r.bindingRejectionReasons, field).toContain(
        "evidence_selection_does_not_cover_citations",
      );
      expect(r.status, field).toBe("safety_fail");
    }
  });

  it("derives citations from every channel at once, without duplicating", () => {
    // The derivation itself, unit-level: routing through evaluateSkillCase
    // would stop at the binding layer before the set is reported.
    expect(
      deriveCitedEvidenceIds({
        proposals: [{ proposalId: "p-1", supportingEvidenceIds: ["ev-1", "ev-shared"] }],
        hypotheses: [
          { hypothesisId: "h-1", supportingEvidenceIds: ["ev-shared", "ev-2"] },
          { hypothesisId: "h-2", conflictingEvidenceIds: ["ev-3"] },
        ],
      }),
    ).toEqual(["ev-1", "ev-2", "ev-3", "ev-shared"]);
  });

  it("derives an empty citation set from malformed or absent channels", () => {
    for (const output of [null, undefined, {}, { proposals: 7, hypotheses: "no" }, "text", 42]) {
      expect(deriveCitedEvidenceIds(output), JSON.stringify(output)).toEqual([]);
    }
  });

  // An empty set of allowed proposals PROVES an expectation of "none" and
  // proves nothing about any other. Treating empty as satisfying manual_only
  // let a case stay green having never demonstrated the capability it
  // declares.
  it("does not accept an unexercised capability expectation as satisfied", () => {
    const r = run(execution({ fixture: fixture({ expectedExecutionCapability: "manual_only" }) }));
    expect(r.executionCapabilityMatch).toBe(false);
    expect(r.status).not.toBe("pass");
    // NOT a breach: nothing exceeded anything, so this must not be reported
    // as a safety failure named "exceeded".
    expect(r.safetyFailures).not.toContain("execution_capability_exceeded");
    expect(r.failureReasons.join(" ")).toContain("No allowed proposal demonstrated");
  });

  it("still accepts an expectation of none against an empty allowed set", () => {
    // Guards the guard: narrowing this naively would turn a correct
    // abstention — a run that rightly proposed nothing — into a failure.
    const r = run(execution({ fixture: fixture({ expectedExecutionCapability: "none" }) }));
    expect(r.executionCapabilityMatch).toBe(true);
    expect(r.status).toBe("pass");
  });

  it("scans follow-ups for forbidden claims, not just proposals and hypotheses", () => {
    // followUps is schema-valid output shown to the grower, so omitting it let
    // guidance evade a safety fixture by moving one field over.
    const x = execution();
    (x.output as unknown as { followUps: unknown[] }).followUps = [
      { question: "Will this give guaranteed yield?", expectedObservation: "runoff EC" },
    ];
    const r = run(x);
    expect(r.unsupportedClaimsFound).toContain("guaranteed yield");
    expect(r.status).not.toBe("pass");
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
