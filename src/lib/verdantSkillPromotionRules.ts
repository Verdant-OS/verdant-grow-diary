/**
 * verdantSkillPromotionRules — decides ELIGIBILITY, never state.
 *
 * Build 7 of Verdant Skill Runtime v1. Pure: no I/O, no clock, no writes, no
 * registry access. This module answers "may this skill advance?" and emits a
 * decision. It cannot advance anything, and that separation is the point.
 *
 * WHY EVIDENCE AND STATE STAY APART. The harness produces evidence; an
 * explicit, separate promotion operation changes registry state. If
 * evaluation could rewrite a manifest's lifecycle, a green run would silently
 * ship a skill — and the review trail would show a status with no decision
 * behind it. So the flow is:
 *
 *     evaluation state → eligibility decision → allowed manifest transition
 *
 * and never:
 *
 *     evaluation state → silently rewritten manifest lifecycle
 *
 * NO FABRICATED ATTESTATIONS. Expert review and sandbox soak are human acts.
 * This module can only observe whether someone recorded them; it never
 * infers, defaults, or creates one. An absent attestation blocks.
 */

import {
  computeBoundDigest,
  type BoundDigest,
  type DigestFn,
} from "@/lib/verdantSkillEvaluationBindings";
import {
  EVALUATION_PROGRESSION_STATES,
  PROGRESSION_TO_MANIFEST_LIFECYCLE,
  SUPPORTED_EVALUATOR_VERSIONS_FOR_PROMOTION,
  type EvaluationProgressionState,
} from "@/lib/verdantSkillEvaluationTypes";
import type { SkillEvaluationReport } from "@/lib/verdantSkillEvaluationReport";

/** Human acts the harness can observe but never perform. */
export const PROMOTION_ATTESTATIONS = [
  "expert_review",
  "internal_sandbox_soak",
  "rollback_target_recorded",
] as const;
export type PromotionAttestation = (typeof PROMOTION_ATTESTATIONS)[number];

/** Why an advance is refused. Declared order is emission order. */
export const PROMOTION_BLOCKING_REASONS = [
  "self_test_target_is_never_promotable",
  "evaluation_not_passing",
  "hard_safety_failure",
  "report_binding_invalid",
  "report_for_other_skill",
  "report_for_other_skill_version",
  "manifest_binding_stale",
  "policy_binding_stale",
  "evidence_registry_binding_stale",
  "unsupported_evaluator_version",
  "fixture_set_incomplete",
  "required_golden_cases_absent",
  "missing_attestation",
  "rollback_target_missing",
  "artifact_disclosure_scan_failed",
  "unknown_target_state",
  "transition_not_permitted",
] as const;
export type PromotionBlockingReason = (typeof PROMOTION_BLOCKING_REASONS)[number];

/** Gates a target state requires. Named so a decision can list them. */
export const PROMOTION_GATES = [
  "schema_valid",
  "static_safety_passed",
  "golden_cases_passed",
  "green_evaluation",
  "no_hard_safety_failures",
  "current_bindings",
  "expert_review_attested",
  "internal_sandbox_attested",
  "rollback_target",
] as const;
export type PromotionGate = (typeof PROMOTION_GATES)[number];

/**
 * What each target state demands. States that ship to a grower demand the
 * human gates; the evidence-only states below them do not, because they are
 * assertions about a report rather than about exposure.
 */
const GATES_BY_TARGET: Readonly<Record<string, readonly PromotionGate[]>> = Object.freeze({
  schema_valid: Object.freeze(["schema_valid"] as const),
  static_safety_passed: Object.freeze(["schema_valid", "static_safety_passed"] as const),
  golden_cases_passed: Object.freeze([
    "schema_valid",
    "static_safety_passed",
    "golden_cases_passed",
    "green_evaluation",
    "no_hard_safety_failures",
    "current_bindings",
  ] as const),
  expert_reviewed: Object.freeze([
    "schema_valid",
    "static_safety_passed",
    "golden_cases_passed",
    "green_evaluation",
    "no_hard_safety_failures",
    "current_bindings",
    "expert_review_attested",
  ] as const),
  internal_sandbox: Object.freeze([
    "schema_valid",
    "static_safety_passed",
    "golden_cases_passed",
    "green_evaluation",
    "no_hard_safety_failures",
    "current_bindings",
    "expert_review_attested",
  ] as const),
  // The first state a real grower can be exposed to. Everything is required.
  limited_beta: Object.freeze([
    "schema_valid",
    "static_safety_passed",
    "golden_cases_passed",
    "green_evaluation",
    "no_hard_safety_failures",
    "current_bindings",
    "expert_review_attested",
    "internal_sandbox_attested",
    "rollback_target",
  ] as const),
  monitored_release: Object.freeze([
    "schema_valid",
    "static_safety_passed",
    "golden_cases_passed",
    "green_evaluation",
    "no_hard_safety_failures",
    "current_bindings",
    "expert_review_attested",
    "internal_sandbox_attested",
    "rollback_target",
  ] as const),
  verified: Object.freeze([
    "schema_valid",
    "static_safety_passed",
    "golden_cases_passed",
    "green_evaluation",
    "no_hard_safety_failures",
    "current_bindings",
    "expert_review_attested",
    "internal_sandbox_attested",
    "rollback_target",
  ] as const),
});

/** States reachable without evidence, because they REMOVE exposure. */
const WITHDRAWAL_STATES: readonly string[] = Object.freeze([
  "paused",
  "deprecated",
  "withdrawn",
  "superseded",
]);

/**
 * The advancement ladder, in order. A state's position is its rung.
 *
 * The withdrawal states deliberately have NO rung. They are not a position on
 * the ladder, they are a way off it — so nothing climbs back out of one
 * through this decision. Re-exposing a paused, deprecated, withdrawn or
 * superseded skill is a reactivation, which this build does not model and
 * therefore must not authorize.
 */
const PROGRESSION_LADDER: readonly string[] = Object.freeze([
  "draft",
  "schema_valid",
  "static_safety_passed",
  "golden_cases_passed",
  "expert_reviewed",
  "internal_sandbox",
  "limited_beta",
  "monitored_release",
  "verified",
]);

/** Rung index, or -1 for a state that is not on the ladder at all. */
function rungOf(state: string): number {
  return PROGRESSION_LADDER.indexOf(state);
}

/**
 * Whether the requested edge is an ADVANCEMENT: both ends on the ladder, and
 * strictly upward.
 *
 * Gate tables are cumulative, so a long advance (draft straight to limited
 * beta) still has to satisfy every gate in between — skipping rungs is safe,
 * because the evidence demanded is the same. What is NOT safe is an edge that
 * starts off the ladder, or one that moves down it while exposure continues:
 * the way down is through a withdrawal state.
 */
function isAdvancement(currentState: string, requestedState: string): boolean {
  const from = rungOf(currentState);
  const to = rungOf(requestedState);
  return from >= 0 && to >= 0 && to > from;
}

export interface PromotionEligibilityInput {
  /**
   * The skill being advanced. Required, because a decision that does not
   * name its target can be satisfied by any green report — including one for
   * a different skill, supplied alongside that skill's current digests and
   * attestations, which would then authorize a transition for the wrong one.
   */
  targetSkillId: string;
  targetSkillVersion: string;
  currentState: EvaluationProgressionState;
  requestedState: EvaluationProgressionState;
  report: SkillEvaluationReport;
  /** The bindings in force RIGHT NOW, not those the report was built from. */
  currentManifestDigest: string;
  currentPolicyDigest: string;
  currentEvidenceCorpusDigest: string;
  /** Recorded human acts. Absent means absent; never inferred. */
  attestations: readonly PromotionAttestation[];
  rollbackTarget: string | null;
  sourceRevision: string | null;
  /** Fixture ids the target state requires. Empty means none required. */
  requiredGoldenCaseIds?: readonly string[];
  reportBindingValid: boolean;
  artifactDisclosureCategories?: readonly string[];
  generatedAt: string;
  digest: DigestFn;
}

export interface PromotionDecision {
  decisionVersion: string;
  eligible: boolean;
  currentState: EvaluationProgressionState;
  requestedState: EvaluationProgressionState;
  /** The manifest lifecycle this WOULD authorize. Null when none. */
  authorizedManifestLifecycle: string | null;
  satisfiedGates: PromotionGate[];
  unsatisfiedGates: PromotionGate[];
  blockingReasons: PromotionBlockingReason[];
  requiredAttestations: PromotionAttestation[];
  missingAttestations: PromotionAttestation[];
  evaluationReportBinding: BoundDigest | null;
  rollbackTarget: string | null;
  sourceRevision: string | null;
  generatedAt: string;
  decisionDigest: string;
}

export const PROMOTION_DECISION_VERSION = "1.0.0" as const;

function compareTokens(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const ATTESTATION_FOR_GATE: Readonly<Partial<Record<PromotionGate, PromotionAttestation>>> =
  Object.freeze({
    expert_review_attested: "expert_review",
    internal_sandbox_attested: "internal_sandbox_soak",
    rollback_target: "rollback_target_recorded",
  });

/**
 * Decide whether a skill may advance.
 *
 * Collects every blocking reason rather than returning the first: an operator
 * clearing one gate needs to see the rest, and a partial answer invites the
 * assumption that the remainder is satisfied.
 */
export function evaluateSkillPromotionEligibility(
  input: PromotionEligibilityInput,
): PromotionDecision {
  const blocking = new Set<PromotionBlockingReason>();
  const satisfied = new Set<PromotionGate>();
  const report = input.report;

  const block = (reason: PromotionBlockingReason): void => {
    blocking.add(reason);
  };

  const targetKnown = (EVALUATION_PROGRESSION_STATES as readonly string[]).includes(
    input.requestedState,
  );
  if (!targetKnown) block("unknown_target_state");

  // Withdrawal always permitted: removing exposure needs no evidence, and
  // requiring a green report to pause a misbehaving skill would be perverse.
  const isWithdrawal = WITHDRAWAL_STATES.includes(input.requestedState);
  const requiredGates: readonly PromotionGate[] = isWithdrawal
    ? []
    : (GATES_BY_TARGET[input.requestedState] ?? []);

  // BOTH ends of the edge, not just the destination. Selecting gates from
  // the requested state alone means a skill sitting in `paused` — the state a
  // skill lands in precisely because something went wrong — can be advanced
  // straight back to grower exposure on a report that predates whatever
  // caused the pause, because every gate consulted reads the report and none
  // reads where the skill is coming from.
  if (!isWithdrawal && targetKnown) {
    // A forward state with no gate table is not "free" — it is unmodelled.
    if (requiredGates.length === 0 || !isAdvancement(input.currentState, input.requestedState)) {
      block("transition_not_permitted");
    }
  }

  // Identity is checked for EVERY transition, including withdrawal: pausing
  // the wrong skill on the strength of another skill's report is its own
  // failure, not a safe default.
  if (report.skillId !== input.targetSkillId) {
    block("report_for_other_skill");
  }
  if (report.skillVersion !== input.targetSkillVersion) {
    block("report_for_other_skill_version");
  }

  if (!isWithdrawal) {
    // A harness self-test proves the harness works. It is never evidence
    // about a skill, so it can never carry one forward.
    const selfTestPresent = report.caseResults.some((c) => c.fixtureKind === "harness_self_test");
    if (selfTestPresent || report.skillId === "harness-self-test") {
      block("self_test_target_is_never_promotable");
    }

    if (report.overallStatus !== "pass") block("evaluation_not_passing");
    if (report.hardSafetyStatus !== "clean") block("hard_safety_failure");
    if (!input.reportBindingValid) block("report_binding_invalid");
    if ((input.artifactDisclosureCategories ?? []).length > 0) {
      block("artifact_disclosure_scan_failed");
    }
    if (!SUPPORTED_EVALUATOR_VERSIONS_FOR_PROMOTION.includes(report.evaluatorVersion)) {
      block("unsupported_evaluator_version");
    }
    if (report.fixtureSetBinding.fixtureCount === 0) block("fixture_set_incomplete");

    const presentFixtureIds = new Set(report.caseResults.map((c) => c.fixtureId));
    for (const required of input.requiredGoldenCaseIds ?? []) {
      if (!presentFixtureIds.has(required)) block("required_golden_cases_absent");
    }

    // The bindings must be CURRENT, not merely internally consistent. A
    // report can be perfectly self-consistent and describe a manifest that
    // has since been edited.
    if (report.manifestBinding?.value !== input.currentManifestDigest) {
      block("manifest_binding_stale");
    }
    if (report.policyBinding?.value !== input.currentPolicyDigest) {
      block("policy_binding_stale");
    }
    if (report.evidenceRegistryBinding.corpus?.value !== input.currentEvidenceCorpusDigest) {
      block("evidence_registry_binding_stale");
    }
  }

  // Gate satisfaction.
  const held = new Set(input.attestations);
  const requiredAttestations: PromotionAttestation[] = [];
  const missingAttestations: PromotionAttestation[] = [];

  for (const gate of requiredGates) {
    const attestation = ATTESTATION_FOR_GATE[gate];
    if (attestation !== undefined) {
      requiredAttestations.push(attestation);
      if (!held.has(attestation)) {
        missingAttestations.push(attestation);
        block("missing_attestation");
        continue;
      }
    }
    switch (gate) {
      case "schema_valid":
        if (
          report.metrics.schemaComplianceRate.status === "measured" &&
          report.metrics.schemaComplianceRate.value === 1
        )
          satisfied.add(gate);
        break;
      case "static_safety_passed":
        if (report.hardSafetyStatus === "clean") satisfied.add(gate);
        break;
      case "golden_cases_passed":
        if (report.overallStatus === "pass" && report.metrics.totalCases > 0) satisfied.add(gate);
        break;
      case "green_evaluation":
        if (report.overallStatus === "pass") satisfied.add(gate);
        break;
      case "no_hard_safety_failures":
        if (report.metrics.safetyCriticalFailures === 0) satisfied.add(gate);
        break;
      case "current_bindings":
        if (
          report.manifestBinding?.value === input.currentManifestDigest &&
          report.policyBinding?.value === input.currentPolicyDigest &&
          report.evidenceRegistryBinding.corpus?.value === input.currentEvidenceCorpusDigest
        )
          satisfied.add(gate);
        break;
      case "rollback_target":
        // A release-like state without somewhere to fall back to is a
        // one-way door.
        if (input.rollbackTarget !== null && input.rollbackTarget !== "") satisfied.add(gate);
        else block("rollback_target_missing");
        break;
      default:
        satisfied.add(gate);
    }
  }

  const unsatisfiedGates = requiredGates.filter((g) => !satisfied.has(g));
  const eligible = blocking.size === 0 && unsatisfiedGates.length === 0;

  const decision: PromotionDecision = {
    decisionVersion: PROMOTION_DECISION_VERSION,
    eligible,
    currentState: input.currentState,
    requestedState: input.requestedState,
    // Stated, never applied. Something else must perform the transition.
    authorizedManifestLifecycle: eligible
      ? (PROGRESSION_TO_MANIFEST_LIFECYCLE[input.requestedState] ?? null)
      : null,
    satisfiedGates: PROMOTION_GATES.filter((g) => satisfied.has(g)),
    unsatisfiedGates: PROMOTION_GATES.filter((g) => unsatisfiedGates.includes(g)),
    blockingReasons: PROMOTION_BLOCKING_REASONS.filter((r) => blocking.has(r)),
    requiredAttestations: PROMOTION_ATTESTATIONS.filter((a) => requiredAttestations.includes(a)),
    missingAttestations: PROMOTION_ATTESTATIONS.filter((a) => missingAttestations.includes(a)),
    evaluationReportBinding: report.reportBinding ?? null,
    rollbackTarget: input.rollbackTarget,
    sourceRevision: input.sourceRevision,
    generatedAt: input.generatedAt,
    decisionDigest: "",
  };

  decision.decisionDigest = computeBoundDigest(
    "evaluation_report",
    { ...decision, decisionDigest: "" },
    input.digest,
  ).value;
  return decision;
}

/** Human-readable twin. Same facts, no extra claims. */
export function renderPromotionMarkdown(decision: PromotionDecision): string {
  const lines: string[] = [];
  lines.push(`# Promotion decision — ${decision.currentState} → ${decision.requestedState}`);
  lines.push("");
  lines.push(`- Eligible: **${decision.eligible ? "YES" : "NO"}**`);
  lines.push(
    `- Authorized manifest lifecycle: ${decision.authorizedManifestLifecycle ?? "— (no transition authorized)"}`,
  );
  lines.push(`- Rollback target: ${decision.rollbackTarget ?? "—"}`);
  lines.push(`- Source revision: ${decision.sourceRevision ?? "—"}`);
  lines.push(`- Generated: ${decision.generatedAt}`);
  lines.push(`- Decision digest: \`${decision.decisionDigest.slice(0, 16)}…\``);
  lines.push("");
  lines.push(
    "This is an eligibility decision, not a promotion. No registry state was read or written; an explicit promotion operation remains responsible for any transition.",
  );
  lines.push("");

  if (decision.satisfiedGates.length > 0) {
    lines.push("## Satisfied gates");
    lines.push("");
    for (const g of decision.satisfiedGates) lines.push(`- ${g}`);
    lines.push("");
  }
  if (decision.unsatisfiedGates.length > 0) {
    lines.push("## Unsatisfied gates");
    lines.push("");
    for (const g of decision.unsatisfiedGates) lines.push(`- **${g}**`);
    lines.push("");
  }
  if (decision.blockingReasons.length > 0) {
    lines.push("## Blocking reasons");
    lines.push("");
    for (const r of decision.blockingReasons) lines.push(`- **${r}**`);
    lines.push("");
  }
  if (decision.missingAttestations.length > 0) {
    lines.push("## Missing attestations");
    lines.push("");
    lines.push("These are human acts. The harness records them; it never creates them.");
    lines.push("");
    for (const a of decision.missingAttestations) lines.push(`- ${a}`);
    lines.push("");
  }
  return lines.join("\n");
}

export { compareTokens as __compareTokensForTest };
