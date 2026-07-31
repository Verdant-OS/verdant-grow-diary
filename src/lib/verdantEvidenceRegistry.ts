/**
 * verdantEvidenceRegistry — the curated, versioned corpus of cultivation
 * claims that Verdant skills are allowed to cite.
 *
 * Build 5 of Verdant Skill Runtime v1. Engine-only: no UI, no schema, no
 * migration, no model call, no network. This is explicitly NOT open-web
 * search, NOT a vector database, and NOT permission to scrape: the
 * corpus is a static, hand-curated list validated all-or-nothing at
 * build time, exactly like `verdantSkillRegistry`.
 *
 * WHAT THIS IS NOT (naming, deliberately):
 *  - `EvidenceRecord` in `verdantSkillSchemas` is an OBSERVATION — a
 *    sensor reading or diary row with a trust confidence. It has no
 *    claim, citation, or tier. This module's record is a published or
 *    documented CLAIM. The two never convert into one another; see the
 *    no-laundering test. Conflating them is how a grower's humidity
 *    reading would end up cited as literature.
 *  - `EvidenceCitation` belongs to `aiDoctorEvidenceCitationRules` (it
 *    anchors AI Doctor prose to a sensor metric). The result-side type
 *    here is `EvidenceCitationRef`.
 *  - `SensorConflict` in `sensorTruthGateRules` is cross-DEVICE
 *    disagreement. Conflict here is claim-versus-claim.
 *  - "provenance" means sensor lineage in this repo and is not reused.
 *
 * TIER IS THE SOLE CREDIBILITY AUTHORITY. `sourceDocumentType` records
 * the FORM of the document (journal article, product label, …) and is
 * pinned against tier so the two cannot drift; it deliberately does not
 * imply an ordering of its own, because a second credibility ranking is
 * a second thing to disagree with.
 *
 * V1 SCOPE LIMIT — local grow evidence is not registerable. This module
 * is client-side code: a registry built at module load is compiled into
 * the browser bundle, so a record is disclosed to every user before any
 * query-time gate could run. There is no consented ingest path for one
 * grower's private results in V1, and the build sequence explicitly
 * excludes global cross-user cultivation claims without consent. The
 * tier stays in the ladder (the six-tier hierarchy is specified) but
 * `buildEvidenceRegistry` refuses to register one.
 */

import {
  growSettingEnumValues,
  SKILL_IRRIGATION_ARCHITECTURES,
  SKILL_MEDIA,
  type SkillGrowSetting,
  type SkillIrrigationArchitecture,
  type SkillMedium,
} from "@/lib/verdantSkillManifest";
import { SENSOR_GATE_METRICS, type SensorGateMetric } from "@/lib/sensorTruthGateRules";
import {
  SKILL_PLANT_STAGES,
  contractTextSchema,
  idTokenSchema,
  isoTimestampSchema,
  serializeSkillContract,
  type SkillPlantStage,
} from "@/lib/verdantSkillSchemas";
import { z } from "zod";

/** Bumped when the record or result shape changes incompatibly. */
export const EVIDENCE_REGISTRY_CONTRACT_VERSION = "1.0.0" as const;

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

/**
 * The evidence hierarchy, declared strongest-first. A lower rank is
 * stronger. Nothing outside this ladder can be represented, so there is
 * no "trust me" tier.
 */
export const EVIDENCE_TIERS = [
  "controlled_cannabis_research",
  "controlled_environment_horticulture_research",
  "manufacturer_specification",
  "established_sop",
  "local_grow_evidence",
  "unverified_hypothesis",
] as const;
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

/**
 * Rank as explicit DATA rather than `EVIDENCE_TIERS.indexOf(tier)`.
 * An index lookup silently returns -1 for an unknown token, which would
 * sort an unrecognized tier ABOVE controlled research. The annotation is
 * mandatory: a bare object literal would infer literal types (`1`) and
 * break arithmetic.
 */
export const EVIDENCE_TIER_RANKS: Readonly<Record<EvidenceTier, number>> = Object.freeze({
  controlled_cannabis_research: 1,
  controlled_environment_horticulture_research: 2,
  manufacturer_specification: 3,
  established_sop: 4,
  local_grow_evidence: 5,
  unverified_hypothesis: 6,
});

// The table must be exactly the declared ladder, in order. If someone
// adds a tier and forgets a rank, this throws at import rather than
// mis-sorting evidence at runtime.
EVIDENCE_TIERS.forEach((tier, index) => {
  if (EVIDENCE_TIER_RANKS[tier] !== index + 1) {
    throw new Error(`[verdantEvidenceRegistry] tier rank mismatch for ${tier}`);
  }
});

/**
 * Rank for an arbitrary token. An unknown tier sorts LAST and is
 * excluded by retrieval — never treated as strong evidence.
 */
export function evidenceTierRank(tier: string): number {
  const rank = Object.prototype.hasOwnProperty.call(EVIDENCE_TIER_RANKS, tier)
    ? EVIDENCE_TIER_RANKS[tier as EvidenceTier]
    : undefined;
  return typeof rank === "number" ? rank : Number.MAX_SAFE_INTEGER;
}

/** Document FORM. Not a credibility ordering — `tier` owns that. */
export const EVIDENCE_SOURCE_TYPES = [
  "journal_article",
  "conference_paper",
  "extension_publication",
  "textbook_or_reference",
  "product_label",
  "manufacturer_manual",
  "internal_sop",
  "grower_log",
] as const;
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

/**
 * Which document forms each tier may claim. Without this, a record could
 * cite a product leaflet and label itself controlled research.
 */
const TIER_ADMISSIBLE_SOURCE_TYPES: Readonly<Record<EvidenceTier, readonly EvidenceSourceType[]>> =
  Object.freeze({
    controlled_cannabis_research: [
      "journal_article",
      "conference_paper",
      "extension_publication",
      "textbook_or_reference",
    ],
    controlled_environment_horticulture_research: [
      "journal_article",
      "conference_paper",
      "extension_publication",
      "textbook_or_reference",
    ],
    manufacturer_specification: ["product_label", "manufacturer_manual"],
    established_sop: ["internal_sop", "extension_publication", "textbook_or_reference"],
    local_grow_evidence: ["grower_log"],
    unverified_hypothesis: ["internal_sop"],
  });

/**
 * Closed species vocabulary. Free text would let "cannabis sativa",
 * "Cannabis", and "weed" all be different species to the filter.
 */
export const EVIDENCE_SPECIES = [
  "cannabis",
  "tomato",
  "cucumber",
  "lettuce",
  "pepper",
  "strawberry",
  "generic_horticulture",
] as const;
export type EvidenceSpecies = (typeof EVIDENCE_SPECIES)[number];

/**
 * Only `verified` records can ever be applicable. The others remain
 * REPRESENTABLE so a curator-audit query can see them, but they surface
 * as excluded carrying their own status as the reason.
 */
export const EVIDENCE_STATUSES = ["draft", "verified", "deprecated", "withdrawn"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

/** The scoping axes a record can be filtered on. */
export const EVIDENCE_AXES = [
  "growSettings",
  "media",
  "irrigationArchitectures",
  "stages",
  "metrics",
] as const;
export type EvidenceAxis = (typeof EVIDENCE_AXES)[number];

/**
 * Limitation codes. The DERIVED ones are computed by the runtime and may
 * never be authored: a curator who could write
 * `cross_species_extrapolation` by hand could also write it on a record
 * where it is false, or pre-empt the real one.
 */
export const EVIDENCE_DERIVED_LIMITATION_CODES = [
  "cross_species_extrapolation",
  "product_specific_instruction",
  "advisory_condition",
  "curated_coverage_only",
] as const;
export const EVIDENCE_AUTHORED_LIMITATION_CODES = [
  "scope_limitation",
  "method_limitation",
  "sample_limitation",
  "conflicting_findings",
] as const;
export const EVIDENCE_LIMITATION_CODES = [
  ...EVIDENCE_DERIVED_LIMITATION_CODES,
  ...EVIDENCE_AUTHORED_LIMITATION_CODES,
] as const;
export type EvidenceLimitationCode = (typeof EVIDENCE_LIMITATION_CODES)[number];

export interface EvidenceLimitation {
  code: EvidenceLimitationCode;
  detail: string | null;
}

export const EVIDENCE_APPLICABILITY_CONDITION_KINDS = ["requires_metric", "advisory"] as const;
export type EvidenceApplicabilityConditionKind =
  (typeof EVIDENCE_APPLICABILITY_CONDITION_KINDS)[number];

/**
 * Conditions the claim depends on beyond the scoping axes.
 *
 * `requires_metric` is machine-checkable against what the caller
 * actually observed. `advisory` is NOT machine-checkable and is never
 * auto-satisfied — it is always echoed to the caller as a limitation, so
 * an unverifiable precondition cannot quietly evaluate to true.
 */
export type EvidenceApplicabilityCondition =
  | { kind: "requires_metric"; metric: SensorGateMetric }
  | { kind: "advisory"; detail: string };

/** How complete a citation is. Derived at build time, never authored. */
export const EVIDENCE_CITATION_COMPLETENESS = ["bibliographic", "attributed", "internal"] as const;
export type EvidenceCitationCompleteness = (typeof EVIDENCE_CITATION_COMPLETENESS)[number];

export interface EvidenceSourceCitation {
  title: string;
  publisher: string | null;
  year: number | null;
  /** DOI, ISBN, document revision, section — whatever resolves it. */
  locator: string | null;
  url: string | null;
}

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

/** Same grammar as a skill id, so `allowedSkillIds` cannot drift. */
const skillIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{1,63}$/, "skill_id_shape");

const semverSchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "version_shape");

/**
 * A curator HANDLE, not a person's name or email. No regex reliably
 * strips PII from free text, so the field simply cannot hold it.
 */
const reviewerHandleSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{1,63}$/, "reviewer_handle_shape");

const shortTextSchema = z.string().trim().min(1).max(300);

/**
 * A citation URL is a bare https location: scheme + host + path.
 *
 * Userinfo, query strings, and fragments are refused outright. That is a
 * blunter rule than scanning for credential shapes, and strictly
 * stronger: session tokens, signed-URL parameters, and `user:pass@`
 * forms all live in exactly those three places, so the whole class is
 * unrepresentable rather than heuristically detected.
 */
const citationUrlSchema = z
  .string()
  .trim()
  .max(500)
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "citation_url_not_a_url" });
      return;
    }
    if (parsed.protocol !== "https:") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "citation_url_must_be_https" });
    }
    if (parsed.username !== "" || parsed.password !== "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "citation_url_must_not_carry_userinfo",
      });
    }
    if (parsed.search !== "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "citation_url_must_not_carry_query" });
    }
    if (parsed.hash !== "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "citation_url_must_not_carry_fragment",
      });
    }
  });

const citationSchema = z
  .object({
    title: shortTextSchema,
    publisher: shortTextSchema.nullable(),
    year: z.number().int().min(1800).max(2200).nullable(),
    locator: shortTextSchema.nullable(),
    url: citationUrlSchema.nullable(),
  })
  .strict();

const limitationSchema = z
  .object({
    code: z.enum(EVIDENCE_LIMITATION_CODES),
    detail: shortTextSchema.nullable(),
  })
  .strict();

const applicabilityConditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("requires_metric"), metric: z.enum(SENSOR_GATE_METRICS) }).strict(),
  z.object({ kind: z.literal("advisory"), detail: shortTextSchema }).strict(),
]);

const DOI_RE = /^10\.\d{4,9}\/\S+$/;
const ISBN_RE = /^(?:97[89])?\d{9}[\dXx]$/;

/** Can a reader actually go and find this? */
function hasResolvableLocator(citation: EvidenceSourceCitation): boolean {
  if (citation.url !== null) return true;
  const locator = citation.locator;
  if (locator === null) return false;
  const compact = locator.replace(/[\s-]/g, "");
  return DOI_RE.test(locator.trim()) || ISBN_RE.test(compact);
}

/**
 * Citation completeness required by tier. A uniform "has a title" bar
 * would let `{title: "internal notes"}` pass as controlled research.
 */
function requiredCompleteness(tier: EvidenceTier): EvidenceCitationCompleteness {
  if (tier === "established_sop") return "attributed";
  if (tier === "unverified_hypothesis" || tier === "local_grow_evidence") return "internal";
  return "bibliographic";
}

function citationIssues(tier: EvidenceTier, citation: EvidenceSourceCitation): string[] {
  const issues: string[] = [];
  const level = requiredCompleteness(tier);
  if (level === "bibliographic") {
    if (citation.publisher === null) issues.push("citation_requires_publisher");
    if (citation.year === null) issues.push("citation_requires_year");
    // Research must be findable by a stable identifier. A manufacturer
    // document is identified by revision instead — "Rev. 4" is the
    // honest locator for a feeding chart, and demanding a DOI for one
    // would only push curators to leave the field empty.
    if (tier === "manufacturer_specification") {
      if (citation.locator === null) issues.push("citation_requires_document_identifier");
    } else if (!hasResolvableLocator(citation)) {
      issues.push("citation_requires_resolvable_locator");
    }
  } else if (level === "attributed") {
    if (citation.publisher === null) issues.push("citation_requires_publisher");
    if (citation.year === null) issues.push("citation_requires_year");
  } else if (tier === "unverified_hypothesis") {
    // A hypothesis must not dress itself up with a publisher or a link.
    if (citation.publisher !== null) issues.push("hypothesis_citation_must_not_claim_publisher");
    if (citation.year !== null) issues.push("hypothesis_citation_must_not_claim_year");
    if (citation.url !== null) issues.push("hypothesis_citation_must_not_claim_url");
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Record contract
// ---------------------------------------------------------------------------

/**
 * Hand-declared rather than `z.infer`: this repo compiles with loose
 * strictness in places, where `z.infer` degrades object properties to
 * optional and silently weakens every consumer. Build 4 hit exactly this
 * and had to do the same.
 */
export interface CultivationEvidenceRecord {
  evidenceId: string;
  /** Carried and serialized. Never compared, sorted, or resolved on. */
  version: string;
  claim: string;
  detail: string | null;
  citation: EvidenceSourceCitation;
  sourceDocumentType: EvidenceSourceType;
  tier: EvidenceTier;
  species: EvidenceSpecies;
  growSettings: SkillGrowSetting[];
  media: SkillMedium[];
  irrigationArchitectures: SkillIrrigationArchitecture[];
  stages: SkillPlantStage[];
  metrics: SensorGateMetric[];
  /** An axis is empty IFF it is declared agnostic here. */
  agnosticAxes: EvidenceAxis[];
  productIds: string[];
  applicabilityConditions: EvidenceApplicabilityCondition[];
  limitations: EvidenceLimitation[];
  conflictingEvidenceIds: string[];
  lastReviewed: string;
  reviewer: string;
  status: EvidenceStatus;
  allowedSkillIds: string[];
}

const AXIS_FIELD: Readonly<Record<EvidenceAxis, keyof CultivationEvidenceRecord>> = Object.freeze({
  growSettings: "growSettings",
  media: "media",
  irrigationArchitectures: "irrigationArchitectures",
  stages: "stages",
  metrics: "metrics",
});

/**
 * Tiers permitted to declare an axis agnostic. An SOP is by definition a
 * practice under stated conditions, and a product spec is scoped by
 * construction — neither may claim to apply everywhere.
 */
const AGNOSTIC_CAPABLE_TIERS: readonly EvidenceTier[] = [
  "controlled_cannabis_research",
  "controlled_environment_horticulture_research",
];

export const cultivationEvidenceRecordSchema = z
  .object({
    evidenceId: idTokenSchema,
    version: semverSchema,
    claim: contractTextSchema,
    detail: contractTextSchema.nullable(),
    citation: citationSchema,
    sourceDocumentType: z.enum(EVIDENCE_SOURCE_TYPES),
    tier: z.enum(EVIDENCE_TIERS),
    species: z.enum(EVIDENCE_SPECIES),
    growSettings: z.array(z.enum(growSettingEnumValues())).max(16),
    media: z.array(z.enum(SKILL_MEDIA)).max(16),
    irrigationArchitectures: z.array(z.enum(SKILL_IRRIGATION_ARCHITECTURES)).max(16),
    stages: z.array(z.enum(SKILL_PLANT_STAGES)).max(16),
    metrics: z.array(z.enum(SENSOR_GATE_METRICS)).max(16),
    agnosticAxes: z.array(z.enum(EVIDENCE_AXES)).max(EVIDENCE_AXES.length),
    productIds: z.array(idTokenSchema).max(32),
    applicabilityConditions: z.array(applicabilityConditionSchema).max(16),
    limitations: z.array(limitationSchema).max(16),
    conflictingEvidenceIds: z.array(idTokenSchema).max(32),
    lastReviewed: isoTimestampSchema,
    reviewer: reviewerHandleSchema,
    status: z.enum(EVIDENCE_STATUSES),
    allowedSkillIds: z.array(skillIdSchema).min(1).max(64),
  })
  .strict()
  .superRefine((r, ctx) => {
    const add = (message: string, path: (string | number)[]): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    };
    const tier = r.tier as EvidenceTier;

    // Tier and document form must agree.
    const admissible = TIER_ADMISSIBLE_SOURCE_TYPES[tier];
    if (admissible && !admissible.includes(r.sourceDocumentType as EvidenceSourceType)) {
      add("source_document_type_not_admissible_for_tier", ["sourceDocumentType"]);
    }

    // Cannabis research must actually be about cannabis.
    if (tier === "controlled_cannabis_research" && r.species !== "cannabis") {
      add("cannabis_research_tier_requires_cannabis_species", ["species"]);
    }

    // Citation completeness scales with the authority being claimed.
    for (const issue of citationIssues(tier, r.citation as EvidenceSourceCitation)) {
      add(issue, ["citation"]);
    }

    // A manufacturer instruction is meaningless without the product it
    // belongs to. Routed off the DOCUMENT FORM as well as the tier, so
    // re-tiering a product leaflet cannot shed the requirement.
    const isProductDocument =
      tier === "manufacturer_specification" ||
      r.sourceDocumentType === "product_label" ||
      r.sourceDocumentType === "manufacturer_manual";
    if (isProductDocument) {
      if (r.productIds.length === 0) {
        add("product_document_requires_product_ids", ["productIds"]);
      }
      if (r.citation.publisher === null) {
        add("product_document_requires_publisher", ["citation", "publisher"]);
      }
    }

    // An axis is empty if and only if it is declared agnostic. Silence
    // is never agreement: an unscoped axis has to be an assertion
    // somebody made, not a field somebody forgot.
    const agnostic = new Set<string>(r.agnosticAxes);
    for (const axis of EVIDENCE_AXES) {
      const value = r[AXIS_FIELD[axis]] as unknown[];
      const isEmpty = value.length === 0;
      if (isEmpty && !agnostic.has(axis)) {
        add(`axis_empty_but_not_declared_agnostic:${axis}`, [axis]);
      }
      if (!isEmpty && agnostic.has(axis)) {
        add(`axis_declared_agnostic_but_scoped:${axis}`, ["agnosticAxes"]);
      }
    }
    if (r.agnosticAxes.length > 0 && !AGNOSTIC_CAPABLE_TIERS.includes(tier)) {
      add("tier_may_not_declare_agnostic_axes", ["agnosticAxes"]);
    }

    // "unknown" is a real token on both axes, and it means "nobody
    // recorded it". Evidence cannot be scoped TO that.
    if ((r.media as string[]).includes("unknown")) {
      add("unknown_is_not_a_scopable_medium", ["media"]);
    }
    if ((r.irrigationArchitectures as string[]).includes("unknown")) {
      add("unknown_is_not_a_scopable_irrigation_architecture", ["irrigationArchitectures"]);
    }

    // Cross-species research must state its own limits.
    if (tier === "controlled_environment_horticulture_research" && r.limitations.length === 0) {
      add("horticulture_tier_requires_stated_limitations", ["limitations"]);
    }

    // Derived codes are the runtime's to emit.
    const derived = new Set<string>(EVIDENCE_DERIVED_LIMITATION_CODES);
    for (const limitation of r.limitations) {
      if (derived.has(limitation.code)) {
        add(`limitation_code_is_runtime_derived:${limitation.code}`, ["limitations"]);
      }
    }

    // A record cannot conflict with itself.
    if (r.conflictingEvidenceIds.includes(r.evidenceId)) {
      add("conflicting_evidence_id_is_self", ["conflictingEvidenceIds"]);
    }
    if (new Set(r.conflictingEvidenceIds).size !== r.conflictingEvidenceIds.length) {
      add("conflicting_evidence_ids_contain_duplicates", ["conflictingEvidenceIds"]);
    }
    if (new Set(r.allowedSkillIds).size !== r.allowedSkillIds.length) {
      add("allowed_skill_ids_contain_duplicates", ["allowedSkillIds"]);
    }
  });

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * A record as registered: the curated data plus what the build derived.
 * `conflictingEvidenceIds` here is the SYMMETRIC CLOSURE, so a conflict
 * is visible from whichever side the caller happens to match.
 */
export interface RegisteredEvidenceRecord extends CultivationEvidenceRecord {
  tierRank: number;
  citationCompleteness: EvidenceCitationCompleteness;
}

declare const EVIDENCE_REGISTRY_BRAND: unique symbol;

/**
 * Opaque on purpose: retrieval accepts only a registry that
 * `buildEvidenceRegistry` minted, so "no uncited evidence" is enforced
 * once at build time instead of re-checked on every read.
 */
export interface EvidenceRegistry {
  readonly [EVIDENCE_REGISTRY_BRAND]: true;
  list(): RegisteredEvidenceRecord[];
  get(evidenceId: string): RegisteredEvidenceRecord | null;
  ids(): string[];
  recordCount(): number;
  /** Identifies the exact corpus a citation came from. */
  signature(): string;
}

export type BuildEvidenceRegistryResult =
  | { ok: true; registry: EvidenceRegistry }
  | { ok: false; issues: string[] };

/**
 * Codepoint ordering. `localeCompare` is locale- and ICU-dependent, so
 * the same corpus could order differently on a contributor's machine
 * than in CI — which would break the determinism guarantee this build
 * is required to make.
 */
export function compareEvidenceIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

/**
 * FNV-1a over the canonical serialization of the corpus. Pure, tiny, and
 * dependency-free — this is an identity stamp so a cited claim can name
 * the corpus it came from, not a security hash.
 */
export function evidenceRegistrySignature(records: readonly RegisteredEvidenceRecord[]): string {
  const canonical = serializeSkillContract(records);
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Validate and register a corpus. Every record must be valid; one bad
 * record fails the whole build rather than silently registering a
 * partial corpus a skill would then cite as if it were complete.
 *
 * `options.knownSkillIds` cross-checks `allowedSkillIds` against the
 * skills that actually exist. Pass `null` to skip that check
 * deliberately — it is a required key so skipping is always a choice
 * somebody made, never an omission.
 */
export function buildEvidenceRegistry(
  records: readonly unknown[],
  options: { knownSkillIds: readonly string[] | null },
): BuildEvidenceRegistryResult {
  const issues: string[] = [];
  const parsed: CultivationEvidenceRecord[] = [];

  records.forEach((raw, index) => {
    const result = cultivationEvidenceRecordSchema.safeParse(raw);
    if (result.success === false) {
      for (const issue of result.error.issues) {
        issues.push(`[${index}] ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      return;
    }
    parsed.push(result.data as unknown as CultivationEvidenceRecord);
  });

  // Local grow evidence has no consented ingest path in V1 and this
  // corpus ships in the client bundle. Refusing it here is what makes
  // cross-user disclosure impossible rather than merely filtered.
  for (const record of parsed) {
    if (record.tier === "local_grow_evidence") {
      issues.push(`${record.evidenceId}: local_evidence_not_registerable_in_v1`);
    }
  }

  const byId = new Map<string, CultivationEvidenceRecord>();
  for (const record of parsed) {
    if (byId.has(record.evidenceId)) {
      issues.push(`duplicate evidenceId: ${record.evidenceId}`);
      continue;
    }
    byId.set(record.evidenceId, record);
  }

  // A conflict pointing at nothing is a silent loss of visibility: the
  // runtime would report "no conflicts" for a claim the curator knew was
  // contested. Same posture as the skill registry's supersession check.
  for (const record of parsed) {
    for (const target of record.conflictingEvidenceIds) {
      if (!byId.has(target)) {
        issues.push(`${record.evidenceId}: conflictingEvidenceId ${target} is not registered`);
      }
    }
  }

  if (options.knownSkillIds !== null) {
    const known = new Set<string>(options.knownSkillIds);
    for (const record of parsed) {
      for (const skillId of record.allowedSkillIds) {
        if (!known.has(skillId)) {
          issues.push(`${record.evidenceId}: allowedSkillId ${skillId} is not a known skill`);
        }
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues: issues.sort() };

  // Symmetric closure: a conflict annotated on one side is visible from
  // both. Otherwise whether a caller learns their claim is contested
  // depends on which of the two records their query happened to match.
  const closure = new Map<string, Set<string>>();
  for (const record of parsed) closure.set(record.evidenceId, new Set());
  for (const record of parsed) {
    for (const target of record.conflictingEvidenceIds) {
      closure.get(record.evidenceId)?.add(target);
      closure.get(target)?.add(record.evidenceId);
    }
  }

  const registered: RegisteredEvidenceRecord[] = parsed
    .map((record) => ({
      ...record,
      conflictingEvidenceIds: [...(closure.get(record.evidenceId) ?? new Set<string>())].sort(
        compareEvidenceIds,
      ),
      tierRank: evidenceTierRank(record.tier),
      citationCompleteness: requiredCompleteness(record.tier),
    }))
    .sort((a, b) => compareEvidenceIds(a.evidenceId, b.evidenceId))
    .map((record) => deepFreeze(record));

  const lookup = new Map<string, RegisteredEvidenceRecord>();
  for (const record of registered) lookup.set(record.evidenceId, record);
  const signature = evidenceRegistrySignature(registered);

  const registry = {
    list: () => [...registered],
    get: (evidenceId: string) => lookup.get(evidenceId) ?? null,
    ids: () => registered.map((r) => r.evidenceId),
    recordCount: () => registered.length,
    signature: () => signature,
  } as unknown as EvidenceRegistry;

  return { ok: true, registry };
}

/** Throwing variant for module-load registration. */
export function assertValidEvidenceRegistry(
  records: readonly unknown[],
  options: { knownSkillIds: readonly string[] | null },
): EvidenceRegistry {
  const result = buildEvidenceRegistry(records, options);
  if (result.ok === false) {
    throw new Error(`[verdantEvidenceRegistry] ${result.issues.join("; ")}`);
  }
  return result.registry;
}
