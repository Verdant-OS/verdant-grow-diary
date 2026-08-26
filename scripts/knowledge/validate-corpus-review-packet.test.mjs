import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertProductionPromotionAdmissionReceipt,
  canonicalJson,
  canonicalSha256,
  evaluateCorpusPromotion,
  evaluateCorpusPromotionForTest,
} from "./evaluate-corpus-promotion.mjs";
import {
  runtimeGuideDigest,
  validateCorpusReviewPacket,
} from "./validate-corpus-review-packet.mjs";
import { projectResolvedGuide, sha256Text } from "./validate-corpus.mjs";
import { EDGE_CONTRACTS } from "./validate-schemas.mjs";

const PATHS = Object.freeze([
  "/guides/cannabis-burnt-crispy-leaf-tips",
  "/guides/cannabis-leaf-spots-lesions",
  "/guides/cannabis-leaf-symptoms",
  "/guides/cannabis-leaves-turning-yellow",
]);
const PROVENANCE_ID = "source:pr-627-route-cohort-provenance";
const EVIDENCE_SOURCE_IDS = Object.freeze(["source:extension-b", "source:peer-a"]);
const HUB_PATH = "/guides/cannabis-leaf-symptoms";
const HUB_INTERNAL_LINKS = Object.freeze([
  {
    location: "sections.0.links.0",
    path: "/guides/cannabis-leaves-turning-yellow",
  },
  {
    location: "sections.0.links.1",
    path: "/guides/cannabis-leaf-spots-lesions",
  },
  {
    location: "sections.0.links.2",
    path: "/guides/cannabis-burnt-crispy-leaf-tips",
  },
  {
    location: "sections.2.links.0",
    path: "/guides/daily-grow-log-checklist",
  },
]);
const DIAGNOSTIC_INTERNAL_LINKS = Object.freeze([
  { location: "related.0", path: HUB_PATH },
  { location: "related.1", path: "/guides/plant-watering-log" },
  { location: "related.2", path: "/guides/sensor-truth-grow-room" },
]);
const PROMOTION_NEXT_PATH = "/guides/daily-grow-log-checklist";
const PROMOTION_DIFFERENTIAL_PATHS = Object.freeze([
  "/guides/plant-watering-log",
  "/guides/root-zone-troubleshooting",
  "/guides/sensor-truth-grow-room",
]);
const PROMOTION_REGISTRY_PATHS = Object.freeze(
  [...PATHS, PROMOTION_NEXT_PATH, ...PROMOTION_DIFFERENTIAL_PATHS].sort(),
);

function clone(value) {
  return structuredClone(value);
}

function resolvedGuide(path) {
  return {
    path,
    publishedOn: "2026-08-01",
    modifiedOn: "2026-08-01",
    material: [{ key: "body", text: `Bounded material for ${path}`, sha256: "a".repeat(64) }],
    internalLinks: clone(path === HUB_PATH ? HUB_INTERNAL_LINKS : DIAGNOSTIC_INTERNAL_LINKS),
    externalSources: [],
    relatedPaths: [],
  };
}

function source(id, sourceType, overrides = {}) {
  const isProvenance = sourceType === "cohort_provenance";
  const url = isProvenance
    ? "https://github.com/Verdant-OS/verdant-grow-diary/pull/627"
    : `https://example.edu/${id.split(":")[1]}`;
  return {
    id,
    sourceType,
    title: isProvenance ? "Verdant route cohort pull request" : `Evidence source ${id}`,
    url,
    publisher: isProvenance
      ? "Verdant-OS"
      : id === "source:peer-a"
        ? "Peer Journal"
        : "University Extension",
    authors: [],
    evidenceTier: id === "source:peer-a" ? "A" : "B",
    publishedOn: "2026-08-01",
    versionDate: null,
    accessedOn: "2026-08-26",
    stableIdentifier: url,
    archiveLocator: null,
    license: "Link and independent paraphrase only",
    limitations: ["This source does not establish a diagnosis by itself."],
    ...overrides,
  };
}

function applicability() {
  return {
    evidenceBasis: "authoritative_synthesis",
    speciesOrPopulation: "Cannabis sativa L. and general plant-diagnostic context",
    cultivarPopulation: "No cultivar-specific conclusion",
    stageScope: "All stages require stage-specific interpretation",
    propagationMethod: "Not evaluated as an independent causal factor",
    mediumScope: "Medium changes interpretation and must be recorded",
    facilityScope: "Indoor, greenhouse, and field transfer is not assumed",
    methodScope: "Observation pattern and history before intervention",
    unitScope: "No numeric threshold is asserted",
    evidenceDateScope: "Linked source versions accessed 2026-08-26",
    sampleSize: "Source-specific sample sizes are not pooled in this draft.",
    replication: "Source-specific replication designs are not pooled in this draft.",
    environmentalContext: {
      temperature: "Must be recorded; no universal threshold asserted",
      humidity: "Must be recorded; no universal threshold asserted",
      light: "Must be recorded; no universal threshold asserted",
      co2: "Not independently evaluated",
      irrigation: "Must be recorded as a confounder",
      pathogen: "Symptoms alone do not establish pathogen identity",
    },
    scopeNote: "A cautious evidence-check workflow, not a diagnosis",
    transferLimits: ["Controlled-study observations do not transfer universally."],
  };
}

function claim(path) {
  const slug = path.slice("/guides/".length);
  return {
    id: `claim:${slug}:bounded-evidence-check`,
    path,
    claimType: "diagnostic_boundary",
    wordingState: "bounded",
    evidenceState: "sourced_pending_review",
    riskClass: "R2",
    riskDomains: ["standard"],
    text: "A visible symptom should trigger evidence gathering rather than a single-cause diagnosis.",
    sourceLinks: EVIDENCE_SOURCE_IDS.map((sourceId) => ({
      sourceId,
      roles: sourceId === "source:peer-a" ? ["limits", "supports"] : ["supports"],
      locator: "Diagnostic method and limitations section",
    })),
    applicability: applicability(),
    confounders: ["Stage, medium, root-zone, light, and recent changes can overlap."],
    uncertainty: ["Visible appearance alone is not specific."],
    prohibitedConclusions: ["Do not identify a nutrient, pest, or pathogen from one sign."],
    limitations: ["This draft has not completed evidence or cultivation review."],
    authorId: null,
    evidenceReviewerIds: [],
    cultivationReviewerIds: [],
    approvalDecision: "pending",
    approvedOn: null,
    invalidationTriggers: ["Material copy, source, or product behavior changes."],
    nextReviewOn: null,
    materialKeys: ["body"],
  };
}

function page(path, guide) {
  const claimId = claim(path).id;
  const isHub = path === HUB_PATH;
  return {
    path,
    pageFamily: isHub ? "cluster" : "diagnostic",
    riskClass: "R2",
    runtimeMaterialSha256: runtimeGuideDigest(guide),
    claimIds: [claimId],
    nonClaimMaterial: [],
    proposedVisibleSourceIds: [...EVIDENCE_SOURCE_IDS],
    proposedLinks: isHub
      ? guide.internalLinks.map((link, index) => ({
          ...link,
          slot: index < 3 ? "collection_child" : "next_step",
          status: "proposed",
        }))
      : guide.internalLinks.map((link) => ({
          ...link,
          slot: "differential",
          status: "proposed",
        })),
    searchResearchReceiptId: null,
    originalAssetReviewId: null,
  };
}

function makeFixture() {
  const resolvedGuides = PATHS.map(resolvedGuide);
  return {
    cohortRegistry: {
      cohorts: [
        {
          id: "PV1-SYMPTOM-EVIDENCE-GUIDES",
          sourcePullRequest: 627,
          paths: [...PATHS],
        },
      ],
    },
    resolvedGuides,
    packet: {
      version: 1,
      artifactType: "knowledge_corpus_review_packet",
      revisionId: "pv1-symptom-evidence-guides:draft-001",
      createdOn: "2026-08-26",
      evidenceScope: "resolved_runtime_material_and_draft_claim_map",
      cohort: {
        id: "PV1-SYMPTOM-EVIDENCE-GUIDES",
        registrySourcePullRequest: 627,
        cohortProvenanceSourceId: PROVENANCE_ID,
        paths: [...PATHS],
        sourceRouteState: "registered_public",
        editorialState: "sourced",
        publicationReadiness: "BLOCKED",
      },
      statusEvidence: {
        publicationStatus: "NOT_MEASURED",
        renderedCrawlStatus: "NOT_MEASURED",
      },
      assignments: {
        managingEditorId: null,
        authorIds: [],
        evidenceReviewerIds: [],
        cultivationReviewerIds: [],
      },
      aiAssistance: {
        tool: "Codex",
        usedOn: "2026-08-26",
        uses: ["Draft claim organization", "Source discovery"],
        humanVerifierId: null,
      },
      sources: [
        source("source:extension-b", "evidence"),
        source("source:peer-a", "evidence"),
        source(PROVENANCE_ID, "cohort_provenance"),
      ],
      claims: PATHS.map(claim).sort((left, right) => left.id.localeCompare(right.id)),
      pages: PATHS.map((path, index) => page(path, resolvedGuides[index])),
    },
  };
}

function prepareReviewedRuntimeFixture() {
  const fixture = makeFixture();
  const evidenceSources = fixture.packet.sources.filter(
    (sourceEntry) => sourceEntry.sourceType === "evidence",
  );
  for (const [index, guide] of fixture.resolvedGuides.entries()) {
    guide.externalSources = evidenceSources.map((sourceEntry, sourceIndex) => ({
      location: `sources.${sourceIndex}`,
      href: sourceEntry.url,
    }));
    fixture.packet.pages[index].runtimeMaterialSha256 = runtimeGuideDigest(guide);
  }
  return fixture;
}

function promotionRuntimeGuides(fixture) {
  const evidenceSources = fixture.packet.sources.filter(
    (sourceEntry) => sourceEntry.sourceType === "evidence",
  );
  return PATHS.map((path) => {
    const slug = path.slice("/guides/".length);
    const isHub = path === HUB_PATH;
    const contextualPaths = PATHS.filter(
      (candidatePath) => candidatePath !== HUB_PATH && candidatePath !== path,
    );
    return {
      slug,
      title: `Reviewed ${slug}`,
      h1: `Reviewed heading for ${slug}`,
      description: `Reviewed description for ${slug}.`,
      intro: `Reviewed introduction for ${slug}.`,
      publishedOn: "2026-08-01",
      modifiedOn: "2026-08-26",
      sections: isHub
        ? [
            {
              heading: "Symptom children",
              body: "Reviewed collection children.",
              links: HUB_INTERNAL_LINKS.slice(0, 3).map((link, index) => ({
                label: `Child ${index + 1}`,
                to: link.path,
              })),
            },
            { heading: "Evidence", body: "Reviewed evidence workflow.", links: [] },
            {
              heading: "Next step",
              body: "Reviewed next step.",
              links: [],
            },
          ]
        : [
            {
              heading: "Context and next step",
              body: "Reviewed diagnostic context and next step.",
              links: [
                ...contextualPaths.map((candidatePath, index) => ({
                  label: `Context ${index + 1}`,
                  to: candidatePath,
                })),
                { label: "Continue", to: PROMOTION_NEXT_PATH },
              ],
            },
          ],
      faq: [
        {
          question: "What should be verified first?",
          answer: "Verify the recorded evidence before changing anything.",
        },
      ],
      sources: evidenceSources.map((sourceEntry) => ({
        label: sourceEntry.title,
        href: sourceEntry.url,
        note: `Reviewed support bounded to ${sourceEntry.id}.`,
      })),
      related: isHub
        ? [PROMOTION_NEXT_PATH.slice("/guides/".length)]
        : PROMOTION_DIFFERENTIAL_PATHS.map((candidatePath) =>
            candidatePath.slice("/guides/".length),
          ),
    };
  });
}

function promotionArtifacts(fixture) {
  const searchResearchArtifacts = fixture.packet.pages.map((pageEntry, index) => ({
    version: 1,
    artifactType: "knowledge_search_research_receipt",
    receiptId: `search:${index}`,
    path: pageEntry.path,
    capturedOn: "2026-08-26",
    source: "Synthetic authenticated search export",
    queries: [
      {
        query: `synthetic evidence query ${index}`,
        observation: "Synthetic observation retained only for gate validation.",
      },
    ],
    limitations: ["Synthetic promotion-gate proof only."],
  }));
  const originalAssetArtifacts = fixture.packet.pages.map((pageEntry, index) => ({
    receiptId: `asset:${index}`,
    path: pageEntry.path,
    bytes: new Uint8Array([index + 1, 17, 29]),
  }));
  return { searchResearchArtifacts, originalAssetArtifacts };
}

function promotionSuccessorPacket(fixture, resolvedGuides) {
  const successorPacket = structuredClone(fixture.packet);
  successorPacket.revisionId = "pv1-symptom-evidence-guides:draft-002";
  successorPacket.supersedesRevisionId = fixture.packet.revisionId;
  successorPacket.createdOn = "2026-08-26";
  const claimByPath = new Map(
    successorPacket.claims.map((claimEntry) => [claimEntry.path, claimEntry]),
  );
  successorPacket.pages.forEach((pageEntry, index) => {
    const resolvedGuideEntry = resolvedGuides[index];
    const claimEntry = claimByPath.get(pageEntry.path);
    assert.ok(claimEntry, `synthetic successor claim missing for ${pageEntry.path}`);
    claimEntry.materialKeys = ["intro"];
    pageEntry.nonClaimMaterial = [
      {
        classification: "metadata",
        reason: "Synthetic non-claim classification for promotion-gate validation.",
        keys: resolvedGuideEntry.material
          .map((entry) => entry.key)
          .filter((key) => key !== "intro")
          .sort(),
      },
    ];
    pageEntry.proposedLinks = resolvedGuideEntry.internalLinks.map((link) => {
      let slot;
      if (pageEntry.pageFamily === "cluster") {
        slot = link.location.startsWith("sections.0.links.") ? "collection_child" : "next_step";
      } else if (link.location.startsWith("sections.0.links.")) {
        slot = link.location === "sections.0.links.2" ? "next_step" : "contextual_lateral";
      } else {
        slot = "differential";
      }
      return { ...link, slot, status: "proposed" };
    });
    pageEntry.runtimeMaterialSha256 = runtimeGuideDigest(resolvedGuideEntry);
  });
  return successorPacket;
}

function promotionCandidateCorpus(fixture, successorPacket, decisionId, reviewerRegistry) {
  return {
    version: 1,
    artifactType: "knowledge_repository_corpus_candidate",
    artifactScope: "Synthetic candidate used only to test promotion admission.",
    rootNodeId: "topic:guides",
    sourceRevisionId: fixture.packet.revisionId,
    sourcePacketCanonicalSha256: canonicalSha256(fixture.packet),
    successorRevisionId: successorPacket.revisionId,
    successorPacketCanonicalSha256: canonicalSha256(successorPacket),
    reviewerRegistryId: reviewerRegistry.registryId,
    reviewerRegistryCanonicalSha256: canonicalSha256(reviewerRegistry),
    decisionId,
    deliveryEvidence: {
      publicationStatus: "NOT_MEASURED",
      renderedCrawlStatus: "NOT_MEASURED",
      productionStatus: "NOT_MEASURED",
      releaseAuthorization: "NOT_AUTHORIZED",
    },
    nodes: [{}],
    sources: successorPacket.sources.map((sourceEntry) => ({ nodeId: sourceEntry.id })),
    cohorts: [{ id: successorPacket.cohort.id, paths: [...successorPacket.cohort.paths] }],
    claims: successorPacket.claims.map((claimEntry) => ({
      nodeId: claimEntry.id,
      scope: { type: "page" },
    })),
    pages: successorPacket.pages.map((pageEntry) => ({
      path: pageEntry.path,
      pageFamily: pageEntry.pageFamily,
      claimIds: [...pageEntry.claimIds],
    })),
    applicabilityReceipts: [],
    edges: [{}],
  };
}

const PROMOTION_REVIEWER_ID = "reviewer:editor";
const PROMOTION_COHORT_CLAIM_ID = "claim:synthetic-cohort-approval";
const PROMOTION_COHORT_RATIONALE =
  "Synthetic approved cohort used only to prove the promotion admission contract.";

function promotionReviewerRegistry() {
  const roleContracts = {
    author: ["author", "page_owner", "asset_creator"],
    cultivation: ["cultivation_reviewer"],
    editor: ["managing_editor"],
    evidence: ["evidence_reviewer", "ai_verifier"],
  };
  return {
    version: 1,
    artifactType: "knowledge_trusted_reviewer_registry",
    registryId: "registry:synthetic-reviewers-v1",
    issuedOn: "2026-08-26",
    reviewers: Object.entries(roleContracts).map(([role, permittedRoles]) => ({
      id: `reviewer:${role}`,
      identityProvider: "synthetic-test-authority",
      identitySubject: `synthetic-subject:${role}`,
      displayName: `${role} reviewer`,
      qualifications: ["Synthetic promotion-gate qualification."],
      conflictStatus: "none",
      conflictDisclosure: "No conflict disclosed for this synthetic promotion fixture.",
      permittedRoles,
      activeFrom: "2026-08-01",
      activeThrough: "2027-12-31",
    })),
  };
}

function promotionNodeId(path) {
  if (path === "/guides") return "topic:guides";
  const slug = path.slice("/guides/".length);
  if (path === HUB_PATH || path === PROMOTION_NEXT_PATH) return `topic:${slug}`;
  return `condition:${slug}`;
}

function promotionRouteNode(path) {
  const id = promotionNodeId(path);
  const label = path === "/guides" ? "Guide library" : path.slice("/guides/".length);
  return {
    id,
    type: id.startsWith("condition:") ? "Condition" : "Topic",
    label,
    description: `${label} synthetic promotion route node.`,
    status: "active",
    route: {
      path,
      publicationStatus: "NOT_MEASURED",
      indexingIntent: "index",
    },
  };
}

function promotionRegistryNode(id, type, label) {
  return {
    id,
    type,
    label,
    description: `${label} synthetic promotion registry node.`,
    status: "active",
  };
}

function promotionEdge(id, type, sourceId, sourceType, targetId, targetType, provenance) {
  const contract = EDGE_CONTRACTS[type];
  assert.ok(contract, `synthetic promotion edge uses known type ${type}`);
  let normalizedSourceId = sourceId;
  let normalizedSourceType = sourceType;
  let normalizedTargetId = targetId;
  let normalizedTargetType = targetType;
  if (contract.symmetric && normalizedSourceId > normalizedTargetId) {
    [normalizedSourceId, normalizedTargetId] = [normalizedTargetId, normalizedSourceId];
    [normalizedSourceType, normalizedTargetType] = [normalizedTargetType, normalizedSourceType];
  }
  return {
    id,
    type,
    sourceId: normalizedSourceId,
    sourceType: normalizedSourceType,
    targetId: normalizedTargetId,
    targetType: normalizedTargetType,
    cardinality: contract.cardinality,
    symmetric: contract.symmetric,
    status: "active",
    effectiveFrom: null,
    effectiveThrough: null,
    provenance,
  };
}

function promotionEditorialEdge(id, type, sourceId, sourceType, targetId, targetType) {
  return promotionEdge(id, type, sourceId, sourceType, targetId, targetType, {
    claimIds: [],
    sourceIds: [],
    reviewerIds: [PROMOTION_REVIEWER_ID],
    limitations: ["Synthetic promotion-gate relationship only."],
  });
}

function promotionSupportedByEdge(id, claimId, sourceId) {
  return promotionEdge(id, "supported_by", claimId, "Claim", sourceId, "EvidenceSource", {
    claimIds: [claimId],
    sourceIds: [sourceId],
    reviewerIds: [],
    limitations: ["Synthetic promotion-gate evidence binding only."],
  });
}

function eligiblePromotionCandidateCorpus({
  fixture,
  successorPacket,
  runtimeGuides,
  decisionId,
  reviewerRegistry,
}) {
  const cohortRegistry = {
    cohorts: fixture.cohortRegistry.cohorts.map((cohortEntry) => ({
      ...cohortEntry,
      rationale: PROMOTION_COHORT_RATIONALE,
    })),
  };
  const projectedByPath = new Map(
    runtimeGuides.map((guide) => {
      const projected = projectResolvedGuide(guide);
      return [projected.path, projected];
    }),
  );
  const sourceByUrl = new Map(
    successorPacket.sources.map((sourceEntry) => [sourceEntry.url, sourceEntry]),
  );
  const pageNodeIdByPath = new Map(PATHS.map((path) => [path, promotionNodeId(path)]));
  const pageNodeTypeByPath = new Map(
    PATHS.map((path) => [
      path,
      promotionNodeId(path).startsWith("condition:") ? "Condition" : "Topic",
    ]),
  );
  const diagnosticPaths = PATHS.filter((path) => path !== HUB_PATH);
  const edges = [];
  const parentEdgeByChildPath = new Map();
  const nextEdgeByPagePath = new Map();
  const contextualEdgeByPair = new Map();
  const differentialEdgeByPair = new Map();

  const rootHubEdgeId = "edge:promotion-root-symptom-hub-parent";
  parentEdgeByChildPath.set(HUB_PATH, rootHubEdgeId);
  edges.push(
    promotionEditorialEdge(
      rootHubEdgeId,
      "parent_of",
      promotionNodeId("/guides"),
      "Topic",
      promotionNodeId(HUB_PATH),
      "Topic",
    ),
  );
  for (const path of diagnosticPaths) {
    const edgeId = `edge:promotion-hub-${path.slice("/guides/".length)}-parent`;
    parentEdgeByChildPath.set(path, edgeId);
    edges.push(
      promotionEditorialEdge(
        edgeId,
        "parent_of",
        promotionNodeId(HUB_PATH),
        "Topic",
        promotionNodeId(path),
        "Condition",
      ),
    );
  }
  for (const path of PATHS) {
    const edgeId = `edge:promotion-${path.slice("/guides/".length)}-next-daily-log`;
    nextEdgeByPagePath.set(path, edgeId);
    edges.push(
      promotionEditorialEdge(
        edgeId,
        "next_step",
        promotionNodeId(path),
        pageNodeTypeByPath.get(path),
        promotionNodeId(PROMOTION_NEXT_PATH),
        "Topic",
      ),
    );
  }
  for (let leftIndex = 0; leftIndex < diagnosticPaths.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < diagnosticPaths.length; rightIndex += 1) {
      const leftPath = diagnosticPaths[leftIndex];
      const rightPath = diagnosticPaths[rightIndex];
      const pairKey = [leftPath, rightPath].sort().join("|");
      const edgeId = `edge:promotion-context-${leftIndex}-${rightIndex}`;
      contextualEdgeByPair.set(pairKey, edgeId);
      edges.push(
        promotionEditorialEdge(
          edgeId,
          "related_to",
          promotionNodeId(leftPath),
          "Condition",
          promotionNodeId(rightPath),
          "Condition",
        ),
      );
    }
  }
  for (const [diagnosticIndex, diagnosticPath] of diagnosticPaths.entries()) {
    for (const [destinationIndex, destinationPath] of PROMOTION_DIFFERENTIAL_PATHS.entries()) {
      const pairKey = `${diagnosticPath}|${destinationPath}`;
      const edgeId = `edge:promotion-differential-${diagnosticIndex}-${destinationIndex}`;
      differentialEdgeByPair.set(pairKey, edgeId);
      edges.push(
        promotionEditorialEdge(
          edgeId,
          "differential_of",
          promotionNodeId(diagnosticPath),
          "Condition",
          promotionNodeId(destinationPath),
          "Condition",
        ),
      );
    }
  }

  const pageClaims = successorPacket.claims.map((claimEntry) => {
    const projected = projectedByPath.get(claimEntry.path);
    assert.ok(projected, `synthetic promotion runtime missing ${claimEntry.path}`);
    const sourceIds = claimEntry.sourceLinks.map((link) => link.sourceId).sort();
    for (const [sourceIndex, sourceId] of sourceIds.entries()) {
      edges.push(
        promotionSupportedByEdge(
          `edge:promotion-page-${claimEntry.path.slice("/guides/".length)}-source-${sourceIndex}`,
          claimEntry.id,
          sourceId,
        ),
      );
    }
    return {
      nodeId: claimEntry.id,
      scope: { type: "page", id: pageNodeIdByPath.get(claimEntry.path) },
      summary: claimEntry.text,
      riskClass: claimEntry.riskClass,
      riskDomains: [...claimEntry.riskDomains],
      evidenceState: "supported",
      sourceIds,
      limitations: [...claimEntry.limitations],
      material: projected.material.map(({ key, sha256 }) => ({ key, sha256 })),
    };
  });
  edges.push(
    promotionSupportedByEdge(
      "edge:promotion-cohort-supported-provenance",
      PROMOTION_COHORT_CLAIM_ID,
      PROVENANCE_ID,
    ),
  );
  const claims = [
    ...pageClaims,
    {
      nodeId: PROMOTION_COHORT_CLAIM_ID,
      scope: { type: "cohort", id: successorPacket.cohort.id },
      summary: "The synthetic cohort retains exact approving-pull-request provenance.",
      riskClass: "R0",
      riskDomains: ["standard"],
      evidenceState: "supported",
      sourceIds: [PROVENANCE_ID],
      limitations: ["Synthetic promotion-gate cohort proof only."],
      material: [{ key: "cohort.rationale", sha256: sha256Text(PROMOTION_COHORT_RATIONALE) }],
    },
  ].sort((left, right) => left.nodeId.localeCompare(right.nodeId));

  const applicabilityReceipts = [];
  const createNotApplicableSlot = (path, slot) => {
    const slug = path.slice("/guides/".length);
    const normalizedSlot = slot.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    const receiptId = `receipt:${slug}-${normalizedSlot}`;
    applicabilityReceipts.push({
      id: receiptId,
      pageId: pageNodeIdByPath.get(path),
      slot,
      reason: `The synthetic ${path} fixture does not use the ${slot} slot.`,
      reviewerId: PROMOTION_REVIEWER_ID,
      reviewedOn: "2026-08-26",
    });
    return { status: "not_applicable", edgeIds: [], receiptId };
  };
  const pages = successorPacket.pages.map((packetPage) => {
    const path = packetPage.path;
    const projected = projectedByPath.get(path);
    assert.ok(projected, `synthetic promotion projected guide missing ${path}`);
    const isHub = path === HUB_PATH;
    const contextualEdgeIds = isHub
      ? []
      : diagnosticPaths
          .filter((candidatePath) => candidatePath !== path)
          .map((candidatePath) => contextualEdgeByPair.get([path, candidatePath].sort().join("|")));
    const differentialEdgeIds = isHub
      ? []
      : PROMOTION_DIFFERENTIAL_PATHS.map((destinationPath) =>
          differentialEdgeByPair.get(`${path}|${destinationPath}`),
        );
    const slots = {
      breadcrumb: {
        status: "required",
        edgeIds: [parentEdgeByChildPath.get(path)],
        receiptId: null,
      },
      collectionChild: isHub
        ? {
            status: "required",
            edgeIds: diagnosticPaths.map((candidatePath) =>
              parentEdgeByChildPath.get(candidatePath),
            ),
            receiptId: null,
          }
        : createNotApplicableSlot(path, "collectionChild"),
      prerequisite: createNotApplicableSlot(path, "prerequisite"),
      contextualLateral: isHub
        ? createNotApplicableSlot(path, "contextualLateral")
        : { status: "required", edgeIds: contextualEdgeIds, receiptId: null },
      nextStep: {
        status: "required",
        edgeIds: [nextEdgeByPagePath.get(path)],
        receiptId: null,
      },
      differential: isHub
        ? createNotApplicableSlot(path, "differential")
        : { status: "required", edgeIds: differentialEdgeIds, receiptId: null },
    };
    const linkDecisions = projected.internalLinks.map((link) => {
      if (isHub && link.path !== PROMOTION_NEXT_PATH) {
        return {
          ...link,
          edgeId: parentEdgeByChildPath.get(link.path),
          slot: "collection_child",
        };
      }
      if (link.path === PROMOTION_NEXT_PATH) {
        return { ...link, edgeId: nextEdgeByPagePath.get(path), slot: "next_step" };
      }
      if (link.location.startsWith("sections.0.links.")) {
        return {
          ...link,
          edgeId: contextualEdgeByPair.get([path, link.path].sort().join("|")),
          slot: "contextual_lateral",
        };
      }
      return {
        ...link,
        edgeId: differentialEdgeByPair.get(`${path}|${link.path}`),
        slot: "differential",
      };
    });
    const pageClaimId = packetPage.claimIds[0];
    const sourceDecisions = projected.externalSources.map((renderedSource) => {
      const sourceEntry = sourceByUrl.get(renderedSource.href);
      assert.ok(sourceEntry, `synthetic promotion source missing ${renderedSource.href}`);
      return {
        location: renderedSource.location,
        href: renderedSource.href,
        sourceId: sourceEntry.id,
        claimIds: [pageClaimId],
      };
    });
    return {
      nodeId: pageNodeIdByPath.get(path),
      cohortId: successorPacket.cohort.id,
      path,
      slug: projected.slug,
      pageFamily: packetPage.pageFamily,
      riskClass: packetPage.riskClass,
      riskDomains: ["standard"],
      publishedOn: projected.publishedOn,
      modifiedOn: projected.modifiedOn,
      slots,
      claimIds: [...packetPage.claimIds],
      linkDecisions,
      sourceDecisions,
    };
  });

  const sourceEntries = successorPacket.sources
    .map((sourceEntry) => ({
      nodeId: sourceEntry.id,
      url: sourceEntry.url,
      evidenceTier: sourceEntry.evidenceTier,
      accessedOn: sourceEntry.accessedOn,
      stableIdentifier: sourceEntry.stableIdentifier,
      limitations: [...sourceEntry.limitations],
    }))
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const nodes = [
    promotionRouteNode("/guides"),
    ...PROMOTION_REGISTRY_PATHS.map(promotionRouteNode),
    promotionRegistryNode(PROMOTION_REVIEWER_ID, "Reviewer", "Promotion editor"),
    ...successorPacket.sources.map((sourceEntry) =>
      promotionRegistryNode(sourceEntry.id, "EvidenceSource", sourceEntry.title),
    ),
    ...claims.map((claimEntry) =>
      promotionRegistryNode(claimEntry.nodeId, "Claim", `Claim ${claimEntry.nodeId}`),
    ),
  ].sort((left, right) => left.id.localeCompare(right.id));

  return {
    cohortRegistry,
    candidateCorpus: {
      version: 1,
      artifactType: "knowledge_repository_corpus_candidate",
      artifactScope: "Synthetic candidate used only to prove exact promotion admission.",
      rootNodeId: promotionNodeId("/guides"),
      sourceRevisionId: fixture.packet.revisionId,
      sourcePacketCanonicalSha256: canonicalSha256(fixture.packet),
      successorRevisionId: successorPacket.revisionId,
      successorPacketCanonicalSha256: canonicalSha256(successorPacket),
      reviewerRegistryId: reviewerRegistry.registryId,
      reviewerRegistryCanonicalSha256: canonicalSha256(reviewerRegistry),
      decisionId,
      deliveryEvidence: {
        publicationStatus: "NOT_MEASURED",
        renderedCrawlStatus: "NOT_MEASURED",
        productionStatus: "NOT_MEASURED",
        releaseAuthorization: "NOT_AUTHORIZED",
      },
      nodes,
      sources: sourceEntries,
      cohorts: [
        {
          id: successorPacket.cohort.id,
          sourcePullRequest: successorPacket.cohort.registrySourcePullRequest,
          paths: [...successorPacket.cohort.paths],
          sourceIds: [PROVENANCE_ID],
          materialClaimIds: [PROMOTION_COHORT_CLAIM_ID],
        },
      ],
      claims,
      pages,
      applicabilityReceipts: applicabilityReceipts.sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
      edges: edges.sort((left, right) => left.id.localeCompare(right.id)),
    },
  };
}

function completePromotionDecision(
  fixture,
  {
    successorPacket,
    candidateCorpus,
    resolvedGuides,
    reviewerRegistry,
    searchResearchArtifacts,
    originalAssetArtifacts,
  },
) {
  const people = reviewerRegistry.reviewers.map(
    ({ id, displayName, qualifications, conflictStatus, conflictDisclosure }) => ({
      id,
      displayName,
      qualifications,
      conflictStatus,
      conflictDisclosure,
    }),
  );
  return {
    version: 1,
    artifactType: "knowledge_corpus_promotion_decision",
    decisionId: "decision:synthetic:promotion-1",
    reviewerRegistryId: reviewerRegistry.registryId,
    reviewerRegistryCanonicalSha256: canonicalSha256(reviewerRegistry),
    sourceRevisionId: fixture.packet.revisionId,
    sourcePacketCanonicalSha256: canonicalSha256(fixture.packet),
    successorRevisionId: successorPacket.revisionId,
    successorPacketCanonicalSha256: canonicalSha256(successorPacket),
    supersedesRevisionId: fixture.packet.revisionId,
    candidateCorpusCanonicalSha256: canonicalSha256(candidateCorpus),
    decisionStatus: "approved_for_candidate_admission",
    decidedOn: "2026-08-26",
    people,
    roleAssignments: {
      managingEditorId: "reviewer:editor",
      authorIds: ["reviewer:author"],
      evidenceReviewerIds: ["reviewer:evidence"],
      cultivationReviewerIds: ["reviewer:cultivation"],
    },
    aiVerification: {
      verifierId: "reviewer:evidence",
      decision: "verified",
      verifiedOn: "2026-08-26",
      nextReviewOn: "2027-08-26",
      limitations: ["Synthetic promotion-gate proof only."],
    },
    claimApprovals: successorPacket.claims.map((claimEntry) => ({
      claimId: claimEntry.id,
      claimCanonicalSha256: canonicalSha256(claimEntry),
      decision: "approved",
      evidenceReviewerId: "reviewer:evidence",
      cultivationReviewerId: "reviewer:cultivation",
      approvedOn: "2026-08-26",
      nextReviewOn: "2027-08-26",
      limitations: ["Synthetic promotion-gate proof only."],
    })),
    sourceVerifications: successorPacket.sources
      .filter((sourceEntry) => sourceEntry.sourceType === "evidence")
      .map((sourceEntry) => ({
        sourceId: sourceEntry.id,
        sourceCanonicalSha256: canonicalSha256(sourceEntry),
        reviewerId: "reviewer:evidence",
        verifiedOn: "2026-08-26",
        nextReviewOn: "2027-08-26",
        authorshipStatus: "verified",
        publicationDateStatus: "verified",
        licenseDisposition: "link_only",
        correctionStatus: "checked_current",
        retractionStatus: "not_retracted",
        limitations: ["Synthetic promotion-gate proof only."],
      })),
    pageReviews: successorPacket.pages.map((pageEntry, index) => ({
      path: pageEntry.path,
      ownerId: "reviewer:author",
      runtimeGuideSha256: runtimeGuideDigest(resolvedGuides[index]),
      visibleSourceIds: [...pageEntry.proposedVisibleSourceIds],
      linkManifest: pageEntry.proposedLinks.map(({ location, path, slot }) => ({
        location,
        path,
        slot,
        decision: "approved",
        reviewerId: "reviewer:editor",
        reviewedOn: "2026-08-26",
        limitations: ["Synthetic promotion-gate proof only."],
      })),
      searchResearch: {
        receiptId: `search:${index}`,
        querySetSha256: canonicalSha256(searchResearchArtifacts[index]),
        capturedOn: "2026-08-26",
        reviewerId: "reviewer:evidence",
        source: "Synthetic authenticated search export",
        limitations: ["Synthetic promotion-gate proof only."],
      },
      originalAsset: {
        receiptId: `asset:${index}`,
        artifactSha256: createHash("sha256")
          .update(originalAssetArtifacts[index].bytes)
          .digest("hex"),
        creatorId: "reviewer:author",
        reviewerId: "reviewer:evidence",
        method: "Synthetic original asset method.",
        provenance: "Synthetic original asset provenance.",
        licenseDisposition: "owned",
        reviewedOn: "2026-08-26",
      },
      reviewedOn: "2026-08-26",
      nextReviewOn: "2027-08-26",
    })),
  };
}

function completeEligiblePromotionInput() {
  const fixture = makeFixture();
  const reviewResult = validateCorpusReviewPacket(fixture);
  const runtimeGuides = promotionRuntimeGuides(fixture);
  const candidateResolvedGuides = runtimeGuides.map(projectResolvedGuide);
  const successorPacket = promotionSuccessorPacket(fixture, candidateResolvedGuides);
  const artifacts = promotionArtifacts(fixture);
  const reviewerRegistry = promotionReviewerRegistry();
  const trustedReviewerRegistrySha256 = canonicalSha256(reviewerRegistry);
  const evaluatedOn = "2026-08-26";
  const decisionId = "decision:synthetic:promotion-1";
  const { candidateCorpus, cohortRegistry } = eligiblePromotionCandidateCorpus({
    fixture,
    successorPacket,
    runtimeGuides,
    decisionId,
    reviewerRegistry,
  });
  const decision = completePromotionDecision(fixture, {
    successorPacket,
    candidateCorpus,
    resolvedGuides: candidateResolvedGuides,
    reviewerRegistry,
    ...artifacts,
  });
  return {
    fixture,
    reviewResult,
    runtimeGuides,
    candidateResolvedGuides,
    successorPacket,
    candidateCorpus,
    decision,
    cohortRegistry,
    reviewerRegistry,
    trustedReviewerRegistrySha256,
    evaluatedOn,
    ...artifacts,
  };
}

function assertInvalid(mutator, pattern) {
  const fixture = makeFixture();
  mutator(fixture);
  assert.throws(() => validateCorpusReviewPacket(fixture), pattern);
}

test("accepts a structurally valid sourced draft while preserving BLOCKED readiness", () => {
  const result = validateCorpusReviewPacket(makeFixture());
  assert.equal(result.contractStatus, "pass");
  assert.equal(result.editorialState, "sourced");
  assert.equal(result.publicationReadiness, "BLOCKED");
  assert.equal(result.publicationStatus, "NOT_MEASURED");
  assert.equal(result.renderedCrawlStatus, "NOT_MEASURED");
  assert.equal(result.pageCount, 4);
  assert.equal(result.claimCount, 4);
  assert.ok(result.blockers.some((blocker) => blocker.code === "AUTHOR_UNASSIGNED"));
  assert.ok(result.blockers.some((blocker) => blocker.code === "VISIBLE_SOURCES_NOT_RENDERED"));
  assert.ok(result.blockers.some((blocker) => blocker.code === "DIFFERENTIAL_LINKS_UNREVIEWED"));
});

test("pins the exact cohort and exact resolved runtime material", () => {
  assertInvalid(({ packet }) => {
    packet.cohort.paths.pop();
  }, /must exactly equal the registered route cohort/);
  assertInvalid(({ resolvedGuides }) => {
    resolvedGuides[0].material[0].sha256 = "b".repeat(64);
  }, /runtime material changed without review-packet refresh/);
  assertInvalid(({ packet }) => {
    packet.pages[0].claimIds = [];
  }, /claimIds must be an array with at least 1 item/);
});

test("requires complete, exact material classifications", () => {
  assertInvalid(({ packet }) => {
    packet.claims[0].materialKeys = ["unknown"];
  }, /material coverage diverges/);
  assertInvalid(({ packet }) => {
    packet.pages[0].nonClaimMaterial.push({
      keys: ["body"],
      classification: "heading",
      reason: "This is a presentation heading, not a factual claim.",
    });
  }, /material coverage must be unique/);
});

test("requires sample-size and replication scope for every claim", () => {
  assertInvalid(({ packet }) => {
    delete packet.claims[0].applicability.sampleSize;
  }, /applicability\.sampleSize/);
  assertInvalid(({ packet }) => {
    delete packet.claims[0].applicability.replication;
  }, /applicability\.replication/);
});

test("never lets pending data impersonate approval", () => {
  assertInvalid(({ packet }) => {
    packet.cohort.sourceRouteState = "published";
  }, /sourceRouteState must record current public-source registry membership/);
  assertInvalid(({ packet }) => {
    packet.cohort.publicationReadiness = "READY";
  }, /publicationReadiness must remain BLOCKED/);
  assertInvalid(({ packet }) => {
    packet.claims[0].approvalDecision = "approved";
  }, /must remain pending with null approval and review dates/);
  assertInvalid(({ packet }) => {
    packet.claims[0].authorId = "author:invented";
  }, /authorId must remain null/);
  assertInvalid(({ packet }) => {
    packet.claims[0].evidenceReviewerIds = ["reviewer:invented"];
  }, /cannot claim evidence review/);
});

test("keeps PR 627 as cohort provenance instead of scientific evidence", () => {
  assertInvalid(({ packet }) => {
    packet.claims[0].sourceLinks[0].sourceId = PROVENANCE_ID;
    packet.claims[0].sourceLinks.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  }, /cannot use cohort provenance as scientific evidence/);
  assertInvalid(({ packet }) => {
    packet.sources.find((candidate) => candidate.id === PROVENANCE_ID).url += "/files";
  }, /must use the exact registered pull-request URL/);
});

test("requires canonical, located, independently identified evidence sources", () => {
  assertInvalid(({ packet }) => {
    packet.claims[0].sourceLinks[0].locator = "";
  }, /locator must be a string/);
  assertInvalid(({ packet }) => {
    packet.sources[0].url = "http://example.edu/evidence";
  }, /must use HTTPS/);
  assertInvalid(({ packet }) => {
    packet.sources[1].stableIdentifier = packet.sources[0].stableIdentifier;
  }, /repeat stableIdentifier/);
});

test("rejects source and AI chronology that postdates the packet evidence snapshot", () => {
  assertInvalid(({ packet }) => {
    packet.aiAssistance.usedOn = "2099-01-01";
  }, /aiAssistance\.usedOn cannot be after packet createdOn/);

  assertInvalid(({ packet }) => {
    packet.sources.find((source) => source.sourceType === "evidence").accessedOn = "2099-01-01";
  }, /accessedOn cannot be after packet createdOn/);

  assertInvalid(({ packet }) => {
    const source = packet.sources.find((candidate) => candidate.sourceType === "evidence");
    source.publishedOn = "2099-01-01";
  }, /publishedOn cannot be after accessedOn/);

  assertInvalid(({ packet }) => {
    const source = packet.sources.find((candidate) => candidate.sourceType === "evidence");
    source.versionDate = "2099-01-01";
  }, /versionDate cannot be after accessedOn/);
});

test("derives an R2 source-mix blocker without turning a draft contract into a false failure", () => {
  const fixture = makeFixture();
  const peer = fixture.packet.sources.find((sourceEntry) => sourceEntry.id === "source:peer-a");
  peer.evidenceTier = "B";
  peer.publisher = "University Extension";
  const result = validateCorpusReviewPacket(fixture);
  assert.equal(result.contractStatus, "pass");
  assert.ok(result.blockers.some((blocker) => blocker.code === "R2_SOURCE_MIX_UNREVIEWED"));
});

test("derives missing source-metadata blockers without inventing publication evidence", () => {
  const fixture = makeFixture();
  const evidenceSource = fixture.packet.sources.find(
    (sourceEntry) => sourceEntry.id === "source:extension-b",
  );
  evidenceSource.authors = [];
  evidenceSource.publishedOn = null;
  evidenceSource.license = "not_assessed";
  const result = validateCorpusReviewPacket(fixture);
  const sourceBlockerCodes = result.blockers
    .filter((blocker) => blocker.scopeId === "source:extension-b")
    .map((blocker) => blocker.code);
  assert.deepEqual(sourceBlockerCodes, [
    "SOURCE_AUTHORSHIP_UNVERIFIED",
    "SOURCE_DATE_UNVERIFIED",
    "SOURCE_LICENSE_UNASSESSED",
  ]);
});

test("keeps review-packet edges proposed and page-family semantics honest", () => {
  assertInvalid(({ packet }) => {
    packet.pages[0].proposedLinks[0].status = "active";
  }, /links must remain proposed/);
  assertInvalid(({ packet }) => {
    packet.pages.find(
      (pageEntry) => pageEntry.path === "/guides/cannabis-leaf-symptoms",
    ).pageFamily = "diagnostic";
  }, /symptom hub must retain pageFamily cluster/);
  assertInvalid(({ packet }) => {
    packet.pages[0].pageFamily = "cluster";
  }, /focused symptom page .* pageFamily diagnostic/);
});

test("pins the immutable real draft packet canonical digest", () => {
  const realPacket = JSON.parse(
    readFileSync(
      new URL(
        "../../docs/knowledge-library/corpus/pv1-symptom-evidence-guides/revisions/draft-001.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(
    canonicalSha256(realPacket),
    "742162f41137daf8a3a31649e7ae2b0d6b24c52de2077079307553892166875f",
  );
  const successorPacket = JSON.parse(
    readFileSync(
      new URL(
        "../../docs/knowledge-library/corpus/pv1-symptom-evidence-guides/revisions/draft-002.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(successorPacket.supersedesRevisionId, realPacket.revisionId);
  assert.equal(
    canonicalSha256(successorPacket),
    "893c0b3c4a5233ff8b57e409587cc1aaeef71ec5293010e5cfcf31b59a9bc3f4",
  );
});

test("emits a deterministic blocked promotion-admission receipt without delivery claims", () => {
  const fixture = makeFixture();
  const reviewResult = validateCorpusReviewPacket(fixture);
  const input = {
    ...fixture,
    reviewResult,
    decision: null,
    candidateCorpus: null,
    registryPaths: PATHS,
  };
  const first = evaluateCorpusPromotion(input);
  const reordered = evaluateCorpusPromotion({
    ...input,
    reviewResult: { ...reviewResult, blockers: [...reviewResult.blockers].reverse() },
    resolvedGuides: [...fixture.resolvedGuides].reverse(),
  });

  assert.equal(first.promotionStatus, "BLOCKED");
  assert.equal(first.successorRevisionRequired, true);
  assert.equal(first.candidateCorpusSha256, null);
  assert.equal(first.publicationStatus, "NOT_MEASURED");
  assert.equal(first.renderedCrawlStatus, "NOT_MEASURED");
  assert.equal(first.productionStatus, "NOT_MEASURED");
  assert.equal(first.releaseAuthorization, "NOT_AUTHORIZED");
  assert.equal(first.counts.blockers, reviewResult.blockers.length);
  const { receiptSha256, ...receiptBody } = first;
  assert.equal(receiptSha256, canonicalSha256(receiptBody));
  assert.equal(canonicalJson(first), canonicalJson(reordered));
  assert.doesNotMatch(
    canonicalJson(first),
    /"(?:publicationStatus|productionStatus)":"(?:PASS|published)"/,
  );
});

test("fails closed when only one promotion input is supplied", () => {
  const fixture = makeFixture();
  const reviewResult = validateCorpusReviewPacket(fixture);
  assert.throws(
    () =>
      evaluateCorpusPromotion({
        ...fixture,
        reviewResult,
        decision: { version: 1 },
        candidateCorpus: null,
        registryPaths: PATHS,
      }),
    /decision, candidate corpus, immutable successor packet, trusted reviewer registry and digest, authority provenance, admission date, search artifacts, and original-asset bytes/,
  );
});

test("rejects forged blocker results and downstream delivery claims in decisions", () => {
  const fixture = makeFixture();
  const reviewResult = validateCorpusReviewPacket(fixture);
  assert.throws(
    () =>
      evaluateCorpusPromotion({
        ...fixture,
        reviewResult: { ...reviewResult, blockers: reviewResult.blockers.slice(1) },
        decision: null,
        candidateCorpus: null,
        registryPaths: PATHS,
      }),
    /does not match a fresh review/,
  );
  assert.throws(
    () =>
      evaluateCorpusPromotion({
        ...fixture,
        reviewResult,
        decision: { publicationStatus: "PASS" },
        candidateCorpus: {},
        successorPacket: {},
        searchResearchArtifacts: [],
        originalAssetArtifacts: [],
        evaluatedOn: "2026-08-26",
        runtimeGuides: [{ slug: "placeholder" }],
        registryPaths: PATHS,
      }),
    /cannot claim downstream delivery evidence/,
  );
});

test("validates complete typed human receipts before admitting candidate semantics", () => {
  const fixture = makeFixture();
  const reviewResult = validateCorpusReviewPacket(fixture);
  const runtimeGuides = promotionRuntimeGuides(fixture);
  const candidateResolvedGuides = runtimeGuides.map(projectResolvedGuide);
  const successorPacket = promotionSuccessorPacket(fixture, candidateResolvedGuides);
  const artifacts = promotionArtifacts(fixture);
  const reviewerRegistry = promotionReviewerRegistry();
  const decisionId = "decision:synthetic:promotion-1";
  const candidateCorpus = promotionCandidateCorpus(
    fixture,
    successorPacket,
    decisionId,
    reviewerRegistry,
  );
  const decision = completePromotionDecision(fixture, {
    successorPacket,
    candidateCorpus,
    resolvedGuides: candidateResolvedGuides,
    reviewerRegistry,
    ...artifacts,
  });
  assert.throws(
    () =>
      evaluateCorpusPromotionForTest(
        {
          ...fixture,
          reviewResult,
          decision,
          candidateCorpus,
          successorPacket,
          ...artifacts,
          evaluatedOn: "2026-08-26",
          runtimeGuides,
          registryPaths: PATHS,
        },
        {
          reviewerRegistry,
          trustedReviewerRegistrySha256: canonicalSha256(reviewerRegistry),
        },
      ),
    /candidate corpus fails strict schema validation: \/nodes\/0 required/,
  );

  const eligibleInput = completeEligiblePromotionInput();
  const conflicted = structuredClone(eligibleInput.decision);
  conflicted.roleAssignments.evidenceReviewerIds = ["reviewer:author"];
  assert.throws(
    () =>
      evaluateCorpusPromotionForTest(
        {
          packet: eligibleInput.fixture.packet,
          reviewResult: eligibleInput.reviewResult,
          cohortRegistry: eligibleInput.cohortRegistry,
          resolvedGuides: eligibleInput.fixture.resolvedGuides,
          decision: conflicted,
          candidateCorpus: eligibleInput.candidateCorpus,
          successorPacket: eligibleInput.successorPacket,
          searchResearchArtifacts: eligibleInput.searchResearchArtifacts,
          originalAssetArtifacts: eligibleInput.originalAssetArtifacts,
          evaluatedOn: eligibleInput.evaluatedOn,
          runtimeGuides: eligibleInput.runtimeGuides,
          registryPaths: PROMOTION_REGISTRY_PATHS,
        },
        {
          reviewerRegistry: eligibleInput.reviewerRegistry,
          trustedReviewerRegistrySha256: eligibleInput.trustedReviewerRegistrySha256,
        },
      ),
    /is not trusted for role evidence_reviewer/,
  );
});

test("admits only the exact fully bound candidate and emits an order-independent receipt", () => {
  const input = completeEligiblePromotionInput();
  const evaluate = (overrides = {}) =>
    evaluateCorpusPromotionForTest(
      {
        packet: input.fixture.packet,
        reviewResult: input.reviewResult,
        cohortRegistry: input.cohortRegistry,
        resolvedGuides: input.fixture.resolvedGuides,
        decision: input.decision,
        candidateCorpus: input.candidateCorpus,
        successorPacket: input.successorPacket,
        searchResearchArtifacts: input.searchResearchArtifacts,
        originalAssetArtifacts: input.originalAssetArtifacts,
        evaluatedOn: input.evaluatedOn,
        runtimeGuides: input.runtimeGuides,
        registryPaths: PROMOTION_REGISTRY_PATHS,
        ...overrides,
      },
      {
        reviewerRegistry: input.reviewerRegistry,
        trustedReviewerRegistrySha256: input.trustedReviewerRegistrySha256,
      },
    );
  const first = evaluate();
  const reordered = evaluate({
    resolvedGuides: [...input.fixture.resolvedGuides].reverse(),
    runtimeGuides: [...input.runtimeGuides].reverse(),
    searchResearchArtifacts: [...input.searchResearchArtifacts].reverse(),
    originalAssetArtifacts: [...input.originalAssetArtifacts].reverse(),
  });

  assert.equal(first.promotionStatus, "TEST_ONLY_NOT_ADMISSIBLE");
  assert.equal(first.productionTrust, false);
  assert.equal(first.candidateCorpusSha256, canonicalSha256(input.candidateCorpus));
  assert.equal(first.successorRevisionId, input.successorPacket.revisionId);
  assert.equal(first.successorPacketCanonicalSha256, canonicalSha256(input.successorPacket));
  assert.equal(first.decisionCanonicalSha256, canonicalSha256(input.decision));
  assert.equal(first.publicationStatus, "NOT_MEASURED");
  assert.equal(first.renderedCrawlStatus, "NOT_MEASURED");
  assert.equal(first.productionStatus, "NOT_MEASURED");
  assert.equal(first.releaseAuthorization, "NOT_AUTHORIZED");
  assert.deepEqual(first.reviewerAuthority, {
    source: "test_fixture",
    baseRevision: null,
  });
  assert.throws(
    () =>
      assertProductionPromotionAdmissionReceipt(first, "d17e431d7634f33a9f2c5da338508b539d81fbc8"),
    /not production-trusted and eligible/,
  );
  const { receiptSha256, ...receiptBody } = first;
  assert.equal(receiptSha256, canonicalSha256(receiptBody));
  assert.equal(canonicalJson(reordered), canonicalJson(first));
});

test("rejects unbound promotion fields, successor drift, and fabricated artifact receipts", () => {
  const input = completeEligiblePromotionInput();
  const evaluate = (overrides = {}) =>
    evaluateCorpusPromotionForTest(
      {
        packet: input.fixture.packet,
        reviewResult: input.reviewResult,
        cohortRegistry: input.cohortRegistry,
        resolvedGuides: input.fixture.resolvedGuides,
        decision: input.decision,
        candidateCorpus: input.candidateCorpus,
        successorPacket: input.successorPacket,
        searchResearchArtifacts: input.searchResearchArtifacts,
        originalAssetArtifacts: input.originalAssetArtifacts,
        evaluatedOn: input.evaluatedOn,
        runtimeGuides: input.runtimeGuides,
        registryPaths: PROMOTION_REGISTRY_PATHS,
        ...overrides,
      },
      {
        reviewerRegistry: input.reviewerRegistry,
        trustedReviewerRegistrySha256: input.trustedReviewerRegistrySha256,
      },
    );

  const unknownDecision = structuredClone(input.decision);
  unknownDecision.unreviewedOverride = true;
  assert.throws(
    () => evaluate({ decision: unknownDecision }),
    /promotion decision fails strict schema validation.*additionalProperties/,
  );

  const falseDeliveryCandidate = structuredClone(input.candidateCorpus);
  falseDeliveryCandidate.pages[0].published = true;
  const falseDeliveryDecision = structuredClone(input.decision);
  falseDeliveryDecision.candidateCorpusCanonicalSha256 = canonicalSha256(falseDeliveryCandidate);
  assert.throws(
    () =>
      evaluate({
        candidateCorpus: falseDeliveryCandidate,
        decision: falseDeliveryDecision,
      }),
    /candidate corpus\.pages\[0\]\.published cannot claim downstream delivery evidence/,
  );

  const candidateDrift = structuredClone(input.candidateCorpus);
  candidateDrift.nodes[0].label = "Unreviewed candidate mutation";
  assert.throws(
    () => evaluate({ candidateCorpus: candidateDrift }),
    /promotion decision must approve the exact candidate corpus bytes/,
  );

  const successorDrift = structuredClone(input.successorPacket);
  successorDrift.supersedesRevisionId = "pv1-symptom-evidence-guides:invented";
  assert.throws(
    () => evaluate({ successorPacket: successorDrift }),
    /successor packet must be a new immutable revision of the source packet/,
  );

  const searchDrift = structuredClone(input.searchResearchArtifacts);
  searchDrift[0].queries[0].observation = "Unreviewed search observation.";
  assert.throws(
    () => evaluate({ searchResearchArtifacts: searchDrift }),
    /search receipt .* digest does not match/,
  );

  const assetDrift = input.originalAssetArtifacts.map((artifact) => ({
    ...artifact,
    bytes: new Uint8Array(artifact.bytes),
  }));
  assetDrift[0].bytes[0] += 100;
  assert.throws(
    () => evaluate({ originalAssetArtifacts: assetDrift }),
    /asset receipt .* digest does not match/,
  );

  const runtimeDrift = structuredClone(input.runtimeGuides);
  runtimeDrift[0].intro = "Unreviewed runtime copy mutation.";
  assert.throws(
    () => evaluate({ runtimeGuides: runtimeDrift }),
    /runtime material changed without review-packet refresh/,
  );

  const pathDrift = structuredClone(input.searchResearchArtifacts);
  pathDrift[0].path = input.searchResearchArtifacts[1].path;
  assert.throws(
    () => evaluate({ searchResearchArtifacts: pathDrift }),
    /search-research artifacts .* repeat path|search receipt .* bound to another path/,
  );

  const duplicateSearchEvidence = structuredClone(input.searchResearchArtifacts);
  duplicateSearchEvidence[1].queries = structuredClone(duplicateSearchEvidence[0].queries);
  duplicateSearchEvidence[1].limitations = structuredClone(duplicateSearchEvidence[0].limitations);
  assert.throws(
    () => evaluate({ searchResearchArtifacts: duplicateSearchEvidence }),
    /search-research artifacts .* repeat the same evidence payload/,
  );

  const duplicateAssetBytes = input.originalAssetArtifacts.map((artifact) => ({
    ...artifact,
    bytes: new Uint8Array(artifact.bytes),
  }));
  duplicateAssetBytes[1].bytes = new Uint8Array(duplicateAssetBytes[0].bytes);
  assert.throws(
    () => evaluate({ originalAssetArtifacts: duplicateAssetBytes }),
    /original-asset artifacts .* repeat identical bytes/,
  );
});

test("rejects expired and retrograde promotion receipts while binding the admission date", () => {
  const input = completeEligiblePromotionInput();
  const evaluate = (overrides = {}) =>
    evaluateCorpusPromotionForTest(
      {
        packet: input.fixture.packet,
        reviewResult: input.reviewResult,
        cohortRegistry: input.cohortRegistry,
        resolvedGuides: input.fixture.resolvedGuides,
        decision: input.decision,
        candidateCorpus: input.candidateCorpus,
        successorPacket: input.successorPacket,
        searchResearchArtifacts: input.searchResearchArtifacts,
        originalAssetArtifacts: input.originalAssetArtifacts,
        evaluatedOn: input.evaluatedOn,
        runtimeGuides: input.runtimeGuides,
        registryPaths: PROMOTION_REGISTRY_PATHS,
        ...overrides,
      },
      {
        reviewerRegistry: input.reviewerRegistry,
        trustedReviewerRegistrySha256: input.trustedReviewerRegistrySha256,
      },
    );

  const baseline = evaluate();
  const boundary = evaluate({ evaluatedOn: "2027-08-26" });
  assert.equal(boundary.evaluatedOn, "2027-08-26");
  assert.notEqual(boundary.receiptSha256, baseline.receiptSha256);
  assert.throws(() => evaluate({ evaluatedOn: "2027-08-27" }), /review expired before 2027-08-27/);

  const expiredSourceDecision = structuredClone(input.decision);
  expiredSourceDecision.sourceVerifications[0].verifiedOn = "2026-08-24";
  expiredSourceDecision.sourceVerifications[0].nextReviewOn = "2026-08-25";
  assert.throws(
    () => evaluate({ decision: expiredSourceDecision }),
    /promotion source .* review expired before 2026-08-26/,
  );

  const expiredAiDecision = structuredClone(input.decision);
  expiredAiDecision.aiVerification.verifiedOn = "2026-08-24";
  expiredAiDecision.aiVerification.nextReviewOn = "2026-08-25";
  assert.throws(
    () => evaluate({ decision: expiredAiDecision }),
    /promotion AI verification review expired before 2026-08-26/,
  );

  const retrogradeSourceDecision = structuredClone(input.decision);
  retrogradeSourceDecision.sourceVerifications[0].verifiedOn = "2026-08-25";
  assert.throws(
    () => evaluate({ decision: retrogradeSourceDecision }),
    /promotion source .* cannot be before source artifact date 2026-08-26/,
  );
});

test("rejects caller-supplied reviewer authority, aliased identities, and nested candidate drift", () => {
  const input = completeEligiblePromotionInput();
  const productionArgs = {
    packet: input.fixture.packet,
    reviewResult: input.reviewResult,
    cohortRegistry: input.cohortRegistry,
    resolvedGuides: input.fixture.resolvedGuides,
    decision: input.decision,
    candidateCorpus: input.candidateCorpus,
    successorPacket: input.successorPacket,
    searchResearchArtifacts: input.searchResearchArtifacts,
    originalAssetArtifacts: input.originalAssetArtifacts,
    evaluatedOn: input.evaluatedOn,
    runtimeGuides: input.runtimeGuides,
    registryPaths: PROMOTION_REGISTRY_PATHS,
  };
  assert.throws(
    () =>
      evaluateCorpusPromotion({
        ...productionArgs,
        reviewerRegistry: input.reviewerRegistry,
        trustedReviewerRegistrySha256: input.trustedReviewerRegistrySha256,
      }),
    /production promotion evaluation cannot accept caller-supplied reviewer authority/,
  );
  assert.throws(
    () => evaluateCorpusPromotion(productionArgs),
    /derives evaluatedOn from the trusted UTC clock/,
  );

  const aliasedRegistry = structuredClone(input.reviewerRegistry);
  aliasedRegistry.reviewers[1].identityProvider = aliasedRegistry.reviewers[0].identityProvider;
  aliasedRegistry.reviewers[1].identitySubject = aliasedRegistry.reviewers[0].identitySubject;
  assert.throws(
    () =>
      evaluateCorpusPromotionForTest(productionArgs, {
        reviewerRegistry: aliasedRegistry,
        trustedReviewerRegistrySha256: canonicalSha256(aliasedRegistry),
      }),
    /aliases one external identity/,
  );

  const evaluateCandidate = (candidateCorpus) => {
    const decision = structuredClone(input.decision);
    decision.candidateCorpusCanonicalSha256 = canonicalSha256(candidateCorpus);
    return evaluateCorpusPromotionForTest(
      { ...productionArgs, candidateCorpus, decision },
      {
        reviewerRegistry: input.reviewerRegistry,
        trustedReviewerRegistrySha256: input.trustedReviewerRegistrySha256,
      },
    );
  };

  const unknownNestedField = structuredClone(input.candidateCorpus);
  unknownNestedField.pages[0].unreviewedOverride = true;
  assert.throws(
    () => evaluateCandidate(unknownNestedField),
    /candidate corpus fails strict schema validation.*additionalProperties/,
  );

  const inventedEdgeType = structuredClone(input.candidateCorpus);
  inventedEdgeType.edges[0].type = "invented_relationship";
  assert.throws(
    () => evaluateCandidate(inventedEdgeType),
    /candidate corpus fails strict schema validation.*enum/,
  );

  const contradictorySlot = structuredClone(input.candidateCorpus);
  contradictorySlot.pages[0].slots.nextStep.receiptId = "receipt:invented";
  assert.throws(
    () => evaluateCandidate(contradictorySlot),
    /candidate corpus fails strict schema validation.*oneOf|candidate corpus fails strict schema validation.*type/,
  );

  const wrongCardinality = structuredClone(input.candidateCorpus);
  const parentEdge = wrongCardinality.edges.find((edge) => edge.type === "parent_of");
  parentEdge.cardinality = "many_to_many";
  assert.throws(() => evaluateCandidate(wrongCardinality), /invalid cardinality/);

  const malformedSuccessor = structuredClone(input.successorPacket);
  malformedSuccessor.claims[0].unreviewedOverride = true;
  assert.throws(
    () =>
      evaluateCorpusPromotionForTest(
        { ...productionArgs, successorPacket: malformedSuccessor },
        {
          reviewerRegistry: input.reviewerRegistry,
          trustedReviewerRegistrySha256: input.trustedReviewerRegistrySha256,
        },
      ),
    /successor review packet fails strict schema validation.*additionalProperties/,
  );
});

test("binds every candidate claim and source projection to the reviewed successor semantics", () => {
  const input = completeEligiblePromotionInput();
  const evaluateCandidate = (candidateCorpus) => {
    const decision = structuredClone(input.decision);
    decision.candidateCorpusCanonicalSha256 = canonicalSha256(candidateCorpus);
    return evaluateCorpusPromotionForTest(
      {
        packet: input.fixture.packet,
        reviewResult: input.reviewResult,
        cohortRegistry: input.cohortRegistry,
        resolvedGuides: input.fixture.resolvedGuides,
        decision,
        candidateCorpus,
        successorPacket: input.successorPacket,
        searchResearchArtifacts: input.searchResearchArtifacts,
        originalAssetArtifacts: input.originalAssetArtifacts,
        evaluatedOn: input.evaluatedOn,
        runtimeGuides: input.runtimeGuides,
        registryPaths: PROMOTION_REGISTRY_PATHS,
      },
      {
        reviewerRegistry: input.reviewerRegistry,
        trustedReviewerRegistrySha256: input.trustedReviewerRegistrySha256,
      },
    );
  };

  for (const [label, mutate] of [
    [
      "claim summary",
      (candidate) =>
        (candidate.claims.find((claim) => claim.scope.type === "page").summary =
          "Candidate-only unsupported claim wording must not survive review."),
    ],
    [
      "claim risk class",
      (candidate) =>
        (candidate.claims.find((claim) => claim.scope.type === "page").riskClass = "R1"),
    ],
    [
      "claim risk domains",
      (candidate) =>
        (candidate.claims.find((claim) => claim.scope.type === "page").riskDomains = ["pathogen"]),
    ],
    [
      "claim limitations",
      (candidate) =>
        (candidate.claims.find((claim) => claim.scope.type === "page").limitations = [
          "Candidate-only limitation drift.",
        ]),
    ],
    [
      "claim source identities",
      (candidate) => {
        const claim = candidate.claims.find((entry) => entry.scope.type === "page");
        const replacement = candidate.sources.find(
          (source) => !claim.sourceIds.includes(source.nodeId),
        );
        claim.sourceIds = replacement ? [replacement.nodeId] : claim.sourceIds.slice(0, -1);
      },
    ],
  ]) {
    const candidate = structuredClone(input.candidateCorpus);
    mutate(candidate);
    assert.throws(
      () => evaluateCandidate(candidate),
      /candidate claim .* diverges from its reviewed successor claim/,
      label,
    );
  }

  for (const [label, mutate] of [
    ["source URL", (source) => (source.url = "https://example.com/candidate-only-source")],
    ["source evidence tier", (source) => (source.evidenceTier = "D")],
    ["source access date", (source) => (source.accessedOn = "2026-08-25")],
    ["source stable identity", (source) => (source.stableIdentifier = "candidate-only-id")],
    ["source limitations", (source) => (source.limitations = ["Candidate-only limitation drift."])],
  ]) {
    const candidate = structuredClone(input.candidateCorpus);
    mutate(candidate.sources[0]);
    assert.throws(
      () => evaluateCandidate(candidate),
      /candidate source .* diverges from its reviewed successor source/,
      label,
    );
  }
});

test("binds every proposed edge to an exact resolved runtime location and path", () => {
  assertInvalid(({ packet }) => {
    packet.pages[0].proposedLinks[0].location = "related.999";
  }, /proposed-link location related\.999 is not rendered/);
  assertInvalid(({ packet }) => {
    packet.pages[0].proposedLinks[0].path = "/guides/invented";
  }, /path \/guides\/invented does not match rendered path/);
  assertInvalid(({ packet }) => {
    packet.pages[0].proposedLinks.push(clone(packet.pages[0].proposedLinks[0]));
  }, /repeats proposed-link location related\.0/);
});

test("requires honest cluster-child, next-step, and diagnostic-differential semantics", () => {
  assertInvalid(({ packet }) => {
    const hub = packet.pages.find((pageEntry) => pageEntry.path === HUB_PATH);
    hub.proposedLinks[0].slot = "next_step";
  }, /needs exactly one proposed next-step decision/);
  assertInvalid(({ packet }) => {
    const hub = packet.pages.find((pageEntry) => pageEntry.path === HUB_PATH);
    for (const link of hub.proposedLinks) {
      if (link.slot === "collection_child") link.slot = "supplemental";
    }
  }, /needs at least one proposed collection child/);
  assertInvalid(({ packet }) => {
    packet.pages[0].proposedLinks[0].slot = "supplemental";
  }, /needs at least three proposed differential links/);
});

test("requires runtime and packet route sets to remain equal", () => {
  assertInvalid(({ resolvedGuides }) => {
    resolvedGuides.push(resolvedGuide("/guides/extra"));
  }, /resolved runtime guides must exactly equal/);
  assertInvalid(({ packet }) => {
    packet.pages.reverse();
  }, /page paths must be sorted/);
});
