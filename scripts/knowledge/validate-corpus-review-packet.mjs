import { createHash } from "node:crypto";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_ROLES = new Set([
  "supports",
  "limits",
  "contradicts",
  "defines_method",
  "controls_requirement",
  "documents_product",
]);
const RISK_RANK = Object.freeze({ R0: 0, R1: 1, R2: 2, R3: 3 });
const PAGE_FAMILIES = new Set(["cluster", "diagnostic"]);
const EVIDENCE_TIERS = new Set(["A", "B", "C", "D"]);
const SOURCE_TYPES = new Set(["cohort_provenance", "evidence"]);
const PROPOSED_LINK_SLOTS = new Set([
  "breadcrumb",
  "collection_child",
  "contextual_lateral",
  "differential",
  "next_step",
  "prerequisite",
  "supplemental",
]);

function fail(message) {
  throw new Error(`Knowledge corpus review packet invalid: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) fail(`${label} must be an object`);
  return value;
}

function requireArray(value, label, { minItems = 0 } = {}) {
  if (!Array.isArray(value) || value.length < minItems) {
    fail(`${label} must be an array with at least ${minItems} item(s)`);
  }
  return value;
}

function requireString(value, label, { minLength = 1 } = {}) {
  if (typeof value !== "string" || value.trim().length < minLength) {
    fail(`${label} must be a string with at least ${minLength} character(s)`);
  }
  return value;
}

function requireNullableString(value, label) {
  if (value === null) return null;
  return requireString(value, label);
}

function requireDate(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  requireString(value, label);
  if (!ISO_DATE_PATTERN.test(value)) fail(`${label} must be an ISO date`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail(`${label} must be a real ISO date`);
  }
  return value;
}

function requireUnique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} must be unique`);
}

function compareBytes(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireSorted(values, label) {
  const expected = [...values].sort(compareBytes);
  if (values.some((value, index) => value !== expected[index])) {
    fail(`${label} must be sorted for deterministic review`);
  }
}

function collectStrings(value, label, options) {
  return requireArray(value, label, options).map((entry, index) =>
    requireString(entry, `${label}[${index}]`),
  );
}

function canonicalHttpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(requireString(value, label));
  } catch {
    fail(`${label} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== "https:") fail(`${label} must use HTTPS`);
  if (parsed.username || parsed.password) fail(`${label} must not contain credentials`);
  if (parsed.href !== value) fail(`${label} must use its canonical HTTPS serialization`);
  return parsed.href;
}

function sameSet(actual, expected) {
  return actual.length === expected.size && actual.every((value) => expected.has(value));
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function runtimeGuideReceipt(guide) {
  return {
    path: guide.path,
    publishedOn: guide.publishedOn,
    modifiedOn: guide.modifiedOn,
    material: guide.material.map(({ key, sha256: materialSha256 }) => ({
      key,
      sha256: materialSha256,
    })),
    internalLinks: guide.internalLinks,
    externalSources: guide.externalSources,
    relatedPaths: guide.relatedPaths,
  };
}

export function runtimeGuideDigest(guide) {
  return sha256(JSON.stringify(runtimeGuideReceipt(guide)));
}

function validateHeader(packet) {
  requireRecord(packet, "review packet");
  if (packet.version !== 1 || packet.artifactType !== "knowledge_corpus_review_packet") {
    fail("packet must declare version 1 and artifactType knowledge_corpus_review_packet");
  }
  requireString(packet.revisionId, "revisionId", { minLength: 12 });
  if ("supersedesRevisionId" in packet) {
    requireString(packet.supersedesRevisionId, "supersedesRevisionId", { minLength: 12 });
    if (packet.supersedesRevisionId === packet.revisionId) {
      fail("supersedesRevisionId must identify an earlier immutable revision");
    }
  }
  requireDate(packet.createdOn, "createdOn");
  if (packet.evidenceScope !== "resolved_runtime_material_and_draft_claim_map") {
    fail("evidenceScope must be resolved_runtime_material_and_draft_claim_map");
  }

  const status = requireRecord(packet.statusEvidence, "statusEvidence");
  if (status.publicationStatus !== "NOT_MEASURED") {
    fail("publicationStatus must remain NOT_MEASURED until verified publication evidence exists");
  }
  if (status.renderedCrawlStatus !== "NOT_MEASURED") {
    fail("renderedCrawlStatus must remain NOT_MEASURED until a rendered crawl receipt exists");
  }
}

function validateCohort(packet, cohortRegistry) {
  const cohort = requireRecord(packet.cohort, "cohort");
  const registryCohort = requireArray(cohortRegistry?.cohorts, "cohort registry cohorts", {
    minItems: 1,
  }).find((candidate) => candidate.id === cohort.id);
  if (!registryCohort) fail(`cohort ${String(cohort.id)} is absent from the route registry`);
  if (cohort.registrySourcePullRequest !== registryCohort.sourcePullRequest) {
    fail("registrySourcePullRequest does not match the route registry");
  }
  const paths = collectStrings(cohort.paths, "cohort paths", { minItems: 1 });
  requireUnique(paths, "cohort paths");
  requireSorted(paths, "cohort paths");
  if (!sameSet(paths, new Set(registryCohort.paths))) {
    fail("cohort paths must exactly equal the registered route cohort");
  }
  requireString(cohort.cohortProvenanceSourceId, "cohortProvenanceSourceId");
  if (cohort.sourceRouteState !== "registered_public") {
    fail("sourceRouteState must record current public-source registry membership");
  }
  if (cohort.editorialState !== "sourced") {
    fail("editorialState must remain sourced until human review receipts exist");
  }
  if (cohort.publicationReadiness !== "BLOCKED") {
    fail("publicationReadiness must remain BLOCKED for this unreviewed revision");
  }
  return { cohort, registryCohort, paths };
}

function validateAssignments(packet) {
  const assignments = requireRecord(packet.assignments, "assignments");
  requireNullableString(assignments.managingEditorId, "assignments.managingEditorId");
  for (const field of ["authorIds", "evidenceReviewerIds", "cultivationReviewerIds"]) {
    const ids = collectStrings(assignments[field], `assignments.${field}`);
    requireUnique(ids, `assignments.${field}`);
    requireSorted(ids, `assignments.${field}`);
  }
  return assignments;
}

function validateAiAssistance(packet) {
  const assistance = requireRecord(packet.aiAssistance, "aiAssistance");
  requireString(assistance.tool, "aiAssistance.tool");
  requireDate(assistance.usedOn, "aiAssistance.usedOn");
  collectStrings(assistance.uses, "aiAssistance.uses", { minItems: 1 });
  requireNullableString(assistance.humanVerifierId, "aiAssistance.humanVerifierId");
  return assistance;
}

function validateSources(packet, cohort) {
  const sourceById = new Map();
  const urlToId = new Map();
  const stableIdToId = new Map();
  const ids = [];
  for (const [index, source] of requireArray(packet.sources, "sources", {
    minItems: 3,
  }).entries()) {
    requireRecord(source, `sources[${index}]`);
    const id = requireString(source.id, `sources[${index}].id`);
    if (sourceById.has(id)) fail(`sources repeat ${id}`);
    if (!SOURCE_TYPES.has(source.sourceType)) fail(`source ${id} has invalid sourceType`);
    requireString(source.title, `source ${id} title`, { minLength: 4 });
    const url = canonicalHttpsUrl(source.url, `source ${id} URL`);
    requireString(source.publisher, `source ${id} publisher`, { minLength: 2 });
    collectStrings(source.authors, `source ${id} authors`);
    if (!EVIDENCE_TIERS.has(source.evidenceTier)) fail(`source ${id} has invalid evidenceTier`);
    requireDate(source.publishedOn, `source ${id} publishedOn`, { nullable: true });
    requireDate(source.versionDate, `source ${id} versionDate`, { nullable: true });
    requireDate(source.accessedOn, `source ${id} accessedOn`);
    const stableIdentifier = requireString(
      source.stableIdentifier,
      `source ${id} stableIdentifier`,
      {
        minLength: 4,
      },
    );
    requireNullableString(source.archiveLocator, `source ${id} archiveLocator`);
    requireString(source.license, `source ${id} license`, { minLength: 3 });
    collectStrings(source.limitations, `source ${id} limitations`, { minItems: 1 });
    if (urlToId.has(url)) fail(`sources ${urlToId.get(url)} and ${id} repeat URL ${url}`);
    if (stableIdToId.has(stableIdentifier)) {
      fail(`sources ${stableIdToId.get(stableIdentifier)} and ${id} repeat stableIdentifier`);
    }
    urlToId.set(url, id);
    stableIdToId.set(stableIdentifier, id);
    sourceById.set(id, source);
    ids.push(id);
  }
  requireSorted(ids, "source IDs");

  const provenance = sourceById.get(cohort.cohortProvenanceSourceId);
  if (!provenance || provenance.sourceType !== "cohort_provenance") {
    fail("cohortProvenanceSourceId must resolve to a cohort_provenance source");
  }
  const expectedPrUrl = `https://github.com/Verdant-OS/verdant-grow-diary/pull/${cohort.registrySourcePullRequest}`;
  if (provenance.url !== expectedPrUrl || provenance.stableIdentifier !== expectedPrUrl) {
    fail(
      "cohort provenance must use the exact registered pull-request URL as URL and stableIdentifier",
    );
  }
  const provenanceSources = [...sourceById.values()].filter(
    (source) => source.sourceType === "cohort_provenance",
  );
  if (provenanceSources.length !== 1) fail("packet requires exactly one cohort provenance source");
  return sourceById;
}

function validatePacketChronology(packet, assistance, sourceById) {
  if (assistance.usedOn > packet.createdOn) {
    fail(`aiAssistance.usedOn cannot be after packet createdOn ${packet.createdOn}`);
  }

  for (const source of sourceById.values()) {
    if (source.accessedOn > packet.createdOn) {
      fail(`source ${source.id} accessedOn cannot be after packet createdOn ${packet.createdOn}`);
    }
    for (const field of ["publishedOn", "versionDate"]) {
      const value = source[field];
      if (value !== null && value > source.accessedOn) {
        fail(`source ${source.id} ${field} cannot be after accessedOn ${source.accessedOn}`);
      }
    }
  }
}

function validateApplicability(claim) {
  const applicability = requireRecord(claim.applicability, `claim ${claim.id} applicability`);
  const bases = new Set([
    "direct_cannabis",
    "proxy_crop",
    "field_observation",
    "authoritative_synthesis",
    "editorial_policy",
  ]);
  if (!bases.has(applicability.evidenceBasis)) {
    fail(`claim ${claim.id} has invalid evidenceBasis`);
  }
  for (const field of [
    "speciesOrPopulation",
    "cultivarPopulation",
    "stageScope",
    "propagationMethod",
    "mediumScope",
    "facilityScope",
    "methodScope",
    "unitScope",
    "evidenceDateScope",
    "sampleSize",
    "replication",
    "scopeNote",
  ]) {
    requireString(applicability[field], `claim ${claim.id} applicability.${field}`, {
      minLength: 3,
    });
  }
  const environment = requireRecord(
    applicability.environmentalContext,
    `claim ${claim.id} applicability.environmentalContext`,
  );
  for (const field of ["temperature", "humidity", "light", "co2", "irrigation", "pathogen"]) {
    requireString(environment[field], `claim ${claim.id} environmentalContext.${field}`, {
      minLength: 3,
    });
  }
  collectStrings(applicability.transferLimits, `claim ${claim.id} applicability.transferLimits`, {
    minItems: 1,
  });
}

function validateClaims(packet, sourceById, cohortPaths) {
  const claimById = new Map();
  const ids = [];
  for (const [index, claim] of requireArray(packet.claims, "claims", { minItems: 4 }).entries()) {
    requireRecord(claim, `claims[${index}]`);
    const id = requireString(claim.id, `claims[${index}].id`);
    if (claimById.has(id)) fail(`claims repeat ${id}`);
    if (!cohortPaths.has(claim.path)) fail(`claim ${id} references non-cohort path ${claim.path}`);
    requireString(claim.claimType, `claim ${id} claimType`);
    if (claim.wordingState !== "bounded") fail(`claim ${id} wordingState must be bounded`);
    if (claim.evidenceState !== "sourced_pending_review") {
      fail(`claim ${id} evidenceState must be sourced_pending_review`);
    }
    if (!Object.hasOwn(RISK_RANK, claim.riskClass)) fail(`claim ${id} has invalid riskClass`);
    collectStrings(claim.riskDomains, `claim ${id} riskDomains`, { minItems: 1 });
    requireString(claim.text, `claim ${id} text`, { minLength: 12 });

    const sourceIds = [];
    for (const [linkIndex, link] of requireArray(claim.sourceLinks, `claim ${id} sourceLinks`, {
      minItems: 1,
    }).entries()) {
      requireRecord(link, `claim ${id} sourceLinks[${linkIndex}]`);
      const sourceId = requireString(
        link.sourceId,
        `claim ${id} sourceLinks[${linkIndex}].sourceId`,
      );
      const source = sourceById.get(sourceId);
      if (!source) fail(`claim ${id} references missing source ${sourceId}`);
      if (source.sourceType !== "evidence") {
        fail(`claim ${id} cannot use cohort provenance as scientific evidence`);
      }
      const roles = collectStrings(link.roles, `claim ${id} source ${sourceId} roles`, {
        minItems: 1,
      });
      requireUnique(roles, `claim ${id} source ${sourceId} roles`);
      for (const role of roles) {
        if (!SOURCE_ROLES.has(role))
          fail(`claim ${id} source ${sourceId} has invalid role ${role}`);
      }
      requireString(link.locator, `claim ${id} source ${sourceId} locator`, { minLength: 5 });
      sourceIds.push(sourceId);
    }
    requireUnique(sourceIds, `claim ${id} source IDs`);
    requireSorted(sourceIds, `claim ${id} source IDs`);
    validateApplicability(claim);
    for (const field of [
      "confounders",
      "uncertainty",
      "prohibitedConclusions",
      "limitations",
      "invalidationTriggers",
    ]) {
      collectStrings(claim[field], `claim ${id} ${field}`, { minItems: 1 });
    }
    if (claim.authorId !== null)
      fail(`claim ${id} authorId must remain null while approval is pending`);
    if (requireArray(claim.evidenceReviewerIds, `claim ${id} evidenceReviewerIds`).length !== 0) {
      fail(`claim ${id} cannot claim evidence review before a review receipt exists`);
    }
    if (
      requireArray(claim.cultivationReviewerIds, `claim ${id} cultivationReviewerIds`).length !== 0
    ) {
      fail(`claim ${id} cannot claim cultivation review before a review receipt exists`);
    }
    if (
      claim.approvalDecision !== "pending" ||
      claim.approvedOn !== null ||
      claim.nextReviewOn !== null
    ) {
      fail(`claim ${id} must remain pending with null approval and review dates`);
    }
    const materialKeys = collectStrings(claim.materialKeys, `claim ${id} materialKeys`, {
      minItems: 1,
    });
    requireUnique(materialKeys, `claim ${id} materialKeys`);
    requireSorted(materialKeys, `claim ${id} materialKeys`);
    claimById.set(id, claim);
    ids.push(id);
  }
  requireSorted(ids, "claim IDs");
  return claimById;
}

function sourceMixBlocker(claim, sourceById) {
  if (RISK_RANK[claim.riskClass] < RISK_RANK.R2) return null;
  const sources = claim.sourceLinks.map((link) => sourceById.get(link.sourceId));
  const hasTierA = sources.some((source) => source.evidenceTier === "A");
  const qualifying = sources.filter(
    (source) => source.evidenceTier === "A" || source.evidenceTier === "B",
  );
  const independentPublishers = new Set(qualifying.map((source) => source.publisher.toLowerCase()));
  const independentStableIds = new Set(qualifying.map((source) => source.stableIdentifier));
  if (hasTierA && independentPublishers.size >= 2 && independentStableIds.size >= 2) return null;
  return {
    code: "R2_SOURCE_MIX_UNREVIEWED",
    scopeId: claim.id,
    reason:
      "R2 claim lacks a Tier A source plus an independent Tier A/B source from a distinct publisher.",
  };
}

function validatePages(packet, paths, resolvedGuides, claimById, sourceById) {
  const resolvedByPath = new Map(resolvedGuides.map((guide) => [guide.path, guide]));
  if (!sameSet([...resolvedByPath.keys()], new Set(paths))) {
    fail("resolved runtime guides must exactly equal the registered cohort paths");
  }
  const pageByPath = new Map();
  const pagePaths = [];
  const blockers = [];
  for (const [index, page] of requireArray(packet.pages, "pages", { minItems: 1 }).entries()) {
    requireRecord(page, `pages[${index}]`);
    const pagePath = requireString(page.path, `pages[${index}].path`);
    if (!paths.includes(pagePath)) fail(`page ${pagePath} is outside the cohort`);
    if (pageByPath.has(pagePath)) fail(`pages repeat ${pagePath}`);
    if (!PAGE_FAMILIES.has(page.pageFamily)) fail(`page ${pagePath} has invalid pageFamily`);
    if (pagePath === "/guides/cannabis-leaf-symptoms" && page.pageFamily !== "cluster") {
      fail("the symptom hub must retain pageFamily cluster");
    }
    if (pagePath !== "/guides/cannabis-leaf-symptoms" && page.pageFamily !== "diagnostic") {
      fail(`focused symptom page ${pagePath} must retain pageFamily diagnostic`);
    }
    if (!Object.hasOwn(RISK_RANK, page.riskClass)) fail(`page ${pagePath} has invalid riskClass`);
    const resolved = resolvedByPath.get(pagePath);
    const digest = requireString(
      page.runtimeMaterialSha256,
      `page ${pagePath} runtimeMaterialSha256`,
    );
    if (!SHA256_PATTERN.test(digest) || digest !== runtimeGuideDigest(resolved)) {
      fail(`page ${pagePath} runtime material changed without review-packet refresh`);
    }

    const claimIds = collectStrings(page.claimIds, `page ${pagePath} claimIds`, { minItems: 1 });
    requireUnique(claimIds, `page ${pagePath} claimIds`);
    requireSorted(claimIds, `page ${pagePath} claimIds`);
    for (const claimId of claimIds) {
      const claim = claimById.get(claimId);
      if (!claim || claim.path !== pagePath)
        fail(`page ${pagePath} references foreign claim ${claimId}`);
      if (RISK_RANK[claim.riskClass] > RISK_RANK[page.riskClass]) {
        fail(`page ${pagePath} understates claim risk ${claimId}`);
      }
    }
    const expectedClaimIds = [...claimById.values()]
      .filter((claim) => claim.path === pagePath)
      .map((claim) => claim.id);
    if (!sameSet(claimIds, new Set(expectedClaimIds))) {
      fail(`page ${pagePath} claimIds must exactly cover its claims`);
    }

    const coveredKeys = [];
    for (const claimId of claimIds) coveredKeys.push(...claimById.get(claimId).materialKeys);
    for (const [classificationIndex, classification] of requireArray(
      page.nonClaimMaterial,
      `page ${pagePath} nonClaimMaterial`,
    ).entries()) {
      requireRecord(classification, `page ${pagePath} nonClaimMaterial[${classificationIndex}]`);
      if (
        !new Set(["navigation", "heading", "question", "metadata"]).has(
          classification.classification,
        )
      ) {
        fail(`page ${pagePath} has invalid non-claim classification`);
      }
      requireString(classification.reason, `page ${pagePath} non-claim reason`, { minLength: 8 });
      const keys = collectStrings(classification.keys, `page ${pagePath} non-claim keys`, {
        minItems: 1,
      });
      requireUnique(keys, `page ${pagePath} non-claim keys`);
      requireSorted(keys, `page ${pagePath} non-claim keys`);
      coveredKeys.push(...keys);
    }
    requireUnique(coveredKeys, `page ${pagePath} material coverage`);
    const runtimeKeys = resolved.material.map((entry) => entry.key);
    if (!sameSet(coveredKeys, new Set(runtimeKeys))) {
      const missing = runtimeKeys.filter((key) => !coveredKeys.includes(key));
      const unknown = coveredKeys.filter((key) => !runtimeKeys.includes(key));
      fail(
        `page ${pagePath} material coverage diverges; missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"}`,
      );
    }

    const sourceIds = collectStrings(
      page.proposedVisibleSourceIds,
      `page ${pagePath} proposedVisibleSourceIds`,
      { minItems: 1 },
    );
    requireUnique(sourceIds, `page ${pagePath} proposedVisibleSourceIds`);
    requireSorted(sourceIds, `page ${pagePath} proposedVisibleSourceIds`);
    for (const sourceId of sourceIds) {
      if (sourceById.get(sourceId)?.sourceType !== "evidence") {
        fail(`page ${pagePath} proposed visible source ${sourceId} is not evidence`);
      }
    }
    const usedSourceIds = new Set(
      claimIds.flatMap((claimId) =>
        claimById.get(claimId).sourceLinks.map((link) => link.sourceId),
      ),
    );
    if (!sameSet(sourceIds, usedSourceIds)) {
      fail(
        `page ${pagePath} proposedVisibleSourceIds must exactly equal its claim evidence sources`,
      );
    }
    if (resolved.externalSources.length === 0) {
      blockers.push({
        code: "VISIBLE_SOURCES_NOT_RENDERED",
        scopeId: pagePath,
        reason: "The runtime guide renders no visible source list for this sourced draft.",
      });
    }

    const renderedLinkByLocation = new Map();
    for (const [linkIndex, link] of requireArray(
      resolved.internalLinks,
      `resolved guide ${pagePath} internalLinks`,
    ).entries()) {
      requireRecord(link, `resolved guide ${pagePath} internalLinks[${linkIndex}]`);
      const location = requireString(
        link.location,
        `resolved guide ${pagePath} internalLinks[${linkIndex}].location`,
      );
      const renderedPath = requireString(
        link.path,
        `resolved guide ${pagePath} internalLinks[${linkIndex}].path`,
      );
      if (renderedLinkByLocation.has(location)) {
        fail(`resolved guide ${pagePath} repeats internal-link location ${location}`);
      }
      renderedLinkByLocation.set(location, renderedPath);
    }

    const links = requireArray(page.proposedLinks, `page ${pagePath} proposedLinks`, {
      minItems: 1,
    });
    const proposedLocations = new Set();
    let collectionChildCount = 0;
    let differentialCount = 0;
    let nextStepCount = 0;
    for (const [linkIndex, link] of links.entries()) {
      requireRecord(link, `page ${pagePath} proposedLinks[${linkIndex}]`);
      const location = requireString(
        link.location,
        `page ${pagePath} proposedLinks[${linkIndex}].location`,
      );
      const proposedPath = requireString(
        link.path,
        `page ${pagePath} proposedLinks[${linkIndex}].path`,
      );
      if (proposedLocations.has(location)) {
        fail(`page ${pagePath} repeats proposed-link location ${location}`);
      }
      proposedLocations.add(location);
      if (!renderedLinkByLocation.has(location)) {
        fail(`page ${pagePath} proposed-link location ${location} is not rendered`);
      }
      const renderedPath = renderedLinkByLocation.get(location);
      if (renderedPath !== proposedPath) {
        fail(
          `page ${pagePath} proposed-link location ${location} path ${proposedPath} does not match rendered path ${renderedPath}`,
        );
      }
      if (!PROPOSED_LINK_SLOTS.has(link.slot))
        fail(`page ${pagePath} has invalid proposed-link slot`);
      if (link.status !== "proposed")
        fail(`page ${pagePath} review-packet links must remain proposed`);
      if (link.slot === "collection_child") collectionChildCount += 1;
      if (link.slot === "differential") differentialCount += 1;
      if (link.slot === "next_step") nextStepCount += 1;
    }
    if (page.pageFamily === "cluster") {
      if (collectionChildCount < 1) {
        fail(`cluster page ${pagePath} needs at least one proposed collection child`);
      }
      if (nextStepCount !== 1) {
        fail(`cluster page ${pagePath} needs exactly one proposed next-step decision`);
      }
      blockers.push({
        code: "CLUSTER_NEXT_STEP_REVIEW_PENDING",
        scopeId: pagePath,
        reason: "Cluster next-step candidates remain proposed and have no human review receipt.",
      });
    }
    if (page.pageFamily === "diagnostic") {
      if (differentialCount < 3) {
        fail(`diagnostic page ${pagePath} needs at least three proposed differential links`);
      }
      blockers.push({
        code: "DIFFERENTIAL_LINKS_UNREVIEWED",
        scopeId: pagePath,
        reason:
          "Diagnostic differential candidates remain proposed and have no human review receipt.",
      });
    }
    if (page.searchResearchReceiptId !== null) {
      fail(`page ${pagePath} cannot claim search research without a reviewed receipt artifact`);
    }
    blockers.push({
      code: "SEARCH_RESEARCH_MISSING",
      scopeId: pagePath,
      reason: "No reproducible search-intent receipt exists for this revision.",
    });
    if (page.originalAssetReviewId !== null) {
      fail(`page ${pagePath} cannot claim original-asset review without a receipt artifact`);
    }
    blockers.push({
      code: "ORIGINAL_ASSET_REVIEW_MISSING",
      scopeId: pagePath,
      reason:
        "The page-specific original asset has no creator, method, license, and review receipt.",
    });
    pageByPath.set(pagePath, page);
    pagePaths.push(pagePath);
  }
  requireSorted(pagePaths, "page paths");
  if (!sameSet(pagePaths, new Set(paths))) fail("pages must exactly cover cohort paths");
  return blockers;
}

function assignmentBlockers(assignments, assistance) {
  const blockers = [];
  if (assignments.managingEditorId === null) {
    blockers.push({
      code: "MANAGING_EDITOR_UNASSIGNED",
      scopeId: "PV1-SYMPTOM-EVIDENCE-GUIDES",
      reason: "No real managing editor is assigned to the revision.",
    });
  }
  for (const [field, code, role] of [
    ["authorIds", "AUTHOR_UNASSIGNED", "author"],
    ["evidenceReviewerIds", "EVIDENCE_REVIEWER_UNASSIGNED", "evidence reviewer"],
    ["cultivationReviewerIds", "CULTIVATION_REVIEWER_UNASSIGNED", "cultivation reviewer"],
  ]) {
    if (assignments[field].length === 0) {
      blockers.push({
        code,
        scopeId: "PV1-SYMPTOM-EVIDENCE-GUIDES",
        reason: `No real ${role} is assigned to the revision.`,
      });
    }
  }
  if (assistance.humanVerifierId === null) {
    blockers.push({
      code: "AI_ASSISTANCE_UNVERIFIED",
      scopeId: "PV1-SYMPTOM-EVIDENCE-GUIDES",
      reason:
        "AI-assisted source discovery and drafting have not been verified by an assigned human.",
    });
  }
  return blockers;
}

function sourceMetadataBlockers(sourceById) {
  const blockers = [];
  for (const source of sourceById.values()) {
    if (source.sourceType !== "evidence") continue;
    if (source.authors.length === 0) {
      blockers.push({
        code: "SOURCE_AUTHORSHIP_UNVERIFIED",
        scopeId: source.id,
        reason: "Evidence-source authorship has not been verified for this revision.",
      });
    }
    if (source.publishedOn === null && source.versionDate === null) {
      blockers.push({
        code: "SOURCE_DATE_UNVERIFIED",
        scopeId: source.id,
        reason: "Evidence-source publication or version date has not been verified.",
      });
    }
    if (source.license === "not_assessed") {
      blockers.push({
        code: "SOURCE_LICENSE_UNASSESSED",
        scopeId: source.id,
        reason: "Evidence-source reuse and citation license has not been assessed.",
      });
    }
  }
  return blockers;
}

function compareBlockers(left, right) {
  return compareBytes(`${left.code}\u0000${left.scopeId}`, `${right.code}\u0000${right.scopeId}`);
}

export function validateCorpusReviewPacket({ packet, cohortRegistry, resolvedGuides }) {
  validateHeader(packet);
  const { cohort, paths } = validateCohort(packet, cohortRegistry);
  const assignments = validateAssignments(packet);
  const assistance = validateAiAssistance(packet);
  const sourceById = validateSources(packet, cohort);
  validatePacketChronology(packet, assistance, sourceById);
  const claimById = validateClaims(packet, sourceById, new Set(paths));
  const blockers = [
    ...assignmentBlockers(assignments, assistance),
    ...sourceMetadataBlockers(sourceById),
    ...[...claimById.values()].map((claim) => sourceMixBlocker(claim, sourceById)).filter(Boolean),
    ...validatePages(packet, paths, resolvedGuides, claimById, sourceById),
    ...[...claimById.values()].map((claim) => ({
      code: "CLAIM_APPROVAL_PENDING",
      scopeId: claim.id,
      reason: "Claim has not completed evidence and cultivation review.",
    })),
  ].sort(compareBlockers);

  requireUnique(
    blockers.map((blocker) => `${blocker.code}\u0000${blocker.scopeId}`),
    "derived blocker identities",
  );
  if (blockers.length === 0)
    fail("unreviewed sourced packet unexpectedly has no publication blockers");

  return {
    contractStatus: "pass",
    editorialState: cohort.editorialState,
    publicationReadiness: "BLOCKED",
    publicationStatus: packet.statusEvidence.publicationStatus,
    renderedCrawlStatus: packet.statusEvidence.renderedCrawlStatus,
    cohortId: cohort.id,
    pageCount: packet.pages.length,
    claimCount: packet.claims.length,
    sourceCount: packet.sources.length,
    blockers,
  };
}
