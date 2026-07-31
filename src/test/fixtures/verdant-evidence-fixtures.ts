/**
 * A deliberately tiny evidence corpus — enough to exercise every branch
 * of the registry and retrieval runtime, and no more. This is NOT the
 * start of Verdant's cultivation encyclopedia: real curation is a
 * separate, reviewed process with a domain expert in the loop.
 *
 * Claims here are illustrative test data. They are phrased plausibly so
 * the shapes are realistic, but no number in this file should be treated
 * as a cultivation recommendation.
 *
 * Every citation is fictional and every reviewer is a handle, not a
 * person. `verdant-evidence-fixture-safety.test.ts` enforces that.
 */

import type { CultivationEvidenceRecord } from "@/lib/verdantEvidenceRegistry";

/** The skill these fixtures are curated for. */
export const FIXTURE_SKILL_ID = "coco-dryback-review";
export const OTHER_SKILL_ID = "leaf-photo-triage";
export const FIXTURE_PRODUCT_ID = "prod-nutrient-a";

const REVIEWED_AT = "2026-01-15T00:00:00.000Z";

/**
 * Tier 1 — controlled cannabis research. Agnostic on setting, medium,
 * and irrigation: a vapour-pressure-deficit relationship is a property
 * of the air, not of the root zone.
 */
const vpdFlowerBand: CultivationEvidenceRecord = {
  evidenceId: "ev-vpd-flower-band",
  version: "1.0.0",
  claim: "Flowering canopies held near a moderate VPD band show steadier stomatal conductance.",
  detail: null,
  citation: {
    title: "Vapour pressure deficit and stomatal behaviour in flowering Cannabis sativa",
    publisher: "Journal of Controlled Environment Horticulture",
    year: 2024,
    locator: "10.1234/jceh.2024.0117",
    url: null,
  },
  sourceDocumentType: "journal_article",
  tier: "controlled_cannabis_research",
  species: "cannabis",
  growSettings: [],
  media: [],
  irrigationArchitectures: [],
  stages: ["flower", "late_flower"],
  metrics: ["vpd_kpa"],
  agnosticAxes: ["growSettings", "media", "irrigationArchitectures"],
  productIds: [],
  applicabilityConditions: [],
  limitations: [],
  conflictingEvidenceIds: ["ev-vpd-flower-band-contested"],
  lastReviewed: REVIEWED_AT,
  reviewer: "curator-a",
  status: "verified",
  allowedSkillIds: [FIXTURE_SKILL_ID],
};

/**
 * A contradicting tier-1 finding that is ALSO deprecated. It must still
 * surface as a conflict: "we retired this" is not the same as "this was
 * never said", and hiding it would let the runtime look more settled
 * than the literature is.
 */
const vpdFlowerBandContested: CultivationEvidenceRecord = {
  evidenceId: "ev-vpd-flower-band-contested",
  version: "1.0.0",
  claim: "Flowering canopies showed no consistent stomatal response across the same VPD band.",
  detail: null,
  citation: {
    title: "Absence of a consistent VPD-conductance relationship in late flowering",
    publisher: "Controlled Environment Research Letters",
    year: 2025,
    locator: null,
    url: "https://example.org/cerl/2025/vpd-conductance",
  },
  sourceDocumentType: "journal_article",
  tier: "controlled_cannabis_research",
  species: "cannabis",
  growSettings: [],
  media: [],
  irrigationArchitectures: [],
  stages: ["flower", "late_flower"],
  metrics: ["vpd_kpa"],
  agnosticAxes: ["growSettings", "media", "irrigationArchitectures"],
  productIds: [],
  applicabilityConditions: [],
  limitations: [],
  // Deliberately NOT annotated back — the build computes the symmetric
  // closure, so the conflict is visible from whichever side matched.
  conflictingEvidenceIds: [],
  lastReviewed: REVIEWED_AT,
  reviewer: "curator-a",
  status: "deprecated",
  allowedSkillIds: [FIXTURE_SKILL_ID],
};

/** Tier 2 — cross-species horticulture research. Must state its limits. */
const tomatoEcResponse: CultivationEvidenceRecord = {
  evidenceId: "ev-tomato-ec-response",
  version: "1.1.0",
  claim: "Raising root-zone EC in soilless media reduced vegetative shoot extension.",
  detail: "Measured in recirculating tomato production, not in cannabis.",
  citation: {
    title: "Root-zone electrical conductivity and shoot extension in soilless tomato",
    publisher: "International Society for Horticultural Science",
    year: 2023,
    locator: "10.5678/ishs.2023.4412",
    url: null,
  },
  sourceDocumentType: "journal_article",
  tier: "controlled_environment_horticulture_research",
  species: "tomato",
  growSettings: [],
  media: ["coco", "rockwool"],
  irrigationArchitectures: [],
  stages: ["veg"],
  metrics: ["soil_ec_ms_cm"],
  agnosticAxes: ["growSettings", "irrigationArchitectures"],
  productIds: [],
  applicabilityConditions: [],
  limitations: [
    {
      code: "sample_limitation",
      detail: "Single cultivar, single season.",
    },
  ],
  conflictingEvidenceIds: [],
  lastReviewed: REVIEWED_AT,
  reviewer: "curator-b",
  status: "verified",
  allowedSkillIds: [FIXTURE_SKILL_ID],
};

/** Tier 3 — a product instruction. Scoped to its product, by construction. */
const nutrientAMixRate: CultivationEvidenceRecord = {
  evidenceId: "ev-nutrient-a-mix-rate",
  version: "2.0.0",
  claim: "The manufacturer specifies a fixed dilution rate for vegetative feeding.",
  detail: null,
  citation: {
    title: "Nutrient A feeding chart",
    publisher: "Example Nutrients Ltd",
    year: 2025,
    locator: "Rev. 4",
    url: null,
  },
  sourceDocumentType: "product_label",
  tier: "manufacturer_specification",
  species: "cannabis",
  growSettings: ["tent"],
  media: ["coco"],
  irrigationArchitectures: ["top_feed_drain_to_waste"],
  stages: ["veg"],
  metrics: ["soil_ec_ms_cm"],
  agnosticAxes: [],
  productIds: [FIXTURE_PRODUCT_ID],
  applicabilityConditions: [],
  limitations: [],
  conflictingEvidenceIds: [],
  lastReviewed: REVIEWED_AT,
  reviewer: "curator-b",
  status: "verified",
  allowedSkillIds: [FIXTURE_SKILL_ID],
};

/** Tier 4 — an established SOP. Fully scoped: a practice under conditions. */
const cocoDrybackSop: CultivationEvidenceRecord = {
  evidenceId: "ev-coco-dryback-sop",
  version: "1.0.0",
  claim: "Drain-to-waste coco is managed by targeting a consistent overnight dryback percentage.",
  detail: null,
  citation: {
    title: "Coco drain-to-waste irrigation standard practice",
    publisher: "Verdant cultivation standards",
    year: 2025,
    locator: "SOP-COCO-01",
    url: null,
  },
  sourceDocumentType: "internal_sop",
  tier: "established_sop",
  species: "cannabis",
  growSettings: ["tent"],
  media: ["coco"],
  irrigationArchitectures: ["top_feed_drain_to_waste"],
  stages: ["flower"],
  metrics: ["soil_moisture_pct"],
  agnosticAxes: [],
  productIds: [],
  applicabilityConditions: [
    { kind: "requires_metric", metric: "soil_moisture_pct" },
    { kind: "advisory", detail: "Assumes substrate sensor placement in the active root zone." },
  ],
  limitations: [],
  conflictingEvidenceIds: ["ev-dryback-stress-hypothesis"],
  lastReviewed: REVIEWED_AT,
  reviewer: "curator-a",
  status: "verified",
  allowedSkillIds: [FIXTURE_SKILL_ID],
};

/**
 * Tier 6 — a hypothesis, deliberately marked `verified` to prove the
 * quarantine does not depend on status. It also conflicts with the SOP
 * above, proving a hypothesis cannot ride into the result through the
 * conflict channel either.
 */
const drybackStressHypothesis: CultivationEvidenceRecord = {
  evidenceId: "ev-dryback-stress-hypothesis",
  version: "0.1.0",
  claim: "Deeper drybacks may increase resin production.",
  detail: null,
  citation: {
    title: "Internal hypothesis: dryback depth and resin response",
    publisher: null,
    year: null,
    locator: null,
    url: null,
  },
  sourceDocumentType: "internal_sop",
  tier: "unverified_hypothesis",
  species: "cannabis",
  growSettings: ["tent"],
  media: ["coco"],
  irrigationArchitectures: ["top_feed_drain_to_waste"],
  stages: ["flower"],
  metrics: ["soil_moisture_pct"],
  agnosticAxes: [],
  productIds: [],
  applicabilityConditions: [],
  limitations: [],
  conflictingEvidenceIds: [],
  lastReviewed: REVIEWED_AT,
  reviewer: "curator-a",
  status: "verified",
  allowedSkillIds: [FIXTURE_SKILL_ID],
};

/** Curated for a different skill entirely. */
const otherSkillOnly: CultivationEvidenceRecord = {
  evidenceId: "ev-leaf-colour-index",
  version: "1.0.0",
  claim: "Leaf colour indices correlate with measured nitrogen status.",
  detail: null,
  citation: {
    title: "Leaf colour indexing for nitrogen status",
    publisher: "Journal of Controlled Environment Horticulture",
    year: 2022,
    locator: "10.1234/jceh.2022.0042",
    url: null,
  },
  sourceDocumentType: "journal_article",
  tier: "controlled_cannabis_research",
  species: "cannabis",
  growSettings: [],
  media: [],
  irrigationArchitectures: [],
  stages: ["veg"],
  metrics: ["soil_ec_ms_cm"],
  agnosticAxes: ["growSettings", "media", "irrigationArchitectures"],
  productIds: [],
  applicabilityConditions: [],
  limitations: [],
  conflictingEvidenceIds: [],
  lastReviewed: REVIEWED_AT,
  reviewer: "curator-b",
  status: "verified",
  allowedSkillIds: [OTHER_SKILL_ID],
};

export const EVIDENCE_FIXTURES: readonly CultivationEvidenceRecord[] = Object.freeze([
  vpdFlowerBand,
  vpdFlowerBandContested,
  tomatoEcResponse,
  nutrientAMixRate,
  cocoDrybackSop,
  drybackStressHypothesis,
  otherSkillOnly,
]);

export const FIXTURE_SKILL_IDS: readonly string[] = Object.freeze([
  FIXTURE_SKILL_ID,
  OTHER_SKILL_ID,
]);
