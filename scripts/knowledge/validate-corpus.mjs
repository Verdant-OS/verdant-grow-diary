import { createHash } from "node:crypto";

import { EDGE_CONTRACTS, validateGraphEdgeSemantics } from "./validate-schemas.mjs";

const NODE_ID_PATTERN = /^[a-z][a-z0-9_-]*:[a-z0-9][a-z0-9._:-]*$/;
const EDGE_ID_PATTERN = /^edge:[a-z0-9][a-z0-9._:-]*$/;
const RECEIPT_ID_PATTERN = /^receipt:[a-z0-9][a-z0-9._:-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PUBLIC_KNOWLEDGE_PATH_PATTERN = /^\/(?:guides|cultivars)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RISK_RANK = Object.freeze({ R0: 0, R1: 1, R2: 2, R3: 3 });
const EVIDENCE_STATES = new Set([
  "measured",
  "supported",
  "source_reported",
  "field_tendency",
  "hypothesis",
  "unknown",
  "disputed",
]);
const SOURCE_REQUIRED_EVIDENCE_STATES = new Set(["measured", "supported", "source_reported"]);
const RISK_DOMAINS = new Set([
  "standard",
  "pathogen",
  "biosecurity",
  "pesticide",
  "electrical",
  "fire_safety",
  "hvac_safety",
  "co2_safety",
  "chemical_safety",
]);
const PAGE_FAMILIES = new Set([
  "pillar",
  "cluster",
  "reference",
  "protocol",
  "diagnostic",
  "comparison",
  "worked-example",
  "entity",
  "glossary",
  "method",
  "profile",
  "governance",
]);
const SUPPORTED_FOUNDATION_PAGE_FAMILIES = new Set(["reference", "diagnostic"]);
const FOUNDATION_REQUIRED_SLOTS = Object.freeze({
  reference: new Set(["breadcrumb", "contextualLateral", "nextStep"]),
  diagnostic: new Set(["breadcrumb", "contextualLateral", "nextStep", "differential"]),
});
const PAGE_NODE_TYPES = new Set([
  "Topic",
  "Cultivar",
  "Sensor",
  "Condition",
  "Protocol",
  "Equipment",
  "Method",
]);
const NODE_TYPE_PREFIX = Object.freeze({
  Author: "author",
  Capability: "capability",
  Claim: "claim",
  Condition: "condition",
  Cultivar: "cultivar",
  Equipment: "equipment",
  EvidenceSource: "source",
  Facility: "facility",
  Integration: "integration",
  Jurisdiction: "jurisdiction",
  Medium: "medium",
  Method: "method",
  Metric: "metric",
  Observation: "observation",
  Outcome: "outcome",
  Phenotype: "phenotype",
  ProductAction: "product-action",
  Protocol: "protocol",
  Reviewer: "reviewer",
  Run: "run",
  Sensor: "sensor",
  Stage: "stage",
  Symptom: "symptom",
  Topic: "topic",
  Trait: "trait",
  Unit: "unit",
});
const SLOT_NAMES = Object.freeze([
  "breadcrumb",
  "prerequisite",
  "contextualLateral",
  "nextStep",
  "differential",
]);
const SLOT_EDGE_TYPES = Object.freeze({
  breadcrumb: new Set(["parent_of"]),
  prerequisite: new Set(["requires"]),
  contextualLateral: new Set([
    "measured_by",
    "uses_unit",
    "derived_from",
    "observed_as",
    "confirmed_by",
    "disconfirmed_by",
    "managed_by",
    "occurs_during",
    "affects",
    "applies_to",
    "has_lineage_claim",
    "has_observed_trait",
    "uses_method",
    "has_phenotype",
    "grown_in",
    "produced_outcome",
    "has_capability",
    "exposes_capability",
    "integrates_with",
    "valid_in",
    "related_to",
  ]),
  nextStep: new Set(["next_step"]),
  differential: new Set(["differential_of", "mimics"]),
});
const LINK_DECISION_TO_PAGE_SLOT = Object.freeze({
  prerequisite: "prerequisite",
  contextual_lateral: "contextualLateral",
  next_step: "nextStep",
  differential: "differential",
});
const LINK_DECISION_SLOTS = new Set([...Object.keys(LINK_DECISION_TO_PAGE_SLOT), "supplemental"]);
const RENDER_BOUND_SLOT_NAMES = Object.freeze(Object.values(LINK_DECISION_TO_PAGE_SLOT));

function fail(message) {
  throw new Error(`Knowledge corpus invalid: ${message}`);
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

function requireNodeId(value, label) {
  requireString(value, label);
  if (!NODE_ID_PATTERN.test(value)) fail(`${label} must be a canonical node ID`);
  return value;
}

function requireDate(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  requireString(value, label);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) fail(`${label} must be an ISO date`);
  const parsed = new Date(`${value}T00:00:00Z`);
  const [, year, month, day] = match;
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    fail(`${label} must be an ISO date`);
  }
  return value;
}

function requireUnique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} must be unique`);
}

function requireSorted(values, label) {
  const sorted = [...values].sort(compareBytes);
  if (values.some((value, index) => value !== sorted[index])) {
    fail(`${label} must be sorted for deterministic review`);
  }
}

function compareBytes(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameSet(actual, expected) {
  return actual.length === expected.size && actual.every((value) => expected.has(value));
}

function otherEndpoint(edge, nodeId) {
  if (edge.sourceId === nodeId) return edge.targetId;
  if (edge.symmetric && edge.targetId === nodeId) return edge.sourceId;
  return null;
}

function edgeConnects(edge, sourceNodeId, targetNodeId) {
  if (edge.sourceId === sourceNodeId && edge.targetId === targetNodeId) return true;
  return Boolean(
    edge.symmetric && edge.sourceId === targetNodeId && edge.targetId === sourceNodeId,
  );
}

function collectStrings(value, label) {
  return requireArray(value, label).map((item, index) => requireString(item, `${label}[${index}]`));
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
  return parsed.href;
}

function addMaterial(material, key, value) {
  if (typeof value !== "string" || value.trim().length === 0) return;
  if (material.some((entry) => entry.key === key)) {
    fail(`resolved guide repeats material prose key ${key}`);
  }
  material.push({ key, text: value, sha256: sha256Text(value) });
}

function addInternalLink(links, location, destination) {
  if (typeof destination !== "string" || destination.length === 0) return;
  if (!destination.startsWith("/")) {
    fail(`resolved guide link ${location} must use an absolute in-app path`);
  }
  links.push({ location, path: destination });
}

export function sha256Text(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

/**
 * Project the resolved public-guide object into the exact evidence consumed by
 * repository-corpus validation. The runner imports the real TypeScript guide
 * registry with Bun, so this projection cannot pass against stale duplicated
 * guide JSON.
 */
export function projectResolvedGuide(guide) {
  requireRecord(guide, "resolved guide");
  const slug = requireString(guide.slug, "resolved guide slug");
  const path = `/guides/${slug}`;
  const material = [];
  const internalLinks = [];
  const externalSources = [];

  addMaterial(material, "title", guide.title);
  addMaterial(material, "h1", guide.h1);
  addMaterial(material, "description", guide.description);
  addMaterial(material, "intro", guide.intro);
  if (isRecord(guide.cta)) {
    addMaterial(material, "cta.label", guide.cta.label);
    addMaterial(material, "cta.heading", guide.cta.heading);
    addMaterial(material, "cta.description", guide.cta.description);
    for (const [promptIndex, prompt] of (guide.cta.prompts ?? []).entries()) {
      addMaterial(material, `cta.prompts.${promptIndex}`, prompt);
    }
    addInternalLink(internalLinks, "cta", guide.cta.to);
  }
  requireArray(guide.sections, `${path} sections`, { minItems: 1 }).forEach((section, index) => {
    requireRecord(section, `${path} sections[${index}]`);
    addMaterial(material, `sections.${index}.heading`, section.heading);
    addMaterial(material, `sections.${index}.body`, section.body);
    for (const [linkIndex, link] of (section.links ?? []).entries()) {
      requireRecord(link, `${path} sections[${index}].links[${linkIndex}]`);
      addMaterial(material, `sections.${index}.links.${linkIndex}.label`, link.label);
      addInternalLink(internalLinks, `sections.${index}.links.${linkIndex}`, link.to);
    }
  });
  requireArray(guide.faq, `${path} FAQ`, { minItems: 1 }).forEach((entry, index) => {
    requireRecord(entry, `${path} faq[${index}]`);
    addMaterial(material, `faq.${index}.question`, entry.question);
    addMaterial(material, `faq.${index}.answer`, entry.answer);
  });
  for (const [sourceIndex, source] of (guide.sources ?? []).entries()) {
    requireRecord(source, `${path} sources[${sourceIndex}]`);
    addMaterial(material, `sources.${sourceIndex}.label`, source.label);
    addMaterial(material, `sources.${sourceIndex}.note`, source.note);
    const canonicalHref = canonicalHttpsUrl(source.href, `${path} sources[${sourceIndex}].href`);
    if (source.href !== canonicalHref) {
      fail(`${path} sources[${sourceIndex}].href must use its canonical HTTPS serialization`);
    }
    externalSources.push({
      location: `sources.${sourceIndex}`,
      href: canonicalHref,
    });
  }
  requireUnique(
    externalSources.map((source) => source.href),
    `${path} rendered external-source URLs`,
  );
  if (isRecord(guide.evidenceTable)) {
    addMaterial(material, "evidenceTable.heading", guide.evidenceTable.heading);
    addMaterial(material, "evidenceTable.description", guide.evidenceTable.description);
    addMaterial(material, "evidenceTable.ariaLabel", guide.evidenceTable.ariaLabel);
    requireArray(guide.evidenceTable.rows, `${path} evidence-table rows`, {
      minItems: 1,
    }).forEach((row, index) => {
      requireRecord(row, `${path} evidenceTable.rows[${index}]`);
      addMaterial(material, `evidenceTable.rows.${index}.evidence`, row.evidence);
      addMaterial(material, `evidenceTable.rows.${index}.usable`, row.usable);
      addMaterial(material, `evidenceTable.rows.${index}.conditional`, row.conditional);
      addMaterial(material, `evidenceTable.rows.${index}.untrusted`, row.untrusted);
    });
  }
  if (isRecord(guide.referenceTable)) {
    addMaterial(material, "referenceTable.caption", guide.referenceTable.caption);
    requireArray(guide.referenceTable.rows, `${path} reference-table rows`, {
      minItems: 1,
    }).forEach((row, index) => {
      requireRecord(row, `${path} referenceTable.rows[${index}]`);
      addMaterial(material, `referenceTable.rows.${index}.visibleSign`, row.visibleSign);
      addMaterial(material, `referenceTable.rows.${index}.compareFirst`, row.compareFirst);
      addMaterial(material, `referenceTable.rows.${index}.whatToLogNext`, row.whatToLogNext);
      addMaterial(material, `referenceTable.rows.${index}.doNotAssume`, row.doNotAssume);
    });
  }
  const relatedPaths = requireArray(guide.related, `${path} related guides`, {
    minItems: 1,
  }).map((relatedSlug, index) => {
    const relatedPath = `/guides/${requireString(relatedSlug, `${path} related[${index}]`)}`;
    addInternalLink(internalLinks, `related.${index}`, relatedPath);
    return relatedPath;
  });
  requireUnique(relatedPaths, `${path} related destinations`);

  return {
    slug,
    path,
    publishedOn: requireDate(guide.publishedOn, `${path} publishedOn`),
    modifiedOn: requireDate(guide.modifiedOn, `${path} modifiedOn`),
    material,
    internalLinks,
    externalSources,
    relatedPaths,
  };
}

function validateCorpusHeader(corpus) {
  requireRecord(corpus, "repository corpus");
  if (corpus.version !== 1 || corpus.artifactType !== "knowledge_repository_corpus") {
    fail("repository corpus must declare version 1 and artifactType knowledge_repository_corpus");
  }
  requireString(corpus.artifactScope, "repository corpus artifactScope", { minLength: 20 });
  requireNodeId(corpus.rootNodeId, "repository corpus rootNodeId");
}

function validateNodeRegistry(corpus, publishedPaths) {
  const nodes = requireArray(corpus.nodes, "repository corpus nodes", { minItems: 1 });
  const nodeById = new Map();
  const nodeByPath = new Map();
  const nodeIds = [];
  for (const [index, node] of nodes.entries()) {
    requireRecord(node, `nodes[${index}]`);
    const id = requireNodeId(node.id, `nodes[${index}].id`);
    const type = requireString(node.type, `nodes[${index}].type`);
    const expectedPrefix = NODE_TYPE_PREFIX[type];
    if (!expectedPrefix || !id.startsWith(`${expectedPrefix}:`)) {
      fail(`node ${id} ID prefix does not match declared type ${type}`);
    }
    requireString(node.label, `nodes[${index}].label`, { minLength: 2 });
    requireString(node.description, `nodes[${index}].description`, { minLength: 8 });
    if (node.status !== "active") fail(`node ${id} must be active in the live corpus`);
    if (nodeById.has(id)) fail(`repository corpus repeats node ${id}`);
    nodeIds.push(id);
    if (isRecord(node.route)) {
      const routePath = requireString(node.route.path, `node ${id} route path`);
      if (routePath !== "/guides" && !PUBLIC_KNOWLEDGE_PATH_PATTERN.test(routePath)) {
        fail(`node ${id} has a non-canonical public knowledge path`);
      }
      if (node.route.publicationStatus !== "published" || node.route.indexing !== "index") {
        fail(`node ${id} route must be published and indexable`);
      }
      if (routePath !== "/guides" && !publishedPaths.has(routePath)) {
        fail(`node ${id} route ${routePath} is not an approved published path`);
      }
      if (nodeByPath.has(routePath)) {
        fail(`repository corpus repeats route path ${routePath}`);
      }
      nodeByPath.set(routePath, node);
    }
    nodeById.set(id, node);
  }
  requireSorted(nodeIds, "repository corpus node IDs");
  const root = nodeById.get(corpus.rootNodeId);
  if (!root || root.type !== "Topic" || root.route?.path !== "/guides") {
    fail("repository corpus root must be the active /guides Topic node");
  }
  return { nodeById, nodeByPath };
}

function validateSources(corpus, nodeById) {
  const sources = requireArray(corpus.sources, "repository corpus sources", { minItems: 1 });
  const sourceById = new Map();
  const sourceIdByCanonicalUrl = new Map();
  const sourceIdByStableIdentifier = new Map();
  const sourceIds = [];
  for (const [index, source] of sources.entries()) {
    requireRecord(source, `sources[${index}]`);
    const nodeId = requireNodeId(source.nodeId, `sources[${index}].nodeId`);
    if (nodeById.get(nodeId)?.type !== "EvidenceSource") {
      fail(`source ${nodeId} must resolve to an EvidenceSource node`);
    }
    if (sourceById.has(nodeId)) fail(`repository corpus repeats source ${nodeId}`);
    sourceIds.push(nodeId);
    const canonicalUrl = canonicalHttpsUrl(source.url, `source ${nodeId} URL`);
    if (source.url !== canonicalUrl) {
      fail(`source ${nodeId} URL must use its canonical HTTPS serialization`);
    }
    const duplicateUrlSourceId = sourceIdByCanonicalUrl.get(canonicalUrl);
    if (duplicateUrlSourceId) {
      fail(`sources ${duplicateUrlSourceId} and ${nodeId} repeat canonical URL ${canonicalUrl}`);
    }
    if (!new Set(["A", "B", "C", "D"]).has(source.evidenceTier)) {
      fail(`source ${nodeId} has an invalid evidence tier`);
    }
    requireDate(source.accessedOn, `source ${nodeId} accessedOn`);
    const stableIdentifier = requireString(
      source.stableIdentifier,
      `source ${nodeId} stableIdentifier`,
      { minLength: 3 },
    );
    const duplicateStableSourceId = sourceIdByStableIdentifier.get(stableIdentifier);
    if (duplicateStableSourceId) {
      fail(
        `sources ${duplicateStableSourceId} and ${nodeId} repeat stableIdentifier ${stableIdentifier}`,
      );
    }
    collectStrings(source.limitations, `source ${nodeId} limitations`);
    sourceIdByCanonicalUrl.set(canonicalUrl, nodeId);
    sourceIdByStableIdentifier.set(stableIdentifier, nodeId);
    sourceById.set(nodeId, source);
  }
  requireSorted(sourceIds, "repository corpus source IDs");
  return sourceById;
}

function validateCohorts(corpus, cohortRegistry, sourceById) {
  const approved = new Map(
    requireArray(cohortRegistry?.cohorts, "post-v1 cohort registry cohorts", {
      minItems: 1,
    }).map((cohort) => [cohort.id, cohort]),
  );
  const cohorts = requireArray(corpus.cohorts, "repository corpus cohorts", { minItems: 1 });
  const cohortById = new Map();
  const cohortIds = [];
  for (const [index, cohort] of cohorts.entries()) {
    requireRecord(cohort, `cohorts[${index}]`);
    const approvedCohort = approved.get(cohort.id);
    if (!approvedCohort) fail(`corpus cohort ${String(cohort.id)} is not approved`);
    if (cohort.sourcePullRequest !== approvedCohort.sourcePullRequest) {
      fail(`${cohort.id} source pull request does not match the approved cohort registry`);
    }
    const paths = collectStrings(cohort.paths, `${cohort.id} paths`);
    requireUnique(paths, `${cohort.id} paths`);
    requireSorted(paths, `${cohort.id} paths`);
    if (!sameSet(paths, new Set(approvedCohort.paths))) {
      fail(`${cohort.id} must cover every approved cohort path exactly once`);
    }
    const sourceIds = collectStrings(cohort.sourceIds, `${cohort.id} sourceIds`);
    if (sourceIds.length === 0) fail(`${cohort.id} requires traceable approval provenance`);
    requireUnique(sourceIds, `${cohort.id} sourceIds`);
    requireSorted(sourceIds, `${cohort.id} sourceIds`);
    for (const sourceId of sourceIds) {
      if (!sourceById.has(sourceId)) fail(`${cohort.id} references missing source ${sourceId}`);
    }
    const expectedApprovalUrl =
      `https://github.com/Verdant-OS/verdant-grow-diary/pull/` +
      String(approvedCohort.sourcePullRequest);
    const exactApprovalSourceIds = [...sourceById.entries()]
      .filter(([, source]) => source.url === expectedApprovalUrl)
      .map(([sourceId]) => sourceId);
    if (exactApprovalSourceIds.length !== 1) {
      fail(
        `${cohort.id} requires exactly one globally exact approval source ${expectedApprovalUrl}`,
      );
    }
    const approvalSourceId = exactApprovalSourceIds[0];
    const expectedStableIdentifier = expectedApprovalUrl;
    if (sourceById.get(approvalSourceId).stableIdentifier !== expectedStableIdentifier) {
      fail(
        `${cohort.id} approving PR source ${approvalSourceId} must use stableIdentifier ${expectedStableIdentifier}`,
      );
    }
    if (!sourceIds.includes(approvalSourceId)) {
      fail(`${cohort.id} sourceIds must include its exact approving PR source ${approvalSourceId}`);
    }
    const materialClaimIds = collectStrings(
      cohort.materialClaimIds,
      `${cohort.id} materialClaimIds`,
    );
    if (materialClaimIds.length === 0) fail(`${cohort.id} requires a material claim receipt`);
    requireUnique(materialClaimIds, `${cohort.id} materialClaimIds`);
    requireSorted(materialClaimIds, `${cohort.id} materialClaimIds`);
    if (cohortById.has(cohort.id)) fail(`repository corpus repeats cohort ${cohort.id}`);
    cohortIds.push(cohort.id);
    cohortById.set(cohort.id, {
      ...cohort,
      approved: approvedCohort,
      approvalSourceId,
    });
  }
  requireSorted(cohortIds, "repository corpus cohort IDs");
  return cohortById;
}

function validateClaims(corpus, nodeById, sourceById, cohortById) {
  const claims = requireArray(corpus.claims, "repository corpus claims", { minItems: 1 });
  const claimById = new Map();
  const claimIds = [];
  for (const [index, claim] of claims.entries()) {
    requireRecord(claim, `claims[${index}]`);
    const nodeId = requireNodeId(claim.nodeId, `claims[${index}].nodeId`);
    if (nodeById.get(nodeId)?.type !== "Claim") {
      fail(`claim ${nodeId} must resolve to a Claim node`);
    }
    if (claimById.has(nodeId)) fail(`repository corpus repeats claim ${nodeId}`);
    claimIds.push(nodeId);
    requireRecord(claim.scope, `claim ${nodeId} scope`);
    if (!new Set(["page", "cohort"]).has(claim.scope.type)) {
      fail(`claim ${nodeId} scope type must be page or cohort`);
    }
    requireString(claim.scope.id, `claim ${nodeId} scope id`);
    if (claim.scope.type === "cohort" && !cohortById.has(claim.scope.id)) {
      fail(`claim ${nodeId} references missing cohort ${claim.scope.id}`);
    }
    requireString(claim.summary, `claim ${nodeId} summary`, { minLength: 12 });
    if (!(claim.riskClass in RISK_RANK)) fail(`claim ${nodeId} has invalid riskClass`);
    const riskDomains = collectStrings(claim.riskDomains, `claim ${nodeId} riskDomains`);
    if (riskDomains.length === 0 || riskDomains.some((domain) => !RISK_DOMAINS.has(domain))) {
      fail(`claim ${nodeId} has invalid or empty riskDomains`);
    }
    requireUnique(riskDomains, `claim ${nodeId} riskDomains`);
    if (!EVIDENCE_STATES.has(claim.evidenceState)) {
      fail(`claim ${nodeId} has invalid evidenceState`);
    }
    const sourceIds = collectStrings(claim.sourceIds, `claim ${nodeId} sourceIds`);
    requireUnique(sourceIds, `claim ${nodeId} sourceIds`);
    requireSorted(sourceIds, `claim ${nodeId} sourceIds`);
    if (SOURCE_REQUIRED_EVIDENCE_STATES.has(claim.evidenceState) && sourceIds.length === 0) {
      fail(`claim ${nodeId} evidenceState ${claim.evidenceState} requires a source`);
    }
    for (const sourceId of sourceIds) {
      if (!sourceById.has(sourceId)) fail(`claim ${nodeId} references missing source ${sourceId}`);
    }
    collectStrings(claim.limitations, `claim ${nodeId} limitations`);
    const material = requireArray(claim.material, `claim ${nodeId} material`, { minItems: 1 });
    const materialKeys = [];
    for (const [materialIndex, entry] of material.entries()) {
      requireRecord(entry, `claim ${nodeId} material[${materialIndex}]`);
      materialKeys.push(requireString(entry.key, `claim ${nodeId} material key`));
      if (typeof entry.sha256 !== "string" || !SHA256_PATTERN.test(entry.sha256)) {
        fail(`claim ${nodeId} material ${entry.key} must pin a SHA-256 digest`);
      }
    }
    requireUnique(materialKeys, `claim ${nodeId} material keys`);
    claimById.set(nodeId, claim);
  }
  requireSorted(claimIds, "repository corpus claim IDs");
  return claimById;
}

function validatePages(corpus, nodeById, cohortById, claimById, resolvedGuideByPath) {
  const pages = requireArray(corpus.pages, "repository corpus pages", { minItems: 1 });
  const pageById = new Map();
  const pageByPath = new Map();
  const pagePaths = [];
  for (const [index, page] of pages.entries()) {
    requireRecord(page, `pages[${index}]`);
    const nodeId = requireNodeId(page.nodeId, `pages[${index}].nodeId`);
    const node = nodeById.get(nodeId);
    if (!node || !PAGE_NODE_TYPES.has(node.type)) {
      fail(`page ${nodeId} must resolve to a page-owning node`);
    }
    if (pageById.has(nodeId)) fail(`repository corpus repeats page ${nodeId}`);
    const cohort = cohortById.get(page.cohortId);
    if (!cohort) fail(`page ${nodeId} references missing cohort ${String(page.cohortId)}`);
    const path = requireString(page.path, `page ${nodeId} path`);
    if (node.route?.path !== path) fail(`page ${nodeId} path must match its node route`);
    if (!cohort.paths.includes(path)) fail(`page ${nodeId} is outside cohort ${page.cohortId}`);
    if (pageByPath.has(path)) fail(`repository corpus repeats page path ${path}`);
    pagePaths.push(path);
    const resolvedGuide = resolvedGuideByPath.get(path);
    if (!resolvedGuide) fail(`page ${nodeId} has no resolved guide registry entry`);
    if (page.slug !== resolvedGuide.slug || path !== `/guides/${page.slug}`) {
      fail(`page ${nodeId} slug/path identity does not match the resolved guide`);
    }
    if (!PAGE_FAMILIES.has(page.pageFamily)) fail(`page ${nodeId} has invalid pageFamily`);
    if (!SUPPORTED_FOUNDATION_PAGE_FAMILIES.has(page.pageFamily)) {
      fail(`page ${nodeId} pageFamily ${page.pageFamily} is outside the foundation slot model`);
    }
    const requiredFamilySlots = FOUNDATION_REQUIRED_SLOTS[page.pageFamily];
    if (!(page.riskClass in RISK_RANK)) fail(`page ${nodeId} has invalid riskClass`);
    const riskDomains = collectStrings(page.riskDomains, `page ${nodeId} riskDomains`);
    if (riskDomains.length === 0 || riskDomains.some((domain) => !RISK_DOMAINS.has(domain))) {
      fail(`page ${nodeId} has invalid or empty riskDomains`);
    }
    requireUnique(riskDomains, `page ${nodeId} riskDomains`);
    if (
      page.publishedOn !== resolvedGuide.publishedOn ||
      page.modifiedOn !== resolvedGuide.modifiedOn
    ) {
      fail(`page ${nodeId} publication dates do not match the resolved guide`);
    }
    requireRecord(page.slots, `page ${nodeId} slots`);
    const unknownSlots = Object.keys(page.slots).filter(
      (slotName) => !SLOT_NAMES.includes(slotName),
    );
    if (unknownSlots.length) {
      fail(`page ${nodeId} declares unsupported foundation slots: ${unknownSlots.join(", ")}`);
    }
    for (const slotName of SLOT_NAMES) {
      const slot = requireRecord(page.slots[slotName], `page ${nodeId} slot ${slotName}`);
      if (!new Set(["required", "not_applicable"]).has(slot.status)) {
        fail(`page ${nodeId} slot ${slotName} has invalid status`);
      }
      if (requiredFamilySlots.has(slotName) && slot.status !== "required") {
        fail(
          `${page.pageFamily} page ${nodeId} cannot mark mandatory slot ${slotName} not applicable`,
        );
      }
      if (slot.status === "required") {
        const edgeIds = collectStrings(slot.edgeIds, `page ${nodeId} slot ${slotName} edgeIds`);
        if (edgeIds.length === 0) fail(`page ${nodeId} required slot ${slotName} is empty`);
        if (slot.receiptId !== null) {
          fail(`page ${nodeId} required slot ${slotName} cannot carry an N/A receipt`);
        }
      } else {
        if (requireArray(slot.edgeIds, `page ${nodeId} slot ${slotName} edgeIds`).length !== 0) {
          fail(`page ${nodeId} N/A slot ${slotName} cannot select edges`);
        }
        requireString(slot.receiptId, `page ${nodeId} slot ${slotName} receiptId`);
      }
    }
    const claimIds = collectStrings(page.claimIds, `page ${nodeId} claimIds`);
    if (claimIds.length === 0) fail(`page ${nodeId} requires material claims`);
    requireUnique(claimIds, `page ${nodeId} claimIds`);
    for (const claimId of claimIds) {
      const claim = claimById.get(claimId);
      if (!claim || claim.scope.type !== "page" || claim.scope.id !== nodeId) {
        fail(`page ${nodeId} claim ${claimId} has the wrong scope`);
      }
    }
    const decisions = requireArray(page.linkDecisions, `page ${nodeId} linkDecisions`, {
      minItems: 1,
    });
    const locations = [];
    for (const [decisionIndex, decision] of decisions.entries()) {
      requireRecord(decision, `page ${nodeId} linkDecisions[${decisionIndex}]`);
      locations.push(requireString(decision.location, `page ${nodeId} link decision location`));
      requireString(decision.path, `page ${nodeId} link decision path`);
      requireString(decision.edgeId, `page ${nodeId} link decision edgeId`);
      if (!LINK_DECISION_SLOTS.has(decision.slot)) {
        fail(`page ${nodeId} link decision ${decision.location} has invalid slot`);
      }
    }
    requireUnique(locations, `page ${nodeId} link-decision locations`);
    const sourceDecisions = requireArray(page.sourceDecisions, `page ${nodeId} sourceDecisions`);
    const sourceDecisionLocations = [];
    const sourceDecisionSourceIds = [];
    for (const [decisionIndex, decision] of sourceDecisions.entries()) {
      requireRecord(decision, `page ${nodeId} sourceDecisions[${decisionIndex}]`);
      sourceDecisionLocations.push(
        requireString(decision.location, `page ${nodeId} source decision location`),
      );
      const canonicalHref = canonicalHttpsUrl(
        decision.href,
        `page ${nodeId} source decision ${decision.location} href`,
      );
      if (decision.href !== canonicalHref) {
        fail(`page ${nodeId} source decision ${decision.location} href must be canonical`);
      }
      sourceDecisionSourceIds.push(
        requireNodeId(decision.sourceId, `page ${nodeId} source decision sourceId`),
      );
      const decisionClaimIds = collectStrings(
        decision.claimIds,
        `page ${nodeId} source decision ${decision.location} claimIds`,
      );
      if (decisionClaimIds.length === 0) {
        fail(`page ${nodeId} source decision ${decision.location} requires at least one claim`);
      }
      requireUnique(
        decisionClaimIds,
        `page ${nodeId} source decision ${decision.location} claimIds`,
      );
      requireSorted(
        decisionClaimIds,
        `page ${nodeId} source decision ${decision.location} claimIds`,
      );
    }
    requireUnique(sourceDecisionLocations, `page ${nodeId} source-decision locations`);
    requireUnique(sourceDecisionSourceIds, `page ${nodeId} source-decision source IDs`);
    pageById.set(nodeId, page);
    pageByPath.set(path, page);
  }
  requireSorted(pagePaths, "repository corpus page paths");
  for (const cohort of cohortById.values()) {
    const corpusPaths = pages
      .filter((page) => page.cohortId === cohort.id)
      .map((page) => page.path);
    if (!sameSet(corpusPaths, new Set(cohort.paths))) {
      fail(`${cohort.id} corpus pages must exactly cover the approved cohort`);
    }
  }
  return { pageById };
}

function validateClaimCoverage({ cohortById, claimById, pageById, resolvedGuideByPath }) {
  const usedClaimIds = new Set();
  for (const cohort of cohortById.values()) {
    const claims = cohort.materialClaimIds.map((claimId) => claimById.get(claimId));
    if (claims.some((claim) => !claim)) fail(`${cohort.id} references a missing material claim`);
    const actualMaterial = new Map([["cohort.rationale", sha256Text(cohort.approved.rationale)]]);
    const seen = new Set();
    for (const claim of claims) {
      if (claim.scope.type !== "cohort" || claim.scope.id !== cohort.id) {
        fail(`${cohort.id} claim ${claim.nodeId} has the wrong scope`);
      }
      if (!claim.sourceIds.includes(cohort.approvalSourceId)) {
        fail(`${cohort.id} material claim ${claim.nodeId} must use its exact approving PR source`);
      }
      usedClaimIds.add(claim.nodeId);
      for (const material of claim.material) {
        if (seen.has(material.key)) fail(`${cohort.id} material ${material.key} is covered twice`);
        seen.add(material.key);
        const digest = actualMaterial.get(material.key);
        if (!digest)
          fail(`${cohort.id} claim ${claim.nodeId} covers unknown material ${material.key}`);
        if (digest !== material.sha256) {
          fail(`${cohort.id} material ${material.key} changed without claim review`);
        }
      }
    }
    if (!sameSet([...seen], new Set(actualMaterial.keys()))) {
      fail(`${cohort.id} has uncovered material prose`);
    }
    const materialClaimSourceIds = new Set(claims.flatMap((claim) => claim.sourceIds));
    if (!sameSet(cohort.sourceIds, materialClaimSourceIds)) {
      const extra = cohort.sourceIds.filter((sourceId) => !materialClaimSourceIds.has(sourceId));
      const missing = [...materialClaimSourceIds].filter(
        (sourceId) => !cohort.sourceIds.includes(sourceId),
      );
      fail(
        `${cohort.id} sourceIds must exactly equal its material-claim sources` +
          `${extra.length ? `; extra: ${extra.join(", ")}` : ""}` +
          `${missing.length ? `; missing: ${missing.join(", ")}` : ""}`,
      );
    }
  }

  for (const page of pageById.values()) {
    const guide = resolvedGuideByPath.get(page.path);
    const actualMaterial = new Map(guide.material.map((entry) => [entry.key, entry.sha256]));
    const seen = new Set();
    const pageClaims = page.claimIds.map((claimId) => claimById.get(claimId));
    let maximumRisk = -1;
    const claimRiskDomains = new Set();
    for (const claim of pageClaims) {
      usedClaimIds.add(claim.nodeId);
      maximumRisk = Math.max(maximumRisk, RISK_RANK[claim.riskClass]);
      for (const domain of claim.riskDomains) claimRiskDomains.add(domain);
      for (const material of claim.material) {
        if (seen.has(material.key)) {
          fail(`page ${page.nodeId} material ${material.key} is covered twice`);
        }
        seen.add(material.key);
        const digest = actualMaterial.get(material.key);
        if (!digest) {
          fail(`page ${page.nodeId} claim ${claim.nodeId} covers unknown material ${material.key}`);
        }
        if (digest !== material.sha256) {
          fail(`page ${page.nodeId} material ${material.key} changed without claim review`);
        }
      }
    }
    if (!sameSet([...seen], new Set(actualMaterial.keys()))) {
      const missing = [...actualMaterial.keys()].filter((key) => !seen.has(key));
      fail(`page ${page.nodeId} has uncovered material prose: ${missing.join(", ")}`);
    }
    if (RISK_RANK[page.riskClass] !== maximumRisk) {
      fail(`page ${page.nodeId} riskClass must equal its highest material-claim risk`);
    }
    const pageRiskDomains = new Set(page.riskDomains);
    const missingDomains = [...claimRiskDomains].filter((domain) => !pageRiskDomains.has(domain));
    if (missingDomains.length) {
      fail(`page ${page.nodeId} omits claim risk domains: ${missingDomains.join(", ")}`);
    }
  }
  const unusedClaims = [...claimById.keys()].filter((claimId) => !usedClaimIds.has(claimId));
  if (unusedClaims.length) fail(`repository corpus has unused claims: ${unusedClaims.join(", ")}`);
}

function validateReceipts(corpus, nodeById, pageById) {
  const receipts = requireArray(corpus.applicabilityReceipts, "applicability receipts");
  const receiptById = new Map();
  const receiptIds = [];
  for (const [index, receipt] of receipts.entries()) {
    requireRecord(receipt, `applicabilityReceipts[${index}]`);
    const id = requireString(receipt.id, `applicabilityReceipts[${index}].id`);
    if (!RECEIPT_ID_PATTERN.test(id)) fail(`applicability receipt ${id} has an invalid ID`);
    if (receiptById.has(id)) fail(`repository corpus repeats applicability receipt ${id}`);
    receiptIds.push(id);
    const page = pageById.get(receipt.pageId);
    if (!page) fail(`applicability receipt ${id} references missing page ${receipt.pageId}`);
    if (!SLOT_NAMES.includes(receipt.slot)) fail(`applicability receipt ${id} has invalid slot`);
    if (page.slots[receipt.slot]?.receiptId !== id) {
      fail(`applicability receipt ${id} is not bound to its page slot`);
    }
    requireString(receipt.reason, `applicability receipt ${id} reason`, { minLength: 12 });
    const reviewer = nodeById.get(receipt.reviewerId);
    if (!reviewer || reviewer.type !== "Reviewer") {
      fail(`applicability receipt ${id} requires a Reviewer node`);
    }
    requireDate(receipt.reviewedOn, `applicability receipt ${id} reviewedOn`);
    receiptById.set(id, receipt);
  }
  requireSorted(receiptIds, "repository corpus applicability receipt IDs");
  const referenced = new Set();
  for (const page of pageById.values()) {
    for (const slotName of SLOT_NAMES) {
      const receiptId = page.slots[slotName].receiptId;
      if (receiptId) referenced.add(receiptId);
    }
  }
  const unused = [...receiptById.keys()].filter((id) => !referenced.has(id));
  if (unused.length)
    fail(`repository corpus has unused applicability receipts: ${unused.join(", ")}`);
  return receiptById;
}

function validateEdges(corpus, nodeById, claimById, sourceById) {
  const edges = requireArray(corpus.edges, "repository corpus edges", { minItems: 1 });
  const edgeById = new Map();
  const symmetricKeys = new Set();
  const edgeIds = [];
  for (const [index, edge] of edges.entries()) {
    requireRecord(edge, `edges[${index}]`);
    const id = requireString(edge.id, `edges[${index}].id`);
    if (!EDGE_ID_PATTERN.test(id)) fail(`graph edge ${id} has an invalid ID`);
    if (edgeById.has(id)) fail(`repository corpus repeats edge ${id}`);
    edgeIds.push(id);
    if (edge.status !== "active") fail(`corpus edge ${id} must be active`);
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source) fail(`edge ${id} references missing source node ${String(edge.sourceId)}`);
    if (!target) fail(`edge ${id} references missing target node ${String(edge.targetId)}`);
    if (edge.sourceType !== source.type || edge.targetType !== target.type) {
      fail(`edge ${id} endpoint type does not match the node registry`);
    }
    if (edge.sourceId === edge.targetId) fail(`edge ${id} cannot be a self-edge`);
    try {
      validateGraphEdgeSemantics(edge);
    } catch (error) {
      fail(
        `edge ${id} violates the graph contract: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    requireDate(edge.effectiveFrom, `edge ${id} effectiveFrom`, { nullable: true });
    requireDate(edge.effectiveThrough, `edge ${id} effectiveThrough`, { nullable: true });
    if (edge.effectiveFrom && edge.effectiveThrough && edge.effectiveThrough < edge.effectiveFrom) {
      fail(`edge ${id} effectiveThrough precedes effectiveFrom`);
    }
    const provenance = requireRecord(edge.provenance, `edge ${id} provenance`);
    const claimIds = collectStrings(provenance.claimIds, `edge ${id} provenance claimIds`);
    const sourceIds = collectStrings(provenance.sourceIds, `edge ${id} provenance sourceIds`);
    const reviewerIds = collectStrings(provenance.reviewerIds, `edge ${id} provenance reviewerIds`);
    const limitations = collectStrings(provenance.limitations, `edge ${id} provenance limitations`);
    if (limitations.length === 0) fail(`edge ${id} requires at least one limitation`);
    for (const claimId of claimIds) {
      if (!claimById.has(claimId)) fail(`edge ${id} references missing claim ${claimId}`);
    }
    for (const sourceId of sourceIds) {
      if (!sourceById.has(sourceId)) fail(`edge ${id} references missing source ${sourceId}`);
    }
    for (const reviewerId of reviewerIds) {
      if (nodeById.get(reviewerId)?.type !== "Reviewer") {
        fail(`edge ${id} references non-reviewer ${reviewerId}`);
      }
    }
    if (
      edge.type === "supported_by" &&
      (!sameSet(claimIds, new Set([edge.sourceId])) ||
        !sameSet(sourceIds, new Set([edge.targetId])))
    ) {
      fail(`supported_by edge ${id} provenance must exactly match its claim/source endpoints`);
    }
    if (edge.symmetric) {
      if (compareBytes(edge.sourceId, edge.targetId) >= 0) {
        fail(`symmetric edge ${id} must store the lexicographically smaller node first`);
      }
      const symmetricKey = `${edge.type}|${edge.sourceId}|${edge.targetId}`;
      if (symmetricKeys.has(symmetricKey)) fail(`repository corpus repeats ${symmetricKey}`);
      symmetricKeys.add(symmetricKey);
    }
    edgeById.set(id, edge);
  }
  requireSorted(edgeIds, "repository corpus edge IDs");
  return edgeById;
}

function validateCardinalityAndCycles(edgeById, rootNodeId, pageById) {
  const activeEdges = [...edgeById.values()];
  for (const [edgeType, contract] of Object.entries(EDGE_CONTRACTS)) {
    const typed = activeEdges.filter((edge) => edge.type === edgeType);
    const sourceCounts = new Map();
    const targetCounts = new Map();
    for (const edge of typed) {
      sourceCounts.set(edge.sourceId, (sourceCounts.get(edge.sourceId) ?? 0) + 1);
      targetCounts.set(edge.targetId, (targetCounts.get(edge.targetId) ?? 0) + 1);
    }
    if (contract.cardinality === "one_to_one") {
      // The canonical next_action contract is 0:1 active outgoing per page;
      // multiple pages may legitimately point at the same allow-listed
      // ProductAction registry entry.
      if ([...sourceCounts.values()].some((count) => count > 1)) {
        fail(`graph-wide ${edgeType} source has more than one target`);
      }
    } else if (contract.cardinality === "one_to_many") {
      if ([...targetCounts.values()].some((count) => count > 1)) {
        fail(`graph-wide ${edgeType} target has more than one source`);
      }
    } else if (contract.cardinality === "many_to_one") {
      if ([...sourceCounts.values()].some((count) => count > 1)) {
        fail(`graph-wide ${edgeType} source has more than one target`);
      }
    }
  }

  const parentEdges = activeEdges.filter((edge) => edge.type === "parent_of");
  const children = new Map();
  for (const edge of parentEdges) {
    const current = children.get(edge.sourceId) ?? [];
    current.push(edge.targetId);
    children.set(edge.sourceId, current);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (nodeId) => {
    if (visiting.has(nodeId)) fail(`active parent_of graph contains a cycle at ${nodeId}`);
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const child of children.get(nodeId) ?? []) visit(child);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const nodeId of new Set(parentEdges.flatMap((edge) => [edge.sourceId, edge.targetId]))) {
    visit(nodeId);
  }

  const depth = new Map([[rootNodeId, 0]]);
  const queue = [rootNodeId];
  while (queue.length) {
    const nodeId = queue.shift();
    for (const child of children.get(nodeId) ?? []) {
      const childDepth = depth.get(nodeId) + 1;
      if (!depth.has(child) || childDepth < depth.get(child)) {
        depth.set(child, childDepth);
        queue.push(child);
      }
    }
  }
  for (const pageId of pageById.keys()) {
    if (!depth.has(pageId)) fail(`published page ${pageId} is orphaned from the library root`);
    if (depth.get(pageId) > 4) fail(`published page ${pageId} is deeper than four root clicks`);
  }
  return { maximumRootDepth: Math.max(...[...pageById.keys()].map((id) => depth.get(id))) };
}

function validateSlotAndLinkReciprocity({
  corpus,
  nodeById,
  nodeByPath,
  pageById,
  edgeById,
  receiptById,
  resolvedGuideByPath,
}) {
  const usedEdges = new Set();
  const usedRouteNodeIds = new Set([corpus.rootNodeId]);
  const usedReceiptIds = new Set();

  for (const page of pageById.values()) {
    usedRouteNodeIds.add(page.nodeId);
    const mandatoryDestinations = new Set();
    for (const slotName of SLOT_NAMES) {
      const slot = page.slots[slotName];
      if (slot.status === "not_applicable") {
        if (!receiptById.has(slot.receiptId)) {
          fail(`page ${page.nodeId} slot ${slotName} references missing receipt ${slot.receiptId}`);
        }
        usedReceiptIds.add(slot.receiptId);
        const forbidden = [...edgeById.values()].filter((edge) => {
          if (!SLOT_EDGE_TYPES[slotName].has(edge.type)) return false;
          if (slotName === "breadcrumb") return edge.targetId === page.nodeId;
          return edge.sourceId === page.nodeId || (edge.symmetric && edge.targetId === page.nodeId);
        });
        if (forbidden.length) {
          fail(`page ${page.nodeId} N/A slot ${slotName} has active eligible edges`);
        }
        continue;
      }
      const selectedEdges = slot.edgeIds.map((edgeId) => {
        const edge = edgeById.get(edgeId);
        if (!edge) fail(`page ${page.nodeId} slot ${slotName} references missing edge ${edgeId}`);
        if (!SLOT_EDGE_TYPES[slotName].has(edge.type)) {
          fail(`page ${page.nodeId} slot ${slotName} uses ineligible edge ${edgeId}`);
        }
        if (slotName === "breadcrumb") {
          if (edge.targetId !== page.nodeId) {
            fail(`page ${page.nodeId} breadcrumb edge ${edgeId} must target the page`);
          }
        } else if (otherEndpoint(edge, page.nodeId) === null) {
          fail(`page ${page.nodeId} slot ${slotName} edge ${edgeId} is not incident to the page`);
        }
        usedEdges.add(edgeId);
        const destination =
          slotName === "breadcrumb" ? edge.sourceId : otherEndpoint(edge, page.nodeId);
        if (destination) {
          usedRouteNodeIds.add(destination);
          if (slotName !== "breadcrumb") {
            if (mandatoryDestinations.has(destination)) {
              fail(`page ${page.nodeId} reuses ${destination} across mandatory slots`);
            }
            mandatoryDestinations.add(destination);
          }
        }
        return edge;
      });
      if (slotName === "breadcrumb" && selectedEdges.length !== 1) {
        fail(`page ${page.nodeId} requires exactly one breadcrumb edge`);
      }
      if (slotName === "prerequisite" && selectedEdges.length !== 1) {
        fail(`page ${page.nodeId} requires exactly one prerequisite edge`);
      }
      if (slotName === "contextualLateral" && selectedEdges.length !== 2) {
        fail(`page ${page.nodeId} requires exactly two contextual-lateral edges`);
      }
      if (slotName === "nextStep" && selectedEdges.length !== 1) {
        fail(`page ${page.nodeId} requires exactly one next-step edge`);
      }
      if (slotName === "differential" && selectedEdges.length < 3) {
        fail(`page ${page.nodeId} requires at least three differential edges`);
      }
    }

    const resolvedGuide = resolvedGuideByPath.get(page.path);
    const actualLinks = new Map(
      resolvedGuide.internalLinks.map((link) => [`${link.location}|${link.path}`, link]),
    );
    if (actualLinks.size !== resolvedGuide.internalLinks.length) {
      fail(`resolved guide ${page.path} repeats an internal-link location/path pair`);
    }
    const decisionKeys = new Set();
    const relatedDecisionPaths = [];
    for (const decision of page.linkDecisions) {
      const key = `${decision.location}|${decision.path}`;
      if (!actualLinks.has(key)) {
        fail(`page ${page.nodeId} link decision ${key} is not rendered by the resolved guide`);
      }
      if (decisionKeys.has(key)) fail(`page ${page.nodeId} repeats link decision ${key}`);
      decisionKeys.add(key);
      const destinationNode = nodeByPath.get(decision.path);
      if (!destinationNode) {
        fail(`page ${page.nodeId} rendered link ${decision.path} has no corpus route node`);
      }
      const edge = edgeById.get(decision.edgeId);
      if (!edge || !edgeConnects(edge, page.nodeId, destinationNode.id)) {
        fail(`page ${page.nodeId} link ${key} is not backed by edge ${decision.edgeId}`);
      }
      const selectedSlotName = LINK_DECISION_TO_PAGE_SLOT[decision.slot];
      if (selectedSlotName) {
        if (!page.slots[selectedSlotName].edgeIds.includes(decision.edgeId)) {
          fail(
            `page ${page.nodeId} ${decision.slot} link ${key} is outside its selected ${selectedSlotName} slot`,
          );
        }
      } else {
        if (edge.type === "supported_by") {
          fail(`page ${page.nodeId} supplemental link ${key} cannot use evidence edges`);
        }
        const selectedRenderSlot = RENDER_BOUND_SLOT_NAMES.find((slotName) =>
          page.slots[slotName].edgeIds.includes(decision.edgeId),
        );
        if (selectedRenderSlot) {
          fail(
            `page ${page.nodeId} supplemental link ${key} cannot substitute for selected ${selectedRenderSlot} edge ${decision.edgeId}`,
          );
        }
      }
      usedEdges.add(decision.edgeId);
      usedRouteNodeIds.add(destinationNode.id);
      if (decision.location.startsWith("related.")) relatedDecisionPaths.push(decision.path);
    }
    if (!sameSet([...decisionKeys], new Set(actualLinks.keys()))) {
      const missing = [...actualLinks.keys()].filter((key) => !decisionKeys.has(key));
      fail(`page ${page.nodeId} has ungoverned rendered links: ${missing.join(", ")}`);
    }
    for (const [decisionSlot, pageSlotName] of Object.entries(LINK_DECISION_TO_PAGE_SLOT)) {
      const slot = page.slots[pageSlotName];
      if (slot.status !== "required") continue;
      for (const edgeId of slot.edgeIds) {
        const matchingDecisions = page.linkDecisions.filter(
          (decision) => decision.slot === decisionSlot && decision.edgeId === edgeId,
        );
        if (matchingDecisions.length !== 1) {
          fail(
            `page ${page.nodeId} selected ${pageSlotName} edge ${edgeId} requires exactly one rendered ${decisionSlot} decision`,
          );
        }
      }
    }
    const orderedRelatedDecisions = page.linkDecisions
      .filter((decision) => decision.location.startsWith("related."))
      .sort((left, right) => {
        const leftIndex = Number(left.location.split(".")[1]);
        const rightIndex = Number(right.location.split(".")[1]);
        return leftIndex - rightIndex;
      })
      .map((decision) => decision.path);
    if (
      orderedRelatedDecisions.length !== resolvedGuide.relatedPaths.length ||
      orderedRelatedDecisions.some((path, index) => path !== resolvedGuide.relatedPaths[index])
    ) {
      fail(`page ${page.nodeId} related-module ordering does not match the resolved guide`);
    }
    requireUnique(relatedDecisionPaths, `page ${page.nodeId} related-module destinations`);
  }

  const supportedByEdges = [...edgeById.values()].filter((edge) => edge.type === "supported_by");
  const claimById = new Map(corpus.claims.map((claim) => [claim.nodeId, claim]));
  const sourceIdsUsed = new Set();
  for (const claim of claimById.values()) {
    const reciprocal = supportedByEdges.filter(
      (edge) => edge.sourceId === claim.nodeId && claim.sourceIds.includes(edge.targetId),
    );
    for (const sourceId of claim.sourceIds) {
      const matches = reciprocal.filter((edge) => edge.targetId === sourceId);
      if (matches.length !== 1) {
        fail(`claim ${claim.nodeId} requires exactly one supported_by edge to ${sourceId}`);
      }
      usedEdges.add(matches[0].id);
      sourceIdsUsed.add(sourceId);
    }
    const unexpected = supportedByEdges.filter(
      (edge) => edge.sourceId === claim.nodeId && !claim.sourceIds.includes(edge.targetId),
    );
    if (unexpected.length) fail(`claim ${claim.nodeId} has undeclared supported_by edges`);
  }
  const unusedSources = corpus.sources
    .map((source) => source.nodeId)
    .filter((sourceId) => !sourceIdsUsed.has(sourceId));
  if (unusedSources.length)
    fail(`repository corpus has unused sources: ${unusedSources.join(", ")}`);

  for (const edge of edgeById.values()) {
    if (edge.type === "parent_of" && pageById.has(edge.targetId)) usedEdges.add(edge.id);
  }
  const unusedEdges = [...edgeById.keys()].filter((edgeId) => !usedEdges.has(edgeId));
  if (unusedEdges.length) fail(`repository corpus has unused edges: ${unusedEdges.join(", ")}`);

  const unusedReceipts = [...receiptById.keys()].filter((id) => !usedReceiptIds.has(id));
  if (unusedReceipts.length) {
    fail(`repository corpus has unused applicability receipts: ${unusedReceipts.join(", ")}`);
  }
  const unusedRouteNodes = [...nodeByPath.values()]
    .filter((node) => !usedRouteNodeIds.has(node.id))
    .map((node) => node.id);
  if (unusedRouteNodes.length) {
    fail(`repository corpus has unused route nodes: ${unusedRouteNodes.join(", ")}`);
  }
}

function validateRenderedSourceReciprocity({
  pageById,
  claimById,
  sourceById,
  edgeById,
  resolvedGuideByPath,
}) {
  const supportedByEdges = [...edgeById.values()].filter((edge) => edge.type === "supported_by");

  for (const page of pageById.values()) {
    const renderedSources = resolvedGuideByPath.get(page.path).externalSources;
    if (page.sourceDecisions.length !== renderedSources.length) {
      fail(
        `page ${page.nodeId} source decisions must exactly cover ${renderedSources.length} rendered source(s) in order`,
      );
    }

    const expectedPairs = new Set();
    for (const claimId of page.claimIds) {
      const claim = claimById.get(claimId);
      for (const sourceId of claim.sourceIds) expectedPairs.add(`${claimId}|${sourceId}`);
    }

    const decidedPairs = new Set();
    for (const [index, decision] of page.sourceDecisions.entries()) {
      const renderedSource = renderedSources[index];
      if (decision.location !== renderedSource.location || decision.href !== renderedSource.href) {
        fail(
          `page ${page.nodeId} source decision ${index} must exactly match rendered source ${renderedSource.location}|${renderedSource.href}`,
        );
      }

      const source = sourceById.get(decision.sourceId);
      if (!source) {
        fail(
          `page ${page.nodeId} source decision ${decision.location} references missing EvidenceSource ${decision.sourceId}`,
        );
      }
      if (source.url !== decision.href) {
        fail(
          `page ${page.nodeId} source decision ${decision.location} href must equal source ${decision.sourceId} URL`,
        );
      }

      for (const claimId of decision.claimIds) {
        if (!page.claimIds.includes(claimId)) {
          fail(
            `page ${page.nodeId} source decision ${decision.location} references foreign claim ${claimId}`,
          );
        }
        const claim = claimById.get(claimId);
        if (!claim.sourceIds.includes(decision.sourceId)) {
          fail(
            `page ${page.nodeId} source decision ${decision.location} invents claim/source pair ${claimId}|${decision.sourceId}`,
          );
        }
        const pair = `${claimId}|${decision.sourceId}`;
        if (decidedPairs.has(pair)) {
          fail(`page ${page.nodeId} repeats rendered claim/source pair ${pair}`);
        }
        decidedPairs.add(pair);
        const reciprocalEdges = supportedByEdges.filter(
          (edge) => edge.sourceId === claimId && edge.targetId === decision.sourceId,
        );
        if (reciprocalEdges.length !== 1) {
          fail(
            `page ${page.nodeId} rendered claim/source pair ${pair} requires exactly one supported_by edge`,
          );
        }
      }
    }

    if (!sameSet([...decidedPairs], expectedPairs)) {
      const missing = [...expectedPairs].filter((pair) => !decidedPairs.has(pair));
      const extra = [...decidedPairs].filter((pair) => !expectedPairs.has(pair));
      fail(
        `page ${page.nodeId} rendered claim/source pairs must exactly equal page-claim sources` +
          `${missing.length ? `; missing: ${missing.join(", ")}` : ""}` +
          `${extra.length ? `; extra: ${extra.join(", ")}` : ""}`,
      );
    }
  }
}

export function validateRepositoryCorpus({
  corpus,
  cohortRegistry,
  resolvedGuides,
  registryPaths,
  publishedPaths,
}) {
  validateCorpusHeader(corpus);
  const registryPathSet = new Set(registryPaths ?? []);
  const publishedPathSet = new Set(publishedPaths ?? []);
  if (registryPathSet.size === 0 || publishedPathSet.size === 0) {
    fail("repository corpus validation requires nonempty current and published path registries");
  }
  for (const path of publishedPathSet) {
    if (!registryPathSet.has(path))
      fail(`published path ${path} is absent from the current registry`);
  }
  const projectedGuides = requireArray(resolvedGuides, "resolved guide corpus", {
    minItems: 1,
  }).map(projectResolvedGuide);
  const resolvedGuideByPath = new Map();
  for (const guide of projectedGuides) {
    if (resolvedGuideByPath.has(guide.path)) fail(`resolved guide corpus repeats ${guide.path}`);
    resolvedGuideByPath.set(guide.path, guide);
  }

  const { nodeById, nodeByPath } = validateNodeRegistry(corpus, publishedPathSet);
  const sourceById = validateSources(corpus, nodeById);
  const cohortById = validateCohorts(corpus, cohortRegistry, sourceById);
  const claimById = validateClaims(corpus, nodeById, sourceById, cohortById);
  const expectedPaths = new Set([...cohortById.values()].flatMap((cohort) => cohort.paths));
  if (!sameSet([...resolvedGuideByPath.keys()], expectedPaths)) {
    fail("resolved guide corpus must exactly match the declared corpus cohorts");
  }
  const { pageById } = validatePages(corpus, nodeById, cohortById, claimById, resolvedGuideByPath);
  validateClaimCoverage({ cohortById, claimById, pageById, resolvedGuideByPath });
  const receiptById = validateReceipts(corpus, nodeById, pageById);
  const edgeById = validateEdges(corpus, nodeById, claimById, sourceById);
  const graph = validateCardinalityAndCycles(edgeById, corpus.rootNodeId, pageById);
  validateSlotAndLinkReciprocity({
    corpus,
    nodeById,
    nodeByPath,
    pageById,
    edgeById,
    receiptById,
    resolvedGuideByPath,
  });
  validateRenderedSourceReciprocity({
    pageById,
    claimById,
    sourceById,
    edgeById,
    resolvedGuideByPath,
  });

  return {
    status: "pass",
    evidenceScope: "semantic_contract_only",
    publicationStatus: "NOT_MEASURED",
    renderedCrawlStatus: "NOT_MEASURED",
    cohortCount: cohortById.size,
    pageCount: pageById.size,
    nodeCount: nodeById.size,
    edgeCount: edgeById.size,
    claimCount: claimById.size,
    sourceCount: sourceById.size,
    materialProseCount: [...resolvedGuideByPath.values()].reduce(
      (total, guide) => total + guide.material.length,
      0,
    ),
    renderedInternalLinkCount: [...resolvedGuideByPath.values()].reduce(
      (total, guide) => total + guide.internalLinks.length,
      0,
    ),
    renderedExternalSourceCount: [...resolvedGuideByPath.values()].reduce(
      (total, guide) => total + guide.externalSources.length,
      0,
    ),
    maximumRootDepth: graph.maximumRootDepth,
  };
}
