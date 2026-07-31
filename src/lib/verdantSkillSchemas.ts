/**
 * verdantSkillSchemas — canonical runtime contracts for Verdant Skill
 * Runtime v1.
 *
 * This is THE contract family every cultivation skill speaks. Later
 * runtime components import these schemas/types instead of defining
 * local copies.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no model/API calls, no Action
 *    Queue writes.
 *  - Hardware execution is unrepresentable in V1: `executionCapability`
 *    only admits "none" | "manual_only", and every proposal is
 *    approval-required. There is no field a device controller could read.
 *  - Final system confidence is never supplied directly by a model: the
 *    schema rejects any `SkillConfidenceResult` whose `systemConfidence`
 *    does not equal `deriveSystemConfidence(model, evidence)`.
 *  - Sensor source labels are the canonical six (live / manual / csv /
 *    demo / stale / invalid). Unknown or legacy labels ("imported",
 *    "sim", vendor names) are rejected, never laundered — callers map
 *    at their own boundary, deliberately.
 *  - Unknown object keys are stripped silently (Zod default mode), so
 *    secret-shaped keys can never ride through a contract. Free-form
 *    records (`flags`, error `details`) additionally drop entries whose
 *    key matches the sensitive-key token list — after normalizing
 *    camelCase / hyphen / dot key spellings to snake_case — and entries
 *    whose string value looks like a credential.
 *  - Serialization is deterministic: sorted object keys, arrays in
 *    order — same parsed value, same bytes.
 *
 * Relationship to existing contracts:
 *  - `RiskLevel` and `PlantStage` are REUSED from `@/lib/ai/types`
 *    (compile-time asserted below) — one risk vocabulary, one stage
 *    vocabulary.
 *  - The AI Doctor keeps its own review wire contract
 *    (`aiDoctorReviewResultContract`). `SkillRunResult` is the skill
 *    runtime's result shape, not a replacement for it.
 */

import { z } from "zod";
import type { PlantStage, RiskLevel } from "@/lib/ai/types";

// ---------------------------------------------------------------------------
// Contract version + shared vocabularies
// ---------------------------------------------------------------------------

/** Version stamped on every top-level contract payload. */
export const SKILL_CONTRACT_VERSION = "1.0.0";

/** Canonical sensor source labels. Deny-by-default: anything else rejects. */
export const SKILL_SENSOR_SOURCE_LABELS = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;
export type SkillSensorSourceLabel = (typeof SKILL_SENSOR_SOURCE_LABELS)[number];

/** Reading quality labels (mirrors the sensor trust layer). */
export const SKILL_READING_QUALITY_LABELS = ["ok", "stale", "invalid", "unknown"] as const;
export type SkillReadingQuality = (typeof SKILL_READING_QUALITY_LABELS)[number];

/** Risk vocabulary — must stay identical to the AI Doctor's `RiskLevel`. */
export const SKILL_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type SkillRiskLevel = (typeof SKILL_RISK_LEVELS)[number];

/** Plant stage vocabulary — must stay identical to `PlantStage`. */
export const SKILL_PLANT_STAGES = [
  "seedling",
  "veg",
  "flower",
  "late_flower",
  "harvest",
  "drying",
  "curing",
  "unknown",
] as const;
export type SkillPlantStage = (typeof SKILL_PLANT_STAGES)[number];

/**
 * V1 execution capability. "none" = informational only; "manual_only" =
 * the grower may act by hand after approving. No other value exists, so
 * hardware execution cannot even be represented in the contract.
 */
export const SKILL_EXECUTION_CAPABILITIES = ["none", "manual_only"] as const;
export type SkillExecutionCapability = (typeof SKILL_EXECUTION_CAPABILITIES)[number];

/** V1 proposals are always approval-required. */
export const SKILL_APPROVAL_REQUIREMENT = "approval_required" as const;

/** How `systemConfidence` is derived in V1. */
export const SKILL_CONFIDENCE_DERIVATION = "min_model_evidence_v1" as const;

export const SKILL_INPUT_COMPLETENESS_LEVELS = ["complete", "partial", "insufficient"] as const;
export type SkillInputCompleteness = (typeof SKILL_INPUT_COMPLETENESS_LEVELS)[number];

export const SKILL_RUN_STATUSES = ["ok", "insufficient_context", "error"] as const;
export type SkillRunStatus = (typeof SKILL_RUN_STATUSES)[number];

export const SKILL_ERROR_CODES = [
  "invalid_input",
  "insufficient_context",
  "upstream_unavailable",
  "contract_violation",
  "internal",
] as const;
export type SkillErrorCode = (typeof SKILL_ERROR_CODES)[number];

export const SKILL_EVIDENCE_KINDS = [
  "sensor_reading",
  "diary_entry",
  "photo",
  "manual_note",
  "derived_metric",
] as const;
export type SkillEvidenceKind = (typeof SKILL_EVIDENCE_KINDS)[number];

export const SKILL_FOLLOW_UP_STATUSES = ["pending", "recorded", "cancelled"] as const;
export type SkillFollowUpStatus = (typeof SKILL_FOLLOW_UP_STATUSES)[number];

export const SKILL_FOLLOW_UP_OUTCOMES = [
  "improved",
  "unchanged",
  "worsened",
  "not_checked",
] as const;
export type SkillFollowUpOutcome = (typeof SKILL_FOLLOW_UP_OUTCOMES)[number];

/** Collection / text caps shared across the contract family. */
export const SKILL_CONTRACT_LIMITS = Object.freeze({
  textMax: 2000,
  idMax: 128,
  textItemsMax: 32,
  sourceSummaryMax: 16,
  flagsMax: 32,
  evidenceMax: 64,
  hypothesesMax: 12,
  proposalsMax: 8,
  followUpsMax: 16,
  followUpIntervalHoursMax: 720,
});

// Compile-time locks: the skill vocabularies must equal the existing AI
// contract vocabularies. If `@/lib/ai/types` drifts, this file fails to
// typecheck instead of silently forking the vocabulary.
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _riskLevelStaysCanonical: AssertEqual<SkillRiskLevel, RiskLevel> = true;
const _plantStageStaysCanonical: AssertEqual<SkillPlantStage, PlantStage> = true;
void _riskLevelStaysCanonical;
void _plantStageStaysCanonical;

// ---------------------------------------------------------------------------
// Shared field schemas
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

/** Opaque id token (evidence ids, proposal ids, …). */
const idTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(SKILL_CONTRACT_LIMITS.idMax)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "id_token_shape");

/** Skill identifier: lowercase kebab/snake, e.g. "nutrient-triage". */
const skillIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_-]{1,63}$/, "skill_id_shape");

/** Semver core, e.g. "1.4.0". */
export const skillVersionSchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "skill_version_shape");
export type SkillVersion = z.infer<typeof skillVersionSchema>;

/**
 * Strict ISO-8601 timestamp with timezone. Zod's datetime check gates the
 * shape; the extra refine rejects impossible calendar dates (e.g. Feb 30),
 * which the shape regex alone would let through.
 */
const isoTimestampSchema = z
  .string()
  .max(64)
  .datetime({ offset: true })
  .refine((v) => !Number.isNaN(Date.parse(v)), "timestamp_not_a_real_date");

const contractTextSchema = z.string().trim().min(1).max(SKILL_CONTRACT_LIMITS.textMax);

const contractTextListSchema = z.array(contractTextSchema).max(SKILL_CONTRACT_LIMITS.textItemsMax);

const idTokenListSchema = z.array(idTokenSchema).max(SKILL_CONTRACT_LIMITS.textItemsMax);

const contractVersionSchema = z.literal(SKILL_CONTRACT_VERSION).default(SKILL_CONTRACT_VERSION);

const finiteNumberSchema = z.number().finite();
const unitIntervalSchema = z.number().finite().min(0).max(1);

const sensorSourceSchema = z.enum(SKILL_SENSOR_SOURCE_LABELS);
const readingQualitySchema = z.enum(SKILL_READING_QUALITY_LABELS);
const riskLevelSchema = z.enum(SKILL_RISK_LEVELS);

/**
 * Plant stage with the one sanctioned alias: plant rows historically use
 * "cure" where the canonical stage vocabulary says "curing". Everything
 * else must already be canonical.
 */
const plantStageSchema = z.preprocess(
  (v) => (v === "cure" ? "curing" : v),
  z.enum(SKILL_PLANT_STAGES),
);

/**
 * Key names that must never survive inside free-form records. Extends the
 * sensitive-key posture of `aiDoctorReviewResultContract`: because the
 * record key grammar here admits camelCase, hyphens, and dots, every key
 * is normalized to snake_case FIRST (camel humps and [-.] become
 * underscores) and the token match runs on the normalized form — so
 * "accessToken", "x-api-key", and "stripeSecretKey" are all stripped,
 * not just their snake_case spellings.
 */
const SENSITIVE_KEY_RE =
  /(^|_)(raw_payload|secret|secrets|token|tokens|api_key|apikey|access_key|service_role|password|passwd|passphrase|credential|credentials|authorization|bearer|jwt|private_key)(_|$)/;

function normalizeRecordKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .replace(/[-.]/g, "_")
    .toLowerCase();
}

/**
 * String values that look like credentials are dropped too, regardless of
 * key name — defense in depth for values pasted under a benign key. The
 * shapes covered: vendor secret-key prefixes, JWT-style base64 JSON, and
 * bearer-prefixed strings.
 */
const SENSITIVE_VALUE_RE = /^(sk|pk|rk)_(live|test)_|^eyJ[A-Za-z0-9_-]{8,}|^bearer\s/i;

function isSensitiveRecordEntry(key: string, value: unknown): boolean {
  if (SENSITIVE_KEY_RE.test(normalizeRecordKey(key))) return true;
  if (typeof value === "string" && SENSITIVE_VALUE_RE.test(value.trim())) {
    return true;
  }
  return false;
}

function stripSensitiveRecordKeys(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveRecordEntry(key, value)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

const flagKeySchema = z
  .string()
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9._-]*$/, "flag_key_shape");
const flagValueSchema = z.union([z.boolean(), z.string().max(200), z.number().finite()]);

/** Sanitized primitive record used for feature flags and error details. */
const sanitizedRecordSchema = z.preprocess(
  stripSensitiveRecordKeys,
  z
    .record(flagKeySchema, flagValueSchema)
    .refine((rec) => Object.keys(rec).length <= SKILL_CONTRACT_LIMITS.flagsMax, "record_over_cap"),
);

// ---------------------------------------------------------------------------
// 1. VerdantSkillInputEnvelope
// ---------------------------------------------------------------------------

const sourceSummaryEntrySchema = z.object({
  source: sensorSourceSchema,
  count: z.number().int().min(0),
});

const requestedBySchema = z.object({
  userId: uuidSchema,
  accountRef: idTokenSchema.nullish(),
});

export const verdantSkillInputEnvelopeSchema = z.object({
  contractVersion: contractVersionSchema,
  skillId: skillIdSchema,
  skillVersion: skillVersionSchema,
  runId: uuidSchema,
  requestedAt: isoTimestampSchema,
  growId: uuidSchema,
  /** Present when the run is tent-scoped; explicit null is preserved. */
  tentId: uuidSchema.nullish(),
  /** Present when the run is plant-scoped; explicit null is preserved. */
  plantId: uuidSchema.nullish(),
  requestedBy: requestedBySchema,
  /** Version tag of the context bundle build that fed this run. */
  contextVersion: idTokenSchema,
  /** Per-source reading counts that fed the context bundle. */
  sourceSummary: z
    .array(sourceSummaryEntrySchema)
    .max(SKILL_CONTRACT_LIMITS.sourceSummaryMax)
    .default([]),
  inputCompleteness: z.enum(SKILL_INPUT_COMPLETENESS_LEVELS),
  provenanceWarnings: contractTextListSchema.default([]),
  /** Feature / runtime flags. Secret-shaped keys are stripped, never kept. */
  flags: sanitizedRecordSchema.default({}),
});
export type VerdantSkillInputEnvelope = z.infer<typeof verdantSkillInputEnvelopeSchema>;

// ---------------------------------------------------------------------------
// 2. PlantContextBundle
// ---------------------------------------------------------------------------

const targetRangeSchema = z
  .object({ min: finiteNumberSchema, max: finiteNumberSchema })
  .refine((r) => r.min <= r.max, "target_range_inverted");

const skillSensorSnapshotSchema = z.object({
  capturedAt: isoTimestampSchema,
  source: sensorSourceSchema,
  quality: readingQualitySchema,
  temperatureC: finiteNumberSchema.nullish(),
  humidityPct: finiteNumberSchema.nullish(),
  vpdKpa: finiteNumberSchema.nullish(),
  co2Ppm: finiteNumberSchema.nullish(),
  soilMoisturePct: finiteNumberSchema.nullish(),
});
export type SkillSensorSnapshot = z.infer<typeof skillSensorSnapshotSchema>;

export const plantContextBundleSchema = z.object({
  contractVersion: contractVersionSchema,
  contextVersion: idTokenSchema,
  growId: uuidSchema,
  tentId: uuidSchema.nullish(),
  plantId: uuidSchema,
  /** Explicit null means "stage unknown to the compiler", kept as null. */
  stage: plantStageSchema.nullish(),
  strain: contractTextSchema.nullish(),
  /**
   * null = genuinely unknown, which is NOT the same as false —
   * autoflower-sensitive guidance must stay conservative on null.
   */
  isAutoflower: z.boolean().nullish(),
  ageDays: z.number().int().min(0).nullish(),
  medium: contractTextSchema.nullish(),
  potSize: contractTextSchema.nullish(),
  latestSnapshot: skillSensorSnapshotSchema.nullish(),
  recentDiaryEntryCount: z.number().int().min(0).default(0),
  notes: contractTextListSchema.default([]),
  targets: z
    .object({
      temperatureC: targetRangeSchema.nullish(),
      humidityPct: targetRangeSchema.nullish(),
      vpdKpa: targetRangeSchema.nullish(),
    })
    .nullish(),
});
export type PlantContextBundle = z.infer<typeof plantContextBundleSchema>;

// ---------------------------------------------------------------------------
// 3. EvidenceRecord
// ---------------------------------------------------------------------------

export const evidenceRecordSchema = z.object({
  evidenceId: idTokenSchema,
  kind: z.enum(SKILL_EVIDENCE_KINDS),
  observedAt: isoTimestampSchema,
  source: sensorSourceSchema,
  summary: contractTextSchema,
  detail: contractTextSchema.nullish(),
  metric: z
    .object({
      name: idTokenSchema,
      value: finiteNumberSchema,
      unit: z.string().trim().min(1).max(32).nullish(),
    })
    .nullish(),
  /** Pointer to the underlying row this evidence came from, if any. */
  entityRef: z.object({ entity: idTokenSchema, id: idTokenSchema }).nullish(),
});
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;

// ---------------------------------------------------------------------------
// 4. SkillHypothesis
// ---------------------------------------------------------------------------

export const skillHypothesisSchema = z.object({
  hypothesisId: idTokenSchema,
  statement: contractTextSchema,
  rationale: contractTextSchema,
  /** 1 = most likely. Ranking is a shortlist, not a verdict. */
  rank: z.number().int().min(1),
  supportingEvidenceIds: idTokenListSchema.default([]),
  conflictingEvidenceIds: idTokenListSchema.default([]),
});
export type SkillHypothesis = z.infer<typeof skillHypothesisSchema>;

// ---------------------------------------------------------------------------
// 5. SkillConfidenceResult
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * The ONLY sanctioned derivation of final system confidence in V1:
 * min(model, evidence), both clamped to [0, 1]. Sparse or low-trust
 * evidence therefore always caps whatever the model claimed.
 */
export function deriveSystemConfidence(
  modelConfidence: number,
  evidenceConfidence: number,
): number {
  return Math.min(clamp01(modelConfidence), clamp01(evidenceConfidence));
}

/** Construct a valid confidence result from the two independent inputs. */
export function buildSkillConfidenceResult(
  modelConfidence: number,
  evidenceConfidence: number,
): SkillConfidenceResult {
  const model = clamp01(modelConfidence);
  const evidence = clamp01(evidenceConfidence);
  return {
    modelConfidence: model,
    evidenceConfidence: evidence,
    systemConfidence: deriveSystemConfidence(model, evidence),
    derivation: SKILL_CONFIDENCE_DERIVATION,
  };
}

const CONFIDENCE_EPSILON = 1e-9;

export const skillConfidenceResultSchema = z
  .object({
    /** Self-reported by the model. Display/debug only, never final. */
    modelConfidence: unitIntervalSchema,
    /** Computed from evidence trust/coverage by the runtime, not the model. */
    evidenceConfidence: unitIntervalSchema,
    /** MUST equal deriveSystemConfidence(model, evidence). */
    systemConfidence: unitIntervalSchema,
    derivation: z.literal(SKILL_CONFIDENCE_DERIVATION),
  })
  .superRefine((c, ctx) => {
    const expected = deriveSystemConfidence(c.modelConfidence, c.evidenceConfidence);
    if (Math.abs(c.systemConfidence - expected) > CONFIDENCE_EPSILON) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["systemConfidence"],
        message: "system_confidence_not_derived_from_inputs",
      });
    }
  });
export type SkillConfidenceResult = z.infer<typeof skillConfidenceResultSchema>;

// ---------------------------------------------------------------------------
// 6. SkillActionProposal
// ---------------------------------------------------------------------------

export const skillActionProposalSchema = z.object({
  proposalId: idTokenSchema,
  /** Advisory text the grower reads and acts on by hand, if approved. */
  proposedAction: contractTextSchema,
  reason: contractTextSchema,
  riskLevel: riskLevelSchema,
  /** Evidence-first: a proposal with zero supporting evidence is invalid. */
  supportingEvidenceIds: idTokenListSchema.refine(
    (ids) => ids.length >= 1,
    "proposal_requires_evidence",
  ),
  missingInformation: contractTextListSchema.default([]),
  /** What the grower should observe if the action is working. */
  expectedResponse: contractTextSchema,
  followUpIntervalHours: z
    .number()
    .finite()
    .positive()
    .max(SKILL_CONTRACT_LIMITS.followUpIntervalHoursMax),
  /** Every proposal must say when to stop or reverse course. */
  cancellationConditions: contractTextListSchema.refine(
    (items) => items.length >= 1,
    "proposal_requires_cancellation_conditions",
  ),
  approvalRequirement: z.literal(SKILL_APPROVAL_REQUIREMENT),
  executionCapability: z.enum(SKILL_EXECUTION_CAPABILITIES),
});
export type SkillActionProposal = z.infer<typeof skillActionProposalSchema>;

// ---------------------------------------------------------------------------
// 8. SkillOutcomeFollowUp (defined before SkillRunResult, which embeds it)
// ---------------------------------------------------------------------------

export const skillOutcomeFollowUpSchema = z
  .object({
    followUpId: idTokenSchema,
    runId: uuidSchema,
    /** Proposal this follow-up checks on, when tied to one. */
    proposalId: idTokenSchema.nullish(),
    checkAfterHours: z
      .number()
      .finite()
      .positive()
      .max(SKILL_CONTRACT_LIMITS.followUpIntervalHoursMax),
    question: contractTextSchema,
    expectedObservation: contractTextSchema,
    status: z.enum(SKILL_FOLLOW_UP_STATUSES).default("pending"),
    recordedOutcome: z
      .object({
        observedAt: isoTimestampSchema,
        outcome: z.enum(SKILL_FOLLOW_UP_OUTCOMES),
        note: contractTextSchema.nullish(),
      })
      .nullish(),
  })
  .superRefine((f, ctx) => {
    if (f.status === "recorded" && f.recordedOutcome == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recordedOutcome"],
        message: "recorded_status_requires_outcome",
      });
    }
    if (f.status === "pending" && f.recordedOutcome != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recordedOutcome"],
        message: "pending_status_forbids_outcome",
      });
    }
  });
export type SkillOutcomeFollowUp = z.infer<typeof skillOutcomeFollowUpSchema>;

// ---------------------------------------------------------------------------
// 9. SkillError
// ---------------------------------------------------------------------------

export const skillErrorSchema = z.object({
  code: z.enum(SKILL_ERROR_CODES),
  message: contractTextSchema,
  retryable: z.boolean(),
  occurredAt: isoTimestampSchema,
  /** Free-form diagnostics. Secret-shaped keys are stripped, never kept. */
  details: sanitizedRecordSchema.nullish(),
});
export type SkillError = z.infer<typeof skillErrorSchema>;

// ---------------------------------------------------------------------------
// 7. SkillRunResult — the one canonical result shape
// ---------------------------------------------------------------------------

export const skillRunResultSchema = z
  .object({
    contractVersion: contractVersionSchema,
    runId: uuidSchema,
    skillId: skillIdSchema,
    skillVersion: skillVersionSchema,
    status: z.enum(SKILL_RUN_STATUSES),
    startedAt: isoTimestampSchema,
    completedAt: isoTimestampSchema,
    contextVersion: idTokenSchema,
    evidence: z.array(evidenceRecordSchema).max(SKILL_CONTRACT_LIMITS.evidenceMax).default([]),
    hypotheses: z.array(skillHypothesisSchema).max(SKILL_CONTRACT_LIMITS.hypothesesMax).default([]),
    confidence: skillConfidenceResultSchema.nullish(),
    proposals: z
      .array(skillActionProposalSchema)
      .max(SKILL_CONTRACT_LIMITS.proposalsMax)
      .default([]),
    followUps: z
      .array(skillOutcomeFollowUpSchema)
      .max(SKILL_CONTRACT_LIMITS.followUpsMax)
      .default([]),
    error: skillErrorSchema.nullish(),
  })
  .superRefine((r, ctx) => {
    if (Date.parse(r.completedAt) < Date.parse(r.startedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completedAt"],
        message: "completed_before_started",
      });
    }
    if (r.status === "error" && r.error == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "error_status_requires_error",
      });
    }
    if (r.status !== "error" && r.error != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "error_forbidden_unless_error_status",
      });
    }
    if (r.status === "ok" && r.confidence == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confidence"],
        message: "ok_status_requires_confidence",
      });
    }
    if (r.status !== "ok" && r.proposals.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proposals"],
        message: "proposals_require_ok_status",
      });
    }
    // Referential integrity: every evidence id referenced anywhere must
    // exist in this result's evidence list. Citations must be real.
    const knownIds = new Set(r.evidence.map((e) => e.evidenceId));
    const checkIds = (ids: readonly string[], path: (string | number)[]): void => {
      ids.forEach((id, i) => {
        if (!knownIds.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, i],
            message: "unknown_evidence_id",
          });
        }
      });
    };
    r.hypotheses.forEach((h, i) => {
      checkIds(h.supportingEvidenceIds, ["hypotheses", i, "supportingEvidenceIds"]);
      checkIds(h.conflictingEvidenceIds, ["hypotheses", i, "conflictingEvidenceIds"]);
    });
    r.proposals.forEach((p, i) => {
      checkIds(p.supportingEvidenceIds, ["proposals", i, "supportingEvidenceIds"]);
    });
    r.followUps.forEach((f, i) => {
      if (f.runId !== r.runId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["followUps", i, "runId"],
          message: "follow_up_run_id_mismatch",
        });
      }
      if (f.proposalId != null && !r.proposals.some((p) => p.proposalId === f.proposalId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["followUps", i, "proposalId"],
          message: "unknown_proposal_id",
        });
      }
    });
  });
export type SkillRunResult = z.infer<typeof skillRunResultSchema>;

// ---------------------------------------------------------------------------
// Parse helpers — repo-idiomatic ok-union results
// ---------------------------------------------------------------------------

export type SkillContractParse<T> = { ok: true; value: T } | { ok: false; issues: string[] };

function toParseResult<T>(parsed: z.SafeParseReturnType<unknown, T>): SkillContractParse<T> {
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .map((i) => `${i.path.length > 0 ? i.path.join(".") : "$"}: ${i.message}`)
    .sort();
  return { ok: false, issues };
}

export function parseVerdantSkillInputEnvelope(
  input: unknown,
): SkillContractParse<VerdantSkillInputEnvelope> {
  return toParseResult(verdantSkillInputEnvelopeSchema.safeParse(input));
}

export function parsePlantContextBundle(input: unknown): SkillContractParse<PlantContextBundle> {
  return toParseResult(plantContextBundleSchema.safeParse(input));
}

export function parseEvidenceRecord(input: unknown): SkillContractParse<EvidenceRecord> {
  return toParseResult(evidenceRecordSchema.safeParse(input));
}

export function parseSkillHypothesis(input: unknown): SkillContractParse<SkillHypothesis> {
  return toParseResult(skillHypothesisSchema.safeParse(input));
}

export function parseSkillConfidenceResult(
  input: unknown,
): SkillContractParse<SkillConfidenceResult> {
  return toParseResult(skillConfidenceResultSchema.safeParse(input));
}

export function parseSkillActionProposal(input: unknown): SkillContractParse<SkillActionProposal> {
  return toParseResult(skillActionProposalSchema.safeParse(input));
}

export function parseSkillRunResult(input: unknown): SkillContractParse<SkillRunResult> {
  return toParseResult(skillRunResultSchema.safeParse(input));
}

export function parseSkillOutcomeFollowUp(
  input: unknown,
): SkillContractParse<SkillOutcomeFollowUp> {
  return toParseResult(skillOutcomeFollowUpSchema.safeParse(input));
}

export function parseSkillError(input: unknown): SkillContractParse<SkillError> {
  return toParseResult(skillErrorSchema.safeParse(input));
}

export function parseSkillVersion(input: unknown): SkillContractParse<SkillVersion> {
  return toParseResult(skillVersionSchema.safeParse(input));
}

// ---------------------------------------------------------------------------
// Deterministic serialization
// ---------------------------------------------------------------------------

function stableSerialize(value: unknown): string {
  if (value === undefined) return "null";
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(obj[k])}`).join(",")}}`;
  }
  throw new Error("serializeSkillContract: unsupported value type");
}

/**
 * Deterministic JSON serialization for any parsed contract value: object
 * keys sorted recursively, arrays kept in order, undefined-valued keys
 * omitted. Same parsed value always yields the same bytes.
 */
export function serializeSkillContract(value: unknown): string {
  return stableSerialize(value);
}
