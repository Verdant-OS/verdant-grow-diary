/**
 * verdantEvidenceRetrievalRules — deterministic selection of curated
 * evidence for one skill run.
 *
 * Build 5 of Verdant Skill Runtime v1. Pure and deterministic: no I/O,
 * no clock, no model call, no network, no ranking model. Retrieval is a
 * FILTER over a frozen corpus, not a search: the same registry and the
 * same query always produce byte-identical output.
 *
 * WHAT THIS REFUSES TO DO
 *  - It never returns an unverified hypothesis as evidence.
 *  - It never generalizes a manufacturer instruction beyond its product.
 *  - It never lets an empty `conflicts` array read as consensus: every
 *    result reports how many conflict links were examined and how many
 *    were withheld.
 *  - It never reports "no evidence" and "not permitted to read evidence"
 *    with the same shape, because those mean opposite things to a
 *    caller deciding whether it may proceed.
 *
 * The grant is checked against a VALIDATED MANIFEST, not a bare skill
 * id. A caller that could pass a string could pass any string.
 */

import { z } from "zod";
import {
  EVIDENCE_TIERS,
  compareEvidenceIds,
  evidenceTierRank,
  type EvidenceCitationCompleteness,
  type EvidenceLimitation,
  type EvidenceRegistry,
  type EvidenceSourceType,
  type EvidenceSpecies,
  type EvidenceStatus,
  type EvidenceTier,
  type RegisteredEvidenceRecord,
} from "@/lib/verdantEvidenceRegistry";
import {
  EVIDENCE_REGISTRY_CONTRACT_VERSION,
  EVIDENCE_SPECIES,
  EVIDENCE_STATUSES,
} from "@/lib/verdantEvidenceRegistry";
import {
  growSettingEnumValues,
  SKILL_IRRIGATION_ARCHITECTURES,
  SKILL_MEDIA,
  skillManifestGrantsPermission,
  type VerdantSkillManifest,
} from "@/lib/verdantSkillManifest";
import { SENSOR_GATE_METRICS, type SensorGateMetric } from "@/lib/sensorTruthGateRules";
import { SKILL_PLANT_STAGES } from "@/lib/verdantSkillSchemas";

// ---------------------------------------------------------------------------
// Result vocabulary
// ---------------------------------------------------------------------------

/**
 * Why a record did not make it. Declared order is the emission order, so
 * reasons never depend on evaluation order.
 */
export const EVIDENCE_EXCLUSION_REASONS = [
  "skill_not_permitted",
  "status_not_verified",
  "unverified_hypothesis",
  "unknown_evidence_tier",
  "tier_below_ceiling",
  "species_mismatch",
  "product_scope_not_matched",
  "grow_setting_mismatch",
  "medium_mismatch",
  "irrigation_mismatch",
  "stage_mismatch",
  "metric_mismatch",
  "applicability_condition_unmet",
] as const;
export type EvidenceExclusionReason = (typeof EVIDENCE_EXCLUSION_REASONS)[number];

/** What happened overall. Present on EVERY result, not just empty ones. */
export const EVIDENCE_OUTCOMES = [
  "matched",
  "no_matching_evidence",
  "all_candidates_excluded",
  "retrieval_not_permitted",
] as const;
export type EvidenceOutcome = (typeof EVIDENCE_OUTCOMES)[number];

/** Whether the skill's declared evidence policy was satisfied. */
export const EVIDENCE_POLICY_OUTCOMES = [
  "not_required",
  "satisfied",
  "unsatisfied_required",
] as const;
export type EvidencePolicyOutcome = (typeof EVIDENCE_POLICY_OUTCOMES)[number];

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Every axis is a REQUIRED key that accepts explicit null. A caller must
 * say "I do not know the medium" rather than omitting the field, and a
 * null axis matches only records that declared that axis agnostic —
 * never an axis-scoped one.
 */
export const evidenceRetrievalQuerySchema = z
  .object({
    species: z.enum(EVIDENCE_SPECIES),
    growSetting: z.enum(growSettingEnumValues()).nullable(),
    medium: z.enum(SKILL_MEDIA).nullable(),
    irrigationArchitecture: z.enum(SKILL_IRRIGATION_ARCHITECTURES).nullable(),
    stage: z.enum(SKILL_PLANT_STAGES).nullable(),
    /** Metrics the caller is actually reasoning about. */
    metrics: z.array(z.enum(SENSOR_GATE_METRICS)).max(16),
    /** Metrics the caller actually has usable readings for. */
    observedMetrics: z.array(z.enum(SENSOR_GATE_METRICS)).max(16),
    /** Products in play. An explicit [] is legal and means "none". */
    productIds: z.array(z.string().trim().min(1).max(128)).max(32),
    /**
     * Weakest tier the caller will accept. Narrows only — there is no
     * lever that admits a hypothesis.
     */
    tierCeiling: z.enum([
      "controlled_cannabis_research",
      "controlled_environment_horticulture_research",
      "manufacturer_specification",
      "established_sop",
    ]),
    /** Statuses to CONSIDER. Only `verified` can ever be applicable. */
    statuses: z.array(z.enum(EVIDENCE_STATUSES)).min(1).max(EVIDENCE_STATUSES.length),
  })
  .strict();

export interface EvidenceRetrievalQuery {
  species: EvidenceSpecies;
  growSetting: string | null;
  medium: string | null;
  irrigationArchitecture: string | null;
  stage: string | null;
  metrics: SensorGateMetric[];
  observedMetrics: SensorGateMetric[];
  productIds: string[];
  tierCeiling: EvidenceTier;
  statuses: EvidenceStatus[];
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** Citation-ready reference. Tier travels with it, always. */
export interface EvidenceCitationRef {
  evidenceId: string;
  version: string;
  tier: EvidenceTier;
  tierRank: number;
  sourceDocumentType: EvidenceSourceType;
  species: EvidenceSpecies;
  citation: {
    title: string;
    publisher: string | null;
    year: number | null;
    locator: string | null;
    url: string | null;
  };
  citationCompleteness: EvidenceCitationCompleteness;
  /** Verbatim. Build 6 decides what "old" means, and in what unit. */
  lastReviewed: string;
  reviewer: string;
}

export interface RetrievedEvidence {
  evidenceId: string;
  claim: string;
  detail: string | null;
  tier: EvidenceTier;
  tierRank: number;
  /**
   * Rank used for ordering. A cross-species record sorts one step weaker
   * than its nominal tier — a demotion a downstream model cannot
   * paraphrase away, unlike a prose caveat.
   */
  effectiveTierRank: number;
  species: EvidenceSpecies;
  limitations: EvidenceLimitation[];
  citation: EvidenceCitationRef;
}

export interface ExcludedEvidence {
  evidenceId: string;
  tier: EvidenceTier;
  reasons: EvidenceExclusionReason[];
}

export interface EvidenceConflictNote {
  evidenceId: string;
  conflictsWith: string[];
  claim: string;
  tier: EvidenceTier;
  status: EvidenceStatus;
  /** True when this record is not itself applicable to the query. */
  excludedFromApplicable: boolean;
  /**
   * Why it is not applicable, in the same vocabulary `excluded` uses.
   *
   * A counter-claim scoped to a different product, medium, stage, or
   * species is still shown — suppressing it is how a runtime
   * manufactures certainty — but it is NOT a counter-claim to this
   * query, and a downstream model must be able to tell the difference
   * without re-deriving the scope itself. Empty when the record is
   * applicable and genuinely contests the finding.
   */
  exclusionReasons: EvidenceExclusionReason[];
  /** Scope the conflicting record carries, e.g. its product limitation. */
  limitations: EvidenceLimitation[];
  /** Products this counter-claim is confined to, if any. */
  productIds: string[];
  citation: EvidenceCitationRef;
}

export interface EvidenceRetrievalResult {
  evidenceOutcome: EvidenceOutcome;
  policyOutcome: EvidencePolicyOutcome;
  applicable: RetrievedEvidence[];
  excluded: ExcludedEvidence[];
  conflicts: EvidenceConflictNote[];
  limitations: EvidenceLimitation[];
  references: EvidenceCitationRef[];
  /**
   * Qualifies the conflicts array. An empty `conflicts` with
   * `linksChecked: 0` means nothing was contested; with
   * `withheld > 0` it means something was, and the caller was not
   * cleared to see it. Those are different facts.
   */
  conflictSurvey: {
    linksChecked: number;
    surfaced: number;
    withheld: number;
    withheldReasons: string[];
  };
  registry: {
    contractVersion: string;
    signature: string;
    recordCount: number;
  };
}

export type RetrieveEvidenceResult =
  | { ok: true; result: EvidenceRetrievalResult }
  | { ok: false; issues: string[] };

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Axis match. An agnostic axis (empty on the record) matches anything,
 * including a null query value — that is what the curator asserted. An
 * axis-SCOPED record never matches a null query value: not knowing the
 * medium is not evidence that the medium matches.
 */
function axisMatches(scope: readonly string[], value: string | null): boolean {
  if (scope.length === 0) return true;
  if (value === null) return false;
  return scope.includes(value);
}

function orderedReasons(found: ReadonlySet<EvidenceExclusionReason>): EvidenceExclusionReason[] {
  return EVIDENCE_EXCLUSION_REASONS.filter((reason) => found.has(reason));
}

function toCitationRef(record: RegisteredEvidenceRecord): EvidenceCitationRef {
  return {
    evidenceId: record.evidenceId,
    version: record.version,
    tier: record.tier,
    tierRank: record.tierRank,
    sourceDocumentType: record.sourceDocumentType,
    species: record.species,
    citation: {
      title: record.citation.title,
      publisher: record.citation.publisher,
      year: record.citation.year,
      locator: record.citation.locator,
      url: record.citation.url,
    },
    citationCompleteness: record.citationCompleteness,
    lastReviewed: record.lastReviewed,
    reviewer: record.reviewer,
  };
}

/**
 * Every reason a record fails this query. Collects ALL reasons rather
 * than short-circuiting on the first, so the caller sees the whole
 * picture and the output stays order-independent.
 */
function excludeReasons(
  record: RegisteredEvidenceRecord,
  query: EvidenceRetrievalQuery,
  manifestSkillId: string,
): Set<EvidenceExclusionReason> {
  const reasons = new Set<EvidenceExclusionReason>();

  if (!record.allowedSkillIds.includes(manifestSkillId)) {
    reasons.add("skill_not_permitted");
  }
  if (record.status !== "verified") {
    reasons.add("status_not_verified");
  }
  // A hypothesis is never evidence, whatever else is true of it.
  if (record.tier === "unverified_hypothesis") {
    reasons.add("unverified_hypothesis");
  }
  if (record.tierRank === Number.MAX_SAFE_INTEGER) {
    reasons.add("unknown_evidence_tier");
  }
  if (record.tierRank > evidenceTierRank(query.tierCeiling)) {
    reasons.add("tier_below_ceiling");
  }

  // Cross-species material is only ever admissible from the
  // controlled-environment horticulture tier, which exists precisely to
  // carry it. Everywhere else a species mismatch is an exclusion.
  if (
    record.species !== query.species &&
    record.tier !== "controlled_environment_horticulture_research"
  ) {
    reasons.add("species_mismatch");
  }

  // A product instruction applies to its product and nothing else.
  const isProductScoped = record.productIds.length > 0;
  if (isProductScoped && !record.productIds.some((id) => query.productIds.includes(id))) {
    reasons.add("product_scope_not_matched");
  }

  if (!axisMatches(record.growSettings, query.growSetting)) reasons.add("grow_setting_mismatch");
  if (!axisMatches(record.media, query.medium)) reasons.add("medium_mismatch");
  if (!axisMatches(record.irrigationArchitectures, query.irrigationArchitecture)) {
    reasons.add("irrigation_mismatch");
  }
  if (!axisMatches(record.stages, query.stage)) reasons.add("stage_mismatch");
  if (record.metrics.length > 0 && !record.metrics.some((m) => query.metrics.includes(m))) {
    reasons.add("metric_mismatch");
  }

  // Machine-checkable preconditions. `advisory` conditions are never
  // auto-satisfied here — they surface as limitations instead.
  for (const condition of record.applicabilityConditions) {
    if (condition.kind === "requires_metric" && !query.observedMetrics.includes(condition.metric)) {
      reasons.add("applicability_condition_unmet");
    }
  }

  return reasons;
}

/** Limitations the runtime derives, on top of what the curator wrote. */
function derivedLimitations(
  record: RegisteredEvidenceRecord,
  query: EvidenceRetrievalQuery,
): EvidenceLimitation[] {
  const out: EvidenceLimitation[] = [];
  if (record.species !== query.species) {
    out.push({
      code: "cross_species_extrapolation",
      detail: `Findings are from ${record.species}, applied to ${query.species}.`,
    });
  }
  if (record.productIds.length > 0) {
    out.push({
      code: "product_specific_instruction",
      detail: `Applies to ${record.productIds.join(", ")} only.`,
    });
  }
  for (const condition of record.applicabilityConditions) {
    if (condition.kind === "advisory") {
      out.push({ code: "advisory_condition", detail: condition.detail });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/**
 * Select evidence for one skill run.
 *
 * The manifest is the grant: a skill must hold `retrieve_approved_evidence`
 * AND declare an evidence policy other than `context_only`. Refusal
 * returns `retrieval_not_permitted`, which is deliberately NOT the same
 * shape as "there is no evidence" — a caller must be able to tell "I may
 * not look" from "I looked and found nothing".
 */
export function retrieveEvidence(
  registry: EvidenceRegistry,
  manifest: VerdantSkillManifest,
  rawQuery: unknown,
): RetrieveEvidenceResult {
  const parsed = evidenceRetrievalQuerySchema.safeParse(rawQuery);
  if (parsed.success === false) {
    return {
      ok: false,
      issues: parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .sort(),
    };
  }
  const query = parsed.data as unknown as EvidenceRetrievalQuery;

  const registryStamp = {
    contractVersion: EVIDENCE_REGISTRY_CONTRACT_VERSION,
    signature: registry.signature(),
    recordCount: registry.recordCount(),
  };

  // Curated corpora are never complete. Saying so on every result is
  // what keeps "we found nothing" from reading as "there is nothing".
  const baseLimitations: EvidenceLimitation[] = [
    {
      code: "curated_coverage_only",
      detail: "Curated corpus only; absence of evidence is not evidence of absence.",
    },
  ];

  const permitted =
    skillManifestGrantsPermission(manifest, "retrieve_approved_evidence") &&
    manifest.evidencePolicy !== "context_only";
  if (!permitted) {
    return {
      ok: true,
      result: {
        evidenceOutcome: "retrieval_not_permitted",
        policyOutcome:
          manifest.evidencePolicy === "approved_evidence_required"
            ? "unsatisfied_required"
            : "not_required",
        applicable: [],
        excluded: [],
        conflicts: [],
        limitations: baseLimitations,
        references: [],
        conflictSurvey: { linksChecked: 0, surfaced: 0, withheld: 0, withheldReasons: [] },
        registry: registryStamp,
      },
    };
  }

  const considered = registry.list().filter((record) => query.statuses.includes(record.status));

  const applicable: RetrievedEvidence[] = [];
  const excluded: ExcludedEvidence[] = [];

  for (const record of considered) {
    const reasons = excludeReasons(record, query, manifest.id);
    if (reasons.size > 0) {
      excluded.push({
        evidenceId: record.evidenceId,
        tier: record.tier,
        reasons: orderedReasons(reasons),
      });
      continue;
    }
    // Cross-species material stays usable but sorts one step weaker than
    // its nominal tier. A rank is structural; a footnote is not.
    const crossSpecies = record.species !== query.species;
    applicable.push({
      evidenceId: record.evidenceId,
      claim: record.claim,
      detail: record.detail,
      tier: record.tier,
      tierRank: record.tierRank,
      effectiveTierRank: crossSpecies ? record.tierRank + 1 : record.tierRank,
      species: record.species,
      limitations: [...record.limitations, ...derivedLimitations(record, query)],
      citation: toCitationRef(record),
    });
  }

  applicable.sort((a, b) => {
    if (a.effectiveTierRank !== b.effectiveTierRank) {
      return a.effectiveTierRank - b.effectiveTierRank;
    }
    return compareEvidenceIds(a.evidenceId, b.evidenceId);
  });
  excluded.sort((a, b) => compareEvidenceIds(a.evidenceId, b.evidenceId));

  // Conflicts: a contested claim stays contested even when the opposing
  // record would not itself have survived the filter. Suppressing the
  // other side is how a runtime manufactures certainty.
  const conflicts: EvidenceConflictNote[] = [];
  const applicableIds = new Set(applicable.map((a) => a.evidenceId));
  const withheldReasons = new Set<string>();
  let linksChecked = 0;
  let withheld = 0;
  const seenConflict = new Set<string>();

  for (const entry of applicable) {
    const record = registry.get(entry.evidenceId);
    if (record === null) continue;
    for (const targetId of record.conflictingEvidenceIds) {
      linksChecked += 1;
      if (seenConflict.has(targetId)) continue;
      const target = registry.get(targetId);
      if (target === null) continue;
      // Gated, not exempt: the conflict channel must not become a way to
      // read records the skill was never granted, and a hypothesis is
      // not a counter-argument.
      if (!target.allowedSkillIds.includes(manifest.id)) {
        withheld += 1;
        withheldReasons.add("skill_not_permitted");
        continue;
      }
      if (target.tier === "unverified_hypothesis") {
        withheld += 1;
        withheldReasons.add("unverified_hypothesis");
        continue;
      }
      seenConflict.add(targetId);
      // A counter-claim scoped elsewhere is shown but LABELLED. Without
      // its reasons a caller cannot distinguish "this finding is
      // contested" from "a feeding instruction for a product you are not
      // using says something different", and the two are not the same
      // fact. The reasons use the same vocabulary as `excluded`, so the
      // scope never has to be re-derived downstream.
      const targetReasons = applicableIds.has(target.evidenceId)
        ? new Set<EvidenceExclusionReason>()
        : excludeReasons(target, query, manifest.id);
      conflicts.push({
        evidenceId: target.evidenceId,
        conflictsWith: target.conflictingEvidenceIds
          .filter((id) => applicableIds.has(id))
          .sort(compareEvidenceIds),
        claim: target.claim,
        tier: target.tier,
        status: target.status,
        excludedFromApplicable: !applicableIds.has(target.evidenceId),
        exclusionReasons: orderedReasons(targetReasons),
        limitations: [...target.limitations, ...derivedLimitations(target, query)],
        productIds: [...target.productIds],
        citation: toCitationRef(target),
      });
    }
  }
  conflicts.sort((a, b) => compareEvidenceIds(a.evidenceId, b.evidenceId));

  const evidenceOutcome: EvidenceOutcome =
    applicable.length > 0
      ? "matched"
      : excluded.length > 0
        ? "all_candidates_excluded"
        : "no_matching_evidence";

  const policyOutcome: EvidencePolicyOutcome =
    manifest.evidencePolicy === "approved_evidence_required"
      ? applicable.length > 0
        ? "satisfied"
        : "unsatisfied_required"
      : applicable.length > 0
        ? "satisfied"
        : "not_required";

  return {
    ok: true,
    result: {
      evidenceOutcome,
      policyOutcome,
      applicable,
      excluded,
      conflicts,
      limitations: baseLimitations,
      references: applicable.map((a) => a.citation),
      conflictSurvey: {
        linksChecked,
        surfaced: conflicts.length,
        withheld,
        withheldReasons: [...withheldReasons].sort(),
      },
      registry: registryStamp,
    },
  };
}

/**
 * Did the run satisfy its declared evidence policy? A skill declaring
 * `approved_evidence_required` that retrieved nothing must be treated as
 * insufficient context, not allowed to proceed unsourced.
 */
export function evidenceSatisfiesPolicy(result: EvidenceRetrievalResult): boolean {
  return result.policyOutcome !== "unsatisfied_required";
}

/** Re-exported so callers can iterate the ladder without a second import. */
export { EVIDENCE_TIERS };
