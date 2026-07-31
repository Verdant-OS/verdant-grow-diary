/**
 * verdantSkillManifest — the static, typed declaration of what a
 * Verdant skill may read, when it applies, and what it may propose.
 *
 * Build 4 of Verdant Skill Runtime v1. Engine-only: no UI, no schema,
 * no model calls, no dynamic loading. A manifest is DATA — there is no
 * field anywhere in this contract that can carry executable code, a
 * query, a prompt, or a credential.
 *
 * NAMING (deliberate, see the conflicts this avoids):
 *  - `permission` is prefixed everywhere (`SKILL_PERMISSIONS`,
 *    `SkillPermission`) because `@/lib/permissions` already owns the
 *    bare word for Supabase RLS caller guards, and `capabilities` is
 *    already owned by billing entitlements.
 *  - Execution capability is NOT redefined here: the manifest imports
 *    `SKILL_EXECUTION_CAPABILITIES` from Build 1 so a manifest can
 *    never grant a capability the result contract cannot express.
 *  - Risk uses Build 1's 4-value `SkillRiskLevel`, not the AI Doctor's
 *    3-value ladder.
 *  - No field is called `environment`: that word already means payment
 *    mode, a diary event type, and a table name in this repo. Grow
 *    setting uses the existing `GROW_TYPES` vocabulary instead.
 *
 * V1 PERMISSION CEILING — the union below is the whole grant surface.
 * Anything outside it is unrepresentable rather than merely forbidden:
 * row mutation, equipment control, setpoint changes, automatic queue
 * creation, irrigation actuation, and nutrient dosing have no token.
 */

import { z } from "zod";
import { GROW_TYPES } from "@/lib/grow";
import { CONTEXT_SLOTS, type PlantContextSlot } from "@/lib/plantContextBundleCompiler";
import { SENSOR_GATE_METRICS, type SensorGateMetric } from "@/lib/sensorTruthGateRules";
import {
  SKILL_CONTRACT_VERSION,
  SKILL_EXECUTION_CAPABILITIES,
  SKILL_RISK_LEVELS,
} from "@/lib/verdantSkillSchemas";

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

/** The complete V1 grant surface. */
export const SKILL_PERMISSIONS = [
  "read_plant_history",
  "read_sensor_context",
  "read_photo_metadata",
  "analyze_photos",
  "retrieve_approved_evidence",
  "propose_manual_action",
] as const;
export type SkillPermission = (typeof SKILL_PERMISSIONS)[number];

/** Who authored a skill. No public marketplace authors in V1. */
export const SKILL_AUTHOR_TYPES = [
  "verdant",
  "grower_private",
  "expert_reviewed",
  "partner_verified",
] as const;
export type SkillAuthorType = (typeof SKILL_AUTHOR_TYPES)[number];

export const SKILL_AUTHOR_VERIFICATION_STATES = [
  "unverified",
  "documentation_reviewed",
  "technical_reviewed",
  "verified",
  "paused",
  "withdrawn",
] as const;
export type SkillAuthorVerificationState = (typeof SKILL_AUTHOR_VERIFICATION_STATES)[number];

/**
 * Growing media. Mirrors `RootZoneMedium` from
 * `@/lib/greenhouseRootZoneRules` (the module that already encodes the
 * coco-vs-soil distinction) plus an explicit unknown.
 */
export const SKILL_MEDIA = [
  "coco",
  "rockwool",
  "hydro",
  "living_soil",
  "peat",
  "soil",
  "unknown",
] as const;
export type SkillMedium = (typeof SKILL_MEDIA)[number];

/**
 * Irrigation architecture. NOTE: this is a NEW vocabulary — the repo
 * persists no irrigation architecture anywhere (no column, no
 * constant, no UI). Until a persistence path exists, callers must
 * supply it explicitly, and a skill that requires it will honestly
 * report insufficient context rather than guessing from runoff data.
 */
export const SKILL_IRRIGATION_ARCHITECTURES = [
  "top_feed_drain_to_waste",
  "bottom_feed_valve",
  "tray_bottom_fed",
  "recirculating_drip",
  "ebb_and_flow",
  "deep_water_culture",
  "hand_watered_soil",
  "living_soil_no_runoff",
  "unknown",
] as const;
export type SkillIrrigationArchitecture = (typeof SKILL_IRRIGATION_ARCHITECTURES)[number];

/**
 * Tolerant token normalization. Free-text callers write
 * "top-feed drain-to-waste"; mirrors the existing root-zone rules'
 * `trim().toLowerCase().replace(/[-\s]+/g, "_")` convention so both
 * spellings resolve to the same token.
 */
export function normalizeEnvelopeToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const token = raw
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  return token === "" ? null : token;
}

export function normalizeIrrigationArchitecture(raw: unknown): SkillIrrigationArchitecture | null {
  const token = normalizeEnvelopeToken(raw);
  if (token === null) return null;
  return (SKILL_IRRIGATION_ARCHITECTURES as readonly string[]).includes(token)
    ? (token as SkillIrrigationArchitecture)
    : null;
}

export function normalizeMedium(raw: unknown): SkillMedium | null {
  const token = normalizeEnvelopeToken(raw);
  if (token === null) return null;
  return (SKILL_MEDIA as readonly string[]).includes(token) ? (token as SkillMedium) : null;
}

/** Grow settings, reusing the repo's existing GROW_TYPES vocabulary. */
export const SKILL_GROW_SETTINGS = GROW_TYPES.map((g) => g.value);
export type SkillGrowSetting = (typeof GROW_TYPES)[number]["value"];

export const SKILL_EVIDENCE_POLICIES = [
  "context_only",
  "approved_evidence_required",
  "approved_evidence_optional",
] as const;
export type SkillEvidencePolicy = (typeof SKILL_EVIDENCE_POLICIES)[number];

export const SKILL_LIFECYCLE_STATES = [
  "draft",
  "internal_sandbox",
  "limited_beta",
  "verified",
  "paused",
  "deprecated",
  "superseded",
] as const;
export type SkillLifecycleState = (typeof SKILL_LIFECYCLE_STATES)[number];

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const skillIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{1,63}$/, "skill_id_shape");

const semverSchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "version_shape");

const idTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "id_token_shape");

const textSchema = z.string().trim().min(1).max(500);

/** Context slots come from the compiler's exported token set. */
const contextSlotSchema = z.enum(CONTEXT_SLOTS);

const operatingEnvelopeSchema = z
  .object({
    /** Grow settings the skill supports. Empty = any setting. */
    growSettings: z.array(z.enum(SKILL_GROW_SETTINGS as [string, ...string[]])).default([]),
    /** Supported media. Empty = medium-agnostic. */
    media: z.array(z.enum(SKILL_MEDIA)).default([]),
    /** Supported irrigation architectures. Empty = irrigation-agnostic. */
    irrigationArchitectures: z.array(z.enum(SKILL_IRRIGATION_ARCHITECTURES)).default([]),
    /**
     * When true, the skill needs a KNOWN irrigation architecture: an
     * unknown/absent one yields insufficient context rather than a guess.
     */
    requiresKnownIrrigationArchitecture: z.boolean().default(false),
    /**
     * When true, the skill must not run on a plant whose autoflower
     * status is unknown (null), because null is not false.
     */
    requiresKnownAutoflowerStatus: z.boolean().default(false),
    /** Minimum usable sensor readings the skill needs, across any metric. */
    minUsableSensorReadings: z.number().int().min(0).default(0),
    /**
     * Specific metrics the skill depends on. A global reading count is
     * not enough: a moisture-dependent skill must not be satisfied by a
     * fresh temperature reading.
     */
    requiredSensorMetrics: z.array(z.enum(SENSOR_GATE_METRICS)).default([]),
  })
  .strict();
/**
 * Declared explicitly rather than via `z.infer`: this project compiles
 * with `strict: false`, where Zod's `.default()` degrades inferred
 * properties to optional and downstream consumers lose the guarantees
 * validation actually provides.
 */
export interface SkillOperatingEnvelope {
  growSettings: string[];
  media: SkillMedium[];
  irrigationArchitectures: SkillIrrigationArchitecture[];
  requiresKnownIrrigationArchitecture: boolean;
  requiresKnownAutoflowerStatus: boolean;
  minUsableSensorReadings: number;
  requiredSensorMetrics: SensorGateMetric[];
}

const excludedConditionsSchema = z
  .object({
    media: z.array(z.enum(SKILL_MEDIA)).default([]),
    irrigationArchitectures: z.array(z.enum(SKILL_IRRIGATION_ARCHITECTURES)).default([]),
    growSettings: z.array(z.enum(SKILL_GROW_SETTINGS as [string, ...string[]])).default([]),
  })
  .strict();
export interface SkillExcludedConditions {
  media: SkillMedium[];
  irrigationArchitectures: SkillIrrigationArchitecture[];
  growSettings: string[];
}

export const verdantSkillManifestSchema = z
  .object({
    id: skillIdSchema,
    version: semverSchema,
    name: textSchema,
    description: textSchema,
    authorType: z.enum(SKILL_AUTHOR_TYPES),
    authorVerification: z.enum(SKILL_AUTHOR_VERIFICATION_STATES),
    lifecycle: z.enum(SKILL_LIFECYCLE_STATES),
    operatingEnvelope: operatingEnvelopeSchema,
    requiredContext: z.array(contextSlotSchema).default([]),
    optionalContext: z.array(contextSlotSchema).default([]),
    excludedConditions: excludedConditionsSchema,
    evidencePolicy: z.enum(SKILL_EVIDENCE_POLICIES),
    riskClass: z.enum(SKILL_RISK_LEVELS),
    /** The whole grant. Anything outside this union does not exist. */
    permissions: z.array(z.enum(SKILL_PERMISSIONS)).min(1),
    /**
     * Named deterministic calculators the skill may invoke. Names only
     * — never expressions, never code.
     */
    deterministicCalculators: z.array(idTokenSchema).default([]),
    outputContractVersion: z.literal(SKILL_CONTRACT_VERSION),
    followUpContract: z
      .object({
        requiresFollowUp: z.boolean(),
        defaultIntervalHours: z.number().finite().positive().max(720).nullable(),
      })
      .strict(),
    evaluationSuiteId: idTokenSchema,
    modelPolicyId: idTokenSchema,
    /** Highest capability the skill may ever request. V1 caps at manual. */
    maxExecutionCapability: z.enum(SKILL_EXECUTION_CAPABILITIES),
    deprecation: z
      .object({
        deprecated: z.boolean().default(false),
        supersededBy: semverSchema.nullable().default(null),
        note: textSchema.nullable().default(null),
      })
      .strict()
      .default({ deprecated: false, supersededBy: null, note: null }),
  })
  .strict()
  .superRefine((m, ctx) => {
    // A skill that proposes actions must be able to say how to follow up.
    if (
      m.permissions.includes("propose_manual_action") &&
      m.followUpContract.requiresFollowUp &&
      m.followUpContract.defaultIntervalHours === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["followUpContract", "defaultIntervalHours"],
        message: "follow_up_requires_interval",
      });
    }
    // Analyzing photos requires being allowed to read their metadata.
    if (
      m.permissions.includes("analyze_photos") &&
      !m.permissions.includes("read_photo_metadata")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["permissions"],
        message: "analyze_photos_requires_photo_metadata",
      });
    }
    // Evidence retrieval and evidence policy must agree.
    if (
      m.evidencePolicy === "approved_evidence_required" &&
      !m.permissions.includes("retrieve_approved_evidence")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidencePolicy"],
        message: "evidence_policy_requires_retrieval_permission",
      });
    }
    // A slot cannot be both required and optional.
    const optional = new Set<string>(m.optionalContext);
    for (const slot of m.requiredContext) {
      if (optional.has(slot)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["optionalContext"],
          message: "slot_both_required_and_optional",
        });
      }
    }
    // Excluding a condition the envelope also supports is contradictory.
    const supportedMedia = new Set<string>(m.operatingEnvelope.media);
    for (const medium of m.excludedConditions.media) {
      if (supportedMedia.has(medium)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["excludedConditions", "media"],
          message: "medium_both_supported_and_excluded",
        });
      }
    }
    const supportedIrrigation = new Set<string>(m.operatingEnvelope.irrigationArchitectures);
    for (const arch of m.excludedConditions.irrigationArchitectures) {
      if (supportedIrrigation.has(arch)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["excludedConditions", "irrigationArchitectures"],
          message: "irrigation_both_supported_and_excluded",
        });
      }
    }
    // A skill cannot depend on sensor data it is not permitted to read.
    if (
      (m.operatingEnvelope.requiredSensorMetrics.length > 0 ||
        m.operatingEnvelope.minUsableSensorReadings > 0) &&
      !m.permissions.includes("read_sensor_context")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["permissions"],
        message: "sensor_dependency_requires_read_sensor_context",
      });
    }
    // "unknown" is meaningful as an EXCLUSION but unsatisfiable as
    // support: the evaluator fail-closes unknown values, so a manifest
    // claiming to support "unknown" could never be applicable for it.
    if (m.operatingEnvelope.media.includes("unknown")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["operatingEnvelope", "media"],
        message: "unknown_is_not_a_supportable_medium",
      });
    }
    if (m.operatingEnvelope.irrigationArchitectures.includes("unknown")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["operatingEnvelope", "irrigationArchitectures"],
        message: "unknown_is_not_a_supportable_irrigation_architecture",
      });
    }
    const supportedSettings = new Set<string>(m.operatingEnvelope.growSettings);
    for (const setting of m.excludedConditions.growSettings) {
      if (supportedSettings.has(setting)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["excludedConditions", "growSettings"],
          message: "grow_setting_both_supported_and_excluded",
        });
      }
    }
    // A superseded skill must name its successor.
    if (m.lifecycle === "superseded" && m.deprecation.supersededBy === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deprecation", "supersededBy"],
        message: "superseded_requires_successor_version",
      });
    }
  });

/** The validated manifest. Explicit for the same `strict: false` reason. */
export interface VerdantSkillManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  authorType: SkillAuthorType;
  authorVerification: SkillAuthorVerificationState;
  lifecycle: SkillLifecycleState;
  operatingEnvelope: SkillOperatingEnvelope;
  requiredContext: PlantContextSlot[];
  optionalContext: PlantContextSlot[];
  excludedConditions: SkillExcludedConditions;
  evidencePolicy: SkillEvidencePolicy;
  riskClass: (typeof SKILL_RISK_LEVELS)[number];
  permissions: SkillPermission[];
  deterministicCalculators: string[];
  outputContractVersion: typeof SKILL_CONTRACT_VERSION;
  followUpContract: {
    requiresFollowUp: boolean;
    defaultIntervalHours: number | null;
  };
  evaluationSuiteId: string;
  modelPolicyId: string;
  maxExecutionCapability: (typeof SKILL_EXECUTION_CAPABILITIES)[number];
  deprecation: {
    deprecated: boolean;
    supersededBy: string | null;
    note: string | null;
  };
}

export type SkillManifestParse =
  | { ok: true; manifest: VerdantSkillManifest }
  | { ok: false; issues: string[] };

export function parseVerdantSkillManifest(input: unknown): SkillManifestParse {
  const parsed = verdantSkillManifestSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, manifest: parsed.data as unknown as VerdantSkillManifest };
  }
  return {
    ok: false,
    issues: parsed.error.issues
      .map((i) => `${i.path.length > 0 ? i.path.join(".") : "$"}: ${i.message}`)
      .sort(),
  };
}

/** True when the manifest grants this permission. */
export function skillManifestGrantsPermission(
  manifest: VerdantSkillManifest,
  permission: SkillPermission,
): boolean {
  return manifest.permissions.includes(permission);
}

/** Stable key for a skill version. */
export function skillManifestKey(manifest: { id: string; version: string }): string {
  return `${manifest.id}@${manifest.version}`;
}
