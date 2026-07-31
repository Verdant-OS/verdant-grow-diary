/**
 * verdantSkillEvaluationTypes — vocabularies and result shapes for the
 * Verdant Skill Evaluation Harness.
 *
 * Build 7 of Verdant Skill Runtime v1. Types and frozen vocabularies only:
 * no logic, no I/O, no schemas.
 *
 * TWO AXES, KEPT APART.
 *   Manifest lifecycle    = what a registered skill DECLARES itself to be.
 *   Evaluation progression = what evidence the harness has VERIFIED.
 *
 * These are different facts about different objects and they do not share a
 * vocabulary. Build 4's `SKILL_LIFECYCLE_STATES` is a field inside a strict,
 * version-pinned manifest schema; widening it to carry `golden_cases_passed`
 * would be a breaking contract change AND a category error, because a golden
 * case passing is a property of a REPORT, not of a manifest. The harness
 * produces evidence and an eligibility decision; an explicit, separate
 * promotion operation remains the only thing that may change registry state.
 * Evaluation progression must never be silently written back onto a manifest.
 *
 * NAMING. `pass|warning|fail` and `error|warning|info` already mean these
 * things in `aiDoctorOutputEvaluation`, so those words are reused. The CODE
 * union is new and skill-shaped: that module's codes are bound to
 * `Phase1DiagnosisResult`, which an evaluation of a `SkillRunResult` cannot
 * speak.
 */

import type { SkillPolicyOutcome } from "@/lib/verdantSkillPolicyGovernor";
import type { SkillEvaluationBindings } from "@/lib/verdantSkillEvaluationBindings";
import type { SkillRiskLevel } from "@/lib/verdantSkillSchemas";

/** Bumped when the evaluator's judgement behaviour changes. */
export const SKILL_EVALUATOR_VERSION = "1.0.0" as const;
/** Bumped when the case-result or report shape changes. */
export const SKILL_EVALUATION_REPORT_VERSION = "1.0.0" as const;
/** Bumped when scoring rules change without the shape changing. */
export const SKILL_SCORING_POLICY_VERSION = "1.0.0" as const;

/**
 * Evaluator versions whose reports may justify a promotion.
 *
 * Deliberately separate from the binding layer's read-compatibility list: a
 * report can be readable without being trustworthy enough to advance a skill.
 * Narrowing this is how an evaluator defect is quarantined without having to
 * invalidate every stored artifact.
 */
export const SUPPORTED_EVALUATOR_VERSIONS_FOR_PROMOTION: readonly string[] = Object.freeze([
  SKILL_EVALUATOR_VERSION,
]);

// ---------------------------------------------------------------------------
// Evaluation progression — the harness's own axis
// ---------------------------------------------------------------------------

/**
 * What the harness has verified, declared weakest-first. This is evidence,
 * not status: a skill does not "become" golden_cases_passed, a REPORT
 * demonstrates it.
 */
export const EVALUATION_PROGRESSION_STATES = [
  "draft",
  "schema_valid",
  "static_safety_passed",
  "golden_cases_passed",
  "expert_reviewed",
  "internal_sandbox",
  "limited_beta",
  "monitored_release",
  "verified",
  "paused",
  "deprecated",
  "withdrawn",
  "superseded",
] as const;
export type EvaluationProgressionState = (typeof EVALUATION_PROGRESSION_STATES)[number];

/**
 * The manifest lifecycle state a progression state may justify.
 *
 * Deliberately partial: the gate states have NO manifest counterpart, because
 * "the golden cases passed" is not something a manifest can declare about
 * itself. `null` means the progression state authorizes no manifest
 * transition at all — the correct answer for evidence that is not yet a
 * release decision.
 */
export const PROGRESSION_TO_MANIFEST_LIFECYCLE: Readonly<
  Record<EvaluationProgressionState, string | null>
> = Object.freeze({
  draft: "draft",
  schema_valid: null,
  static_safety_passed: null,
  golden_cases_passed: null,
  expert_reviewed: null,
  internal_sandbox: "internal_sandbox",
  limited_beta: "limited_beta",
  monitored_release: null,
  verified: "verified",
  paused: "paused",
  deprecated: "deprecated",
  withdrawn: null,
  superseded: "superseded",
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * What a fixture is FOR. `harness_self_test` is structurally incapable of
 * promotion — it exercises the harness, and a harness that could promote
 * itself would be marking its own homework.
 */
export const EVALUATION_FIXTURE_KINDS = [
  "golden_case",
  "regression_case",
  "adversarial_case",
  "harness_self_test",
] as const;
export type EvaluationFixtureKind = (typeof EVALUATION_FIXTURE_KINDS)[number];

/**
 * Whether the skill was expected to decline to act.
 *
 * `not_applicable` is a first-class value, not an absence: a case where
 * abstention is meaningless must not enter the abstention denominator, or the
 * rate quietly flatters itself.
 */
export const EVALUATION_ABSTENTION_EXPECTATIONS = [
  "must_abstain",
  "must_act",
  "not_applicable",
] as const;
export type EvaluationAbstentionExpectation = (typeof EVALUATION_ABSTENTION_EXPECTATIONS)[number];

/**
 * Confidence expectation band. Deliberately NOT called calibration: matching
 * a fixture-authored band says the runtime did what a reviewer predicted on
 * synthetic input. Calibration means agreement with real-world outcome
 * frequencies, which Build 7 does not measure and must not claim.
 */
export interface EvaluationConfidenceExpectation {
  min: number | null;
  max: number | null;
}

// ---------------------------------------------------------------------------
// Case results
// ---------------------------------------------------------------------------

/** Why a case failed. `none` is explicit so a pass still states its class. */
export const EVALUATION_FAILURE_CLASSES = [
  "none",
  "fixture_invalid",
  "binding_invalid",
  "output_schema_invalid",
  "expectation_mismatch",
  "determinism_failure",
  "safety_policy_failure",
  "evaluator_error",
] as const;
export type EvaluationFailureClass = (typeof EVALUATION_FAILURE_CLASSES)[number];

/**
 * Hard safety failures — categorically different from an ordinary mismatch.
 * A wrong summary is a quality problem; an equipment instruction is a safety
 * one. Both block promotion; only these produce the safety exit code.
 *
 * NAMING. The first code says `control`, not the more obvious noun for an
 * instruction sent to equipment. The repository's infrastructure scanner bans
 * that noun's snake_case form anywhere outside tests, so a safety vocabulary
 * spelled the obvious way would trip the safety scanner — including from the
 * comment explaining why. `device_control_*` is the precedented family and
 * matches the governor's own rule codes.
 */
export const EVALUATION_SAFETY_FAILURES = [
  "device_control_emitted",
  "execution_capability_exceeded",
  "permission_elevation",
  "unhealthy_telemetry_supported_conclusion",
  "expected_abstention_but_acted",
  "high_impact_action_on_insufficient_context",
  "evidence_cited_outside_selection",
  "confidence_from_uncited_evidence",
  "applicability_bound_to_other_manifest",
  "policy_bound_to_other_version",
  "output_contract_invalid_in_safety_case",
  "determinism_failure_in_required_case",
  "secret_like_value_present",
] as const;
export type EvaluationSafetyFailure = (typeof EVALUATION_SAFETY_FAILURES)[number];

export const EVALUATION_CASE_STATUSES = ["pass", "fail", "safety_fail"] as const;
export type EvaluationCaseStatus = (typeof EVALUATION_CASE_STATUSES)[number];

export interface SkillEvaluationCaseResult {
  reportContractVersion: string;
  fixtureId: string;
  fixtureVersion: string;
  fixtureKind: EvaluationFixtureKind;
  /**
   * What the fixture's OWN author said about promotability.
   *
   * Carried onto the result because the report has to honour it and never saw
   * it otherwise: a suite explicitly marked unsuitable for promotion could
   * still mark the whole report eligible on the strength of a green status.
   */
  fixturePromotionEligible: boolean;
  skillId: string;
  skillVersion: string;
  bindings: SkillEvaluationBindings;
  bindingValid: boolean;
  bindingRejectionReasons: string[];
  /** From the injected clock. The evaluator never reads a real one. */
  evaluatedAt: string;
  /** Null unless deterministically measured; never a wall-clock guess. */
  durationMs: number | null;
  status: EvaluationCaseStatus;
  failureClass: EvaluationFailureClass;
  safetyCritical: boolean;
  safetyFailures: EvaluationSafetyFailure[];
  schemaCompliant: boolean;
  expectedApplicability: string | null;
  actualApplicability: string | null;
  applicabilityMatch: boolean;
  abstentionExpectation: EvaluationAbstentionExpectation;
  abstentionActual: boolean;
  /** Null when the fixture declares abstention not_applicable. */
  abstentionMatch: boolean | null;
  expectedMissingInformation: string[];
  detectedMissingInformation: string[];
  missingInformationMatch: boolean;
  expectedEvidenceIds: string[];
  actualCitedEvidenceIds: string[];
  evidenceReferenceIntegrity: boolean;
  unsupportedClaimsFound: string[];
  expectedPolicyOutcome: SkillPolicyOutcome | null;
  actualPolicyOutcomes: SkillPolicyOutcome[];
  policyMatch: boolean;
  expectedRiskLevel: SkillRiskLevel | null;
  actualRiskLevels: SkillRiskLevel[];
  expectedActionEligibility: string | null;
  actualActionEligibility: string | null;
  actionEligibilityMatch: boolean;
  expectedExecutionCapability: string | null;
  actualExecutionCapabilities: string[];
  executionCapabilityMatch: boolean;
  /** Exact match against the fixture's declared risk expectation. */
  riskLevelMatch: boolean;
  /** What retrieval SELECTED — a different claim from what was cited. */
  expectedSelectedEvidenceIds: string[];
  actualSelectedEvidenceIds: string[];
  evidenceSelectionMatch: boolean;
  deviceCommandFindings: string[];
  confidenceExpectation: EvaluationConfidenceExpectation | null;
  actualConfidence: number | null;
  /** Null when the fixture states no band. */
  confidenceExpectationMatch: boolean | null;
  determinismRepetitions: number;
  /** Null when only one repetition ran — one sample proves nothing. */
  determinismMatch: boolean | null;
  warnings: string[];
  errors: string[];
  failureReasons: string[];
}
