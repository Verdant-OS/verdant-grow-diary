/**
 * verdantSkillSchemas — runtime validation for the Verdant Skill Runtime v1
 * contract family declared in `verdantSkillTypes.ts`.
 *
 * Engine-only. Pure: no React, no Supabase, no fetch, no Date.now() (clock is
 * injectable), no storage. Validators never throw and never mutate input;
 * results are rebuilt field-by-field (no aliasing) and deep-frozen.
 *
 * Boundary rules (all inherited from existing repo doctrine):
 *  - Sensitive-named keys (raw_payload / secrets / tokens / credentials …) are
 *    silently dropped at ANY depth before validation; other unknown keys are
 *    rejected by `.strict()`.
 *  - Oversize strings/arrays are REJECTED, never truncated.
 *  - Timestamps are re-serialized to canonical ISO so equal instants always
 *    serialize identically.
 *  - Prose fields reject overconfident vocabulary (AI_DOCTOR_REVIEW_BANNED_WORDS),
 *    device-control language (DEVICE_CONTROL_DETECTION_PATTERNS), and
 *    secret-like values (containsSecretLikeValue).
 *  - The system-confidence leg is never parsed from input: the only
 *    input-facing confidence schema is `VerdantSkillConfidenceInputSchema`
 *    ({ modelConfidence } strict), and `deriveVerdantSkillConfidence` computes
 *    the system leg through the imported downgrade-only harmonize fence.
 */
import { z } from "zod";
import {
  AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH,
  AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS,
  AI_DOCTOR_REVIEW_PACKET_MAX_ABSOLUTE_NUMBER,
} from "@/lib/aiDoctorReviewRequestPacketValidationRules";
import {
  AI_DOCTOR_REVIEW_ARRAY_CAP,
  AI_DOCTOR_REVIEW_BANNED_WORDS,
} from "@/lib/aiDoctorReviewResultContract";
import { DEVICE_CONTROL_DETECTION_PATTERNS } from "@/lib/aiDoctorSafetyRules";
import { LOW_CONFIDENCE_THRESHOLD, MAX_SUGGESTED_ACTIONS } from "@/lib/aiDoctorDiagnosisRules";
import {
  harmonizeDiagnosisConfidence,
  type HarmonizedConfidence,
} from "@/lib/aiDoctorConfidenceRules";
import type { AiDoctorConfidenceResult } from "@/lib/aiDoctorConfidenceAdapter";
import { AI_DOCTOR_READINESS_CONFIDENCE_CEILING } from "@/lib/aiDoctorOutputEvaluation";
import type { AiContextConfidenceCeiling } from "@/lib/aiContextSufficiencyRules";
import type { AiDoctorContextReadiness } from "@/lib/aiDoctorContextRules";
import type { PlantContextPayload } from "@/lib/aiDoctorContextCompiler";
import { CANONICAL_SENSOR_SOURCES } from "@/constants/sensorIngestProvenance";
import {
  ACTION_FOLLOWUP_OUTCOMES_REQUIRING_NOTE,
  type ActionFollowUpOutcome,
} from "@/lib/actionFollowUpEvidenceRules";
import { containsSecretLikeValue } from "@/lib/mcp/manifestView";
import { isUuid } from "@/lib/isUuid";
import {
  VERDANT_SKILL_RUNTIME_CONTRACT_VERSION,
  VERDANT_SKILL_ENVELOPE_SCHEMA_VERSION,
  VERDANT_SKILL_FOLLOWUP_EVENT_TYPE,
  VERDANT_SKILL_FOLLOWUP_DEFAULT_HOURS,
  VERDANT_SKILL_VERSION_PATTERN,
  SKILL_EXECUTION_CAPABILITIES,
  SKILL_RISK_LEVELS,
  SKILL_HYPOTHESIS_RISK_LEVELS,
  SKILL_TRUST_LEVELS,
  SKILL_CONFIDENCE_CEILINGS,
  SKILL_CONTEXT_READINESS,
  SKILL_INPUT_COMPLETENESS,
  SKILL_EVIDENCE_CONFIDENCE_LEVELS,
  SKILL_FOLLOWUP_OUTCOMES,
  SKILL_METRIC_KEYS,
  SKILL_EVIDENCE_KINDS,
  SKILL_EVIDENCE_ID_PATTERN,
  SKILL_PROPOSAL_ACTION_TYPES,
  SKILL_PROPOSAL_BACK_POINTER_PATTERN,
  SKILL_PROPOSAL_MIN_FOLLOWUP_HOURS,
  SKILL_PROPOSAL_MAX_FOLLOWUP_HOURS,
  SKILL_ERROR_CODES,
  type SkillError,
  type SkillErrorCode,
  type SkillConfidenceResult,
  type SkillOutcomeFollowUp,
  type SkillRunSuccess,
  type VerdantSkillInputEnvelope,
} from "@/lib/verdantSkillTypes";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Copy of the module-private RFC3339_PATTERN in actionQueueTransitions.ts
 * (not exported there); provenance kept so the two stay reconcilable. */
const VERDANT_SKILL_RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Mirrors the module-private SENSITIVE_KEY_RE in aiDoctorReviewResultContract
 * (not exported there) — byte-identical alternations. Keys matching this are
 * silently dropped at any depth BEFORE validation, so a secret-bearing key can
 * never survive a parse. */
const VERDANT_SKILL_SENSITIVE_KEY_RE =
  /(^|_)(raw_payload|secret|secrets|token|tokens|api_key|apikey|service_role|password|credential|credentials|bearer|jwt)(_|$)|^(raw_payload|secret|secrets|token|tokens|api_key|apikey|service_role|password|credential|credentials|bearer|jwt)$/i;

/** Prototype-pollution guard applied during the sensitive strip. */
const FORBIDDEN_PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Transient photo references are rejected — durable refs only. Mirrors the
 * module-private SIGNED_URL_PATTERNS in actionFollowUpEvidenceRules. */
const TRANSIENT_REFERENCE_PATTERNS: readonly RegExp[] = [
  /^https?:\/\//i,
  /^blob:/i,
  /^data:/i,
  /token=/i,
  /signature=/i,
];

const BANNED_WORDS_RE = new RegExp(`\\b(${AI_DOCTOR_REVIEW_BANNED_WORDS.join("|")})\\b`, "i");
const UUID_IN_COPY_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function containsBannedWord(text: string): boolean {
  return BANNED_WORDS_RE.test(text);
}

function containsDeviceControlLanguage(text: string): boolean {
  return DEVICE_CONTROL_DETECTION_PATTERNS.some((rx) => rx.test(text));
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-drop sensitive-named and prototype keys from plain data. Rebuilds the
 * value (never mutates input); non-plain objects pass through untouched. */
function stripSensitiveDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveDeep);
  if (!isPlainRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_PROTO_KEYS.has(key)) continue;
    if (VERDANT_SKILL_SENSITIVE_KEY_RE.test(key)) continue;
    out[key] = stripSensitiveDeep(value[key]);
  }
  return out;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const uuidSchema = z.string().refine(isUuid, "must be a UUID");

/** Code-unit string compare — the ONLY comparator canonical sorts may use.
 * localeCompare is ICU/locale dependent and would break byte-for-byte
 * serialization determinism across runtimes. */
function codeUnitCompare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

const timestampSchema = z
  .string()
  .regex(VERDANT_SKILL_RFC3339_PATTERN, "must be an RFC3339 timestamp")
  .refine((v) => Number.isFinite(Date.parse(v)), "must be a real calendar instant")
  // Canonical ISO re-serialization: equal instants always serialize identically.
  .transform((v) => new Date(Date.parse(v)).toISOString())
  // The canonical form must itself round-trip: instants whose ISO form leaves
  // the RFC3339 pattern (e.g. extended years like +010000-…) are rejected.
  .refine((v) => VERDANT_SKILL_RFC3339_PATTERN.test(v), "must be a real calendar instant");

const slugSchema = z.string().min(1).max(120).regex(SLUG_PATTERN, "must be a lowercase slug");

function proseSchema(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine((v) => !containsBannedWord(v), "banned_language")
    .refine((v) => !containsDeviceControlLanguage(v), "device_control_language")
    .refine((v) => !containsSecretLikeValue(v), "secret_like_value");
}

const shortProse = () => proseSchema(AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH);

const sortedStringArray = (maxItems: number, maxLength: number) =>
  z
    .array(proseSchema(maxLength))
    .max(maxItems)
    .transform((items) => [...items].sort(codeUnitCompare));

/** Nullable-or-absent: absent normalizes to null, explicit null is preserved. */
const nullableUuid = uuidSchema
  .nullable()
  .optional()
  .transform((v) => v ?? null);

// ---------------------------------------------------------------------------
// SkillVersion
// ---------------------------------------------------------------------------

export const SkillVersionSchema = z
  .string()
  .min(4)
  .max(120)
  .regex(VERDANT_SKILL_VERSION_PATTERN, "unsupported_skill_version");

// ---------------------------------------------------------------------------
// EvidenceRecord
// ---------------------------------------------------------------------------

export const EvidenceRecordSchema = z
  .object({
    id: z.string().regex(SKILL_EVIDENCE_ID_PATTERN, "must be a skill-evidence-* id").max(120),
    kind: z.enum(SKILL_EVIDENCE_KINDS),
    summary: shortProse(),
    source: z.enum(CANONICAL_SENSOR_SOURCES).nullable(),
    trust: z.enum(SKILL_TRUST_LEVELS),
    stale: z.boolean(),
    metric: z.enum(SKILL_METRIC_KEYS).nullable(),
    value: z
      .number()
      .refine(Number.isFinite, "must be finite")
      .refine((v) => Math.abs(v) <= AI_DOCTOR_REVIEW_PACKET_MAX_ABSOLUTE_NUMBER, "over_cap")
      .nullable(),
    unit: z.string().min(1).max(32).nullable(),
    observedAt: timestampSchema.nullable(),
  })
  .strict();

// ---------------------------------------------------------------------------
// PlantContextBundle
// ---------------------------------------------------------------------------

/** The compiled payload is validated deeply by the compiler and the packet
 * boundary validator; the bundle only asserts plain-object shape here so the
 * canonical contract is never forked. */
const contextPayloadSchema = z.custom<PlantContextPayload>(
  (v) => v !== null && typeof v === "object" && !Array.isArray(v),
  "contextPayload must be a plain object",
);

export const PlantContextBundleSchema = z
  .object({
    contextPayload: contextPayloadSchema,
    readiness: z.enum(SKILL_CONTEXT_READINESS),
    sufficiency: z.enum(SKILL_INPUT_COMPLETENESS),
    confidenceCeiling: z.enum(SKILL_CONFIDENCE_CEILINGS),
    missing: z
      .array(z.string().min(1).max(64))
      .max(AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS)
      .transform((items) => [...items].sort(codeUnitCompare)),
    sourceTags: z
      .array(z.enum(CANONICAL_SENSOR_SOURCES))
      .max(CANONICAL_SENSOR_SOURCES.length)
      .refine((tags) => new Set(tags).size === tags.length, "source tags must be unique")
      .transform((tags) => [...tags].sort(codeUnitCompare)),
    hasFreshLiveTelemetry: z.boolean(),
    compiledAt: timestampSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// VerdantSkillInputEnvelope
// ---------------------------------------------------------------------------

const sourceCountSchema = z
  .object({
    source: z.enum(CANONICAL_SENSOR_SOURCES),
    count: z.number().int().min(0).max(AI_DOCTOR_REVIEW_PACKET_MAX_ABSOLUTE_NUMBER),
  })
  .strict();

const flagsSchema = z
  .record(z.string().min(1).max(64).regex(SLUG_PATTERN, "flag keys must be slugs"), z.boolean())
  .refine(
    (flags) => Object.keys(flags).length <= AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS,
    "over_cap",
  );

const envelopeObjectSchema = z
  .object({
    schemaVersion: z.literal(VERDANT_SKILL_ENVELOPE_SCHEMA_VERSION, {
      message: "unsupported_schema_version",
    }),
    contractVersion: z.literal(VERDANT_SKILL_RUNTIME_CONTRACT_VERSION, {
      message: "unsupported_contract_version",
    }),
    skillId: slugSchema,
    skillVersion: SkillVersionSchema,
    runId: uuidSchema,
    requestedAt: timestampSchema,
    requestedBy: uuidSchema,
    growId: uuidSchema,
    tentId: nullableUuid,
    plantId: nullableUuid,
    contextVersion: z.number().int().min(1),
    context: PlantContextBundleSchema,
    evidence: z.array(EvidenceRecordSchema).max(AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS),
    sourceSummary: z
      .array(sourceCountSchema)
      .max(CANONICAL_SENSOR_SOURCES.length)
      .refine(
        (rows) => new Set(rows.map((r) => r.source)).size === rows.length,
        "source summary must be unique per source",
      )
      .transform((rows) => [...rows].sort((a, b) => codeUnitCompare(a.source, b.source))),
    inputCompleteness: z.enum(SKILL_INPUT_COMPLETENESS),
    provenanceWarnings: sortedStringArray(
      AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS,
      AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH,
    ),
    flags: flagsSchema,
  })
  .strict()
  .refine((env) => new Set(env.evidence.map((e) => e.id)).size === env.evidence.length, {
    message: "evidence ids must be unique",
    path: ["evidence"],
  });

export const VerdantSkillInputEnvelopeSchema = z.preprocess(
  stripSensitiveDeep,
  envelopeObjectSchema,
);

// ---------------------------------------------------------------------------
// SkillHypothesis
// ---------------------------------------------------------------------------

export const SkillHypothesisSchema = z
  .object({
    id: slugSchema,
    statement: shortProse(),
    likelyIssue: shortProse(),
    riskLevel: z.enum(SKILL_HYPOTHESIS_RISK_LEVELS),
    evidenceIds: z
      .array(z.string().regex(SKILL_EVIDENCE_ID_PATTERN))
      .max(AI_DOCTOR_REVIEW_ARRAY_CAP)
      .transform((ids) => [...ids].sort(codeUnitCompare)),
    missingInformation: sortedStringArray(
      AI_DOCTOR_REVIEW_ARRAY_CAP,
      AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH,
    ),
    modelConfidence: z.number().min(0).max(1),
  })
  .strict()
  .refine((h) => h.modelConfidence >= LOW_CONFIDENCE_THRESHOLD || h.missingInformation.length > 0, {
    message: "low-confidence hypotheses must state what information is missing",
    path: ["missingInformation"],
  });

// ---------------------------------------------------------------------------
// Confidence — the fence.
// ---------------------------------------------------------------------------

/**
 * The ONLY schema that may touch model-supplied confidence. It has no
 * system/displayed/final field, and `.strict()` rejects smuggled keys
 * ("system", "systemConfidence", "displayedConfidence", "final", …).
 */
export const VerdantSkillConfidenceInputSchema = z
  .object({
    modelConfidence: z.number().min(0).max(1),
  })
  .strict();

/**
 * Assemble the three-leg confidence result. The system leg is computed through
 * the imported harmonize fence (downgrade-only: the model can lower the
 * displayed value, never raise it past the context ceiling). There is NO zod
 * schema that parses a full SkillConfidenceResult from unknown input — this
 * function is the only constructor.
 */
/** Rebuild plain data with no shared references (never mutates the source). */
function clonePlainData<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clonePlainData) as unknown as T;
  if (!isPlainRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) out[key] = clonePlainData(value[key]);
  return out as T;
}

export function deriveVerdantSkillConfidence(
  input: z.infer<typeof VerdantSkillConfidenceInputSchema>,
  evidence: AiDoctorConfidenceResult,
  ceiling: AiContextConfidenceCeiling,
): SkillConfidenceResult {
  const system: HarmonizedConfidence = harmonizeDiagnosisConfidence(input.modelConfidence, ceiling);
  return deepFreeze({
    model: { rawConfidence: system.rawConfidence },
    // Cloned so the frozen result never aliases (and never freezes) the
    // caller-owned evidence object.
    evidence: clonePlainData(evidence),
    system,
  });
}

// Shallow sanity refinement for the evidence leg when it is carried through a
// parse boundary — deep computation stays with calculateAiDoctorConfidence.
function isEvidenceConfidenceShaped(v: unknown): v is AiDoctorConfidenceResult {
  if (!isPlainRecord(v)) return false;
  const score = v.score;
  const level = v.level;
  return (
    typeof score === "number" &&
    Number.isInteger(score) &&
    score >= 0 &&
    score <= 100 &&
    typeof level === "string" &&
    (SKILL_EVIDENCE_CONFIDENCE_LEVELS as readonly string[]).includes(level)
  );
}

// ---------------------------------------------------------------------------
// SkillActionProposal
// ---------------------------------------------------------------------------

export const SkillActionProposalSchema = z
  .object({
    actionType: z.enum(SKILL_PROPOSAL_ACTION_TYPES),
    status: z.literal("pending_approval"),
    approvalRequired: z.literal(true),
    executionCapability: z.enum(SKILL_EXECUTION_CAPABILITIES),
    riskLevel: z.enum(SKILL_RISK_LEVELS),
    title: proseSchema(120),
    suggestedChange: shortProse(),
    reason: shortProse(),
    evidenceIds: z
      .array(z.string().regex(SKILL_EVIDENCE_ID_PATTERN))
      .max(AI_DOCTOR_REVIEW_ARRAY_CAP)
      .transform((ids) => [...ids].sort(codeUnitCompare)),
    missingInformation: sortedStringArray(
      AI_DOCTOR_REVIEW_ARRAY_CAP,
      AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH,
    ),
    expectedResponse: shortProse(),
    followUpIntervalHours: z
      .number()
      .int()
      .min(SKILL_PROPOSAL_MIN_FOLLOWUP_HOURS)
      .max(SKILL_PROPOSAL_MAX_FOLLOWUP_HOURS),
    cancellationConditions: z
      .array(proseSchema(AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH))
      .min(1)
      .max(AI_DOCTOR_REVIEW_ARRAY_CAP)
      .transform((items) => [...items].sort(codeUnitCompare)),
    targetMetric: z.literal("general"),
    source: z.literal("skill_runtime"),
    backPointer: z.string().regex(SKILL_PROPOSAL_BACK_POINTER_PATTERN).max(140),
  })
  .strict();

// ---------------------------------------------------------------------------
// SkillOutcomeFollowUp
// ---------------------------------------------------------------------------

const durableReferenceSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (v) => !TRANSIENT_REFERENCE_PATTERNS.some((rx) => rx.test(v)),
    "transient references are not durable evidence",
  );

/** Enforces the documented deterministic key shape at the schema boundary. */
const FOLLOWUP_IDEMPOTENCY_KEY_PATTERN =
  /^verdant_skill_follow_up::s:[a-z0-9][a-z0-9-]*\|r:[0-9a-f-]{36}\|p:(?:[0-9a-f-]{36}|none)$/;

export const SkillOutcomeFollowUpSchema = z
  .object({
    idempotencyKey: z
      .string()
      .min(1)
      .max(255)
      .regex(FOLLOWUP_IDEMPOTENCY_KEY_PATTERN, "must be the deterministic follow-up key"),
    eventType: z.literal(VERDANT_SKILL_FOLLOWUP_EVENT_TYPE),
    title: shortProse().refine((v) => !UUID_IN_COPY_RE.test(v), "no raw ids in grower copy"),
    body: shortProse().refine((v) => !UUID_IN_COPY_RE.test(v), "no raw ids in grower copy"),
    dueAt: timestampSchema,
    checklist: sortedStringArray(
      AI_DOCTOR_REVIEW_ARRAY_CAP,
      AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH,
    ),
    outcome: z.enum(SKILL_FOLLOWUP_OUTCOMES).nullable(),
    note: z.string().min(1).max(1000).nullable(),
    observedAt: timestampSchema.nullable(),
    photoReference: durableReferenceSchema.nullable(),
  })
  .strict()
  .refine(
    (f) =>
      f.outcome === null ||
      !(ACTION_FOLLOWUP_OUTCOMES_REQUIRING_NOTE as readonly ActionFollowUpOutcome[]).includes(
        f.outcome,
      ) ||
      (typeof f.note === "string" && f.note.trim().length > 0),
    { message: "this outcome requires a grower note", path: ["note"] },
  );

/**
 * Build a fresh follow-up from run identity. The clock is injectable — never
 * Date.now(). Observation fields start as explicit nulls: the engine NEVER
 * infers an outcome; only the grower records one.
 */
export function buildVerdantSkillOutcomeFollowUp(
  input: {
    skillId: string;
    runId: string;
    plantId: string | null;
    title: string;
    body: string;
    checklist: readonly string[];
  },
  now: Date,
): { ok: true; followUp: SkillOutcomeFollowUp } | { ok: false; error: SkillError } {
  const dueAt = new Date(
    now.getTime() + VERDANT_SKILL_FOLLOWUP_DEFAULT_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const candidate = {
    idempotencyKey: `${VERDANT_SKILL_FOLLOWUP_EVENT_TYPE}::s:${input.skillId}|r:${input.runId}|p:${input.plantId ?? "none"}`,
    eventType: VERDANT_SKILL_FOLLOWUP_EVENT_TYPE,
    title: input.title,
    body: input.body,
    dueAt,
    checklist: [...input.checklist],
    outcome: null,
    note: null,
    observedAt: null,
    photoReference: null,
  };
  const parsed = SkillOutcomeFollowUpSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: toSkillError(parsed.error, "invalid_model_output", candidate) };
  }
  return { ok: true, followUp: deepFreeze(parsed.data) as SkillOutcomeFollowUp };
}

// ---------------------------------------------------------------------------
// SkillError
// ---------------------------------------------------------------------------

export const SkillErrorSchema = z
  .object({
    code: z.enum(SKILL_ERROR_CODES),
    message: z
      .string()
      .min(1)
      .max(AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH)
      .refine((v) => !containsSecretLikeValue(v), "secret_like_value"),
    field: z.string().min(1).max(255).nullable(),
    issues: z
      .array(z.string().min(1).max(AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH))
      .max(AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS)
      .transform((items) => [...items].sort(codeUnitCompare)),
  })
  .strict();

/** Map a zod failure to a SkillError. Issue strings use the repo's exact
 * `${path || "payload"}: ${message}` format, sorted, capped. */
/** True when the key addressed by `path` is absent from `input` (as opposed
 * to present with an invalid value). Used instead of zod's issue.input, which
 * the installed zod v4 does not populate. */
function isAbsentAtPath(input: unknown, path: readonly PropertyKey[]): boolean {
  if (path.length === 0) return input === undefined;
  let cursor: unknown = input;
  for (const key of path) {
    if (Array.isArray(cursor)) {
      const idx = typeof key === "number" ? key : Number(key);
      if (!Number.isInteger(idx) || idx >= cursor.length) return true;
      cursor = cursor[idx];
      continue;
    }
    if (!isPlainRecord(cursor)) return true;
    if (!Object.prototype.hasOwnProperty.call(cursor, String(key))) return true;
    cursor = cursor[String(key)];
  }
  return cursor === undefined;
}

/** Map a zod failure to a SkillError. Issue strings use the repo's exact
 * `${path || "payload"}: ${message}` format, code-unit sorted, capped.
 * `message` and `field` come from the SAME first sorted issue. */
function toSkillError(
  error: z.ZodError,
  fallbackCode: SkillErrorCode,
  input?: unknown,
): SkillError {
  const enriched = error.issues
    .map((i) => ({
      path: i.path.map(String).join("."),
      text: `${i.path.join(".") || "payload"}: ${i.message}`,
    }))
    .sort((a, b) => codeUnitCompare(a.text, b.text));
  const issues = enriched.map((e) => e.text).slice(0, AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS);
  const first = enriched[0];
  return deepFreeze({
    code: pickErrorCode(error, fallbackCode, input),
    message: first?.text ?? "payload: invalid",
    field: first?.path || null,
    issues,
  });
}

function pickErrorCode(
  error: z.ZodError,
  fallbackCode: SkillErrorCode,
  input?: unknown,
): SkillErrorCode {
  const paths = error.issues.map((i) => i.path.map(String));
  const messages = error.issues.map((i) => i.message);
  const absent = (name: string) => input !== undefined && isAbsentAtPath(input, [name]);
  // A smuggled system/displayed key under confidence is the fence firing;
  // plain value-range failures under confidence fall through to over_cap etc.
  if (
    error.issues.some(
      (i) => i.code === "unrecognized_keys" && String(i.path[0] ?? "") === "confidence",
    )
  ) {
    return "confidence_field_rejected";
  }
  if (messages.some((m) => m === "unsupported_schema_version")) {
    return absent("schemaVersion") ? "missing_required_field" : "unsupported_schema_version";
  }
  if (messages.some((m) => m === "unsupported_contract_version")) {
    return absent("contractVersion") ? "missing_required_field" : "unsupported_contract_version";
  }
  if (paths.some((p) => p[0] === "skillVersion")) {
    return absent("skillVersion") ? "missing_required_field" : "unsupported_skill_version";
  }
  if (paths.some((p) => p[0] === "context")) return "invalid_context_bundle";
  if (messages.some((m) => m === "banned_language")) return "banned_language";
  if (messages.some((m) => m === "device_control_language")) return "device_control_language";
  if (error.issues.some((i) => i.code === "too_big") || messages.some((m) => m === "over_cap")) {
    return "over_cap";
  }
  if (
    input !== undefined &&
    error.issues.some((i) => i.code === "invalid_type" && isAbsentAtPath(input, i.path))
  ) {
    return "missing_required_field";
  }
  return fallbackCode;
}

// ---------------------------------------------------------------------------
// Envelope parse
// ---------------------------------------------------------------------------

export function parseVerdantSkillInputEnvelope(
  input: unknown,
): { ok: true; envelope: VerdantSkillInputEnvelope } | { ok: false; error: SkillError } {
  const stripped = stripSensitiveDeep(input);
  const parsed = envelopeObjectSchema.safeParse(stripped);
  if (!parsed.success) {
    return { ok: false, error: toSkillError(parsed.error, "invalid_envelope", stripped) };
  }
  return { ok: true, envelope: deepFreeze(parsed.data) as VerdantSkillInputEnvelope };
}

// ---------------------------------------------------------------------------
// Run-result parse (model output boundary)
// ---------------------------------------------------------------------------

const runResultObjectSchema = z
  .object({
    skillId: slugSchema,
    skillVersion: SkillVersionSchema,
    runId: uuidSchema,
    startedAt: timestampSchema,
    finishedAt: timestampSchema,
    hypotheses: z.array(SkillHypothesisSchema).max(AI_DOCTOR_REVIEW_ARRAY_CAP),
    evidence: z.array(EvidenceRecordSchema).max(AI_DOCTOR_REVIEW_ARRAY_CAP),
    // The ONLY confidence a model may supply. Smuggled system/displayed keys
    // fail the nested .strict() and map to "confidence_field_rejected".
    confidence: VerdantSkillConfidenceInputSchema,
    proposals: z.array(SkillActionProposalSchema).max(MAX_SUGGESTED_ACTIONS),
    followUp: SkillOutcomeFollowUpSchema.nullable(),
    warnings: sortedStringArray(
      AI_DOCTOR_REVIEW_PACKET_MAX_LIST_ITEMS,
      AI_DOCTOR_REVIEW_PACKET_MAX_TEXT_LENGTH,
    ),
  })
  .strict()
  // Cross-field refines can run over partially-failed data (the field's own
  // issues are already recorded) — every refine below no-ops unless the parts
  // it compares parsed successfully, so failures never produce spurious issues.
  .refine(
    (r) =>
      typeof r.startedAt !== "string" ||
      typeof r.finishedAt !== "string" ||
      !Number.isFinite(Date.parse(r.startedAt)) ||
      !Number.isFinite(Date.parse(r.finishedAt)) ||
      Date.parse(r.finishedAt) >= Date.parse(r.startedAt),
    { message: "finishedAt must not precede startedAt", path: ["finishedAt"] },
  )
  .refine(
    (r) =>
      !Array.isArray(r.evidence) ||
      new Set(r.evidence.map((e) => e?.id)).size === r.evidence.length,
    { message: "evidence ids must be unique", path: ["evidence"] },
  )
  .refine(
    (r) => {
      if (!Array.isArray(r.evidence) || !Array.isArray(r.hypotheses)) return true;
      const known = new Set(r.evidence.map((e) => e?.id));
      return r.hypotheses.every((h) => (h?.evidenceIds ?? []).every((id) => known.has(id)));
    },
    {
      message: "hypothesis evidence ids must resolve against the run's evidence",
      path: ["hypotheses"],
    },
  )
  .refine(
    (r) => {
      if (!Array.isArray(r.evidence) || !Array.isArray(r.proposals)) return true;
      const known = new Set(r.evidence.map((e) => e?.id));
      return r.proposals.every((p) => (p?.evidenceIds ?? []).every((id) => known.has(id)));
    },
    {
      message: "proposal evidence ids must resolve against the run's evidence",
      path: ["proposals"],
    },
  )
  .refine(
    (r) =>
      r.followUp === null ||
      typeof r.followUp?.idempotencyKey !== "string" ||
      typeof r.skillId !== "string" ||
      typeof r.runId !== "string" ||
      r.followUp.idempotencyKey.startsWith(
        `${VERDANT_SKILL_FOLLOWUP_EVENT_TYPE}::s:${r.skillId}|r:${r.runId}|p:`,
      ),
    { message: "follow-up idempotency key must match this run's identity", path: ["followUp"] },
  );

export interface ParseVerdantSkillRunResultDeps {
  /** Evidence-leg confidence, computed upstream by calculateAiDoctorConfidence
   * from context source quality only — never from model output. */
  evidenceConfidence: AiDoctorConfidenceResult;
  /** Context ceiling from the PlantContextBundle. */
  ceiling: AiContextConfidenceCeiling;
  /** Optional readiness cross-check: when supplied, the derived displayed
   * confidence must not exceed the readiness ceiling. */
  readiness?: AiDoctorContextReadiness;
}

/**
 * Validate untrusted model output into a SkillRunSuccess. Never throws; never
 * mutates input; sensitive keys are silently dropped; the system-confidence
 * leg is ALWAYS recomputed via deriveVerdantSkillConfidence — it can never be
 * parsed from the input.
 */
export function parseVerdantSkillRunResult(
  input: unknown,
  deps: ParseVerdantSkillRunResultDeps,
): { ok: true; result: SkillRunSuccess } | { ok: false; error: SkillError } {
  if (!isEvidenceConfidenceShaped(deps.evidenceConfidence)) {
    return {
      ok: false,
      error: deepFreeze({
        code: "invalid_model_output" as const,
        message: "deps: evidence confidence is not a calculateAiDoctorConfidence result",
        field: null,
        issues: [],
      }),
    };
  }
  const stripped = stripSensitiveDeep(input);
  const parsed = runResultObjectSchema.safeParse(stripped);
  if (!parsed.success) {
    return { ok: false, error: toSkillError(parsed.error, "invalid_model_output", stripped) };
  }
  const confidence = deriveVerdantSkillConfidence(
    parsed.data.confidence,
    deps.evidenceConfidence,
    deps.ceiling,
  );
  if (deps.readiness != null) {
    const readinessCeiling = AI_DOCTOR_READINESS_CONFIDENCE_CEILING[deps.readiness];
    // Fail CLOSED on an unknown readiness label — a safety fence must never
    // silently no-op because a caller supplied a value outside the vocabulary.
    if (typeof readinessCeiling !== "number" || !Number.isFinite(readinessCeiling)) {
      return {
        ok: false,
        error: deepFreeze({
          code: "insufficient_context" as const,
          message: "deps: unknown context readiness label",
          field: "confidence",
          issues: [],
        }),
      };
    }
    if (confidence.system.displayedConfidence > readinessCeiling) {
      return {
        ok: false,
        error: deepFreeze({
          code: "insufficient_context" as const,
          message: "confidence: displayed confidence exceeds the context readiness ceiling",
          field: "confidence",
          issues: [],
        }),
      };
    }
  }
  const { confidence: _modelConfidenceInput, ...rest } = parsed.data;
  void _modelConfidenceInput;
  // zod v4 infers transformed (piped) object fields as optional in the output
  // type; runtime validation above guarantees presence, so one cast is safe.
  const result = {
    ok: true,
    contractVersion: VERDANT_SKILL_RUNTIME_CONTRACT_VERSION,
    ...rest,
    confidence,
  } as SkillRunSuccess;
  return { ok: true, result: deepFreeze(result) };
}

// ---------------------------------------------------------------------------
// Deterministic serialization
// ---------------------------------------------------------------------------

/**
 * Canonical sorted-keys JSON. Same algorithm as the module-private
 * stableStringify in src/lib/mcp/manifestHash.ts (not exported there; that
 * directory is auto-bundled into the generated MCP edge function, so it must
 * not be edited to export it).
 */
export function stableSkillStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSkillStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSkillStringify(obj[k])}`).join(",")}}`;
}

export function serializeVerdantSkillRunResult(result: SkillRunSuccess): string {
  return stableSkillStringify(result);
}

export function serializeVerdantSkillInputEnvelope(envelope: VerdantSkillInputEnvelope): string {
  return stableSkillStringify(envelope);
}
