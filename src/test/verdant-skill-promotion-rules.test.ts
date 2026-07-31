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
  PROMOTION_BLOCKING_REASONS,
  PROMOTION_GATES,
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
    fixturePromotionEligible: true,
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
    digest: D,
  });
}

/**
 * A report whose contents no longer match its own binding.
 *
 * The promotion module recomputes `verifyReportBinding` rather than accepting
 * a caller's boolean, so exercising that path means actually editing the
 * report — which is also the real attack: a report modified after generation.
 */
function tamper(r: SkillEvaluationReport): SkillEvaluationReport {
  return { ...r, sourceRevision: "tampered-after-generation" };
}

const ALL: PromotionAttestation[] = [
  "expert_review",
  "internal_sandbox_soak",
  "rollback_target_recorded",
];

function decide(overrides: Partial<PromotionEligibilityInput> = {}) {
  return evaluateSkillPromotionEligibility({
    targetSkillId: "coco-dryback-review",
    targetSkillVersion: "1.0.0",
    currentState: "internal_sandbox",
    requestedState: "limited_beta",
    report: report(),
    currentManifestDigest: MANIFEST_DIGEST,
    currentPolicyDigest: POLICY_DIGEST,
    currentEvidenceCorpusDigest: CORPUS_DIGEST,
    attestations: ALL,
    rollbackTarget: "coco-dryback-review@0.9.0",
    sourceRevision: "abc1234",
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

describe("promotion — currency must come from outside the artifact", () => {
  // The only caller filled these from `report.manifestBinding?.value` — the
  // artifact being judged — reducing all three checks to `x === x`. Three
  // blocking reasons became structurally unreachable and `current_bindings`
  // was satisfied by construction. A gate that cannot fail is not a gate.
  it("treats an unsupplied current digest as a failed comparison, not a passed one", () => {
    const d = decide({
      currentManifestDigest: null,
      currentPolicyDigest: null,
      currentEvidenceCorpusDigest: null,
    });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("manifest_binding_stale");
    expect(d.blockingReasons).toContain("policy_binding_stale");
    expect(d.blockingReasons).toContain("evidence_registry_binding_stale");
    expect(d.unsatisfiedGates).toContain("current_bindings");
  });

  it("blocks when an independently supplied digest disagrees with the report", () => {
    const d = decide({ currentManifestDigest: "0".repeat(64) });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("manifest_binding_stale");
  });
});

describe("promotion — a report that judged nothing", () => {
  // These guards were real but unpinned — nothing asserted they fire, which is
  // the same "gate exists only on paper" shape as the identity codes.
  it("refuses a zero-case report", () => {
    const d = decide({ report: report([]) });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("fixture_set_incomplete");
    expect(d.authorizedManifestLifecycle).toBeNull();
  });

  it("does not call a zero-case report a pass", () => {
    const empty = report([]);
    expect(empty.overallStatus).toBe("blocked");
    expect(empty.promotionEligible).toBe(false);
  });

  it("honours a fixture its own author marked unpromotable", () => {
    const r = report([caseResult({ fixturePromotionEligible: false })]);
    expect(r.overallStatus).toBe("pass");
    expect(r.promotionEligible).toBe(false);
  });
});

describe("promotion — a report that declines to be promoted", () => {
  // Propagating the fixture flag into report.promotionEligible was only half
  // the fix: the decision path read overallStatus and the gates and never the
  // flag, so a report already saying "not promotable" still came back
  // eligible once bindings and attestations were supplied. A conclusion an
  // artifact states about ITSELF has to be read by the thing deciding.
  it("blocks when the report itself says it is not promotable", () => {
    const d = decide({ report: report([caseResult({ fixturePromotionEligible: false })]) });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("report_marked_not_promotable");
    expect(d.authorizedManifestLifecycle).toBeNull();
  });

  it("does not block a withdrawal on it", () => {
    // Removing exposure is never gated on the evidence being promotable.
    const d = decide({
      requestedState: "paused",
      report: report([caseResult({ fixturePromotionEligible: false })]),
    });
    expect(d.blockingReasons).not.toContain("report_marked_not_promotable");
  });
});

describe("promotion — the decision must name its subject", () => {
  // A decision that does not name its target can be satisfied by ANY green
  // report. Supply skill B's report alongside B's digests and attestations,
  // ask for a transition on skill A, and every other gate passes — because
  // every other gate reads the report, not the request.
  it("refuses a report belonging to a different skill", () => {
    const d = decide({ targetSkillId: "some-other-skill" });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("report_for_other_skill");
    expect(d.authorizedManifestLifecycle).toBeNull();
  });

  it("refuses a report belonging to a different version of the same skill", () => {
    const d = decide({ targetSkillVersion: "2.0.0" });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("report_for_other_skill_version");
    expect(d.authorizedManifestLifecycle).toBeNull();
  });

  it("checks identity on withdrawal too", () => {
    // Withdrawal waives the evidence gates, not the identity one: pausing the
    // wrong skill on the strength of another skill's report is its own
    // failure, not a safe default.
    const d = decide({
      requestedState: "paused",
      targetSkillId: "some-other-skill",
      attestations: [],
      report: report([caseResult({ status: "fail", failureClass: "expectation_mismatch" })]),
    });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("report_for_other_skill");
  });

  it("emits every identity code it declares", () => {
    // These two codes were declared in the vocabulary before anything emitted
    // them — a blocking reason that can never fire is a gate that does not
    // exist. This test fails if either becomes unreachable again.
    expect(PROMOTION_BLOCKING_REASONS).toContain("report_for_other_skill");
    expect(PROMOTION_BLOCKING_REASONS).toContain("report_for_other_skill_version");
    expect(decide({ targetSkillId: "x" }).blockingReasons).toContain("report_for_other_skill");
    expect(decide({ targetSkillVersion: "9.9.9" }).blockingReasons).toContain(
      "report_for_other_skill_version",
    );
  });
});

describe("promotion — a transition has two ends", () => {
  // Gates were selected from the requested state alone, so any edge landing
  // on limited_beta was authorized by the same evidence — including one
  // starting from `paused`, the state a skill lands in precisely because
  // something went wrong. Every gate reads the report; none read where the
  // skill is coming from.
  it("refuses to reactivate a withdrawn skill straight into grower exposure", () => {
    for (const from of ["paused", "deprecated", "withdrawn", "superseded"] as const) {
      const d = decide({ currentState: from, requestedState: "limited_beta" });
      expect(d.eligible, from).toBe(false);
      expect(d.blockingReasons, from).toContain("transition_not_permitted");
      expect(d.authorizedManifestLifecycle, from).toBeNull();
    }
  });

  it("refuses a regression that keeps the skill exposed", () => {
    // The way DOWN the ladder is through a withdrawal state, not sideways
    // into a lower exposure tier while still shipping.
    const d = decide({ currentState: "verified", requestedState: "limited_beta" });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("transition_not_permitted");
  });

  it("refuses a no-op transition", () => {
    const d = decide({ currentState: "limited_beta", requestedState: "limited_beta" });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("transition_not_permitted");
  });

  it("still allows an advance that skips rungs, because gates are cumulative", () => {
    // Guards the guard: an edge check that rejected everything would satisfy
    // the three tests above while breaking the CLI, which asks
    // draft → limited_beta.
    const d = decide({ currentState: "draft", requestedState: "limited_beta" });
    expect(d.blockingReasons).not.toContain("transition_not_permitted");
    expect(d.eligible).toBe(true);
  });

  it("still allows withdrawal from anywhere, including from another withdrawal state", () => {
    // Removing exposure never needs an edge check: requiring one to pause a
    // misbehaving skill would be exactly backwards.
    for (const from of ["draft", "verified", "limited_beta", "withdrawn"] as const) {
      for (const to of ["paused", "deprecated", "withdrawn", "superseded"] as const) {
        const d = decide({ currentState: from, requestedState: to });
        expect(d.blockingReasons, `${from} → ${to}`).not.toContain("transition_not_permitted");
      }
    }
  });
});

describe("promotion — a target is judged by its own gate table", () => {
  // The evidence-only rungs record PARTIAL guarantees. Blocking schema_valid
  // on a behavioural expectation miss denied a true statement about outputs
  // that really were schema-compliant. These rungs authorize no manifest
  // lifecycle, which is why they can be honest about what they do not cover.
  it("allows an evidence-only rung whose own gate is satisfied", () => {
    const d = decide({
      currentState: "draft",
      requestedState: "schema_valid",
      report: report([caseResult({ status: "fail", failureClass: "expectation_mismatch" })]),
      attestations: [],
      rollbackTarget: null,
    });
    // ELIGIBLE, not merely "missing one particular blocker". The earlier form
    // of this test asserted the absence of `evaluation_not_passing` and never
    // checked the outcome, so it stayed green while a different unconditional
    // block kept the rung refused under another name.
    expect(d.blockingReasons).toEqual([]);
    expect(d.eligible).toBe(true);
    // Eligible and yet authorizing nothing: an evidence rung records a
    // partial guarantee, it does not ship anything.
    expect(d.authorizedManifestLifecycle).toBeNull();
  });

  it("still blocks a grower-facing rung on the same failing report", () => {
    // Guards the guard: the cumulative gate tables above must not loosen.
    const d = decide({
      report: report([caseResult({ status: "fail", failureClass: "expectation_mismatch" })]),
    });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("evaluation_not_passing");
  });

  it("still blocks static_safety_passed on a hard safety failure", () => {
    const d = decide({
      currentState: "draft",
      requestedState: "static_safety_passed",
      report: report([
        caseResult({
          status: "safety_fail",
          failureClass: "safety_policy_failure",
          safetyFailures: ["evidence_cited_outside_selection"],
          safetyCritical: true,
        }),
      ]),
      attestations: [],
      rollbackTarget: null,
    });
    expect(d.blockingReasons).toContain("hard_safety_failure");
  });
});

describe("promotion — an evidence rung may record what a release may not", () => {
  it("records schema validity for a report marked unpromotable", () => {
    const d = decide({
      currentState: "draft",
      requestedState: "schema_valid",
      report: report([caseResult({ fixturePromotionEligible: false })]),
      attestations: [],
      rollbackTarget: null,
    });
    expect(d.blockingReasons).not.toContain("report_marked_not_promotable");
    expect(d.eligible).toBe(true);
  });

  it("still refuses a release-bearing target for the same report", () => {
    const d = decide({ report: report([caseResult({ fixturePromotionEligible: false })]) });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("report_marked_not_promotable");
  });
});

describe("promotion — trustworthiness applies always, sufficiency by target", () => {
  // The rule this block follows: "is this report trustworthy at all" applies
  // to every target; "is this evidence enough for THIS transition" is gated by
  // the target's own gate table.
  it("does not demand current bindings from a rung that does not require them", () => {
    const d = decide({
      currentState: "draft",
      requestedState: "schema_valid",
      currentManifestDigest: null,
      currentPolicyDigest: null,
      currentEvidenceCorpusDigest: null,
      attestations: [],
      rollbackTarget: null,
    });
    expect(d.blockingReasons).not.toContain("manifest_binding_stale");
    expect(d.eligible).toBe(true);
  });

  it("still demands them for a release-bearing target", () => {
    const d = decide({
      currentManifestDigest: null,
      currentPolicyDigest: null,
      currentEvidenceCorpusDigest: null,
    });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("manifest_binding_stale");
  });

  it("refuses a binding-blocked report at every target, not just release ones", () => {
    // A correction to how I first applied the rule: "blocked" is a
    // TRUSTWORTHINESS verdict — the report cannot say what it measured —
    // so gating it behind green_evaluation let an evidence-only rung accept a
    // report whose schema-compliance rate was 1 while its bindings never
    // verified.
    const blockedReport = report([
      caseResult({ bindingValid: false, failureClass: "binding_invalid", status: "fail" }),
    ]);
    expect(blockedReport.overallStatus).toBe("blocked");
    const d = decide({
      currentState: "draft",
      requestedState: "schema_valid",
      report: blockedReport,
      attestations: [],
      rollbackTarget: null,
    });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("evaluation_not_passing");
  });

  it("applies trustworthiness checks even to an evidence-only rung", () => {
    // A report we cannot read supports no claim, however modest. The binding
    // is BROKEN here rather than asserted broken — the module recomputes it,
    // so a flag would prove nothing.
    const d = decide({
      currentState: "draft",
      requestedState: "schema_valid",
      report: tamper(report()),
      attestations: [],
      rollbackTarget: null,
    });
    expect(d.eligible).toBe(false);
    expect(d.blockingReasons).toContain("report_binding_invalid");
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
    const d = decide({ report: tamper(report()) });
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
    // Against the DECLARED order, not a spread copy of the same array — that
    // earlier form was a tautology for a plain array property and held no
    // matter what the implementation did.
    const d = decide({ attestations: [], rollbackTarget: null });
    expect(d.blockingReasons).toEqual(
      PROMOTION_BLOCKING_REASONS.filter((r) => d.blockingReasons.includes(r)),
    );
    expect(d.unsatisfiedGates).toEqual(
      PROMOTION_GATES.filter((g) => d.unsatisfiedGates.includes(g)),
    );
    // And non-empty, so the assertions above are exercised at all.
    expect(d.blockingReasons.length).toBeGreaterThan(0);
    expect(d.unsatisfiedGates.length).toBeGreaterThan(0);
  });
});
