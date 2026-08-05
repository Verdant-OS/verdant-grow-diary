/**
 * verdantSkillTypes — canonical domain contracts for Verdant Skill Runtime v1.
 *
 * Engine-only: no UI, no Supabase, no fetch, no model calls, no Action Queue
 * writes. Pure types and constants; runtime validation lives in
 * `verdantSkillSchemas.ts`.
 *
 * Reuse doctrine (do not duplicate AI Doctor contracts): every vocabulary here
 * is either imported from its owning module or pinned to the owning module's
 * TYPE with `satisfies`, so drift breaks typecheck instead of silently forking.
 * The AI Doctor result/context/confidence shapes themselves are referenced,
 * never re-declared.
 *
 * Safety posture:
 *  - Proposals are advisory records only — never an executable device command.
 *    `executionCapability` is a closed two-value vocabulary with no member that
 *    could describe hardware execution, so device execution is unrepresentable.
 *  - Final (system) confidence is never model-supplied: `SkillConfidenceResult`
 *    has no input-facing schema; its system leg is constructible only via
 *    `deriveVerdantSkillConfidence` in verdantSkillSchemas.ts.
 *  - The requesting user reference is carried for attribution/telemetry only.
 *    It is never an authorization input — ownership is always re-derived
 *    server-side via auth.uid() + RLS.
 */
import type { RiskLevel } from "@/lib/ai/types";
import type { Phase1RiskLevel } from "@/lib/aiDoctorEngine";
import type { AiDoctorMetricKey } from "@/lib/aiDoctorEnginePhase1Foundation";
import type { AiSensorSnapshotTrust } from "@/lib/aiSensorSnapshotContextRules";
import type {
  AiContextConfidenceCeiling,
  AiContextSufficiency,
} from "@/lib/aiContextSufficiencyRules";
import type { AiDoctorContextReadiness } from "@/lib/aiDoctorContextRules";
import type { PlantContextPayload } from "@/lib/aiDoctorContextCompiler";
import type {
  AiDoctorConfidenceLevel,
  AiDoctorConfidenceResult,
} from "@/lib/aiDoctorConfidenceAdapter";
import type { HarmonizedConfidence } from "@/lib/aiDoctorConfidenceRules";
import type { ActionStatus } from "@/lib/actionQueueTransitions";
import type { ActionFollowUpOutcome } from "@/lib/actionFollowUpEvidenceRules";
import { AI_DOCTOR_FOLLOWUP_DEFAULT_HOURS } from "@/lib/aiDoctorFollowUpRules";
import type { CanonicalSensorSource } from "@/constants/sensorIngestProvenance";

// ---------------------------------------------------------------------------
// Version constants. Parsers hard-reject other versions — no silent migration.
// Precedent: AI_DOCTOR_OUTPUT_CONTRACT_VERSION tag + numeric schemaVersion.
// ---------------------------------------------------------------------------

export const VERDANT_SKILL_RUNTIME_CONTRACT_VERSION = "verdant-skill-runtime/v1" as const;
export const VERDANT_SKILL_ENVELOPE_SCHEMA_VERSION = 1 as const;

/** Distinct from the AI-Doctor-owned "ai_doctor_follow_up" event type. */
export const VERDANT_SKILL_FOLLOWUP_EVENT_TYPE = "verdant_skill_follow_up" as const;

/** The skill runtime keeps the same default follow-up cadence as AI Doctor —
 * imported, not re-declared, so the two can never drift silently. */
export const VERDANT_SKILL_FOLLOWUP_DEFAULT_HOURS = AI_DOCTOR_FOLLOWUP_DEFAULT_HOURS;

/** Skill versions are string tags like "leaf-triage/v1" (no semver objects —
 * the repo's domain code has zero semver precedent). */
export const VERDANT_SKILL_VERSION_PATTERN = /^[a-z0-9][a-z0-9-]*\/v\d+$/;

/**
 * SkillVersion is a documented string tag matching
 * {@link VERDANT_SKILL_VERSION_PATTERN}; validation happens at the zod
 * boundary (`SkillVersionSchema`).
 */
export type SkillVersion = string;

// ---------------------------------------------------------------------------
// V1 execution capability — device execution is UNREPRESENTABLE.
// There is no vocabulary member that could describe hardware execution; the
// closed enum plus the literal-field lattice on SkillActionProposal keeps the
// whole contract advisory-only. Precedent: DoctorActionSuggestion's literal
// `actionType: "advisory"` / `status: "pending_approval"` fields.
// ---------------------------------------------------------------------------

export const SKILL_EXECUTION_CAPABILITIES = ["none", "manual_only"] as const;
export type SkillExecutionCapability = (typeof SKILL_EXECUTION_CAPABILITIES)[number];

// ---------------------------------------------------------------------------
// Vocabulary tuples pinned to their owning modules' types. Where the owning
// module exports a widened `readonly T[]`, we declare a local tuple pinned
// with `satisfies` plus an exhaustiveness assertion so vocabulary drift breaks
// the typecheck.
// ---------------------------------------------------------------------------

/** Action-proposal risk vocabulary — the Action Queue scale (src/lib/ai/types). */
export const SKILL_RISK_LEVELS = [
  "low",
  "medium",
  "high",
  "critical",
] as const satisfies readonly RiskLevel[];
type _RiskExhaustive = RiskLevel extends (typeof SKILL_RISK_LEVELS)[number] ? true : never;
const _riskExhaustive: _RiskExhaustive = true;
void _riskExhaustive;

/** Hypothesis-side risk vocabulary — the diagnosis scale (Phase1RiskLevel). */
export const SKILL_HYPOTHESIS_RISK_LEVELS = [
  "low",
  "medium",
  "high",
] as const satisfies readonly Phase1RiskLevel[];
type _HypRiskExhaustive = Phase1RiskLevel extends (typeof SKILL_HYPOTHESIS_RISK_LEVELS)[number]
  ? true
  : never;
const _hypRiskExhaustive: _HypRiskExhaustive = true;
void _hypRiskExhaustive;

export const SKILL_TRUST_LEVELS = [
  "low",
  "medium",
  "high",
] as const satisfies readonly AiSensorSnapshotTrust[];
type _TrustExhaustive = AiSensorSnapshotTrust extends (typeof SKILL_TRUST_LEVELS)[number]
  ? true
  : never;
const _trustExhaustive: _TrustExhaustive = true;
void _trustExhaustive;

export const SKILL_CONFIDENCE_CEILINGS = [
  "high",
  "medium",
  "low",
] as const satisfies readonly AiContextConfidenceCeiling[];
type _CeilingExhaustive =
  AiContextConfidenceCeiling extends (typeof SKILL_CONFIDENCE_CEILINGS)[number] ? true : never;
const _ceilingExhaustive: _CeilingExhaustive = true;
void _ceilingExhaustive;

export const SKILL_CONTEXT_READINESS = [
  "strong",
  "partial",
  "insufficient",
] as const satisfies readonly AiDoctorContextReadiness[];
type _ReadinessExhaustive =
  AiDoctorContextReadiness extends (typeof SKILL_CONTEXT_READINESS)[number] ? true : never;
const _readinessExhaustive: _ReadinessExhaustive = true;
void _readinessExhaustive;

/** Envelope-level input completeness reuses the context-sufficiency vocabulary. */
export const SKILL_INPUT_COMPLETENESS = [
  "sufficient",
  "limited",
  "insufficient",
] as const satisfies readonly AiContextSufficiency[];
type _CompletenessExhaustive =
  AiContextSufficiency extends (typeof SKILL_INPUT_COMPLETENESS)[number] ? true : never;
const _completenessExhaustive: _CompletenessExhaustive = true;
void _completenessExhaustive;

/** Evidence-confidence levels — the 4-value adapter vocabulary, NOT the
 * 3-value foundation one. */
export const SKILL_EVIDENCE_CONFIDENCE_LEVELS = [
  "very_low",
  "low",
  "medium",
  "high",
] as const satisfies readonly AiDoctorConfidenceLevel[];
type _EvConfExhaustive =
  AiDoctorConfidenceLevel extends (typeof SKILL_EVIDENCE_CONFIDENCE_LEVELS)[number] ? true : never;
const _evConfExhaustive: _EvConfExhaustive = true;
void _evConfExhaustive;

export const SKILL_FOLLOWUP_OUTCOMES = [
  "improved",
  "unchanged",
  "declined",
  "too_soon",
  "unclear",
] as const satisfies readonly ActionFollowUpOutcome[];
type _OutcomeExhaustive = ActionFollowUpOutcome extends (typeof SKILL_FOLLOWUP_OUTCOMES)[number]
  ? true
  : never;
const _outcomeExhaustive: _OutcomeExhaustive = true;
void _outcomeExhaustive;

export const SKILL_METRIC_KEYS = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "soil_ec_ms_cm",
  "ppfd_umol",
  "reservoir_ph",
  "reservoir_ec_ms_cm",
] as const satisfies readonly AiDoctorMetricKey[];
type _MetricExhaustive = AiDoctorMetricKey extends (typeof SKILL_METRIC_KEYS)[number]
  ? true
  : never;
const _metricExhaustive: _MetricExhaustive = true;
void _metricExhaustive;

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/** New runtime vocabulary — no runtime evidence-kind vocab exists in the repo
 * (CitationKind is UI/DOM-anchored and deliberately not reused). */
export const SKILL_EVIDENCE_KINDS = [
  "sensor_metric",
  "timeline_event",
  "manual_observation",
  "csv_history",
  "visual",
  "missing_information",
] as const;
export type SkillEvidenceKind = (typeof SKILL_EVIDENCE_KINDS)[number];

/** Deliberately disjoint from the UI DOM anchors (evidence-envcheck-*,
 * evidence-missing-*) so runtime ids can never be confused with DOM ids. */
export const SKILL_EVIDENCE_ID_PATTERN = /^skill-evidence-[a-z0-9][a-z0-9-]*$/;

export interface EvidenceRecord {
  /** Matches {@link SKILL_EVIDENCE_ID_PATTERN}. */
  readonly id: string;
  readonly kind: SkillEvidenceKind;
  /** 1..512 chars; must not contain secret-like values. */
  readonly summary: string;
  /** Canonical sensor-source label, or explicit null for non-sensor evidence
   * (timeline/visual). Never defaulted — an unknown source stays unknown. */
  readonly source: CanonicalSensorSource | null;
  readonly trust: AiSensorSnapshotTrust;
  readonly stale: boolean;
  /** Metric key, or explicit null when the evidence is not metric-linked. */
  readonly metric: AiDoctorMetricKey | null;
  readonly value: number | null;
  readonly unit: string | null;
  /** RFC3339 timestamp, or explicit null when the observation time is unknown. */
  readonly observedAt: string | null;
}

// ---------------------------------------------------------------------------
// Plant context bundle — composes the canonical compiler payload; it never
// re-declares or forks it.
// ---------------------------------------------------------------------------

export interface PlantContextBundle {
  /** The canonical compiled context (owned by aiDoctorContextCompiler).
   * Deep validation is the compiler's job; the bundle only asserts shape at
   * the plain-object level. */
  readonly contextPayload: PlantContextPayload;
  readonly readiness: AiDoctorContextReadiness;
  readonly sufficiency: AiContextSufficiency;
  /** Feeds the system-confidence fence in deriveVerdantSkillConfidence. */
  readonly confidenceCeiling: AiContextConfidenceCeiling;
  /** Completeness short-codes, sorted, max 32. */
  readonly missing: readonly string[];
  /** Canonical source labels present in the context, sorted, deduplicated. */
  readonly sourceTags: readonly CanonicalSensorSource[];
  /** True ONLY for fresh validated telemetry (source label "live" AND not
   * stale). Every other source or quality keeps its label and never counts. */
  readonly hasFreshLiveTelemetry: boolean;
  readonly compiledAt: string;
}

// ---------------------------------------------------------------------------
// Input envelope
// ---------------------------------------------------------------------------

/** Per-source record counts summarizing where the envelope's data came from. */
export interface SkillSourceCount {
  readonly source: CanonicalSensorSource;
  readonly count: number;
}

export interface VerdantSkillInputEnvelope {
  readonly schemaVersion: typeof VERDANT_SKILL_ENVELOPE_SCHEMA_VERSION;
  readonly contractVersion: typeof VERDANT_SKILL_RUNTIME_CONTRACT_VERSION;
  /** Slug id of the skill being invoked, e.g. "leaf-triage". */
  readonly skillId: string;
  readonly skillVersion: SkillVersion;
  /** UUID of this individual run. */
  readonly runId: string;
  readonly requestedAt: string;
  /** Requesting user/account reference — attribution and telemetry ONLY.
   * Never an authorization input; ownership is re-derived via auth.uid()+RLS. */
  readonly requestedBy: string;
  readonly growId: string;
  /** Explicit null when the run is not tent-scoped. Absent input normalizes
   * to null; an explicit null is preserved as null. */
  readonly tentId: string | null;
  /** Explicit null when the run is not plant-scoped. */
  readonly plantId: string | null;
  /** Version of the compiled context the bundle was built from (>= 1). */
  readonly contextVersion: number;
  readonly context: PlantContextBundle;
  readonly evidence: readonly EvidenceRecord[];
  /** Per-source counts, sorted by source label, unique per source. */
  readonly sourceSummary: readonly SkillSourceCount[];
  readonly inputCompleteness: AiContextSufficiency;
  /** Sorted provenance/freshness warnings surfaced to the skill, max 32. */
  readonly provenanceWarnings: readonly string[];
  /** Feature/runtime flags — boolean-only by contract so flags can never
   * smuggle payloads. Keys are slugs, max 32 entries. */
  readonly flags: Readonly<Record<string, boolean>>;
}

// ---------------------------------------------------------------------------
// Hypothesis
// ---------------------------------------------------------------------------

export interface SkillHypothesis {
  /** Slug id, unique within the run. */
  readonly id: string;
  readonly statement: string;
  readonly likelyIssue: string;
  /** Diagnosis-scale risk (low|medium|high) — deliberately NOT the 4-value
   * proposal vocabulary. */
  readonly riskLevel: Phase1RiskLevel;
  /** Sorted ids resolving against the run's sibling evidence records. */
  readonly evidenceIds: readonly string[];
  readonly missingInformation: readonly string[];
  /** RAW self-reported model confidence in [0,1]. The ONLY confidence a model
   * may supply anywhere in this contract family. Internal/debug only. */
  readonly modelConfidence: number;
}

// ---------------------------------------------------------------------------
// Confidence — three legs, kept separate. The system leg is never
// model-supplied: it is constructible only via deriveVerdantSkillConfidence.
// ---------------------------------------------------------------------------

export interface SkillConfidenceResult {
  /** Model leg: raw clamped [0,1] self-report. Debug only, never displayed. */
  readonly model: { readonly rawConfidence: number };
  /** Evidence leg: computed deterministically from context source quality by
   * calculateAiDoctorConfidence — model confidence is never an input to it. */
  readonly evidence: AiDoctorConfidenceResult;
  /** System leg: produced ONLY by deriveVerdantSkillConfidence via the
   * imported harmonize fence (downgrade-only ceiling cap). */
  readonly system: HarmonizedConfidence;
}

// ---------------------------------------------------------------------------
// Action proposal — advisory record only; never an executable device command.
// ---------------------------------------------------------------------------

/** Mirrors the values of the module-private ALLOWED_ACTION_TYPES in
 * aiDoctorSessionToActionQueueRules (that const is not exported). */
export const SKILL_PROPOSAL_ACTION_TYPES = ["task", "alert", "note", "advisory"] as const;
export type SkillProposalActionType = (typeof SKILL_PROPOSAL_ACTION_TYPES)[number];

/** Dedupe/back-pointer token, e.g. "[skill:leaf-triage]". */
export const SKILL_PROPOSAL_BACK_POINTER_PATTERN = /^\[skill:[a-z0-9][a-z0-9-]*\]$/;

/** Follow-up interval bounds (hours): at least 1 hour, at most 30 days. */
export const SKILL_PROPOSAL_MIN_FOLLOWUP_HOURS = 1;
export const SKILL_PROPOSAL_MAX_FOLLOWUP_HOURS = 24 * 30;

export interface SkillActionProposal {
  readonly actionType: SkillProposalActionType;
  /** Literal: proposals always require grower approval before anything acts. */
  readonly status: "pending_approval";
  readonly approvalRequired: true;
  /** Closed two-value vocabulary — see SKILL_EXECUTION_CAPABILITIES. */
  readonly executionCapability: SkillExecutionCapability;
  readonly riskLevel: RiskLevel;
  /** The proposed action, 1..120 chars. */
  readonly title: string;
  /** What would change, 1..512 chars. */
  readonly suggestedChange: string;
  /** Why it is proposed, 1..512 chars. */
  readonly reason: string;
  /** Sorted evidence ids supporting this proposal. */
  readonly evidenceIds: readonly string[];
  /** What is unknown and would strengthen or cancel the proposal. */
  readonly missingInformation: readonly string[];
  /** What the grower should expect to observe if the proposal is right. */
  readonly expectedResponse: string;
  /** Hours until the outcome should be checked. */
  readonly followUpIntervalHours: number;
  /** Conditions under which the proposal should be withdrawn, min 1 entry. */
  readonly cancellationConditions: readonly string[];
  /** Literal fence: proposals never target a writable metric channel. */
  readonly targetMetric: "general";
  readonly source: "skill_runtime";
  readonly backPointer: string;
}

// ---------------------------------------------------------------------------
// Follow-up
// ---------------------------------------------------------------------------

export interface SkillOutcomeFollowUp {
  /** Deterministic: verdant_skill_follow_up::s:<skillId>|r:<runId>|p:<plantId|none> */
  readonly idempotencyKey: string;
  readonly eventType: typeof VERDANT_SKILL_FOLLOWUP_EVENT_TYPE;
  readonly title: string;
  readonly body: string;
  readonly dueAt: string;
  readonly checklist: readonly string[];
  /** Explicit null until the grower records what they observed. NEVER inferred
   * by the engine — grower-observed outcomes only. */
  readonly outcome: ActionFollowUpOutcome | null;
  readonly note: string | null;
  readonly observedAt: string | null;
  /** Durable reference only — transient signed/inline refs are rejected. */
  readonly photoReference: string | null;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export const SKILL_ERROR_CODES = [
  "invalid_envelope",
  "unsupported_schema_version",
  "unsupported_contract_version",
  "unsupported_skill_version",
  "invalid_context_bundle",
  "invalid_model_output",
  "banned_language",
  "device_control_language",
  "confidence_field_rejected",
  "over_cap",
  "missing_required_field",
  "idempotency_conflict",
  "insufficient_context",
] as const;
export type SkillErrorCode = (typeof SKILL_ERROR_CODES)[number];

/** Data shape, never an Error subclass — pure-rules doctrine. */
export interface SkillError {
  readonly code: SkillErrorCode;
  readonly message: string;
  /** Dotted field path, or null when not field-specific. */
  readonly field: string | null;
  /** Sorted issue strings, max 32. */
  readonly issues: readonly string[];
}

// ---------------------------------------------------------------------------
// Run result — hand-written discriminated union (repo convention).
// ---------------------------------------------------------------------------

export interface SkillRunSuccess {
  readonly ok: true;
  readonly contractVersion: typeof VERDANT_SKILL_RUNTIME_CONTRACT_VERSION;
  readonly skillId: string;
  readonly skillVersion: SkillVersion;
  readonly runId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly hypotheses: readonly SkillHypothesis[];
  readonly evidence: readonly EvidenceRecord[];
  readonly confidence: SkillConfidenceResult;
  readonly proposals: readonly SkillActionProposal[];
  /** Explicit null means the skill judged no follow-up warranted. */
  readonly followUp: SkillOutcomeFollowUp | null;
  /** Sorted, max 32. */
  readonly warnings: readonly string[];
}

export type SkillRunResult = SkillRunSuccess | { readonly ok: false; readonly error: SkillError };

// Pin the proposal status literal to the Action Queue vocabulary so a queue
// vocabulary change breaks this module's typecheck.
type _StatusPinned = SkillActionProposal["status"] extends ActionStatus ? true : never;
const _statusPinned: _StatusPinned = true;
void _statusPinned;
