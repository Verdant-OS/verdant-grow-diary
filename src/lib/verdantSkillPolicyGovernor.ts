/**
 * verdantSkillPolicyGovernor — the deterministic envelope around
 * probabilistic model output.
 *
 * Build 6 of Verdant Skill Runtime v1. Pure: no I/O, no clock, no model call,
 * no network, no writes, and nothing here can execute anything. The governor
 * DECIDES; it never rewrites text, because a governor that could rewrite could
 * launder an unsafe instruction into an acceptable-looking one.
 *
 * WHY THIS IS NOT `aiDoctorOutputEvaluation`. That module answers "is this
 * finished AI Doctor prose acceptable" over `Phase1DiagnosisResult`. It
 * structurally cannot see a `SkillActionProposal[]`, a manifest, or an
 * applicability verdict, which are the inputs this decision turns on. The two
 * coexist and never call each other; the divergence risk that would otherwise
 * create is handled by both scanning through the single detector module
 * `aiOutputTextSafetyDetectors`.
 *
 * BLOCKING VS FLOOR-RAISING — the one design idea worth reading.
 * `aiDoctorOutputEvaluation` forcibly downgrades every prose-derived rule to a
 * warning, on the stated grounds that a regex false positive would hide a
 * correct answer from the grower. That reasoning does not carry here, because
 * blocking is scoped to a single PROPOSAL and the diagnosis, evidence,
 * hypotheses, limitations and conflicts are always shown. So this module
 * deliberately does block on prose — but only for families with no legitimate
 * cultivation use:
 *
 *   BLOCKING       device control, payload shapes, over-promises, medical
 *                  claims, yield claims, dose quantities
 *   FLOOR-RAISING  aggressive nutrient / irrigation / autoflower-stress
 *                  vocabulary — real agronomy, magnitude-blind by
 *                  construction, so it raises the risk floor instead
 *
 * That split is what implements "no aggressive correction FROM WEAK EVIDENCE".
 * "Increase the feed from EC 1.0 to EC 1.2 over two irrigations" is textbook
 * advice; the load-bearing half of the rule is the evidence clause, not the
 * adjective. A raised floor plus a confidence ceiling blocks it precisely when
 * the evidence is thin, and permits it when the evidence is there.
 *
 * THE MODEL CANNOT ELEVATE ITSELF. `riskLevel` is model-supplied, so it is
 * never trusted downward: `effectiveRiskLevel = max(declared, derivedFloor)`.
 * Under-declaring gains nothing because the floor catches it; over-declaring
 * costs the model its own proposal. There is no direction in which lying pays.
 *
 * PERSISTENCE. A decision must be stored alongside its `SkillRunResult`.
 * Without it `proposals: []` is permanently ambiguous between "the model
 * proposed nothing" and "the governor refused everything" — the same ambiguity
 * Build 5 spent `conflictSurvey` and `retrieval_not_permitted` removing one
 * layer up.
 */

import {
  AGGRESSIVE_IRRIGATION_PATTERNS,
  AGGRESSIVE_NUTRIENT_PATTERNS,
  AUTOFLOWER_TIER_A_STRESS_PATTERNS,
  AUTOMATIC_AQ_PATTERNS,
  DOSE_QUANTITY_PATTERNS,
  MEDICAL_CLAIM_PATTERNS,
  OVER_PROMISE_PATTERNS,
  PAYLOAD_SHAPE_PATTERNS,
  SKILL_INTERVENTION_CLASSES,
  YIELD_CLAIM_PATTERNS,
  deriveInterventionClass,
  hasUngovernedCommand,
  scanProseForPatterns,
  type SkillInterventionClass,
} from "@/lib/aiOutputTextSafetyDetectors";
import { DEVICE_CONTROL_DETECTION_PATTERNS } from "@/lib/aiDoctorSafetyRules";
import { SENSOR_TRUTH_CONFIDENCE_FACTORS } from "@/lib/sensorTruthGateRules";
import {
  PLANT_CONTEXT_WINDOWS,
  type PlantContextCompilation,
} from "@/lib/plantContextBundleCompiler";
import {
  resolvePlantIdentity,
  skillMayRun,
  type SkillApplicabilityResult,
} from "@/lib/verdantSkillApplicabilityRules";
import {
  skillManifestGrantsPermission,
  skillManifestKey,
  type VerdantSkillManifest,
} from "@/lib/verdantSkillManifest";
import {
  evidenceSatisfiesPolicy,
  type EvidenceRetrievalResult,
} from "@/lib/verdantEvidenceRetrievalRules";
import {
  SKILL_CONTRACT_VERSION,
  SKILL_RISK_LEVELS,
  parseSkillRunResult,
  serializeSkillContract,
  type SkillActionProposal,
  type SkillConfidenceResult,
  type SkillPlantStage,
  type SkillRiskLevel,
  type SkillRunResult,
  type SkillRunStatus,
} from "@/lib/verdantSkillSchemas";

export const SKILL_POLICY_DECISION_VERSION = "1.0.0" as const;

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

/**
 * The six outcomes, verbatim from the policy specification, declared
 * most-restrictive-first. The order is used ONLY to derive a single-slot
 * `primaryOutcome`; every asserted outcome is returned in `outcomes`.
 */
export const SKILL_POLICY_OUTCOMES = [
  "block_action",
  "urgent_manual_attention",
  "request_more_information",
  "monitor",
  "observation_only",
  "allow_low_risk_manual_action",
] as const;
export type SkillPolicyOutcome = (typeof SKILL_POLICY_OUTCOMES)[number];

/** Every reason the governor can give. Declared order is emission order. */
export const SKILL_POLICY_RULE_CODES = [
  // Contract and manifest conformance — these run first and block everything.
  "contract_violation",
  "confidence_input_mismatch",
  "manifest_run_mismatch",
  "context_version_mismatch",
  "applicability_manifest_mismatch",
  "contract_version_mismatch",
  "proposal_without_grant",
  "capability_exceeds_manifest",
  "risk_exceeds_declared_class",
  "manifest_lifecycle_blocked",
  "evidence_policy_unsatisfied",
  "run_status_not_ok",
  // Blocking prose families.
  "device_control_instruction",
  "device_control_payload_shape",
  "automatic_execution_language",
  "over_promise_language",
  "unsupported_medical_claim",
  "unsupported_yield_claim",
  "dose_quantity_without_provenance",
  // Context, evidence and confidence.
  "applicability_partial",
  "applicability_blocked",
  "missing_required_context",
  "provenance_blocked",
  "no_evidence_retrieved",
  "evidence_review_stale",
  "evidence_confidence_overstated",
  "proposal_evidence_untrustworthy",
  "confidence_below_action_floor",
  "risk_exceeds_confidence_ceiling",
  "completeness_low",
  // Telemetry and conflicts.
  "photo_quality_unknown",
  "photo_quality_poor",
  "photo_single_view",
  "photo_only_evidence",
  "contested_evidence_surfaced",
  "contested_evidence_withheld",
  "conflicting_telemetry",
  // Cultivation gates.
  "stage_forbids_proposals",
  "stage_forbids_intervention_class",
  "stage_unknown",
  "autoflower_stress_blocked",
  "autoflower_stress_capped",
  "autoflower_status_unknown",
  "plant_identity_contradictory",
  "unresolved_follow_up_open",
  "prior_recommendation_unresolved",
  "recent_intervention_same_class",
  "declared_risk_below_derived_floor",
  "intervention_class_unknown",
] as const;
export type SkillPolicyRuleCode = (typeof SKILL_POLICY_RULE_CODES)[number];

export { SKILL_INTERVENTION_CLASSES, type SkillInterventionClass };

/**
 * How far a reading's SOURCE label lets it support a conclusion.
 *
 * Mapped onto the truth gate's existing usability multipliers rather than
 * inventing a second trust scale: a source the gate calls stale is worth what
 * the gate says stale is worth. `demo` is fixture data and supports nothing.
 */
const SOURCE_TRUST_FACTOR: Readonly<Record<string, number>> = Object.freeze({
  live: SENSOR_TRUTH_CONFIDENCE_FACTORS.usable,
  manual: SENSOR_TRUTH_CONFIDENCE_FACTORS.usable,
  csv: SENSOR_TRUTH_CONFIDENCE_FACTORS.usable,
  stale: SENSOR_TRUTH_CONFIDENCE_FACTORS.stale,
  invalid: SENSOR_TRUTH_CONFIDENCE_FACTORS.invalid,
  demo: SENSOR_TRUTH_CONFIDENCE_FACTORS.invalid,
});

/**
 * How far ONE evidence record lets a conclusion be trusted.
 *
 * The source label and the originating layer's own per-record confidence
 * are combined multiplicatively, matching how the sensor truth gate already
 * derives its adjusted confidence. A record can be sourced live and still be
 * rated 0 by the layer that produced it — reading only the label would treat
 * telemetry its own producer called unusable as fully trustworthy.
 */
function recordTrust(
  record: { source?: string | null; confidence?: number | null; observedAt?: string | null },
  asOfMs: number,
): number {
  // An absent source is not a benign default — it is an unlabelled reading,
  // which the truth gate scores at zero.
  const sourceFactor =
    record.source === null || record.source === undefined
      ? SENSOR_TRUTH_CONFIDENCE_FACTORS.unknown
      : (SOURCE_TRUST_FACTOR[record.source] ?? SENSOR_TRUTH_CONFIDENCE_FACTORS.unknown);
  // `live` describes HOW a reading arrived, never WHEN. A months-old
  // record keeps its live label forever, so freshness is measured against
  // the run's own completion time using the window the context compiler
  // already uses to admit sensor evidence at all.
  const observedMs =
    typeof record.observedAt === "string" ? Date.parse(record.observedAt) : Number.NaN;
  const ageFactor = Number.isNaN(observedMs)
    ? SENSOR_TRUTH_CONFIDENCE_FACTORS.unknown
    : observedMs > asOfMs + SENSOR_CLOCK_SKEW_MS
      ? SENSOR_TRUTH_CONFIDENCE_FACTORS.invalid
      : asOfMs - observedMs > PLANT_CONTEXT_WINDOWS.sensorDays * 86_400_000
        ? SENSOR_TRUTH_CONFIDENCE_FACTORS.stale
        : SENSOR_TRUTH_CONFIDENCE_FACTORS.usable;
  const own =
    record.confidence === null || record.confidence === undefined ? 1 : clamp01(record.confidence);
  return sourceFactor * own * ageFactor;
}

/** Tolerance for ordinary clock drift between a device and the runtime. */
const SENSOR_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** V1 ships exactly one allow state, and it is low-risk-only. */
export const V1_MAX_ALLOWED_RISK: SkillRiskLevel = "low";

/** Confidence below this cannot authorize any action at all. */
export const MIN_CONFIDENCE_FOR_LOW_RISK_ACTION = 0.5;

/**
 * Highest risk permitted at a given system confidence. Scanned in declared
 * order with a single `>=`; anything that matches no row falls to the most
 * restrictive outcome rather than to "no cap".
 */
export const MAX_RISK_BY_CONFIDENCE: readonly {
  readonly minSystemConfidence: number;
  readonly maxRiskLevel: SkillRiskLevel | null;
}[] = Object.freeze([
  { minSystemConfidence: 0.85, maxRiskLevel: "high" },
  { minSystemConfidence: 0.7, maxRiskLevel: "medium" },
  { minSystemConfidence: 0.5, maxRiskLevel: "low" },
  { minSystemConfidence: 0, maxRiskLevel: null },
]);

/**
 * Highest risk permitted at a given stage. `null` means no proposal at any
 * risk: once a plant is cut, irrigation, feeding, root-zone corrections and
 * training are not risky, they are meaningless.
 */
export const MAX_RISK_BY_STAGE: Readonly<Record<SkillPlantStage, SkillRiskLevel | null>> =
  Object.freeze({
    seedling: "high",
    veg: "high",
    flower: "high",
    late_flower: "medium",
    harvest: null,
    drying: null,
    curing: null,
    unknown: "low",
  });

/** Interventions that make no sense, or cannot be undone, at a given stage. */
export const STAGE_FORBIDDEN_INTERVENTION_CLASSES: Readonly<
  Record<SkillPlantStage, readonly SkillInterventionClass[]>
> = Object.freeze({
  seedling: Object.freeze(["defoliation"] as const),
  veg: Object.freeze([] as const),
  flower: Object.freeze(["transplant"] as const),
  late_flower: Object.freeze(["transplant", "defoliation", "foliar_application"] as const),
  harvest: Object.freeze([
    "irrigation",
    "nutrient",
    "flush",
    "training",
    "defoliation",
    "transplant",
    "foliar_application",
  ] as const),
  drying: Object.freeze([
    "irrigation",
    "nutrient",
    "flush",
    "training",
    "defoliation",
    "transplant",
    "foliar_application",
  ] as const),
  curing: Object.freeze([
    "irrigation",
    "nutrient",
    "flush",
    "training",
    "defoliation",
    "transplant",
    "foliar_application",
  ] as const),
  unknown: Object.freeze([] as const),
});

/** Inherent floor for an intervention kind, before any prose signal. */
export const RISK_FLOOR_BY_INTERVENTION_CLASS: Readonly<
  Record<SkillInterventionClass, SkillRiskLevel>
> = Object.freeze({
  irrigation: "low",
  nutrient: "medium",
  flush: "high",
  training: "medium",
  defoliation: "high",
  transplant: "high",
  foliar_application: "high",
  environment: "low",
  observation: "low",
  unknown: "high",
});

/** Diary/grow event types mapped to the intervention they represent. */
export const INTERVENTION_CLASS_BY_EVENT_TYPE: Readonly<Record<string, SkillInterventionClass>> =
  Object.freeze({
    watering: "irrigation",
    water: "irrigation",
    irrigation: "irrigation",
    feeding: "nutrient",
    feed: "nutrient",
    nutrients: "nutrient",
    flush: "flush",
    training: "training",
    topping: "training",
    lst: "training",
    defoliation: "defoliation",
    transplant: "transplant",
    repot: "transplant",
    foliar: "foliar_application",
    spray: "foliar_application",
    environment: "environment",
    observation: "observation",
    note: "observation",
    photo: "observation",
  });

// Photo ceilings. Deliberately governor-owned rather than borrowed from the
// vision adapter: `photos.quality_score` and the adapter's
// `image_quality_score` are different measurements, and the adapter's cutoff
// is only meaningful next to its own observation-count term.
export const SKILL_PHOTO_QUALITY_FLOOR = 0.5;
export const PHOTO_QUALITY_UNKNOWN_CEILING = 0.39;
export const PHOTO_QUALITY_POOR_CEILING = 0.3;
export const SINGLE_VIEW_CEILING = 0.39;
export const PHOTO_ONLY_CEILING = 0.39;
export const EVIDENCE_ABSENT_CEILING = 0.3;
/** Curated evidence unreviewed for this long stops being current. */
export const EVIDENCE_REVIEW_STALE_DAYS = 1095;

// ---------------------------------------------------------------------------
// Result contract
// ---------------------------------------------------------------------------

export interface SkillPolicyRuleRef {
  code: SkillPolicyRuleCode;
  /** Set at the rule site, never inferred. */
  basis: "structural" | "linguistic";
  subject: "run" | "proposal";
  proposalId: string | null;
  /** Governor-authored. Never model text. */
  detail: string;
}

export interface SkillProposalVerdict {
  proposalId: string;
  verdict: "allow" | "block";
  /** Carried so eligibility is derived from capability, not verdict count. */
  executionCapability: "none" | "manual_only";
  /**
   * Confidence ceiling from the evidence THIS proposal cites, which can be
   * far below the run's — a run-wide maximum would let one strong reading
   * underwrite a proposal that cites only a weak one.
   */
  citedEvidenceCeiling: number;
  declaredRiskLevel: SkillRiskLevel;
  effectiveRiskLevel: SkillRiskLevel;
  interventionClass: SkillInterventionClass;
  ruleCodes: SkillPolicyRuleCode[];
}

export interface SkillPolicyConflict {
  channel: "telemetry" | "evidence_corpus" | "evidence_corpus_withheld";
  subject: string;
  detail: string;
  /** False for a counter-claim scoped outside this query. */
  contestsThisQuery: boolean;
}

export interface SkillPolicyDecision {
  decisionVersion: string;
  manifestKey: string;
  runId: string;
  outcomes: SkillPolicyOutcome[];
  primaryOutcome: SkillPolicyOutcome;
  urgent: boolean;
  urgentReasons: string[];
  informationRequired: boolean;
  actionEligibility: "none" | "low_risk_manual_only";
  proposalVerdicts: SkillProposalVerdict[];
  allowedProposalIds: string[];
  allowedEvidenceIds: string[];
  allowedHypothesisIds: string[];
  allowedFollowUpIds: string[];
  withheldTextPaths: string[];
  confidenceCeiling: number;
  confidenceCeilingImposedBy: SkillPolicyRuleCode[];
  conflictsToShow: SkillPolicyConflict[];
  conflictsWithheld: number;
  conflictWithheldReasons: string[];
  firedRules: SkillPolicyRuleRef[];
  safeNextStep: string | null;
  mandatedRunStatus: SkillRunStatus;
  withheldProposalCount: number;
}

export interface GovernSkillOutputInput {
  manifest: VerdantSkillManifest;
  applicability: SkillApplicabilityResult;
  /**
   * The COMPILATION, not the bare bundle: photo summary, recent actions,
   * previous recommendations, unresolved follow-ups and the sensor summary
   * exist only here, and half the rules below cannot be written without them.
   */
  context: PlantContextCompilation;
  /**
   * Curated literature from Build 5. Named to keep it distinct from
   * `output.evidence`, which is grower OBSERVATIONS and a different id space
   * — `supportingEvidenceIds` resolves against the latter, never this.
   */
  curatedEvidence: EvidenceRetrievalResult;
  /** The model's structured output. */
  output: SkillRunResult;
  /** Separately supplied and authoritative. */
  confidence: SkillConfidenceResult | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const riskRank = (level: SkillRiskLevel): number => SKILL_RISK_LEVELS.indexOf(level);

/** Lower of two risk ceilings; `null` (nothing allowed) always wins. */
function minRisk(a: SkillRiskLevel | null, b: SkillRiskLevel | null): SkillRiskLevel | null {
  if (a === null || b === null) return null;
  return riskRank(a) <= riskRank(b) ? a : b;
}

function maxRisk(a: SkillRiskLevel, b: SkillRiskLevel): SkillRiskLevel {
  return riskRank(a) >= riskRank(b) ? a : b;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Every string on a value, for text scanning. */
function collectStrings(value: unknown, path: string, out: { path: string; text: string }[]): void {
  if (typeof value === "string") {
    out.push({ path, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectStrings(item, `${path}.${i}`, out));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      collectStrings((value as Record<string, unknown>)[key], `${path}.${key}`, out);
    }
  }
}

/**
 * Which parts of a run result carry model prose that must be scanned.
 *
 * Typed as an exhaustive Record so adding a field to the Build 1 contract
 * fails the build until someone classifies it. This closes the hole where a
 * run with `status: "insufficient_context"` and zero proposals could still
 * carry a full irrigation instruction in `hypotheses[].rationale` — the
 * `proposals_require_ok_status` invariant gates proposals, and nothing else.
 */
export const GOVERNED_RESULT_KEYS: Record<keyof SkillRunResult, "governed" | "exempt_structural"> =
  {
    contractVersion: "exempt_structural",
    runId: "exempt_structural",
    skillId: "exempt_structural",
    skillVersion: "exempt_structural",
    status: "exempt_structural",
    startedAt: "exempt_structural",
    completedAt: "exempt_structural",
    contextVersion: "exempt_structural",
    evidence: "governed",
    hypotheses: "governed",
    confidence: "exempt_structural",
    proposals: "governed",
    followUps: "governed",
    error: "governed",
  };

/**
 * EVERY rule code that causes `block()` — structural as well as linguistic.
 *
 * The linguistic ones come from BLOCKING_FAMILIES below; these are raised
 * structurally and have no prose to detect, so a consumer scanning only the
 * families misses them entirely.
 *
 * This listed FIVE when written, and there are nine. The search that produced
 * it required the code on the same line as `block(`, and four calls span
 * lines — so a list asserting its own completeness was wrong the moment it
 * was committed. When adding a code, check every `block(` site across
 * newlines, not by eye.
 */
export const STRUCTURAL_BLOCKING_RULE_CODES: readonly SkillPolicyRuleCode[] = Object.freeze([
  "autoflower_stress_blocked",
  "capability_exceeds_manifest",
  "confidence_below_action_floor",
  "plant_identity_contradictory",
  "proposal_evidence_untrustworthy",
  "risk_exceeds_confidence_ceiling",
  "risk_exceeds_declared_class",
  "stage_forbids_intervention_class",
  "unresolved_follow_up_open",
]);

/**
 * Rule codes that `blockAll()` seeds onto every proposal (`manifestBlocks`).
 *
 * These fire with `subject: "run"` and `proposalId: null`. The live governor
 * starts every proposal as blocked when any of these are present. An offline
 * harness that only correlates `firedRules` by non-null `proposalId` therefore
 * never sees them contradict an attached `allow` verdict — the P1 this list
 * exists to close. Keep in lockstep with every `blockAll(` site.
 *
 * Informational run-scoped fires (`cap()`, stage notes, withheld-channel
 * linguistic hits) are intentionally absent: they lower ceilings or withhold
 * non-proposal prose without forcing every proposal to block.
 */
export const RUN_SCOPED_BLOCKING_RULE_CODES: readonly SkillPolicyRuleCode[] = Object.freeze([
  "applicability_blocked",
  "applicability_manifest_mismatch",
  "confidence_input_mismatch",
  "contract_version_mismatch",
  "contract_violation",
  "context_version_mismatch",
  "evidence_policy_unsatisfied",
  "manifest_lifecycle_blocked",
  "manifest_run_mismatch",
  "proposal_without_grant",
  "run_status_not_ok",
]);

/**
 * Proposal-local note() codes: always subject "proposal" with a non-null
 * proposalId. Not blocking by themselves, but they still have a canonical
 * attachment shape the live governor never violates.
 */
export const PROPOSAL_SCOPED_NOTE_RULE_CODES: readonly SkillPolicyRuleCode[] = Object.freeze([
  "autoflower_status_unknown",
  "autoflower_stress_capped",
  "declared_risk_below_derived_floor",
  "intervention_class_unknown",
  "prior_recommendation_unresolved",
  "recent_intervention_same_class",
]);

/**
 * Informational run-scoped fires (`cap()`, stage notes, confidence ceilings).
 * Always `subject: "run"` and `proposalId: null` — never a proposal attachment.
 */
export const RUN_SCOPED_INFORMATIONAL_RULE_CODES: readonly SkillPolicyRuleCode[] = Object.freeze([
  "applicability_partial",
  "completeness_low",
  "conflicting_telemetry",
  "contested_evidence_surfaced",
  "contested_evidence_withheld",
  "evidence_confidence_overstated",
  "evidence_review_stale",
  "missing_required_context",
  "no_evidence_retrieved",
  "photo_only_evidence",
  "photo_quality_poor",
  "photo_quality_unknown",
  "photo_single_view",
  "provenance_blocked",
  "stage_forbids_proposals",
  "stage_unknown",
]);

/**
 * Canonical subject + proposalId shape the live governor emits for a code.
 *
 * Used by the evaluation fixture schema so a fabricated
 * `{ code: "proposal_without_grant", subject: "evidence", proposalId: null }`
 * cannot strip a run-wide block by parking it on a channel the evaluator
 * ignores. Linguistic families may appear on proposals (blocked content) or
 * at run scope / withheld channels (proposalId null); everything else is
 * either run/null or proposal/id.
 */
export type CanonicalFiredRuleSubject =
  | "run"
  | "proposal"
  | "hypothesis"
  | "follow_up"
  | "evidence";

export interface CanonicalFiredRuleShape {
  /** Subjects the governor can attach this code under. */
  readonly allowedSubjects: readonly CanonicalFiredRuleSubject[];
  /**
   * - `null` — proposalId must be null
   * - `required` — proposalId must be a non-empty string
   * - `by_subject` — null when subject is not "proposal"; required when it is
   */
  readonly proposalId: "null" | "required" | "by_subject";
}

export function canonicalFiredRuleShape(code: SkillPolicyRuleCode): CanonicalFiredRuleShape {
  if ((RUN_SCOPED_BLOCKING_RULE_CODES as readonly string[]).includes(code)) {
    return { allowedSubjects: ["run"], proposalId: "null" };
  }
  if ((RUN_SCOPED_INFORMATIONAL_RULE_CODES as readonly string[]).includes(code)) {
    return { allowedSubjects: ["run"], proposalId: "null" };
  }
  if ((STRUCTURAL_BLOCKING_RULE_CODES as readonly string[]).includes(code)) {
    return { allowedSubjects: ["proposal"], proposalId: "required" };
  }
  if ((PROPOSAL_SCOPED_NOTE_RULE_CODES as readonly string[]).includes(code)) {
    return { allowedSubjects: ["proposal"], proposalId: "required" };
  }
  // Linguistic blocking families: proposal-local blocks, or run/withheld
  // channel bookkeeping (subject run / hypothesis / follow_up / evidence).
  if (BLOCKING_FAMILIES.some((family) => family.code === code)) {
    return {
      allowedSubjects: ["run", "proposal", "hypothesis", "follow_up", "evidence"],
      proposalId: "by_subject",
    };
  }
  // Fail closed for any code that gained a fire site without a shape entry:
  // run/null is the governor's default for unattached structural fires.
  return { allowedSubjects: ["run"], proposalId: "null" };
}

/** True when a recorded fired rule matches the governor's emission shape. */
export function isCanonicalFiredRule(rule: {
  code: string;
  subject: string;
  proposalId: string | null;
}): boolean {
  if (!(SKILL_POLICY_RULE_CODES as readonly string[]).includes(rule.code)) return false;
  const shape = canonicalFiredRuleShape(rule.code as SkillPolicyRuleCode);
  if (!(shape.allowedSubjects as readonly string[]).includes(rule.subject)) return false;
  const id = rule.proposalId;
  if (shape.proposalId === "null") return id === null;
  if (shape.proposalId === "required") return typeof id === "string" && id.length > 0;
  // by_subject
  if (rule.subject === "proposal") return typeof id === "string" && id.length > 0;
  return id === null;
}

/** Families that block outright: no legitimate use in an advisory proposal. */
export const BLOCKING_FAMILIES: readonly {
  readonly code: SkillPolicyRuleCode;
  readonly patterns: readonly RegExp[];
  /** Prohibition-aware: "Do not turn on the fan" is not an instruction. */
  readonly clauseAware: boolean;
}[] = Object.freeze([
  {
    code: "device_control_instruction",
    patterns: DEVICE_CONTROL_DETECTION_PATTERNS,
    clauseAware: true,
  },
  { code: "device_control_payload_shape", patterns: PAYLOAD_SHAPE_PATTERNS, clauseAware: false },
  { code: "automatic_execution_language", patterns: AUTOMATIC_AQ_PATTERNS, clauseAware: true },
  { code: "over_promise_language", patterns: OVER_PROMISE_PATTERNS, clauseAware: false },
  { code: "unsupported_medical_claim", patterns: MEDICAL_CLAIM_PATTERNS, clauseAware: false },
  { code: "unsupported_yield_claim", patterns: YIELD_CLAIM_PATTERNS, clauseAware: false },
  {
    code: "dose_quantity_without_provenance",
    patterns: DOSE_QUANTITY_PATTERNS,
    clauseAware: false,
  },
]);

/**
 * Codes that impugn a proposal's INTEGRITY rather than its risk arithmetic.
 * A critical-risk proposal carrying none of these was refused only because
 * V1 caps what may be acted on — which is the one state that can honestly
 * ground an urgency claim about the plant itself.
 */
const PROPOSAL_INTEGRITY_BLOCK_CODES: readonly SkillPolicyRuleCode[] = BLOCKING_FAMILIES.map(
  (f) => f.code,
);

function scanBlocking(text: string): SkillPolicyRuleCode[] {
  const hits: SkillPolicyRuleCode[] = [];
  for (const family of BLOCKING_FAMILIES) {
    const hit = family.clauseAware
      ? hasUngovernedCommand(text, family.patterns)
      : scanProseForPatterns(text, family.patterns);
    if (hit) hits.push(family.code);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Governor
// ---------------------------------------------------------------------------

/**
 * Decide what may be shown or proposed for one skill run.
 *
 * Nothing here can allow more than the caller already had: the governor only
 * ever lowers. It never writes a ceiling back into `SkillConfidenceResult` —
 * doing so would launder a governor ceiling as an evidence-layer number.
 */
export function governSkillOutput(input: GovernSkillOutputInput): SkillPolicyDecision {
  const { manifest, applicability, context, curatedEvidence } = input;
  const fired: SkillPolicyRuleRef[] = [];
  const outcomes = new Set<SkillPolicyOutcome>();
  const ceilingCodes = new Set<SkillPolicyRuleCode>();
  const urgentReasons: string[] = [];

  const fire = (
    code: SkillPolicyRuleCode,
    basis: "structural" | "linguistic",
    subject: "run" | "proposal",
    proposalId: string | null,
    detail: string,
  ): void => {
    fired.push({ code, basis, subject, proposalId, detail });
  };

  // A caller cannot be trusted to have parsed: `strict: false` means an
  // unparsed object with `riskLevel` missing would clear every comparison.
  const parsed = parseSkillRunResult(input.output);
  if (parsed.ok === false) {
    fire("contract_violation", "structural", "run", null, "Run result failed contract validation.");
    return finalize({
      manifestKey: skillManifestKey(manifest),
      runId:
        typeof (input.output as { runId?: string })?.runId === "string"
          ? (input.output as { runId: string }).runId
          : "",
      outcomes: new Set<SkillPolicyOutcome>(["block_action", "request_more_information"]),
      verdicts: [],
      fired,
      ceiling: 0,
      ceilingCodes,
      conflicts: [],
      withheld: 0,
      withheldReasons: [],
      urgentReasons,
      safeNextStep: applicability.safeNextStep,
      mandatedRunStatus: "error",
      allowedEvidenceIds: [],
      allowedHypothesisIds: [],
      allowedFollowUpIds: [],
      withheldTextPaths: [],
    });
  }
  const output = parsed.value;
  // The run's own completion time is the injected clock. The governor never
  // reads a real one, so the same inputs always produce the same decision.
  const runCompletedMs = Date.parse(output.completedAt);

  // ---- D0: manifest conformance. Structural, runs first, blocks everything.
  const manifestBlocks: SkillPolicyRuleCode[] = [];
  const blockAll = (code: SkillPolicyRuleCode, detail: string): void => {
    manifestBlocks.push(code);
    fire(code, "structural", "run", null, detail);
  };

  if (output.skillId !== manifest.id || output.skillVersion !== manifest.version) {
    blockAll("manifest_run_mismatch", "Run does not identify the manifest that governs it.");
  }
  // The run must have been produced against THIS compilation. Otherwise the
  // governor judges old prose using a newer context's stage, plant identity,
  // recent actions and open follow-ups — every cultivation gate below would
  // be answering about a different moment than the one the model saw.
  if (output.contextVersion !== context.contextVersion) {
    blockAll("context_version_mismatch", "Run was produced against a different plant context.");
  }
  // An applicability verdict is only meaningful for the skill it was computed
  // for. Accepting a borrowed one lets a permissive manifest's `applicable`
  // stand in for this manifest's medium, irrigation and required-context
  // exclusions — the gate would pass without ever having been asked.
  if (applicability.skillId !== manifest.id || applicability.skillVersion !== manifest.version) {
    blockAll(
      "applicability_manifest_mismatch",
      "Applicability was computed for a different skill.",
    );
  }
  if (manifest.outputContractVersion !== SKILL_CONTRACT_VERSION) {
    blockAll("contract_version_mismatch", "Manifest targets a different output contract version.");
  }
  if (
    output.proposals.length > 0 &&
    !skillManifestGrantsPermission(manifest, "propose_manual_action")
  ) {
    blockAll("proposal_without_grant", "Skill proposed an action without the propose grant.");
  }
  if (
    manifest.lifecycle === "paused" ||
    manifest.lifecycle === "deprecated" ||
    manifest.lifecycle === "superseded" ||
    manifest.deprecation.deprecated === true
  ) {
    blockAll("manifest_lifecycle_blocked", "Skill is retired or paused.");
  }
  if (
    manifest.evidencePolicy === "approved_evidence_required" &&
    evidenceSatisfiesPolicy(curatedEvidence) === false
  ) {
    blockAll("evidence_policy_unsatisfied", "Skill requires approved evidence and retrieved none.");
  }
  if (output.status !== "ok") {
    blockAll("run_status_not_ok", `Run status is ${output.status}; no proposal may be allowed.`);
  }

  // Confidence supplied twice must agree, or the number the grower sees is
  // undecidable and nothing may proceed.
  if (
    output.confidence !== null &&
    output.confidence !== undefined &&
    input.confidence !== null &&
    serializeSkillContract(output.confidence) !== serializeSkillContract(input.confidence)
  ) {
    blockAll("confidence_input_mismatch", "Embedded and supplied confidence disagree.");
  }

  // ---- Applicability and evidence, read structurally rather than as booleans.
  let ceiling = 1;
  // Records EVERY ceiling that applied, not only the binding one: two
  // independent reasons to distrust a run are two facts an auditor needs,
  // and the lower one winning does not make the other untrue.
  const cap = (limit: number, code: SkillPolicyRuleCode, detail: string): void => {
    if (limit < ceiling) ceiling = limit;
    ceilingCodes.add(code);
    fire(code, "structural", "run", null, detail);
  };

  if (skillMayRun(applicability) === false) {
    blockAll("applicability_blocked", `Skill is ${applicability.verdict} for this plant.`);
  } else if (applicability.verdict === "partially_applicable") {
    cap(0.6, "applicability_partial", "Skill is only partially applicable.");
  }
  if (applicability.missingRequiredContext.length > 0) {
    outcomes.add("request_more_information");
    cap(0.5, "missing_required_context", "Required context is missing.");
  }
  if (applicability.provenanceBlockers.length > 0) {
    outcomes.add("request_more_information");
    cap(0.4, "provenance_blocked", "Sensor provenance blocks this skill's evidence.");
  }
  if (applicability.reasons.includes("conflicting_sensor_evidence")) {
    cap(0.5, "conflicting_telemetry", "Contemporaneous devices disagree.");
  }
  if (applicability.reasons.includes("plant_identity_contradictory")) {
    outcomes.add("request_more_information");
    cap(0.4, "plant_identity_contradictory", "Two sources disagree about plant type.");
  }

  if (curatedEvidence.applicable.length === 0) {
    cap(EVIDENCE_ABSENT_CEILING, "no_evidence_retrieved", "No curated evidence matched.");
  }
  if (context.completenessScore < 0.5) {
    cap(0.5, "completeness_low", "Plant context is substantially incomplete.");
  }

  // ---- Photo adequacy. Absent quality is never "adequate".
  const photos = context.photoSummary;
  const everyEvidenceIsPhoto =
    output.evidence.length > 0 && output.evidence.every((e) => e.kind === "photo");
  if (photos.bestQualityScore === null && photos.count > 0) {
    cap(PHOTO_QUALITY_UNKNOWN_CEILING, "photo_quality_unknown", "Photo quality is unrecorded.");
  } else if (
    photos.bestQualityScore !== null &&
    photos.bestQualityScore < SKILL_PHOTO_QUALITY_FLOOR
  ) {
    cap(PHOTO_QUALITY_POOR_CEILING, "photo_quality_poor", "Best photo is below the quality floor.");
  }
  if (photos.count > 0 && photos.angles.length <= 1) {
    cap(SINGLE_VIEW_CEILING, "photo_single_view", "Photos show a single view.");
  }
  if (everyEvidenceIsPhoto) {
    cap(PHOTO_ONLY_CEILING, "photo_only_evidence", "Every cited record is a photo.");
  }

  // ---- Sensor trust. Telemetry the truth gate already distrusts cannot
  //      STRENGTHEN a conclusion drawn from it. The best cited reading sets
  //      the ceiling, because one sound reading is enough to reason from;
  //      when no sensor record is cited at all there is nothing to cap here
  //      and the photo/evidence ceilings above carry the weight instead.
  const sensorRecords = output.evidence.filter(
    (e) => e.kind === "sensor_reading" || e.kind === "derived_metric",
  );
  if (sensorRecords.length > 0) {
    const trust = Math.max(...sensorRecords.map((e) => recordTrust(e, runCompletedMs)));
    if (trust < 1) {
      cap(trust, "proposal_evidence_untrustworthy", "Cited telemetry is not fully trusted.");
    }
  }

  // ---- Conflicts. Shown always; capping depends on whether they contest THIS
  //      query. An out-of-scope counter-claim must not create the pressure
  //      that later gets the cap loosened.
  const conflicts: SkillPolicyConflict[] = [];
  for (const c of curatedEvidence.conflicts) {
    const contests = c.exclusionReasons.length === 0;
    conflicts.push({
      channel: "evidence_corpus",
      subject: c.evidenceId,
      detail: c.claim,
      contestsThisQuery: contests,
    });
    if (contests) {
      cap(0.6, "contested_evidence_surfaced", "Applicable evidence is contested.");
    }
  }
  if (curatedEvidence.conflictSurvey.withheld > 0) {
    conflicts.push({
      channel: "evidence_corpus_withheld",
      subject: "",
      detail: "Contested evidence exists that this skill may not read.",
      contestsThisQuery: true,
    });
    cap(0.5, "contested_evidence_withheld", "Contested evidence was withheld from this skill.");
  }
  for (const c of context.sensorSummary.conflicts) {
    conflicts.push({
      channel: "telemetry",
      subject: c.metric,
      detail: `${c.readingCount} readings disagree by ${c.spread}`,
      contestsThisQuery: true,
    });
    cap(0.5, "conflicting_telemetry", `Devices disagree on ${c.metric}.`);
  }

  // ---- Curated-evidence staleness. Build 5 deferred "what old means" here.
  const nowMsFromRun = Date.parse(output.completedAt);
  for (const ref of curatedEvidence.references) {
    const reviewedMs = Date.parse(ref.lastReviewed);
    if (Number.isNaN(reviewedMs) || Number.isNaN(nowMsFromRun)) continue;
    const ageDays = (nowMsFromRun - reviewedMs) / 86_400_000;
    if (ageDays > EVIDENCE_REVIEW_STALE_DAYS) {
      cap(0.6, "evidence_review_stale", `${ref.evidenceId} has not been reviewed recently.`);
    }
  }

  // ---- Confidence resolution. The governor only lowers.
  const supplied =
    input.confidence === null || input.confidence === undefined
      ? 0
      : clamp01(input.confidence.systemConfidence);
  const governorEvidenceCeiling = clamp01(ceiling);
  if (
    input.confidence !== null &&
    input.confidence !== undefined &&
    input.confidence.evidenceConfidence > governorEvidenceCeiling + 1e-9
  ) {
    fire(
      "evidence_confidence_overstated",
      "structural",
      "run",
      null,
      "Reported evidence confidence exceeds what the evidence supports.",
    );
  }
  const effectiveConfidence = Math.min(supplied, governorEvidenceCeiling);

  const band =
    MAX_RISK_BY_CONFIDENCE.find((row) => effectiveConfidence >= row.minSystemConfidence) ??
    MAX_RISK_BY_CONFIDENCE[MAX_RISK_BY_CONFIDENCE.length - 1];

  const stage: SkillPlantStage =
    output.status === "ok" && context.bundle.stage !== null && context.bundle.stage !== undefined
      ? context.bundle.stage
      : "unknown";
  if (stage === "unknown") {
    outcomes.add("request_more_information");
    fire("stage_unknown", "structural", "run", null, "Plant stage is not recorded.");
  }
  const stageCeiling = MAX_RISK_BY_STAGE[stage] ?? null;
  if (stageCeiling === null) {
    fire(
      "stage_forbids_proposals",
      "structural",
      "run",
      null,
      `No proposal is meaningful at ${stage}.`,
    );
  }

  const runMaxRisk = minRisk(
    minRisk(band.maxRiskLevel, stageCeiling),
    minRisk(manifest.riskClass, V1_MAX_ALLOWED_RISK),
  );

  const identity = resolvePlantIdentity(context);

  // ---- Per-proposal verdicts. One entry per input proposal, no third state.
  const verdicts: SkillProposalVerdict[] = output.proposals.map((proposal) =>
    judgeProposal({
      proposal,
      manifest,
      manifestBlocks,
      runMaxRisk,
      effectiveConfidence,
      stage,
      identity,
      context,
      output,
      runCompletedMs,
      fire,
      outcomes,
    }),
  );

  // ---- Governed prose beyond proposals. A blocked proposal is no protection
  //      if the same instruction rides out in a hypothesis rationale.
  const withheldTextPaths: string[] = [];
  const allowedHypothesisIds: string[] = [];
  const allowedFollowUpIds: string[] = [];

  for (const hypothesis of output.hypotheses) {
    const strings: { path: string; text: string }[] = [];
    collectStrings(
      { statement: hypothesis.statement, rationale: hypothesis.rationale },
      `hypotheses.${hypothesis.hypothesisId}`,
      strings,
    );
    const hits = strings.flatMap((s) => scanBlocking(s.text).map((code) => ({ ...s, code })));
    if (hits.length === 0) {
      allowedHypothesisIds.push(hypothesis.hypothesisId);
      continue;
    }
    for (const hit of hits) {
      withheldTextPaths.push(hit.path);
      fire(hit.code, "linguistic", "run", null, `Withheld ${hit.path}.`);
    }
  }

  for (const followUp of output.followUps) {
    const strings: { path: string; text: string }[] = [];
    collectStrings(
      {
        question: followUp.question,
        expectedObservation: followUp.expectedObservation,
        // A recorded outcome is model-adjacent prose too: a note reading
        // "turn on the pump" would otherwise render with an allowed id.
        recordedNote: followUp.recordedOutcome?.note,
      },
      `followUps.${followUp.followUpId}`,
      strings,
    );
    const hits = strings.flatMap((s) => scanBlocking(s.text).map((code) => ({ ...s, code })));
    if (hits.length === 0) {
      allowedFollowUpIds.push(followUp.followUpId);
      continue;
    }
    for (const hit of hits) {
      withheldTextPaths.push(hit.path);
      fire(hit.code, "linguistic", "run", null, `Withheld ${hit.path}.`);
    }
  }

  // ---- Evidence and error prose. These fields are rendered too: a device
  //      instruction in `evidence[].summary` or `error.message` reaches the
  //      grower exactly as a hypothesis would, and GOVERNED_RESULT_KEYS
  //      declaring them governed is a claim this loop has to make true.
  const allowedEvidenceIds: string[] = [];
  for (const record of output.evidence) {
    const strings: { path: string; text: string }[] = [];
    collectStrings(
      { summary: record.summary, detail: record.detail, unit: record.metric?.unit },
      `evidence.${record.evidenceId}`,
      strings,
    );
    const hits = strings.flatMap((s) => scanBlocking(s.text).map((code) => ({ ...s, code })));
    if (hits.length === 0) {
      allowedEvidenceIds.push(record.evidenceId);
      continue;
    }
    for (const hit of hits) {
      withheldTextPaths.push(hit.path);
      fire(hit.code, "linguistic", "run", null, `Withheld ${hit.path}.`);
    }
  }
  if (output.error !== null && output.error !== undefined) {
    const strings: { path: string; text: string }[] = [];
    collectStrings(
      { message: output.error.message, details: output.error.details },
      "error",
      strings,
    );
    for (const s of strings) {
      for (const code of scanBlocking(s.text)) {
        withheldTextPaths.push(s.path);
        fire(code, "linguistic", "run", null, `Withheld ${s.path}.`);
      }
    }
  }

  // ---- Outcomes. Derived from what survived; never seeded at the permissive
  //      end. An empty rule set does not mean "allow".
  const anyAllowed = verdicts.some((v) => v.verdict === "allow");
  if (verdicts.some((v) => v.verdict === "block")) outcomes.add("block_action");
  if (anyAllowed) outcomes.add("allow_low_risk_manual_action");

  // Urgency is a CONDITION-level claim, and `riskLevel` describes the risk of
  // TAKING an action — a dangerous flush the governor just blocked says
  // nothing about the plant. The V1-representable signal that the condition
  // itself demands attention is a critical-risk proposal whose integrity
  // held: clean prose, trustworthy cited evidence, adequate confidence — one
  // the governor refuses only because V1 caps what may be ACTED on.
  const honestCritical = verdicts.some(
    (v) =>
      v.declaredRiskLevel === "critical" &&
      !v.ruleCodes.some(
        (c) =>
          PROPOSAL_INTEGRITY_BLOCK_CODES.includes(c) || c === "proposal_evidence_untrustworthy",
      ),
  );
  if (honestCritical && effectiveConfidence >= MIN_CONFIDENCE_FOR_LOW_RISK_ACTION) {
    outcomes.add("urgent_manual_attention");
    urgentReasons.push(
      "A critical-risk condition was identified on trustworthy evidence; act manually, not through this proposal.",
    );
  }
  if (context.sensorSummary.conflicts.length > 0 || curatedEvidence.conflicts.length > 0) {
    outcomes.add("monitor");
  }
  if (outcomes.size === 0) outcomes.add("observation_only");
  if (!anyAllowed && !outcomes.has("block_action")) outcomes.add("observation_only");

  return finalize({
    manifestKey: skillManifestKey(manifest),
    runId: output.runId,
    outcomes,
    verdicts,
    fired,
    ceiling: effectiveConfidence,
    ceilingCodes,
    conflicts,
    withheld: curatedEvidence.conflictSurvey.withheld,
    withheldReasons: [...curatedEvidence.conflictSurvey.withheldReasons],
    urgentReasons,
    safeNextStep: applicability.safeNextStep,
    // A run that itself failed stays failed. Mandating "ok" over a valid
    // `status: "error"` or model-declared insufficient_context would let a
    // persistence layer record a failed run as successful; the never-"error"
    // rule applies to POLICY REFUSALS, which only happen on ok runs.
    mandatedRunStatus:
      output.status !== "ok"
        ? output.status
        : applicability.missingRequiredContext.length > 0 ||
            applicability.provenanceBlockers.length > 0
          ? "insufficient_context"
          : "ok",
    allowedEvidenceIds,
    allowedHypothesisIds,
    allowedFollowUpIds,
    withheldTextPaths,
  });
}

// ---------------------------------------------------------------------------
// Per-proposal judgement
// ---------------------------------------------------------------------------

interface JudgeInput {
  proposal: SkillActionProposal;
  manifest: VerdantSkillManifest;
  manifestBlocks: readonly SkillPolicyRuleCode[];
  runMaxRisk: SkillRiskLevel | null;
  effectiveConfidence: number;
  stage: SkillPlantStage;
  identity: { known: boolean; isAutoflower: boolean | null; contradictory: boolean };
  context: PlantContextCompilation;
  output: SkillRunResult;
  runCompletedMs: number;
  fire: (
    code: SkillPolicyRuleCode,
    basis: "structural" | "linguistic",
    subject: "run" | "proposal",
    proposalId: string | null,
    detail: string,
  ) => void;
  outcomes: Set<SkillPolicyOutcome>;
}

/**
 * Allow requires an affirmative conjunction. There is no fallthrough that
 * yields "allow" — an unknown is never satisfied. This is the shape Build 4's
 * presence check had to be rewritten into after review found its permissive
 * default four rounds running.
 */
function judgeProposal(input: JudgeInput): SkillProposalVerdict {
  const {
    proposal,
    manifestBlocks,
    runMaxRisk,
    effectiveConfidence,
    runCompletedMs,
    stage,
    identity,
    context,
    output,
    fire,
    outcomes,
  } = input;
  const codes = new Set<SkillPolicyRuleCode>(manifestBlocks);
  let blocked = manifestBlocks.length > 0;

  const id = proposal.proposalId;
  const block = (
    code: SkillPolicyRuleCode,
    basis: "structural" | "linguistic",
    detail: string,
  ): void => {
    codes.add(code);
    blocked = true;
    fire(code, basis, "proposal", id, detail);
  };
  const note = (
    code: SkillPolicyRuleCode,
    basis: "structural" | "linguistic",
    detail: string,
  ): void => {
    codes.add(code);
    fire(code, basis, "proposal", id, detail);
  };

  // Structural manifest ceilings that are per-proposal.
  // A `none` manifest is informational-only, so ANY action proposal exceeds
  // it. Keying on the proposal's self-declared capability would let a model
  // set `none` on its own proposal and keep the action.
  if (input.manifest.maxExecutionCapability === "none") {
    block("capability_exceeds_manifest", "structural", "Manifest permits no action proposals.");
  }
  if (riskRank(proposal.riskLevel) > riskRank(input.manifest.riskClass)) {
    block(
      "risk_exceeds_declared_class",
      "structural",
      "Proposal exceeds the skill's declared risk class.",
    );
  }

  // All governed prose on this proposal.
  const strings: { path: string; text: string }[] = [];
  collectStrings(
    {
      proposedAction: proposal.proposedAction,
      reason: proposal.reason,
      expectedResponse: proposal.expectedResponse,
      missingInformation: proposal.missingInformation,
      cancellationConditions: proposal.cancellationConditions,
    },
    `proposals.${id}`,
    strings,
  );
  for (const s of strings) {
    for (const code of scanBlocking(s.text)) {
      block(code, "linguistic", `Blocking language at ${s.path}.`);
    }
  }

  // Intervention class and the risk floor it implies.
  // Classified on the ACTION alone. Folding in the reason would let the
  // justification for a reading ("moisture has drifted") reclassify it as an
  // irrigation change.
  const klass = deriveInterventionClass(proposal.proposedAction);
  if (klass === "unknown") {
    note(
      "intervention_class_unknown",
      "structural",
      "Proposal does not name a recognized intervention.",
    );
  }
  let floor = RISK_FLOOR_BY_INTERVENTION_CLASS[klass];

  // Floor-raising prose families. Real agronomy — never a block on its own.
  const proseAll = `${proposal.proposedAction} ${proposal.reason}`;
  if (scanProseForPatterns(proseAll, AGGRESSIVE_NUTRIENT_PATTERNS)) {
    floor = maxRisk(floor, "medium");
  }
  if (scanProseForPatterns(proseAll, AGGRESSIVE_IRRIGATION_PATTERNS)) {
    floor = maxRisk(floor, "medium");
  }

  // Stage gates.
  if (STAGE_FORBIDDEN_INTERVENTION_CLASSES[stage].includes(klass)) {
    block(
      "stage_forbids_intervention_class",
      "structural",
      `${klass} is not meaningful at ${stage}.`,
    );
  }

  // Autoflower. Tier A is time-irrecoverable on a fixed clock.
  const tierA = scanProseForPatterns(proseAll, AUTOFLOWER_TIER_A_STRESS_PATTERNS);
  if (tierA) {
    if (identity.contradictory) {
      block(
        "plant_identity_contradictory",
        "structural",
        "Plant type is contradictory; high-stress work refused.",
      );
      outcomes.add("request_more_information");
    } else if (identity.isAutoflower === true) {
      if (stage === "flower" || stage === "late_flower") {
        block(
          "autoflower_stress_blocked",
          "structural",
          "High-stress work on a flowering autoflower.",
        );
      } else {
        floor = maxRisk(floor, "high");
        note(
          "autoflower_stress_capped",
          "structural",
          "High-stress work on an autoflower is capped.",
        );
      }
    } else if (identity.known === false) {
      // Not blocked: refusing routine veg advice for every plant whose type
      // is unrecorded is the failure mode that gets safety gates deleted.
      note("autoflower_status_unknown", "structural", "Plant type is unrecorded.");
      outcomes.add("request_more_information");
      floor = maxRisk(floor, "medium");
    }
  }

  // Cooldown. Structural only — no topical text matching.
  if (context.unresolvedFollowUps.some((f) => f.status === "pending")) {
    if (riskRank(proposal.riskLevel) > riskRank("low")) {
      block("unresolved_follow_up_open", "structural", "An earlier follow-up is still open.");
    }
    outcomes.add("monitor");
  }
  const sameClassRecent = context.recentActions.some(
    (a) => a.immediate && INTERVENTION_CLASS_BY_EVENT_TYPE[a.eventType] === klass,
  );
  if (sameClassRecent) {
    floor = maxRisk(floor, "medium");
    note(
      "recent_intervention_same_class",
      "structural",
      `A ${klass} action was already taken recently.`,
    );
  }

  const effectiveRiskLevel = maxRisk(proposal.riskLevel, floor);
  if (riskRank(proposal.riskLevel) < riskRank(floor)) {
    note(
      "declared_risk_below_derived_floor",
      "structural",
      "Declared risk is below what this intervention implies.",
    );
  }

  // Evidence must be real and trustworthy.
  const cited = proposal.supportingEvidenceIds
    .map((eid) => output.evidence.find((e) => e.evidenceId === eid))
    .filter((e) => e !== undefined);
  // A cited record supports a proposal only when BOTH its source and its own
  // reported confidence leave it usable. Both halves are required: trust
  // alone would readmit a stale record carrying a high confidence, and the
  // source allowlist alone would accept a live record its producer scored 0.
  const usableCited = cited.filter(
    (e) =>
      e !== undefined &&
      e.source !== "stale" &&
      e.source !== "invalid" &&
      e.source !== "demo" &&
      recordTrust(e, runCompletedMs) > 0,
  );
  if (usableCited.length === 0) {
    block("proposal_evidence_untrustworthy", "structural", "No cited evidence is trustworthy.");
  }
  // The ceiling is the best record THIS proposal cites — one sound reading
  // is enough to reason from, but a strong reading the proposal never cited
  // must not underwrite it.
  const citedEvidenceCeiling =
    usableCited.length === 0
      ? 0
      : Math.max(...usableCited.map((e) => recordTrust(e, runCompletedMs)));
  const proposalConfidence = Math.min(effectiveConfidence, citedEvidenceCeiling);

  // Confidence and risk ceiling, scoped to what this proposal actually cites.
  if (proposalConfidence < MIN_CONFIDENCE_FOR_LOW_RISK_ACTION) {
    block("confidence_below_action_floor", "structural", "Confidence is below the action floor.");
  }
  const proposalBand =
    MAX_RISK_BY_CONFIDENCE.find((row) => proposalConfidence >= row.minSystemConfidence) ??
    MAX_RISK_BY_CONFIDENCE[MAX_RISK_BY_CONFIDENCE.length - 1];
  const proposalMaxRisk = minRisk(runMaxRisk, proposalBand.maxRiskLevel);
  if (proposalMaxRisk === null || riskRank(effectiveRiskLevel) > riskRank(proposalMaxRisk)) {
    block(
      "risk_exceeds_confidence_ceiling",
      "structural",
      "Risk exceeds what the evidence supports.",
    );
  }

  return {
    proposalId: id,
    verdict: blocked ? "block" : "allow",
    executionCapability: proposal.executionCapability === "manual_only" ? "manual_only" : "none",
    citedEvidenceCeiling,
    declaredRiskLevel: proposal.riskLevel,
    effectiveRiskLevel,
    interventionClass: klass,
    ruleCodes: SKILL_POLICY_RULE_CODES.filter((c) => codes.has(c)),
  };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Single-slot UI only. Never load-bearing — `outcomes` is the real answer. */
export function derivePrimaryOutcome(outcomes: readonly SkillPolicyOutcome[]): SkillPolicyOutcome {
  const found = SKILL_POLICY_OUTCOMES.find((o) => outcomes.includes(o));
  return found ?? "observation_only";
}

interface FinalizeInput {
  manifestKey: string;
  runId: string;
  outcomes: Set<SkillPolicyOutcome>;
  verdicts: SkillProposalVerdict[];
  fired: SkillPolicyRuleRef[];
  ceiling: number;
  ceilingCodes: Set<SkillPolicyRuleCode>;
  conflicts: SkillPolicyConflict[];
  withheld: number;
  withheldReasons: string[];
  urgentReasons: string[];
  safeNextStep: string | null;
  mandatedRunStatus: SkillRunStatus;
  allowedEvidenceIds: string[];
  allowedHypothesisIds: string[];
  allowedFollowUpIds: string[];
  withheldTextPaths: string[];
}

function finalize(input: FinalizeInput): SkillPolicyDecision {
  const orderedOutcomes = SKILL_POLICY_OUTCOMES.filter((o) => input.outcomes.has(o));
  const allowedVerdicts = input.verdicts.filter((v) => v.verdict === "allow");
  const allowed = allowedVerdicts.map((v) => v.proposalId).sort(compareIds);
  // An allowed proposal that declares `none` is informational by contract.
  // Advertising manual eligibility because SOME proposal survived would
  // upgrade it into an action the contract says it is not.
  const anyActionable = allowedVerdicts.some((v) => v.executionCapability === "manual_only");

  return {
    decisionVersion: SKILL_POLICY_DECISION_VERSION,
    manifestKey: input.manifestKey,
    runId: input.runId,
    outcomes: orderedOutcomes,
    primaryOutcome: derivePrimaryOutcome(orderedOutcomes),
    urgent: orderedOutcomes.includes("urgent_manual_attention"),
    urgentReasons: [...input.urgentReasons],
    informationRequired: orderedOutcomes.includes("request_more_information"),
    actionEligibility: anyActionable ? "low_risk_manual_only" : "none",
    proposalVerdicts: [...input.verdicts].sort((a, b) => compareIds(a.proposalId, b.proposalId)),
    allowedProposalIds: allowed,
    allowedEvidenceIds: [...input.allowedEvidenceIds].sort(compareIds),
    allowedHypothesisIds: [...input.allowedHypothesisIds].sort(compareIds),
    allowedFollowUpIds: [...input.allowedFollowUpIds].sort(compareIds),
    withheldTextPaths: [...input.withheldTextPaths].sort(compareIds),
    confidenceCeiling: input.ceiling,
    confidenceCeilingImposedBy: SKILL_POLICY_RULE_CODES.filter((c) => input.ceilingCodes.has(c)),
    conflictsToShow: [...input.conflicts].sort((a, b) => {
      const ch = compareIds(a.channel, b.channel);
      return ch !== 0 ? ch : compareIds(a.subject, b.subject);
    }),
    conflictsWithheld: input.withheld,
    conflictWithheldReasons: [...input.withheldReasons].sort(compareIds),
    firedRules: input.fired,
    safeNextStep: input.safeNextStep,
    mandatedRunStatus: input.mandatedRunStatus,
    withheldProposalCount: input.verdicts.filter((v) => v.verdict === "block").length,
  };
}
