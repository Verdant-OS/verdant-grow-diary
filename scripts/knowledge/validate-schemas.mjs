import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
export const DEFAULT_SCHEMA_DIR = path.join(root, "docs", "knowledge-library", "schemas");

export const REQUIRED_TEMPLATES = Object.freeze([
  "cultivar.schema.json",
  "sensor.schema.json",
  "deficiency.schema.json",
  "equipment.schema.json",
]);

const TEMPLATE_CONTRACTS = Object.freeze({
  "cultivar.schema.json": Object.freeze({
    pageType: "cultivar",
    pageFamily: "entity",
    nodeType: "Cultivar",
  }),
  "sensor.schema.json": Object.freeze({
    pageType: "sensor",
    pageFamily: "entity",
    nodeType: "Sensor",
  }),
  "deficiency.schema.json": Object.freeze({
    pageType: "deficiency",
    pageFamily: "diagnostic",
    nodeType: "Condition",
  }),
  "equipment.schema.json": Object.freeze({
    pageType: "equipment",
    pageFamily: "entity",
    nodeType: "Equipment",
  }),
});

const REQUIRED_NODE_TYPES = Object.freeze([
  "Topic",
  "Cultivar",
  "Stage",
  "Metric",
  "Sensor",
  "Symptom",
  "Condition",
  "Protocol",
  "Equipment",
  "EvidenceSource",
  "ProductAction",
  "Claim",
  "Author",
  "Reviewer",
  "Method",
  "Observation",
  "Run",
  "Phenotype",
  "Trait",
  "Medium",
  "Facility",
  "Unit",
  "Outcome",
  "Jurisdiction",
  "Capability",
  "Integration",
]);

const REQUIRED_EDGE_TYPES = Object.freeze([
  "parent_of",
  "requires",
  "next_step",
  "measured_by",
  "uses_unit",
  "derived_from",
  "observed_as",
  "mimics",
  "differential_of",
  "confirmed_by",
  "disconfirmed_by",
  "managed_by",
  "occurs_during",
  "affects",
  "applies_to",
  "has_lineage_claim",
  "has_observed_trait",
  "supported_by",
  "authored_by",
  "reviewed_by",
  "uses_method",
  "observed_in",
  "observes",
  "has_phenotype",
  "grown_in",
  "produced_outcome",
  "has_capability",
  "exposes_capability",
  "integrates_with",
  "valid_in",
  "logged_as",
  "next_action",
  "supersedes",
  "related_to",
]);

const REQUIRED_EDITORIAL_STATES = Object.freeze([
  "idea",
  "triaged",
  "briefed",
  "sourced",
  "drafted",
  "evidence_review",
  "cultivation_review",
  "safety_review",
  "product_truth_review",
  "technical_review",
  "copy_accessibility_review",
  "ready",
  "published",
  "monitored",
  "refresh_due",
  "revision_required",
  "blocked",
  "blocked_evidence",
  "corrected",
  "withdrawn",
  "archived",
  "rejected",
]);

const REQUIRED_RISK_CLASSES = Object.freeze(["R0", "R1", "R2", "R3"]);
const REQUIRED_CONTENT_DOMAINS = Object.freeze([
  "fundamentals",
  "environment",
  "sensors",
  "irrigation",
  "nutrition",
  "health",
  "genetics",
  "stages",
  "harvest",
  "equipment",
]);
const REQUIRED_RISK_DOMAINS = Object.freeze([
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
const REQUIRED_SOURCE_LINK_ROLES = Object.freeze([
  "supports",
  "limits",
  "contradicts",
  "defines_method",
  "controls_requirement",
  "documents_product",
]);
const REQUIRED_CLAIM_TYPES = Object.freeze([
  "definition",
  "measurement",
  "mechanism",
  "causal",
  "association",
  "range",
  "safety",
  "legal",
  "product_capability",
  "provenance",
  "field_observation",
  "recommendation",
]);

const CANONICAL_SENSOR_SOURCES = Object.freeze([
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
]);

export const SENSOR_METRIC_CONTRACTS = Object.freeze({
  air_temp_c: Object.freeze({
    metricId: "metric:air-temperature",
    unitId: "unit:celsius",
  }),
  humidity_pct: Object.freeze({
    metricId: "metric:relative-humidity",
    unitId: "unit:percent-relative-humidity",
  }),
  vpd_kpa: Object.freeze({ metricId: "metric:vpd-air", unitId: "unit:kilopascal" }),
  leaf_temp_c: Object.freeze({
    metricId: "metric:leaf-temperature",
    unitId: "unit:celsius",
  }),
  leaf_vpd_kpa: Object.freeze({ metricId: "metric:vpd-leaf", unitId: "unit:kilopascal" }),
  co2_ppm: Object.freeze({
    metricId: "metric:carbon-dioxide-concentration",
    unitId: "unit:parts-per-million",
  }),
  soil_moisture_pct: Object.freeze({
    metricId: "metric:soil-moisture-relative",
    unitId: "unit:percent",
  }),
  soil_temp_c: Object.freeze({
    metricId: "metric:soil-temperature",
    unitId: "unit:celsius",
  }),
  soil_ec_mscm: Object.freeze({
    metricId: "metric:soil-electrical-conductivity",
    unitId: "unit:millisiemens-per-centimeter",
  }),
  reservoir_ph: Object.freeze({ metricId: "metric:reservoir-ph", unitId: "unit:ph" }),
  reservoir_ec_mscm: Object.freeze({
    metricId: "metric:reservoir-electrical-conductivity",
    unitId: "unit:millisiemens-per-centimeter",
  }),
  ppfd: Object.freeze({
    metricId: "metric:ppfd",
    unitId: "unit:micromole-per-square-meter-per-second",
  }),
});

const VPD_INPUT_METRIC_IDS = Object.freeze({
  vpd_kpa: Object.freeze(["metric:air-temperature", "metric:relative-humidity"]),
  leaf_vpd_kpa: Object.freeze([
    "metric:air-temperature",
    "metric:relative-humidity",
    "metric:leaf-temperature",
  ]),
});

const REQUIRED_PAGE_OWNER_TYPES = Object.freeze([
  "Topic",
  "Cultivar",
  "Sensor",
  "Condition",
  "Protocol",
  "Equipment",
  "Method",
]);
const REQUIRED_PAGE_TYPES = Object.freeze([
  "topic",
  "cultivar",
  "sensor",
  "deficiency",
  "equipment",
  "protocol",
  "method",
]);
const REQUIRED_PAGE_FAMILIES = Object.freeze([
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

const REQUIRED_CONTEXTUAL_LATERAL_PAGE_FAMILIES = Object.freeze([
  "reference",
  "protocol",
  "diagnostic",
  "comparison",
  "worked-example",
  "entity",
  "glossary",
]);

const EMPIRICAL_EDGE_TYPES = Object.freeze([
  "measured_by",
  "uses_unit",
  "derived_from",
  "observed_as",
  "mimics",
  "confirmed_by",
  "disconfirmed_by",
  "managed_by",
  "occurs_during",
  "affects",
  "applies_to",
  "has_lineage_claim",
  "has_observed_trait",
  "supported_by",
  "uses_method",
  "observed_in",
  "observes",
  "has_phenotype",
  "grown_in",
  "produced_outcome",
  "has_capability",
  "exposes_capability",
  "integrates_with",
  "valid_in",
  "logged_as",
]);

const EDITORIAL_EDGE_TYPES = Object.freeze([
  "parent_of",
  "requires",
  "next_step",
  "differential_of",
  "authored_by",
  "reviewed_by",
  "next_action",
  "supersedes",
  "related_to",
]);

const edgeContract = (sourceTypes, targetTypes, cardinality, symmetric, provenanceClass) =>
  Object.freeze({
    sourceTypes: Object.freeze(sourceTypes),
    targetTypes: Object.freeze(targetTypes),
    cardinality,
    symmetric,
    provenanceClass,
  });

const PAGE_OR_CLAIM_TYPES = Object.freeze([...REQUIRED_PAGE_OWNER_TYPES, "Claim"]);
const ALL_NODE_TYPES = REQUIRED_NODE_TYPES;

export const EDGE_CONTRACTS = Object.freeze({
  parent_of: edgeContract(["Topic"], REQUIRED_PAGE_OWNER_TYPES, "one_to_many", false, "editorial"),
  requires: edgeContract(
    REQUIRED_PAGE_OWNER_TYPES,
    REQUIRED_PAGE_OWNER_TYPES,
    "many_to_many",
    false,
    "editorial",
  ),
  next_step: edgeContract(
    REQUIRED_PAGE_OWNER_TYPES,
    REQUIRED_PAGE_OWNER_TYPES,
    "many_to_many",
    false,
    "editorial",
  ),
  measured_by: edgeContract(
    ["Metric"],
    ["Sensor", "Equipment", "Method"],
    "many_to_many",
    false,
    "empirical",
  ),
  uses_unit: edgeContract(
    ["Metric", "Claim", "Observation", "Outcome"],
    ["Unit"],
    "many_to_many",
    false,
    "empirical",
  ),
  derived_from: edgeContract(["Metric"], ["Metric"], "many_to_many", false, "empirical"),
  observed_as: edgeContract(["Condition"], ["Symptom"], "many_to_many", false, "empirical"),
  mimics: edgeContract(["Condition"], ["Condition"], "many_to_many", true, "empirical"),
  differential_of: edgeContract(
    ["Topic", "Condition"],
    ["Condition"],
    "many_to_many",
    false,
    "editorial",
  ),
  confirmed_by: edgeContract(
    ["Condition"],
    ["Observation", "Method", "Protocol", "Claim"],
    "many_to_many",
    false,
    "empirical",
  ),
  disconfirmed_by: edgeContract(
    ["Condition"],
    ["Observation", "Method", "Protocol", "Claim"],
    "many_to_many",
    false,
    "empirical",
  ),
  managed_by: edgeContract(["Condition"], ["Protocol"], "many_to_many", false, "empirical"),
  occurs_during: edgeContract(
    ["Topic", "Condition", "Observation", "Run"],
    ["Stage"],
    "many_to_many",
    false,
    "empirical",
  ),
  affects: edgeContract(
    ["Condition", "Medium", "Equipment", "Protocol"],
    ["Metric", "Trait", "Outcome"],
    "many_to_many",
    false,
    "empirical",
  ),
  applies_to: edgeContract(
    ["Protocol", "Method", "Equipment", "Integration", "Claim"],
    ["Medium", "Stage", "Facility", "Jurisdiction"],
    "many_to_many",
    false,
    "empirical",
  ),
  has_lineage_claim: edgeContract(
    ["Cultivar", "Phenotype"],
    ["Cultivar"],
    "many_to_many",
    false,
    "empirical",
  ),
  has_observed_trait: edgeContract(
    ["Cultivar", "Phenotype"],
    ["Trait"],
    "many_to_many",
    false,
    "empirical",
  ),
  supported_by: edgeContract(["Claim"], ["EvidenceSource"], "many_to_many", false, "empirical"),
  authored_by: edgeContract(PAGE_OR_CLAIM_TYPES, ["Author"], "many_to_many", false, "editorial"),
  reviewed_by: edgeContract(PAGE_OR_CLAIM_TYPES, ["Reviewer"], "many_to_many", false, "editorial"),
  uses_method: edgeContract(
    ["Metric", "Observation", "Outcome", "Claim"],
    ["Method"],
    "many_to_many",
    false,
    "empirical",
  ),
  observed_in: edgeContract(
    ["Observation", "Outcome", "Phenotype"],
    ["Run"],
    "many_to_one",
    false,
    "empirical",
  ),
  observes: edgeContract(
    ["Observation"],
    ["Metric", "Symptom", "Trait", "Outcome"],
    "many_to_many",
    false,
    "empirical",
  ),
  has_phenotype: edgeContract(["Cultivar"], ["Phenotype"], "one_to_many", false, "empirical"),
  grown_in: edgeContract(["Run"], ["Medium", "Facility"], "many_to_many", false, "empirical"),
  produced_outcome: edgeContract(["Run"], ["Outcome"], "one_to_many", false, "empirical"),
  has_capability: edgeContract(
    ["Equipment", "Sensor"],
    ["Capability"],
    "many_to_many",
    false,
    "empirical",
  ),
  exposes_capability: edgeContract(
    ["Integration"],
    ["Capability"],
    "many_to_many",
    false,
    "empirical",
  ),
  integrates_with: edgeContract(
    ["Equipment", "Sensor"],
    ["Integration"],
    "many_to_many",
    false,
    "empirical",
  ),
  valid_in: edgeContract(
    ["Claim", "Protocol", "Method", "Integration"],
    ["Jurisdiction"],
    "many_to_many",
    false,
    "empirical",
  ),
  logged_as: edgeContract(
    ["Observation", "Outcome"],
    ["ProductAction"],
    "many_to_many",
    false,
    "empirical",
  ),
  next_action: edgeContract(
    REQUIRED_PAGE_OWNER_TYPES,
    ["ProductAction"],
    "one_to_one",
    false,
    "editorial",
  ),
  supersedes: edgeContract(ALL_NODE_TYPES, ALL_NODE_TYPES, "many_to_one", false, "editorial"),
  related_to: edgeContract(ALL_NODE_TYPES, ALL_NODE_TYPES, "many_to_many", true, "editorial"),
});

const JSON_SCHEMA_TYPES = new Set([
  "null",
  "boolean",
  "object",
  "array",
  "number",
  "string",
  "integer",
]);

function fail(message) {
  throw new Error(`Knowledge schema invalid: ${message}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameSet(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    [...actual].sort().join("|") === [...expected].sort().join("|")
  );
}

function requireRecord(value, label) {
  if (!isRecord(value)) fail(`${label} must be an object`);
  return value;
}

function requireExactEnum(schema, expected, label) {
  if (!sameSet(schema?.enum, expected)) {
    fail(`${label} must contain exactly: ${expected.join(", ")}`);
  }
}

function requireKeys(schema, keys, label) {
  requireRecord(schema, label);
  if (!Array.isArray(schema.required)) fail(`${label} must declare required keys`);
  for (const key of keys) {
    if (!schema.required.includes(key)) fail(`${label} must require ${key}`);
    if (!isRecord(schema.properties) || !(key in schema.properties)) {
      fail(`${label} must define property ${key}`);
    }
  }
}

function requireRef(schema, expected, label) {
  if (!isRecord(schema) || schema.$ref !== expected) {
    fail(`${label} must reference ${expected}`);
  }
}

function requireRiskMetadataContract(schema, label) {
  requireRef(schema?.properties?.riskClass, "#/$defs/riskClass", `${label} riskClass`);
  const riskDomains = schema?.properties?.riskDomains;
  if (
    !isRecord(riskDomains) ||
    riskDomains.type !== "array" ||
    riskDomains.minItems !== 1 ||
    riskDomains.uniqueItems !== true
  ) {
    fail(`${label} riskDomains must be a nonempty unique array`);
  }
  requireRef(riskDomains.items, "#/$defs/riskDomain", `${label} riskDomains items`);
}

function requireContentMetadataContract(schema, label) {
  const contentDomains = schema?.properties?.contentDomains;
  if (
    !isRecord(contentDomains) ||
    contentDomains.type !== "array" ||
    contentDomains.minItems !== 1 ||
    contentDomains.uniqueItems !== true
  ) {
    fail(`${label} contentDomains must be a nonempty unique array`);
  }
  requireRef(contentDomains.items, "#/$defs/contentDomain", `${label} contentDomains items`);
}

function requireNodeIdArrayContract(schema, label, minItems) {
  if (
    !isRecord(schema) ||
    schema.type !== "array" ||
    schema.minItems !== minItems ||
    schema.uniqueItems !== true
  ) {
    fail(`${label} must be a unique node-ID array with minItems ${minItems}`);
  }
  requireRef(schema.items, "#/$defs/nodeId", `${label} items`);
}

function nodeTypesFromConstraint(schema) {
  if (!isRecord(schema)) return [];
  if (typeof schema.const === "string") return [schema.const];
  if (Array.isArray(schema.enum)) return schema.enum;
  if (schema.$ref === "#/$defs/pageOwningNodeType") return REQUIRED_PAGE_OWNER_TYPES;
  if (schema.$ref === "#/$defs/nodeType") return REQUIRED_NODE_TYPES;
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.flatMap((entry) => nodeTypesFromConstraint(entry));
  }
  return [];
}

function validateGraphEdgeSchemaContract(graphEdge) {
  if (!Array.isArray(graphEdge.oneOf) || graphEdge.oneOf.length !== REQUIRED_EDGE_TYPES.length) {
    fail(`common graphEdge must define exactly ${REQUIRED_EDGE_TYPES.length} semantic branches`);
  }
  const branches = new Map();
  for (const branch of graphEdge.oneOf) {
    const edgeType = branch?.properties?.type?.const;
    if (typeof edgeType !== "string" || branches.has(edgeType)) {
      fail("common graphEdge semantic branches must use unique edge-type constants");
    }
    branches.set(edgeType, branch);
  }
  if (!sameSet([...branches.keys()], REQUIRED_EDGE_TYPES)) {
    fail("common graphEdge semantic branches must cover the exact edge vocabulary");
  }
  for (const [edgeType, contract] of Object.entries(EDGE_CONTRACTS)) {
    const properties = branches.get(edgeType)?.properties;
    if (
      !sameSet(nodeTypesFromConstraint(properties?.sourceType), contract.sourceTypes) ||
      !sameSet(nodeTypesFromConstraint(properties?.targetType), contract.targetTypes) ||
      properties?.cardinality?.const !== contract.cardinality ||
      properties?.symmetric?.const !== contract.symmetric
    ) {
      fail(
        `common graphEdge ${edgeType} branch must match its endpoint/cardinality/symmetry contract`,
      );
    }
  }

  const activeEmpiricalContract = conditionalExists(
    graphEdge,
    (value) =>
      hasPropertyConst(value, "status", "active") &&
      hasPropertyConstraint(value, "type", (property) =>
        sameSet(property.enum, EMPIRICAL_EDGE_TYPES),
      ),
    (value) =>
      hasPropertyConstraint(value, "claimIds", (property) => property.minItems >= 1) &&
      hasPropertyConstraint(value, "sourceIds", (property) => property.minItems >= 1),
  );
  if (!activeEmpiricalContract) {
    fail("common active empirical edges must require claim and source provenance");
  }
  const activeEditorialContract = conditionalExists(
    graphEdge,
    (value) =>
      hasPropertyConst(value, "status", "active") &&
      hasPropertyConstraint(value, "type", (property) =>
        sameSet(property.enum, EDITORIAL_EDGE_TYPES),
      ),
    (value) => hasPropertyConstraint(value, "reviewerIds", (property) => property.minItems >= 1),
  );
  if (!activeEditorialContract) {
    fail("common active editorial edges must require reviewer provenance");
  }
}

export function validateGraphEdgeSemantics(edge) {
  if (!isRecord(edge)) fail("graph edge instance must be an object");
  const contract = EDGE_CONTRACTS[edge.type];
  if (!contract) fail(`graph edge instance has unknown type ${String(edge.type)}`);
  if (!contract.sourceTypes.includes(edge.sourceType)) {
    fail(`graph edge ${edge.type} has invalid sourceType ${String(edge.sourceType)}`);
  }
  if (!contract.targetTypes.includes(edge.targetType)) {
    fail(`graph edge ${edge.type} has invalid targetType ${String(edge.targetType)}`);
  }
  if (edge.cardinality !== contract.cardinality) {
    fail(`graph edge ${edge.type} has invalid cardinality ${String(edge.cardinality)}`);
  }
  if (edge.symmetric !== contract.symmetric) {
    fail(`graph edge ${edge.type} has invalid symmetry ${String(edge.symmetric)}`);
  }
  if (edge.type === "supersedes" && edge.sourceType !== edge.targetType) {
    fail("graph edge supersedes must connect nodes of the same type");
  }
  if (edge.status === "active") {
    const provenance = edge.provenance;
    if (!isRecord(provenance)) fail(`active graph edge ${edge.type} requires provenance`);
    if (
      contract.provenanceClass === "empirical" &&
      (!Array.isArray(provenance.claimIds) ||
        provenance.claimIds.length === 0 ||
        !Array.isArray(provenance.sourceIds) ||
        provenance.sourceIds.length === 0)
    ) {
      fail(`active empirical graph edge ${edge.type} requires claim and source provenance`);
    }
    if (
      contract.provenanceClass === "editorial" &&
      (!Array.isArray(provenance.reviewerIds) || provenance.reviewerIds.length === 0)
    ) {
      fail(`active editorial graph edge ${edge.type} requires reviewer provenance`);
    }
  }
  return { status: "pass", edgeType: edge.type };
}

function requireFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
  return value;
}

function requireValidTimestamp(value, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(`${label} must be a valid timestamp`);
  return timestamp;
}

function requireApproxEqual(actual, expected, label, epsilon = 0.001) {
  requireFiniteNumber(actual, label);
  requireFiniteNumber(expected, `${label} expected value`);
  if (Math.abs(actual - expected) > epsilon) {
    fail(`${label} does not match its recorded inputs`);
  }
}

function matchingActiveEdges(edges, predicate) {
  return edges.filter((edge) => edge.status === "active" && predicate(edge));
}

function uniqueSourceNodeIds(sources, label) {
  const sourceIds = (sources ?? []).map((source) => source?.nodeId);
  if (new Set(sourceIds).size !== sourceIds.length) {
    fail(`${label} must not repeat a source node identity`);
  }
  return new Set(sourceIds);
}

/**
 * Prove page-local canonical identity plus author/reviewer profile reciprocity.
 * JSON Schema owns field shape; this helper owns equality and set semantics.
 */
export function validatePageIdentitySemantics(page) {
  if (!isRecord(page)) fail("page identity semantic input must be an object");
  const manifest = page.pageManifest;
  const metadata = manifest?.metadata;
  const graph = manifest?.graph;
  const seo = manifest?.seo;
  const editorial = page.editorial;
  if (
    !isRecord(metadata) ||
    !isRecord(graph) ||
    !isRecord(graph.node) ||
    !Array.isArray(graph.edges) ||
    !isRecord(seo) ||
    !isRecord(editorial)
  ) {
    fail("page identity semantics require metadata, graph, SEO, and editorial records");
  }
  if (metadata.path !== seo.canonicalPath) {
    fail("page metadata path must match seo canonicalPath");
  }
  const pathTail = metadata.path?.split("/").filter(Boolean).at(-1);
  const slugs = [metadata.slug, page.slug].filter((slug) => slug !== undefined);
  if (!pathTail || slugs.length === 0 || slugs.some((slug) => slug !== pathTail)) {
    fail("page path tail must match every page-local slug");
  }
  if (metadata.id !== graph.node.id) {
    fail("page metadata id must match the graph node id");
  }
  const specializedNodeIds = [
    page.identity?.cultivarNodeId,
    page.identity?.equipmentNodeId,
    page.deviceIdentity?.sensorNodeId,
  ].filter((nodeId) => nodeId !== undefined);
  if (specializedNodeIds.some((nodeId) => nodeId !== graph.node.id)) {
    fail("page-local specialized identity must match the graph node id");
  }
  const breadcrumbIds = seo.breadcrumbNodeIds;
  if (!Array.isArray(breadcrumbIds) || breadcrumbIds.at(-1) !== graph.node.id) {
    fail("page breadcrumb must terminate at the graph node id");
  }
  if (breadcrumbIds.at(-2) !== graph.parentId) {
    fail("page breadcrumb parent must match graph parentId");
  }
  const pageSourceIds = uniqueSourceNodeIds(page.sources, "page sources");
  if (isRecord(seo.faqPageReceipt)) {
    if (!pageSourceIds.has(seo.faqPageReceipt.consumerDocumentationSourceId)) {
      fail("FAQPage consumer receipt must resolve its current-documentation source identity");
    }
  }

  const author = editorial.author;
  if (!isRecord(author) || author.profileSubjectId !== author.nodeId) {
    fail("page author profile subject must match its person identity");
  }
  const reviewerRefs = Object.values(editorial.signoffs ?? {})
    .filter((signoff) => isRecord(signoff) && isRecord(signoff.reviewer))
    .map((signoff) => signoff.reviewer);
  for (const reviewer of reviewerRefs) {
    if (reviewer.profileSubjectId !== reviewer.nodeId) {
      fail("page reviewer profile subject must match its person identity");
    }
  }
  const reviewerIds = [...new Set(reviewerRefs.map((reviewer) => reviewer.nodeId))].sort();
  const authoredTargets = matchingActiveEdges(
    graph.edges,
    (edge) =>
      edge.type === "authored_by" &&
      edge.sourceId === graph.node.id &&
      edge.sourceType === graph.node.type &&
      edge.targetType === "Author",
  )
    .map((edge) => edge.targetId)
    .sort();
  const reviewedTargets = matchingActiveEdges(
    graph.edges,
    (edge) =>
      edge.type === "reviewed_by" &&
      edge.sourceId === graph.node.id &&
      edge.sourceType === graph.node.type &&
      edge.targetType === "Reviewer",
  )
    .map((edge) => edge.targetId)
    .sort();
  if (!sameSet(authoredTargets, [author.nodeId])) {
    fail("page authored_by edges must exactly match the page author");
  }
  if (!sameSet(reviewedTargets, reviewerIds)) {
    fail("page reviewed_by edges must exactly match the page reviewers");
  }

  return {
    status: "pass",
    pageId: metadata.id,
    authorCount: 1,
    reviewerCount: reviewerIds.length,
  };
}

/**
 * Prove the cross-record truth contract for one sensor knowledge page.
 *
 * JSON Schema validates record shape. This helper owns keyed uniqueness,
 * arithmetic, chronology, and graph reciprocity that portable Draft 2020-12
 * cannot express. Callers inject asOf when freshness status is evaluated; this
 * function never reads the wall clock.
 */
export function validateSensorPageSemantics(page, { asOf = null } = {}) {
  if (!isRecord(page)) fail("sensor page semantic input must be an object");
  const measurements = page.measurements;
  const graph = page.pageManifest?.graph;
  const edges = graph?.edges;
  if (!Array.isArray(measurements) || !isRecord(graph) || !Array.isArray(edges)) {
    fail("sensor page semantics require measurements and page graph edges");
  }
  if (page.deviceIdentity?.sensorNodeId !== graph.node?.id) {
    fail("sensor device identity must match the page graph node");
  }
  const sourceNodeIds = uniqueSourceNodeIds(page.sources, "sensor sources");
  const requireEvidenceSources = (sourceIds, label) => {
    for (const sourceId of sourceIds ?? []) {
      if (!sourceNodeIds.has(sourceId)) {
        fail(`${label} references missing evidence source ${String(sourceId)}`);
      }
    }
  };
  if (page.deviceIdentity?.manualSourceId) {
    requireEvidenceSources([page.deviceIdentity.manualSourceId], "sensor device identity");
  }
  for (const edge of edges) {
    requireEvidenceSources(edge.provenance?.sourceIds, `sensor graph edge ${String(edge.id)}`);
  }
  for (const claim of page.claims ?? []) {
    requireEvidenceSources(
      (claim.sourceLinks ?? []).map((sourceLink) => sourceLink.sourceId),
      `sensor claim ${String(claim.nodeId ?? claim.id)}`,
    );
  }

  const measurementByKey = new Map();
  const measurementById = new Map();
  for (const measurement of measurements) {
    const contract = SENSOR_METRIC_CONTRACTS[measurement.metricKey];
    if (!contract)
      fail(`sensor measurement has unknown metricKey ${String(measurement.metricKey)}`);
    if (measurement.metricId !== contract.metricId || measurement.unitId !== contract.unitId) {
      fail(`sensor metric tuple mismatch for ${measurement.metricKey}`);
    }
    if (measurementByKey.has(measurement.metricKey)) {
      fail(`sensor page repeats metricKey ${measurement.metricKey}`);
    }
    if (measurementById.has(measurement.metricId)) {
      fail(`sensor page repeats metricId ${measurement.metricId}`);
    }
    measurementByKey.set(measurement.metricKey, measurement);
    measurementById.set(measurement.metricId, measurement);

    const unitEdges = matchingActiveEdges(
      edges,
      (edge) =>
        edge.type === "uses_unit" &&
        edge.sourceId === measurement.metricId &&
        edge.sourceType === "Metric",
    );
    if (
      unitEdges.length !== 1 ||
      unitEdges[0].targetId !== measurement.unitId ||
      unitEdges[0].targetType !== "Unit"
    ) {
      fail(`sensor metric ${measurement.metricId} requires exactly one active uses_unit edge`);
    }
    const measuredByEdges = matchingActiveEdges(
      edges,
      (edge) => edge.type === "measured_by" && edge.sourceId === measurement.metricId,
    );
    if (
      measurement.directOrDerived === "direct" &&
      (measuredByEdges.length !== 1 ||
        measuredByEdges[0].sourceType !== "Metric" ||
        measuredByEdges[0].targetId !== graph.node.id ||
        measuredByEdges[0].targetType !== "Sensor")
    ) {
      fail(`direct sensor metric ${measurement.metricId} requires one measured_by edge`);
    }
    if (measurement.directOrDerived !== "direct" && measuredByEdges.length !== 0) {
      fail(`derived sensor metric ${measurement.metricId} must not use measured_by`);
    }
  }

  for (const measurement of measurements) {
    if (measurement.directOrDerived === "direct") {
      if (measurement.derivation !== null) {
        fail(`direct sensor metric ${measurement.metricId} must not carry derivation evidence`);
      }
      continue;
    }
    const derivation = measurement.derivation;
    if (!isRecord(derivation) || !Array.isArray(derivation.inputs)) {
      fail(`derived sensor metric ${measurement.metricId} requires structured inputs`);
    }
    if (measurement.directOrDerived === "derived" && derivation.vendorMethodSourceId !== null) {
      fail(`Verdant-derived metric ${measurement.metricId} must not claim a vendor method`);
    }
    if (
      measurement.directOrDerived === "vendor_derived" &&
      typeof derivation.vendorMethodSourceId !== "string"
    ) {
      fail(`vendor-derived metric ${measurement.metricId} requires vendor method evidence`);
    }
    if (measurement.directOrDerived === "vendor_derived") {
      requireEvidenceSources(
        [derivation.vendorMethodSourceId],
        `sensor derivation ${measurement.metricId}`,
      );
    }

    const expectedInputs = VPD_INPUT_METRIC_IDS[measurement.metricKey];
    const inputIds = derivation.inputs.map((input) => input.metricId);
    if (new Set(inputIds).size !== inputIds.length) {
      fail(`derived sensor metric ${measurement.metricId} repeats an input metric`);
    }
    if (expectedInputs && !sameSet(inputIds, expectedInputs)) {
      fail(`derived sensor metric ${measurement.metricId} has the wrong input metric set`);
    }
    const computedAt = requireValidTimestamp(
      derivation.computedAt,
      `derived sensor metric ${measurement.metricId} computedAt`,
    );
    const inputTimes = [];
    for (const input of derivation.inputs) {
      const capturedAt = requireValidTimestamp(
        input.capturedAt,
        `derived sensor metric ${measurement.metricId} input capturedAt`,
      );
      if (capturedAt > computedAt) {
        fail(`derived sensor metric ${measurement.metricId} has a future input`);
      }
      const ageSeconds = (computedAt - capturedAt) / 1000;
      requireApproxEqual(
        input.freshnessAgeSeconds,
        ageSeconds,
        `derived sensor metric ${measurement.metricId} input freshness`,
      );
      if (ageSeconds > derivation.maxInputAgeSeconds) {
        fail(
          `derived sensor metric ${measurement.metricId} uses an input beyond its freshness window`,
        );
      }
      if (
        measurement.authorityStatus === "authoritative" &&
        (input.qualityState !== "ok" || ["demo", "stale", "invalid"].includes(input.source))
      ) {
        fail(`authoritative derived metric ${measurement.metricId} has an untrusted input`);
      }
      if (measurement.directOrDerived === "derived") {
        const inputMeasurement = measurementById.get(input.metricId);
        if (
          input.visibility !== "page_measurement" ||
          !inputMeasurement ||
          inputMeasurement.directOrDerived !== "direct" ||
          inputMeasurement.unitId !== input.unitId
        ) {
          fail(`Verdant-derived metric ${measurement.metricId} requires visible direct inputs`);
        }
      } else if (
        input.visibility === "page_measurement" &&
        (!measurementById.has(input.metricId) ||
          measurementById.get(input.metricId).unitId !== input.unitId)
      ) {
        fail(`vendor-derived metric ${measurement.metricId} references a missing visible input`);
      }
      inputTimes.push(capturedAt);
    }
    if (
      Math.max(...inputTimes) - Math.min(...inputTimes) >
      derivation.maxTimestampSkewSeconds * 1000
    ) {
      fail(`derived sensor metric ${measurement.metricId} exceeds its input timestamp-skew limit`);
    }

    const derivedEdges = matchingActiveEdges(
      edges,
      (edge) => edge.type === "derived_from" && edge.sourceId === measurement.metricId,
    );
    const edgeTargets = derivedEdges.map((edge) => edge.targetId);
    if (!sameSet(edgeTargets, inputIds)) {
      fail(`derived sensor metric ${measurement.metricId} graph edges do not match its inputs`);
    }
    const methodEdges = matchingActiveEdges(
      edges,
      (edge) => edge.type === "uses_method" && edge.sourceId === measurement.metricId,
    );
    if (
      methodEdges.length !== 1 ||
      methodEdges[0].sourceType !== "Metric" ||
      methodEdges[0].targetId !== derivation.methodId ||
      methodEdges[0].targetType !== "Method"
    ) {
      fail(
        `derived sensor metric ${measurement.metricId} requires exactly one active uses_method edge`,
      );
    }
  }

  const authoritativeMeasurements = measurements.filter(
    (measurement) => measurement.authorityStatus === "authoritative",
  );
  if (authoritativeMeasurements.length > 0 && asOf === null) {
    fail("authoritative sensor evidence requires an explicit asOf timestamp");
  }
  const asOfTimestamp = asOf === null ? null : requireValidTimestamp(asOf, "sensor semantic asOf");

  const calibration = page.calibration;
  if (!isRecord(calibration) || !Array.isArray(calibration.verificationHistory)) {
    fail("sensor page semantics require calibration verification history");
  }
  const verificationById = new Map();
  for (const [index, verification] of calibration.verificationHistory.entries()) {
    if (verificationById.has(verification.verificationId)) {
      fail(`sensor calibration repeats verificationId ${verification.verificationId}`);
    }
    const verifiedAt = requireValidTimestamp(
      verification.verifiedAt,
      `verification ${verification.verificationId} verifiedAt`,
    );
    const nextDueAt = requireValidTimestamp(
      `${verification.nextDueOn}T23:59:59Z`,
      `verification ${verification.verificationId} nextDueOn`,
    );
    if (nextDueAt < verifiedAt) {
      fail(`verification ${verification.verificationId} is due before it was performed`);
    }
    requireEvidenceSources(
      verification.sourceIds,
      `sensor verification ${verification.verificationId}`,
    );
    const resultMetricIds = new Set();
    for (const result of verification.results ?? []) {
      if (resultMetricIds.has(result.metricId)) {
        fail(
          `verification ${verification.verificationId} repeats metric result ${result.metricId}`,
        );
      }
      resultMetricIds.add(result.metricId);
      const metricContract = Object.values(SENSOR_METRIC_CONTRACTS).find(
        (candidate) => candidate.metricId === result.metricId,
      );
      if (!metricContract || result.unitId !== metricContract.unitId) {
        fail("verification result unit does not match the canonical metric unit");
      }
    }
    if (verification.supersedesVerificationId !== null) {
      if (
        verification.supersedesVerificationId === verification.verificationId ||
        !verificationById.has(verification.supersedesVerificationId)
      ) {
        fail(`verification ${verification.verificationId} has an invalid supersedes reference`);
      }
      const priorIndex = calibration.verificationHistory.findIndex(
        (entry) => entry.verificationId === verification.supersedesVerificationId,
      );
      if (priorIndex >= index) {
        fail(`verification ${verification.verificationId} must supersede an earlier record`);
      }
    }
    verificationById.set(verification.verificationId, verification);
  }
  const currentVerification =
    calibration.currentVerificationId === null
      ? null
      : verificationById.get(calibration.currentVerificationId);
  if (calibration.verificationStatus === "unverified") {
    if (calibration.currentVerificationId !== null || verificationById.size !== 0) {
      fail("unverified sensor calibration cannot claim a current or historical verification");
    }
  } else if (!currentVerification) {
    fail("sensor calibration currentVerificationId must reference its history");
  }
  if (asOfTimestamp !== null && currentVerification) {
    const currentVerifiedAt = requireValidTimestamp(
      currentVerification.verifiedAt,
      "current verification verifiedAt",
    );
    if (currentVerifiedAt > asOfTimestamp) {
      fail("sensor calibration current verification occurs after asOf");
    }
    const applicableVerifications = calibration.verificationHistory.filter(
      (verification) =>
        requireValidTimestamp(
          verification.verifiedAt,
          `${verification.verificationId} verifiedAt`,
        ) <= asOfTimestamp,
    );
    const latestApplicable = [...applicableVerifications]
      .sort(
        (left, right) =>
          requireValidTimestamp(left.verifiedAt, `${left.verificationId} verifiedAt`) -
          requireValidTimestamp(right.verifiedAt, `${right.verificationId} verifiedAt`),
      )
      .at(-1);
    if (latestApplicable?.verificationId !== calibration.currentVerificationId) {
      fail(
        "sensor calibration currentVerificationId must reference the latest applicable verification",
      );
    }
    const dueTimestamp = requireValidTimestamp(
      `${currentVerification.nextDueOn}T23:59:59Z`,
      "current verification nextDueOn",
    );
    if (calibration.verificationStatus === "current" && asOfTimestamp > dueTimestamp) {
      fail("sensor calibration marked current after its due date");
    }
  }

  const highRhCheck = calibration.highRhCheck;
  if (highRhCheck !== null && highRhCheck !== undefined) {
    if (highRhCheck.verificationId !== calibration.currentVerificationId) {
      fail("high-RH evidence must belong to the current verification");
    }
    if (
      asOfTimestamp !== null &&
      requireValidTimestamp(highRhCheck.checkedAt, "high-RH checkedAt") > asOfTimestamp
    ) {
      fail("high-RH evidence occurs after asOf");
    }
    requireApproxEqual(
      highRhCheck.asFoundDeviationPctPoints,
      highRhCheck.deviceAsFoundRelativeHumidityPct - highRhCheck.referenceRelativeHumidityPct,
      "high-RH as-found deviation",
    );
    if (highRhCheck.adjustmentPerformed) {
      requireApproxEqual(
        highRhCheck.asLeftDeviationPctPoints,
        highRhCheck.deviceAsLeftRelativeHumidityPct - highRhCheck.referenceRelativeHumidityPct,
        "high-RH as-left deviation",
      );
    } else if (
      highRhCheck.deviceAsLeftRelativeHumidityPct !== null ||
      highRhCheck.asLeftDeviationPctPoints !== null
    ) {
      fail("high-RH as-left values require a recorded adjustment");
    }
  }
  const leafBasis = calibration.leafTemperatureBasis;
  if (leafBasis !== null && leafBasis !== undefined) {
    requireEvidenceSources(leafBasis.evidenceSourceIds, "sensor leaf-temperature basis");
    if (
      asOfTimestamp !== null &&
      requireValidTimestamp(leafBasis.measuredAt, "leaf-temperature basis measuredAt") >
        asOfTimestamp
    ) {
      fail("leaf-temperature evidence occurs after asOf");
    }
    requireApproxEqual(
      leafBasis.offsetC,
      leafBasis.leafTemperatureC - leafBasis.airTemperatureC,
      "leaf-temperature offset",
    );
  }
  if (authoritativeMeasurements.length > 0) {
    if (calibration.verificationStatus !== "current" || !currentVerification) {
      fail("authoritative sensor evidence requires a current verification");
    }
    const currentResults = new Map(
      (currentVerification.results ?? []).map((result) => [result.metricId, result]),
    );
    const requiredVerifiedMetricIds = new Set();
    for (const measurement of authoritativeMeasurements) {
      if (measurement.directOrDerived === "direct") {
        requiredVerifiedMetricIds.add(measurement.metricId);
      } else {
        for (const input of measurement.derivation?.inputs ?? []) {
          requiredVerifiedMetricIds.add(input.metricId);
        }
      }
    }
    for (const metricId of requiredVerifiedMetricIds) {
      if (currentResults.get(metricId)?.disposition !== "pass") {
        fail("authoritative sensor evidence requires passing verification results");
      }
    }
    if (
      authoritativeMeasurements.some((measurement) => measurement.metricKey === "humidity_pct") &&
      highRhCheck?.disposition !== "pass"
    ) {
      fail("authoritative humidity evidence requires a passing high-RH check");
    }
  }
  const hasVpd = measurements.some((measurement) =>
    Object.hasOwn(VPD_INPUT_METRIC_IDS, measurement.metricKey),
  );
  if (hasVpd) {
    if (
      calibration.verificationStatus !== "current" ||
      !currentVerification ||
      !highRhCheck ||
      !leafBasis
    ) {
      fail("VPD evidence requires current verification, high-RH evidence, and a leaf basis");
    }
    const verifiedMetricIds = new Set(
      (currentVerification.results ?? []).map((result) => result.metricId),
    );
    const requiredVerifiedInputs = new Set(
      measurements
        .filter((measurement) => Object.hasOwn(VPD_INPUT_METRIC_IDS, measurement.metricKey))
        .flatMap((measurement) => VPD_INPUT_METRIC_IDS[measurement.metricKey]),
    );
    if ([...requiredVerifiedInputs].some((metricId) => !verifiedMetricIds.has(metricId))) {
      fail("current VPD verification does not cover every required input metric");
    }
    if (highRhCheck.disposition !== "pass") {
      fail("VPD evidence cannot be authoritative without a passing high-RH check");
    }
    if (
      measurementByKey.has("vpd_kpa") &&
      !leafBasis.applications.includes("context_only_for_air_vpd")
    ) {
      fail("air VPD requires a context-only measured leaf-temperature basis");
    }
    if (
      measurementByKey.has("leaf_vpd_kpa") &&
      !leafBasis.applications.includes("formula_input_for_leaf_vpd")
    ) {
      fail("leaf VPD requires a measured leaf-temperature formula input");
    }
  }

  requireEvidenceSources(page.transport?.evidenceSourceIds, "sensor transport");
  for (const capability of page.capabilities ?? []) {
    requireEvidenceSources(
      capability.evidenceSourceIds,
      `sensor capability ${capability.capabilityId}`,
    );
    if (capability.owner === "native_device") {
      const capabilityEdges = matchingActiveEdges(
        edges,
        (edge) =>
          edge.type === "has_capability" &&
          edge.sourceId === graph.node.id &&
          edge.targetId === capability.capabilityId,
      );
      if (capabilityEdges.length !== 1) {
        fail(
          `native sensor capability ${capability.capabilityId} requires has_capability reciprocity`,
        );
      }
    } else {
      if (capability.readOnly !== true || capability.verdantMayInvoke !== false) {
        fail(
          `Verdant capability ${capability.capabilityId} must remain read-only and non-invocable`,
        );
      }
      if (capability.status === "verified" && page.transport?.status !== "verified_read_only") {
        fail(
          `verified Verdant capability ${capability.capabilityId} requires verified read-only transport`,
        );
      }
      const integrationId = page.transport?.integrationId;
      const integrationEdges = matchingActiveEdges(
        edges,
        (edge) =>
          edge.type === "integrates_with" &&
          edge.sourceId === graph.node.id &&
          edge.targetId === integrationId,
      );
      const exposedEdges = matchingActiveEdges(
        edges,
        (edge) =>
          edge.type === "exposes_capability" &&
          edge.sourceId === integrationId &&
          edge.targetId === capability.capabilityId,
      );
      if (integrationEdges.length !== 1 || exposedEdges.length !== 1) {
        fail(`Verdant capability ${capability.capabilityId} lacks integration graph reciprocity`);
      }
    }
  }

  return {
    status: "pass",
    measurementCount: measurements.length,
    verificationCount: verificationById.size,
    capabilityCount: page.capabilities?.length ?? 0,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function validateSensorVerificationHistoryAppendOnly(previousPage, currentPage) {
  const previous = previousPage?.calibration?.verificationHistory;
  const current = currentPage?.calibration?.verificationHistory;
  if (!Array.isArray(previous) || !Array.isArray(current)) {
    fail("sensor verification append-only comparison requires both histories");
  }
  if (current.length < previous.length) {
    fail("sensor verification history cannot delete prior records");
  }
  for (let index = 0; index < previous.length; index += 1) {
    if (
      previous[index]?.verificationId !== current[index]?.verificationId ||
      canonicalJson(previous[index]) !== canonicalJson(current[index])
    ) {
      fail(
        "sensor verification history must preserve prior records byte-semantically and in order",
      );
    }
  }
  return {
    status: "pass",
    previousCount: previous.length,
    currentCount: current.length,
    appendedCount: current.length - previous.length,
  };
}

function cultivarHealthKey(scope, target) {
  return `${canonicalJson(scope)}|${String(target).trim().toLowerCase()}`;
}

function screeningEvidenceTime(event) {
  return event.resultedOn
    ? requireValidTimestamp(`${event.resultedOn}T00:00:00Z`, `${event.eventId} resultedOn`)
    : requireValidTimestamp(event.recordedOn, `${event.eventId} recordedOn`);
}

function quarantineStateForAction(action) {
  if (["open", "reopen"].includes(action)) return "open";
  if (action === "release") return "released";
  if (action === "dispose") return "disposed";
  if (action === "override") return "override";
  fail(`unknown quarantine action ${String(action)}`);
}

export function deriveCultivarHealthDisposition(record) {
  const provenance = record?.identity?.provenance;
  const declaredSubjects = provenance?.healthSubjects;
  const screeningHistory = provenance?.screeningHistory;
  const quarantineHistory = provenance?.quarantineHistory;
  if (
    !Array.isArray(declaredSubjects) ||
    !Array.isArray(screeningHistory) ||
    !Array.isArray(quarantineHistory)
  ) {
    fail("cultivar health derivation requires declared subjects and both histories");
  }
  const supersededIds = new Set(
    screeningHistory
      .map((event) => event.supersedesEventId)
      .filter((eventId) => typeof eventId === "string"),
  );
  const subjects = declaredSubjects
    .map((subject) => {
      const key = cultivarHealthKey(subject.scope, subject.target);
      const screenings = screeningHistory.filter(
        (event) => cultivarHealthKey(event.scope, event.target) === key,
      );
      const activeScreenings = screenings.filter((event) => !supersededIds.has(event.eventId));
      const latestScreeningTime =
        activeScreenings.length === 0
          ? null
          : Math.max(...activeScreenings.map((event) => screeningEvidenceTime(event)));
      const currentScreenings =
        latestScreeningTime === null
          ? []
          : activeScreenings.filter(
              (event) => screeningEvidenceTime(event) === latestScreeningTime,
            );
      const currentResults = new Set(currentScreenings.map((event) => event.result));
      let screeningState = "untested";
      if (currentResults.has("positive")) screeningState = "positive";
      else if (currentResults.has("inconclusive")) screeningState = "inconclusive";
      else if (currentResults.has("negative")) screeningState = "negative_scoped";

      const meaningfulResults = new Set(
        activeScreenings.map((event) => event.result).filter((result) => result !== "not_tested"),
      );
      let discordanceState = activeScreenings.length === 0 ? "unknown" : "none";
      if (
        new Set(
          currentScreenings
            .map((event) => event.result)
            .filter((result) => result !== "not_tested"),
        ).size > 1
      ) {
        discordanceState = "current_conflict";
      } else if (meaningfulResults.size > 1) {
        discordanceState = "historical_conflict";
      }
      const conflictingScreeningEventIds =
        meaningfulResults.size > 1
          ? activeScreenings
              .filter((event) => event.result !== "not_tested")
              .map((event) => event.eventId)
              .sort()
          : [];

      const quarantines = quarantineHistory.filter(
        (event) => cultivarHealthKey(event.scope, event.target) === key,
      );
      const terminalByEpisode = new Map();
      for (const [historyIndex, event] of quarantines.entries()) {
        const occurredOn = requireValidTimestamp(event.occurredOn, `${event.eventId} occurredOn`);
        const prior = terminalByEpisode.get(event.episodeId);
        if (
          !prior ||
          occurredOn > prior.occurredOn ||
          (occurredOn === prior.occurredOn && historyIndex > prior.historyIndex)
        ) {
          terminalByEpisode.set(event.episodeId, { event, occurredOn, historyIndex });
        }
      }
      const currentQuarantines = [...terminalByEpisode.values()];
      const latestCurrentQuarantine = currentQuarantines.reduce(
        (latest, candidate) =>
          latest === null ||
          candidate.occurredOn > latest.occurredOn ||
          (candidate.occurredOn === latest.occurredOn &&
            candidate.historyIndex > latest.historyIndex)
            ? candidate
            : latest,
        null,
      );
      const hasActiveEpisode = currentQuarantines.some(
        ({ event }) => quarantineStateForAction(event.action) === "open",
      );
      const quarantineState =
        latestCurrentQuarantine === null
          ? "not_started"
          : hasActiveEpisode
            ? "open"
            : quarantineStateForAction(latestCurrentQuarantine.event.action);

      return {
        scope: structuredClone(subject.scope),
        target: subject.target,
        screeningState,
        quarantineState,
        discordanceState,
        currentScreeningEventIds: currentScreenings.map((event) => event.eventId).sort(),
        conflictingScreeningEventIds,
        currentQuarantineEventIds: currentQuarantines.map(({ event }) => event.eventId).sort(),
        derivedFromScreeningEventIds: screenings.map((event) => event.eventId),
        derivedFromQuarantineEventIds: quarantines.map((event) => event.eventId),
        limitations: [
          "A negative result remains limited to the recorded subject, target, sample, and date.",
        ],
      };
    })
    .sort((left, right) =>
      cultivarHealthKey(left.scope, left.target).localeCompare(
        cultivarHealthKey(right.scope, right.target),
      ),
    );
  return subjects;
}

export function validateCultivarHealthSemantics(record) {
  if (!isRecord(record)) fail("cultivar health semantic input must be an object");
  const provenance = record.identity?.provenance;
  const screeningHistory = provenance?.screeningHistory;
  const quarantineHistory = provenance?.quarantineHistory;
  const declaredSubjects = provenance?.healthSubjects;
  const currentDisposition = provenance?.currentHealthDisposition;
  if (
    !Array.isArray(screeningHistory) ||
    !Array.isArray(quarantineHistory) ||
    !Array.isArray(declaredSubjects) ||
    !isRecord(currentDisposition)
  ) {
    fail("cultivar health semantics require histories, subjects, and a current disposition");
  }
  const declaredKeys = new Set();
  for (const subject of declaredSubjects) {
    const key = cultivarHealthKey(subject.scope, subject.target);
    if (declaredKeys.has(key)) fail("cultivar health subjects repeat a scope and target");
    declaredKeys.add(key);
  }
  const sourceNodeIds = new Set((record.sources ?? []).map((source) => source.nodeId));
  const screeningById = new Map();
  const correctionSuccessors = new Map();
  const supersededIds = new Set();
  for (const event of screeningHistory) {
    if (screeningById.has(event.eventId)) {
      fail(`cultivar screening history repeats eventId ${event.eventId}`);
    }
    const key = cultivarHealthKey(event.scope, event.target);
    if (!declaredKeys.has(key)) {
      fail(`screening event ${event.eventId} uses an undeclared subject scope or target`);
    }
    for (const sourceLink of event.sourceLinks ?? []) {
      if (!sourceNodeIds.has(sourceLink.sourceId)) {
        fail(`screening event ${event.eventId} references a missing source`);
      }
    }
    const recordedOn = requireValidTimestamp(event.recordedOn, `${event.eventId} recordedOn`);
    if (event.collectedOn !== null && event.resultedOn !== null) {
      const collectedOn = requireValidTimestamp(
        `${event.collectedOn}T00:00:00Z`,
        `${event.eventId} collectedOn`,
      );
      const resultedOn = requireValidTimestamp(
        `${event.resultedOn}T00:00:00Z`,
        `${event.eventId} resultedOn`,
      );
      if (collectedOn > resultedOn || resultedOn > recordedOn) {
        fail(`screening event ${event.eventId} has impossible collection/result chronology`);
      }
    }
    const references = [
      ...(event.supersedesEventId ? [event.supersedesEventId] : []),
      ...(event.retestOfEventIds ?? []),
    ];
    for (const referencedId of references) {
      const prior = screeningById.get(referencedId);
      if (
        referencedId === event.eventId ||
        !prior ||
        cultivarHealthKey(prior.scope, prior.target) !== key
      ) {
        fail(`screening event ${event.eventId} has an invalid prior-event reference`);
      }
    }
    if (event.supersedesEventId) {
      if (correctionSuccessors.has(event.supersedesEventId)) {
        fail(`screening event ${event.supersedesEventId} has multiple direct corrections`);
      }
      correctionSuccessors.set(event.supersedesEventId, event.eventId);
      supersededIds.add(event.supersedesEventId);
    }
    screeningById.set(event.eventId, event);
  }

  const quarantineIds = new Set();
  const episodeStates = new Map();
  for (const event of quarantineHistory) {
    if (quarantineIds.has(event.eventId)) {
      fail(`cultivar quarantine history repeats eventId ${event.eventId}`);
    }
    quarantineIds.add(event.eventId);
    const key = cultivarHealthKey(event.scope, event.target);
    if (!declaredKeys.has(key)) {
      fail(`quarantine event ${event.eventId} uses an undeclared subject scope or target`);
    }
    for (const sourceLink of event.sourceLinks ?? []) {
      if (!sourceNodeIds.has(sourceLink.sourceId)) {
        fail(`quarantine event ${event.eventId} references a missing source`);
      }
    }
    const occurredOn = requireValidTimestamp(event.occurredOn, `${event.eventId} occurredOn`);
    const priorState = episodeStates.get(event.episodeId);
    if (!priorState) {
      if (event.action !== "open") {
        fail(`quarantine episode ${event.episodeId} must begin with open`);
      }
    } else {
      if (priorState.key !== key || occurredOn < priorState.occurredOn) {
        fail(`quarantine episode ${event.episodeId} changed scope/target or chronology`);
      }
      const mayClose =
        priorState.state === "open" && ["release", "dispose", "override"].includes(event.action);
      const mayReopen = priorState.state !== "open" && event.action === "reopen";
      if (!mayClose && !mayReopen) {
        fail(`quarantine episode ${event.episodeId} has an illegal transition`);
      }
    }
    for (const screeningEventId of event.screeningEventIds ?? []) {
      const screening = screeningById.get(screeningEventId);
      if (!screening || cultivarHealthKey(screening.scope, screening.target) !== key) {
        fail(`quarantine event ${event.eventId} references mismatched screening evidence`);
      }
    }
    if (event.action === "release") {
      const latestOpen = priorState?.lastOpenAt;
      const referenced = event.screeningEventIds.map((eventId) => screeningById.get(eventId));
      for (const screening of referenced) {
        const recordedOn = requireValidTimestamp(
          screening.recordedOn,
          `${screening.eventId} recordedOn`,
        );
        if (recordedOn > occurredOn) {
          fail(
            `quarantine release ${event.eventId} relies on evidence that was not recorded before release`,
          );
        }
      }
      const negatives = referenced.filter(
        (screening) => screening.result === "negative" && !supersededIds.has(screening.eventId),
      );
      if (negatives.length === 0 || latestOpen === undefined) {
        fail(`quarantine release ${event.eventId} lacks a current scoped negative`);
      }
      for (const negative of negatives) {
        const collectedOn = requireValidTimestamp(
          `${negative.collectedOn}T23:59:59Z`,
          `${negative.eventId} collectedOn`,
        );
        if (collectedOn < latestOpen) {
          fail(`quarantine release ${event.eventId} relies on pre-quarantine evidence`);
        }
      }
      const latestNegativeTime = Math.max(
        ...negatives.map((entry) => screeningEvidenceTime(entry)),
      );
      const contradiction = screeningHistory.find(
        (screening) =>
          !supersededIds.has(screening.eventId) &&
          cultivarHealthKey(screening.scope, screening.target) === key &&
          screening.result !== "negative" &&
          requireValidTimestamp(screening.recordedOn, `${screening.eventId} recordedOn`) <=
            occurredOn &&
          screeningEvidenceTime(screening) >= latestNegativeTime,
      );
      if (contradiction) {
        fail(`quarantine release ${event.eventId} is blocked by contradictory evidence`);
      }
    }
    const nextState = quarantineStateForAction(event.action);
    episodeStates.set(event.episodeId, {
      key,
      state: nextState,
      occurredOn,
      lastOpenAt:
        event.action === "open" || event.action === "reopen" ? occurredOn : priorState?.lastOpenAt,
    });
  }

  if (currentDisposition.methodId !== "method:genetics-health-disposition:v1") {
    fail("cultivar current health disposition must use the canonical derivation method");
  }
  const expectedSubjects = deriveCultivarHealthDisposition(record);
  if (canonicalJson(currentDisposition.subjects) !== canonicalJson(expectedSubjects)) {
    fail("cultivar current health disposition has drifted from its immutable histories");
  }
  return {
    status: "pass",
    screeningEventCount: screeningHistory.length,
    quarantineEventCount: quarantineHistory.length,
    subjectCount: expectedSubjects.length,
  };
}

export function validateCultivarHistoryAppendOnly(previousRecord, currentRecord) {
  const previous = previousRecord?.identity?.provenance;
  const current = currentRecord?.identity?.provenance;
  if (!isRecord(previous) || !isRecord(current)) {
    fail("cultivar append-only comparison requires both provenance records");
  }
  let appendedCount = 0;
  for (const field of ["screeningHistory", "quarantineHistory"]) {
    const previousHistory = previous[field];
    const currentHistory = current[field];
    if (!Array.isArray(previousHistory) || !Array.isArray(currentHistory)) {
      fail(`cultivar append-only comparison requires ${field}`);
    }
    if (currentHistory.length < previousHistory.length) {
      fail(`cultivar ${field} cannot delete prior events`);
    }
    for (let index = 0; index < previousHistory.length; index += 1) {
      if (
        previousHistory[index]?.eventId !== currentHistory[index]?.eventId ||
        canonicalJson(previousHistory[index]) !== canonicalJson(currentHistory[index])
      ) {
        fail(`cultivar ${field} must preserve prior events semantically and in order`);
      }
    }
    appendedCount += currentHistory.length - previousHistory.length;
  }
  return { status: "pass", appendedCount };
}

export function resolvePointer(document, pointer, sourceName) {
  if (pointer === "") return document;
  if (!pointer.startsWith("/")) fail(`${sourceName} uses unsupported JSON pointer #${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((value, part) => {
      if (value === undefined || value === null || !(part in value)) {
        fail(`${sourceName} references missing JSON pointer #${pointer}`);
      }
      return value[part];
    }, document);
}

export function loadSchemaDocuments(schemaDir = DEFAULT_SCHEMA_DIR) {
  const files = readdirSync(schemaDir)
    .filter((fileName) => fileName.endsWith(".schema.json"))
    .sort();
  return new Map(
    files.map((fileName) => {
      const fullPath = path.join(schemaDir, fileName);
      return [fileName, JSON.parse(readFileSync(fullPath, "utf8"))];
    }),
  );
}

/**
 * Compile the complete local schema set with strict Draft 2020-12 semantics.
 *
 * All schemas are registered before any validator is requested so relative
 * cross-file references resolve against each document's canonical $id. The
 * returned validators can also be used by tests and future content tooling to
 * prove instance-level rules rather than merely inspecting schema syntax.
 */
export function compileSchemaDocuments(documents) {
  if (!(documents instanceof Map) || documents.size === 0) {
    fail("schema document map must not be empty");
  }

  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: false,
    strict: true,
    validateFormats: true,
  });
  addFormats(ajv);

  try {
    for (const schema of documents.values()) ajv.addSchema(schema);
  } catch (error) {
    fail(
      `strict Draft 2020-12 compilation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const validators = new Map();
  for (const [fileName, schema] of documents) {
    const validator = ajv.getSchema(schema.$id);
    if (typeof validator !== "function") {
      fail(`strict Draft 2020-12 compilation produced no validator for ${fileName}`);
    }
    validators.set(fileName, validator);
  }

  return { ajv, validators };
}

function isConditionalPointer(pointer) {
  return /\/(?:allOf|anyOf|oneOf|if|then|else)\//.test(pointer);
}

function validateType(type, label) {
  const values = Array.isArray(type) ? type : [type];
  if (values.some((entry) => !JSON_SCHEMA_TYPES.has(entry))) {
    fail(`${label} declares an unsupported JSON Schema type`);
  }
  if (new Set(values).size !== values.length) fail(`${label} repeats a JSON Schema type`);
}

function deepHas(value, predicate) {
  if (predicate(value)) return true;
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((child) => deepHas(child, predicate));
}

function conditionalExists(schema, ifPredicate, thenPredicate) {
  return (
    Array.isArray(schema.allOf) &&
    schema.allOf.some(
      (entry) => isRecord(entry) && ifPredicate(entry.if) && thenPredicate(entry.then),
    )
  );
}

function hasPropertyConst(value, propertyName, expected) {
  return deepHas(
    value,
    (entry) => isRecord(entry?.[propertyName]) && entry[propertyName].const === expected,
  );
}

function hasPropertyEnum(value, propertyName, expectedValues) {
  return deepHas(value, (entry) => {
    const property = entry?.[propertyName];
    return (
      isRecord(property) && expectedValues.every((expected) => property.enum?.includes(expected))
    );
  });
}

function hasPropertyConstraint(value, propertyName, predicate) {
  return deepHas(
    value,
    (entry) => isRecord(entry?.[propertyName]) && predicate(entry[propertyName]),
  );
}

function schemaPropertyAt(value, propertyPath) {
  return propertyPath.reduce((current, propertyName) => current?.properties?.[propertyName], value);
}

function hasSchemaPropertyConst(value, propertyPath, expected) {
  return schemaPropertyAt(value, propertyPath)?.const === expected;
}

function hasSchemaPropertyEnum(value, propertyPath, expectedValues) {
  const actual = schemaPropertyAt(value, propertyPath)?.enum;
  return Array.isArray(actual) && sameSet(actual, expectedValues);
}

function collectSchemaPropertyConsts(value, propertyName, output = []) {
  if (!value || typeof value !== "object") return output;
  if (isRecord(value.properties?.[propertyName]) && "const" in value.properties[propertyName]) {
    output.push(value.properties[propertyName].const);
  }
  for (const child of Object.values(value)) {
    collectSchemaPropertyConsts(child, propertyName, output);
  }
  return output;
}

function validateGenericSchemaShape(fileName, schema, documents) {
  const expectedId = `https://verdantgrowdiary.com/schemas/knowledge/${fileName}`;
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    fail(`${fileName} must use JSON Schema 2020-12`);
  }
  if (schema.$id !== expectedId) fail(`${fileName} must use canonical $id ${expectedId}`);

  const walk = (value, pointer = "#") => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${pointer}/${index}`));
      return;
    }

    if (value.type !== undefined) validateType(value.type, `${fileName}${pointer}`);

    const declaredTypes = Array.isArray(value.type) ? value.type : [value.type];
    const usesObjectKeywords = isRecord(value.properties) || value.required !== undefined;
    if (usesObjectKeywords && !declaredTypes.includes("object")) {
      fail(`${fileName}${pointer} uses object keywords without explicit object type`);
    }
    const usesArrayKeywords = ["items", "contains", "minItems", "maxItems", "uniqueItems"].some(
      (keyword) => keyword in value,
    );
    if (usesArrayKeywords && !declaredTypes.includes("array")) {
      fail(`${fileName}${pointer} uses array keywords without explicit array type`);
    }

    if (Array.isArray(value.enum)) {
      if (value.enum.length === 0) fail(`${fileName}${pointer} declares an empty enum`);
      if (new Set(value.enum.map((entry) => JSON.stringify(entry))).size !== value.enum.length) {
        fail(`${fileName}${pointer} repeats an enum value`);
      }
    }

    if (value.required !== undefined) {
      if (!Array.isArray(value.required) || value.required.length === 0) {
        fail(`${fileName}${pointer} must use a non-empty required array`);
      }
      if (new Set(value.required).size !== value.required.length) {
        fail(`${fileName}${pointer} repeats a required key`);
      }
      if (!isRecord(value.properties)) {
        fail(`${fileName}${pointer} declares required keys without properties`);
      }
      for (const requiredKey of value.required) {
        if (typeof requiredKey !== "string" || !(requiredKey in value.properties)) {
          fail(`${fileName}${pointer} requires missing property ${requiredKey}`);
        }
      }
    }

    const objectTyped =
      value.type === "object" || (Array.isArray(value.type) && value.type.includes("object"));
    if (
      objectTyped &&
      isRecord(value.properties) &&
      !isConditionalPointer(pointer) &&
      value.additionalProperties !== false
    ) {
      fail(`${fileName}${pointer} must set additionalProperties to false`);
    }

    if (value.if !== undefined && value.then === undefined && value.else === undefined) {
      fail(`${fileName}${pointer} declares if without then or else`);
    }

    if (typeof value.$ref === "string") {
      const [targetName, targetPointer = ""] = value.$ref.split("#", 2);
      if (
        /^[a-z]+:/i.test(targetName) ||
        targetName.includes("..") ||
        path.isAbsolute(targetName)
      ) {
        fail(`${fileName}${pointer} must use a local, non-traversing $ref`);
      }
      const resolvedName = targetName || fileName;
      const targetPath = path.join(DEFAULT_SCHEMA_DIR, resolvedName);
      if (!existsSync(targetPath) && !documents.has(resolvedName)) {
        fail(`${fileName}${pointer} references missing schema ${resolvedName}`);
      }
      if (!documents.has(resolvedName)) {
        fail(`${fileName}${pointer} references unloaded schema ${resolvedName}`);
      }
      const target = resolvePointer(
        documents.get(resolvedName),
        targetPointer,
        `${fileName}${pointer}`,
      );
      if (!(typeof target === "boolean" || isRecord(target))) {
        fail(`${fileName}${pointer} reference target must be a schema object or boolean`);
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        ["properties", "$defs", "patternProperties", "dependentSchemas"].includes(key) &&
        isRecord(child)
      ) {
        for (const [schemaName, childSchema] of Object.entries(child)) {
          walk(childSchema, `${pointer}/${key}/${schemaName}`);
        }
      } else {
        walk(child, `${pointer}/${key}`);
      }
    }
  };

  walk(schema);
}

function validateCommonContract(common) {
  const defs = requireRecord(common.$defs, "common.schema.json#/$defs");
  const requiredDefs = [
    "nodeId",
    "nodeType",
    "pageOwningNodeType",
    "edgeType",
    "riskClass",
    "contentDomain",
    "riskDomain",
    "graphNode",
    "graphEdge",
    "pageGraph",
    "pageMetadata",
    "faqPageConsumerReceipt",
    "pageSeo",
    "originalAsset",
    "applicabilityDecision",
    "blockApplicability",
    "linkApplicability",
    "pageManifest",
    "source",
    "sourceLink",
    "claim",
    "personRef",
    "signoff",
    "notApplicableSignoff",
    "approvedOrNotApplicableSignoff",
    "r3SafetySignoff",
    "editorial",
    "pageSafetyReviewGate",
    "productAction",
    "nonProductNextStep",
    "conversion",
  ];
  for (const definitionName of requiredDefs) {
    if (!isRecord(defs[definitionName])) {
      fail(`common.schema.json must define $defs/${definitionName}`);
    }
  }

  requireExactEnum(defs.nodeType, REQUIRED_NODE_TYPES, "common nodeType");
  requireExactEnum(defs.pageOwningNodeType, REQUIRED_PAGE_OWNER_TYPES, "common pageOwningNodeType");
  requireExactEnum(defs.edgeType, REQUIRED_EDGE_TYPES, "common edgeType");
  requireExactEnum(defs.riskClass, REQUIRED_RISK_CLASSES, "common riskClass");
  requireExactEnum(defs.contentDomain, REQUIRED_CONTENT_DOMAINS, "common contentDomain");
  requireExactEnum(defs.riskDomain, REQUIRED_RISK_DOMAINS, "common riskDomain");
  requireKeys(
    defs.graphNode,
    ["id", "type", "label", "aliases", "status", "description"],
    "common graphNode",
  );
  requireKeys(
    defs.graphEdge,
    [
      "id",
      "type",
      "sourceId",
      "sourceType",
      "targetId",
      "targetType",
      "cardinality",
      "symmetric",
      "status",
      "effectiveFrom",
      "effectiveThrough",
      "provenance",
    ],
    "common graphEdge",
  );
  validateGraphEdgeSchemaContract(defs.graphEdge);
  requireKeys(
    defs.pageManifest,
    ["metadata", "graph", "seo", "originalAsset", "blockApplicability", "linkApplicability"],
    "common pageManifest",
  );
  requireKeys(
    defs.pageMetadata,
    [
      "schemaVersion",
      "id",
      "slug",
      "path",
      "pageType",
      "pageFamily",
      "pillarId",
      "contentDomains",
      "riskClass",
      "riskDomains",
      "canonicalIntent",
      "readerOutcome",
      "scope",
      "nonScope",
      "language",
      "aliases",
    ],
    "common pageMetadata",
  );
  requireContentMetadataContract(defs.pageMetadata, "common pageMetadata");
  requireRiskMetadataContract(defs.pageMetadata, "common pageMetadata");
  requireExactEnum(
    defs.pageMetadata.properties.pageType,
    REQUIRED_PAGE_TYPES,
    "common pageMetadata pageType",
  );
  requireExactEnum(
    defs.pageMetadata.properties.pageFamily,
    REQUIRED_PAGE_FAMILIES,
    "common pageMetadata pageFamily",
  );
  requireKeys(
    defs.pageGraph,
    [
      "node",
      "parentId",
      "prerequisiteIds",
      "lateralIds",
      "nextStepIds",
      "differentialIds",
      "edges",
    ],
    "common pageGraph",
  );
  requireNodeIdArrayContract(
    defs.pageGraph.properties.prerequisiteIds,
    "common pageGraph prerequisiteIds",
    0,
  );
  requireNodeIdArrayContract(
    defs.pageGraph.properties.lateralIds,
    "common pageGraph lateralIds",
    0,
  );
  requireNodeIdArrayContract(
    defs.pageGraph.properties.nextStepIds,
    "common pageGraph nextStepIds",
    1,
  );
  requireNodeIdArrayContract(
    defs.pageGraph.properties.differentialIds,
    "common pageGraph differentialIds",
    0,
  );
  if (
    !deepHas(
      defs.pageGraph.properties.node,
      (value) => value?.$ref === "#/$defs/pageOwningNodeType",
    )
  ) {
    fail("common pageGraph node must use the canonical page-owning node vocabulary");
  }
  requireKeys(
    defs.pageSeo,
    [
      "title",
      "h1",
      "description",
      "canonicalPath",
      "indexing",
      "breadcrumbNodeIds",
      "structuredDataTypes",
      "faqPageReceipt",
    ],
    "common pageSeo",
  );
  requireKeys(
    defs.faqPageConsumerReceipt,
    [
      "consumerName",
      "consumerPurpose",
      "consumerDocumentationSourceId",
      "documentationVerifiedOn",
      "contractVersion",
      "visibleQuestionIds",
      "googleRichResultExpected",
      "limitations",
    ],
    "common FAQPage consumer receipt",
  );
  if (defs.faqPageConsumerReceipt.properties.googleRichResultExpected?.const !== false) {
    fail("common FAQPage receipt must prohibit a Google rich-result expectation");
  }
  const faqReceiptGate = conditionalExists(
    defs.pageSeo,
    (value) =>
      hasPropertyConstraint(
        value,
        "structuredDataTypes",
        (property) => property.contains?.const === "FAQPage",
      ),
    (value) =>
      hasPropertyConstraint(
        value,
        "faqPageReceipt",
        (property) => property.$ref === "#/$defs/faqPageConsumerReceipt",
      ),
  );
  if (!faqReceiptGate) {
    fail("common pageSeo must require an alternate-consumer receipt for FAQPage");
  }
  requireKeys(
    defs.originalAsset,
    [
      "id",
      "kind",
      "title",
      "description",
      "creatorIds",
      "method",
      "license",
      "sourceUrl",
      "accessibilityDescription",
      "limitations",
    ],
    "common originalAsset",
  );
  requireKeys(
    defs.applicabilityDecision,
    ["status", "reason", "reviewerId", "reviewedOn"],
    "common applicabilityDecision",
  );
  requireExactEnum(
    defs.applicabilityDecision.properties.status,
    ["required", "not_applicable"],
    "common applicabilityDecision status",
  );
  requireRef(
    defs.applicabilityDecision.properties.reviewerId,
    "#/$defs/nodeId",
    "common applicabilityDecision reviewerId",
  );
  if (
    defs.applicabilityDecision.properties.reviewedOn?.type !== "string" ||
    defs.applicabilityDecision.properties.reviewedOn?.format !== "date"
  ) {
    fail("common applicabilityDecision reviewedOn must be a date");
  }
  if (
    !Array.isArray(defs.applicabilityDecision.oneOf) ||
    defs.applicabilityDecision.oneOf.length !== 2
  ) {
    fail("common applicabilityDecision must define required and not-applicable branches");
  }
  const applicabilityBranches = new Map(
    (defs.applicabilityDecision.oneOf ?? []).map((branch) => [
      branch?.properties?.status?.const,
      branch,
    ]),
  );
  if (!sameSet([...applicabilityBranches.keys()], ["required", "not_applicable"])) {
    fail("common applicabilityDecision must pin required and not_applicable statuses");
  }
  if (applicabilityBranches.get("required")?.properties?.reason?.type !== "null") {
    fail("common required block applicability must prohibit a reason");
  }
  const notApplicableBlockReason = applicabilityBranches.get("not_applicable")?.properties?.reason;
  if (notApplicableBlockReason?.type !== "string" || notApplicableBlockReason.minLength < 12) {
    fail("common not-applicable block applicability must require a recorded reason");
  }
  requireKeys(
    defs.blockApplicability,
    ["procedureOrComparison", "confoundersOrDifferentials", "stopAndFollowUp"],
    "common blockApplicability",
  );
  for (const blockName of [
    "procedureOrComparison",
    "confoundersOrDifferentials",
    "stopAndFollowUp",
  ]) {
    requireRef(
      defs.blockApplicability.properties[blockName],
      "#/$defs/applicabilityDecision",
      `common blockApplicability ${blockName}`,
    );
  }
  requireKeys(
    defs.linkApplicability,
    ["prerequisite", "contextualLateral", "differential"],
    "common linkApplicability",
  );
  for (const linkSlot of ["prerequisite", "contextualLateral", "differential"]) {
    requireRef(
      defs.linkApplicability.properties[linkSlot],
      "#/$defs/applicabilityDecision",
      `common linkApplicability ${linkSlot}`,
    );
  }
  const linkSlotGates = [
    ["prerequisite", "prerequisiteIds", 1],
    ["contextualLateral", "lateralIds", 2],
    ["differential", "differentialIds", 3],
  ];
  for (const [linkSlot, graphField, minimum] of linkSlotGates) {
    const gate = defs.pageManifest.allOf?.find((entry) =>
      hasSchemaPropertyConst(entry?.if, ["linkApplicability", linkSlot, "status"], "required"),
    );
    if (
      !gate ||
      schemaPropertyAt(gate.then, ["graph", graphField])?.type !== "array" ||
      schemaPropertyAt(gate.then, ["graph", graphField])?.minItems < minimum ||
      schemaPropertyAt(gate.else, ["graph", graphField])?.type !== "array" ||
      schemaPropertyAt(gate.else, ["graph", graphField])?.maxItems !== 0
    ) {
      fail(`common pageManifest must bind ${linkSlot} applicability to ${graphField} cardinality`);
    }
  }
  const diagnosticRequiresDifferentials = conditionalExists(
    defs.pageManifest,
    (value) => hasSchemaPropertyConst(value, ["metadata", "pageFamily"], "diagnostic"),
    (value) =>
      hasSchemaPropertyConst(value, ["linkApplicability", "differential", "status"], "required"),
  );
  if (!diagnosticRequiresDifferentials) {
    fail("common diagnostic page family must require the differential link slot");
  }
  const pillarProhibitsPrerequisites = conditionalExists(
    defs.pageManifest,
    (value) => hasSchemaPropertyConst(value, ["metadata", "pageFamily"], "pillar"),
    (value) =>
      hasSchemaPropertyConst(
        value,
        ["linkApplicability", "prerequisite", "status"],
        "not_applicable",
      ),
  );
  if (!pillarProhibitsPrerequisites) {
    fail("common pillar page family must mark the prerequisite link slot not applicable");
  }
  const instructionalFamiliesRequireLaterals = conditionalExists(
    defs.pageManifest,
    (value) =>
      hasSchemaPropertyEnum(
        value,
        ["metadata", "pageFamily"],
        REQUIRED_CONTEXTUAL_LATERAL_PAGE_FAMILIES,
      ),
    (value) =>
      hasSchemaPropertyConst(
        value,
        ["linkApplicability", "contextualLateral", "status"],
        "required",
      ),
  );
  if (!instructionalFamiliesRequireLaterals) {
    fail("common instructional page families must require contextual lateral links");
  }
  requireKeys(
    defs.source,
    [
      "id",
      "nodeId",
      "title",
      "url",
      "publisher",
      "authorIds",
      "evidenceTier",
      "publishedOn",
      "versionDate",
      "accessedOn",
      "stableIdentifier",
      "archiveLocator",
      "limitations",
      "license",
    ],
    "common source",
  );
  requireKeys(defs.sourceLink, ["sourceId", "roles", "locator"], "common sourceLink");
  requireExactEnum(
    defs.sourceLink.properties.roles.items,
    REQUIRED_SOURCE_LINK_ROLES,
    "common sourceLink roles",
  );
  requireKeys(
    defs.claim,
    [
      "id",
      "nodeId",
      "section",
      "claimType",
      "text",
      "wordingState",
      "evidenceState",
      "riskClass",
      "riskDomains",
      "sourceLinks",
      "methodIds",
      "observationIds",
      "applicability",
      "limitations",
      "authorId",
      "evidenceReviewerIds",
      "cultivationReviewerIds",
      "approvalDecision",
      "approvedOn",
      "invalidationTriggers",
      "nextReviewOn",
    ],
    "common claim",
  );
  requireRiskMetadataContract(defs.claim, "common claim");
  requireExactEnum(defs.claim.properties.claimType, REQUIRED_CLAIM_TYPES, "common claimType");
  requireRef(
    defs.claim.properties.sourceLinks.items,
    "#/$defs/sourceLink",
    "common claim sourceLinks items",
  );
  const approvedClaimGate = conditionalExists(
    defs.claim,
    (value) => hasPropertyConst(value, "approvalDecision", "approved"),
    (value) =>
      hasPropertyConst(value, "wordingState", "approved") &&
      hasPropertyConstraint(value, "approvedOn", (property) => property.type === "string") &&
      hasPropertyConstraint(value, "evidenceReviewerIds", (property) => property.minItems >= 1) &&
      hasPropertyConstraint(value, "cultivationReviewerIds", (property) => property.minItems >= 1),
  );
  if (!approvedClaimGate) {
    fail("common approved claims must pin wording, date, and evidence/cultivation reviewers");
  }
  requireKeys(
    defs.personRef,
    [
      "nodeId",
      "profileSubjectId",
      "displayName",
      "roleSummary",
      "experienceStatement",
      "credentials",
      "profilePath",
    ],
    "common personRef",
  );
  requireKeys(
    defs.signoff,
    ["reviewer", "role", "decision", "reviewedOn", "notes", "conflictsReviewed", "skipReason"],
    "common signoff",
  );
  requireExactEnum(
    defs.signoff.properties.decision,
    ["pending", "approved", "changes_requested", "blocked", "not_applicable"],
    "common signoff decision",
  );
  const notApplicableReasonGate = conditionalExists(
    defs.signoff,
    (value) => hasPropertyConst(value, "decision", "not_applicable"),
    (value) =>
      hasPropertyConstraint(
        value,
        "skipReason",
        (property) => property.type === "string" && property.minLength >= 12,
      ),
  );
  if (!notApplicableReasonGate) {
    fail("common not-applicable signoffs must require a recorded reason");
  }
  requireKeys(
    defs.editorial,
    [
      "status",
      "managingEditor",
      "author",
      "maintainer",
      "signoffs",
      "publishedOn",
      "modifiedOn",
      "nextReviewOn",
      "reviewIntervalDays",
      "updateTriggers",
      "changeHistory",
      "conflictsOfInterest",
      "corrections",
      "correctionPath",
    ],
    "common editorial",
  );
  requireExactEnum(
    defs.editorial.properties.status,
    REQUIRED_EDITORIAL_STATES,
    "common editorial status",
  );
  requireKeys(
    defs.editorial.properties.signoffs,
    ["cultivation", "evidence", "productTruth", "copyAccessibility", "seoTechnical", "safety"],
    "common editorial signoffs",
  );
  const signoffRoleBySlot = {
    cultivation: "cultivation",
    evidence: "evidence",
    productTruth: "product_truth",
    copyAccessibility: "copy_accessibility",
    seoTechnical: "seo_technical",
    safety: "safety",
  };
  for (const [slot, role] of Object.entries(signoffRoleBySlot)) {
    const slotSchema = defs.editorial.properties.signoffs.properties?.[slot];
    if (
      !deepHas(slotSchema, (value) => value?.$ref === "#/$defs/nullableSignoff") ||
      !deepHas(slotSchema, (value) => value?.role?.const === role)
    ) {
      fail(`common editorial ${slot} signoff slot must require role ${role}`);
    }
  }
  const publishedApprovalGate = conditionalExists(
    defs.editorial,
    (value) => hasPropertyEnum(value, "status", ["published", "monitored", "refresh_due"]),
    (value) => {
      const encoded = JSON.stringify(value);
      return (
        ["cultivation", "evidence", "productTruth", "copyAccessibility", "seoTechnical"].every(
          (role) => encoded.includes(`\"${role}\"`),
        ) &&
        (encoded.match(/approvedSignoff/g) ?? []).length >= 5 &&
        encoded.includes("approvedOrNotApplicableSignoff")
      );
    },
  );
  if (!publishedApprovalGate) {
    fail("common editorial must require approved publication signoffs with bounded safety N/A");
  }
  if (
    !deepHas(defs.pageSafetyReviewGate, (value) => value?.riskClass?.const === "R3") ||
    !deepHas(
      defs.pageSafetyReviewGate,
      (value) => value?.safety?.$ref === "#/$defs/r3SafetySignoff",
    )
  ) {
    fail("common page safety gate must prohibit not-applicable safety review for R3 pages");
  }
  requireKeys(
    defs.productAction,
    ["nodeId", "label", "path", "truthStatement"],
    "common productAction",
  );
  requireKeys(
    defs.conversion,
    ["mode", "productAction", "nonProductNextStep"],
    "common conversion",
  );
  requireRef(
    defs.conversion.properties.nonProductNextStep,
    "#/$defs/nonProductNextStep",
    "common conversion nonProductNextStep",
  );
  const nonProductReason = defs.conversion.properties.nonProductReason;
  if (
    !isRecord(nonProductReason) ||
    nonProductReason.type !== "string" ||
    nonProductReason.minLength < 1
  ) {
    fail("common conversion must allow an optional clear nonProductReason");
  }
  requireExactEnum(
    defs.conversion.properties.mode,
    ["product_action", "non_product_only", "safety_only"],
    "common conversion mode",
  );
  if (!Array.isArray(defs.conversion.oneOf) || defs.conversion.oneOf.length !== 3) {
    fail("common conversion must define product-action, non-product, and safety-only branches");
  }
  const conversionModes = defs.conversion.oneOf.map((branch) => branch?.properties?.mode?.const);
  if (!sameSet(conversionModes, ["product_action", "non_product_only", "safety_only"])) {
    fail(
      "common conversion branches must pin product_action, non_product_only, and safety_only modes",
    );
  }
  const nonProductBranch = defs.conversion.oneOf.find(
    (branch) => branch?.properties?.mode?.const === "non_product_only",
  );
  if (
    nonProductBranch?.properties?.productAction?.type !== "null" ||
    nonProductBranch?.required?.includes("nonProductReason")
  ) {
    fail(
      "common non-product conversion must prohibit a product action and keep its reason optional",
    );
  }
  const productBranch = defs.conversion.oneOf.find(
    (branch) => branch?.properties?.mode?.const === "product_action",
  );
  if (productBranch?.properties?.productAction?.$ref !== "#/$defs/productAction") {
    fail("common product-action conversion must require the canonical product action");
  }
  const safetyBranch = defs.conversion.oneOf.find(
    (branch) => branch?.properties?.mode?.const === "safety_only",
  );
  if (
    safetyBranch?.properties?.productAction?.type !== "null" ||
    !safetyBranch.required?.includes("safetyReason") ||
    safetyBranch?.properties?.safetyReason?.type !== "string"
  ) {
    fail("common safety-only conversion must require a reason and prohibit a product action");
  }
}

function validateTemplateWiring(fileName, schema) {
  const contract = TEMPLATE_CONTRACTS[fileName];
  requireKeys(schema, ["pageManifest", "claims", "sources", "editorial", "conversion"], fileName);
  requireRef(
    schema.properties.pageManifest,
    "common.schema.json#/$defs/pageManifest",
    `${fileName} pageManifest`,
  );
  requireRef(
    schema.properties.editorial,
    "common.schema.json#/$defs/editorial",
    `${fileName} editorial`,
  );
  requireRef(
    schema.properties.conversion,
    "common.schema.json#/$defs/conversion",
    `${fileName} conversion`,
  );
  const hasPageTypePin = deepHas(
    schema.allOf,
    (value) => value?.pageType?.const === contract.pageType,
  );
  const hasPageFamilyPin = deepHas(
    schema.allOf,
    (value) => value?.pageFamily?.const === contract.pageFamily,
  );
  const hasNodeTypePin = deepHas(schema.allOf, (value) => value?.type?.const === contract.nodeType);
  if (!hasPageTypePin || !hasPageFamilyPin || !hasNodeTypePin) {
    fail(
      `${fileName} must pin pageType=${contract.pageType}, pageFamily=${contract.pageFamily}, and nodeType=${contract.nodeType}`,
    );
  }
  if (
    !Array.isArray(schema.allOf) ||
    !schema.allOf.some((entry) => entry?.$ref === "common.schema.json#/$defs/pageSafetyReviewGate")
  ) {
    fail(`${fileName} must apply the common page safety review gate`);
  }
}

function hasExactVpdTruthPair(thenSchema, derivedBasis) {
  if (!Array.isArray(thenSchema?.oneOf) || thenSchema.oneOf.length !== 2) return false;
  const pairs = thenSchema.oneOf.map((branch) => [
    branch?.properties?.directOrDerived?.const,
    branch?.properties?.vpdBasis?.const,
  ]);
  return (
    pairs.some(
      ([derivationKind, basis]) => derivationKind === "derived" && basis === derivedBasis,
    ) &&
    pairs.some(
      ([derivationKind, basis]) => derivationKind === "vendor_derived" && basis === "vendor",
    )
  );
}

function validateSensorConditionals(schema) {
  const measurements = schema.properties?.measurements;
  const measurement = measurements?.items;
  const allowedSources = schema.properties?.truthModel?.properties?.allowedSources;
  const defs = schema.$defs;
  if (
    !isRecord(measurements) ||
    measurements.type !== "array" ||
    measurements.minItems < 1 ||
    !isRecord(measurement) ||
    measurement.type !== "object" ||
    schema.properties?.measurement !== undefined
  ) {
    fail("sensor schema must model truth per metric in a nonempty measurements array");
  }
  if (
    !isRecord(allowedSources) ||
    allowedSources.type !== "array" ||
    !sameSet(allowedSources.const, CANONICAL_SENSOR_SOURCES)
  ) {
    fail("sensor truth model must explicitly type and pin the canonical source vocabulary");
  }
  requireKeys(
    schema,
    [
      "deviceIdentity",
      "measurements",
      "placement",
      "calibration",
      "transport",
      "capabilities",
      "truthModel",
    ],
    "sensor schema",
  );
  for (const definitionName of [
    "metricContract",
    "derivationInput",
    "derivationRecord",
    "highRhCheck",
    "leafTemperatureBasis",
    "verificationResult",
    "verificationRecord",
  ]) {
    if (!isRecord(defs?.[definitionName])) {
      fail(`sensor schema must define $defs/${definitionName}`);
    }
  }

  const tupleBranches = defs.metricContract.oneOf;
  if (!Array.isArray(tupleBranches) || tupleBranches.length !== 12) {
    fail("sensor metric contract must define exactly 12 canonical tuples");
  }
  const tupleMap = new Map(
    tupleBranches.map((branch) => [
      branch?.properties?.metricKey?.const,
      {
        metricId: branch?.properties?.metricId?.const,
        unitId: branch?.properties?.unitId?.const,
      },
    ]),
  );
  if (
    tupleMap.size !== Object.keys(SENSOR_METRIC_CONTRACTS).length ||
    Object.entries(SENSOR_METRIC_CONTRACTS).some(
      ([metricKey, contract]) =>
        tupleMap.get(metricKey)?.metricId !== contract.metricId ||
        tupleMap.get(metricKey)?.unitId !== contract.unitId,
    )
  ) {
    fail("sensor metric contract must pin every metric key to its canonical metric and unit IDs");
  }
  if (!measurement.allOf?.some((entry) => entry.$ref === "#/$defs/metricContract")) {
    fail("sensor measurement items must apply the canonical metric contract");
  }

  requireKeys(
    measurement,
    [
      "metricId",
      "metricKey",
      "directOrDerived",
      "vpdBasis",
      "unitId",
      "authorityStatus",
      "derivation",
    ],
    "sensor measurement item",
  );
  requireKeys(
    defs.derivationInput,
    [
      "metricId",
      "unitId",
      "observationId",
      "capturedAt",
      "source",
      "qualityState",
      "freshnessAgeSeconds",
      "visibility",
    ],
    "sensor derivation input",
  );
  requireExactEnum(
    defs.derivationInput.properties.source,
    CANONICAL_SENSOR_SOURCES,
    "sensor derivation input source",
  );
  requireKeys(
    defs.derivationRecord,
    [
      "methodId",
      "formulaVersion",
      "formulaExpression",
      "computedAt",
      "maxInputAgeSeconds",
      "maxTimestampSkewSeconds",
      "inputs",
      "inputQualityRequirements",
      "uncertaintyStatement",
      "vendorMethodSourceId",
      "limitations",
    ],
    "sensor derivation record",
  );
  if (
    defs.derivationRecord.properties.inputs?.minItems < 2 ||
    defs.derivationRecord.properties.inputs?.items?.$ref !== "#/$defs/derivationInput"
  ) {
    fail("sensor derivation must require structured, timestamped inputs");
  }

  const directGate = measurement.allOf.find((entry) =>
    hasSchemaPropertyConst(entry.if, ["directOrDerived"], "direct"),
  );
  const derivedGate = measurement.allOf.find((entry) =>
    hasSchemaPropertyConst(entry.if, ["directOrDerived"], "derived"),
  );
  const vendorGate = measurement.allOf.find((entry) =>
    hasSchemaPropertyConst(entry.if, ["directOrDerived"], "vendor_derived"),
  );
  if (schemaPropertyAt(directGate?.then, ["derivation"])?.type !== "null") {
    fail("sensor schema must prohibit derivation evidence on direct measurements");
  }
  if (
    !deepHas(derivedGate?.then, (value) => value?.$ref === "#/$defs/derivationRecord") ||
    !hasPropertyConstraint(
      derivedGate?.then,
      "vendorMethodSourceId",
      (property) => property.type === "null",
    ) ||
    !hasPropertyConstraint(
      derivedGate?.then,
      "formulaExpression",
      (property) => property.type === "string" && property.minLength >= 8,
    )
  ) {
    fail("sensor internal derivation must require a formula and prohibit vendor-method evidence");
  }
  if (
    !deepHas(vendorGate?.then, (value) => value?.$ref === "#/$defs/derivationRecord") ||
    !hasPropertyConstraint(
      vendorGate?.then,
      "vendorMethodSourceId",
      (property) => property.$ref === "common.schema.json#/$defs/nodeId",
    )
  ) {
    fail("sensor vendor derivation must require vendor-method evidence");
  }

  const vpdGate = measurement.allOf.find((entry) =>
    hasSchemaPropertyEnum(entry.if, ["metricKey"], ["vpd_kpa", "leaf_vpd_kpa"]),
  );
  if (
    !hasPropertyEnum(vpdGate?.then, "directOrDerived", ["derived", "vendor_derived"]) ||
    hasPropertyEnum(vpdGate?.then, "directOrDerived", ["direct"])
  ) {
    fail("sensor schema must prohibit direct VPD");
  }
  const airVpdGate = measurement.allOf.find((entry) =>
    hasSchemaPropertyConst(entry.if, ["metricKey"], "vpd_kpa"),
  );
  const leafVpdGate = measurement.allOf.find((entry) =>
    hasSchemaPropertyConst(entry.if, ["metricKey"], "leaf_vpd_kpa"),
  );
  if (!hasExactVpdTruthPair(airVpdGate?.then, "air")) {
    fail("sensor schema must pair air VPD derivation kind with its truthful basis");
  }
  if (!hasExactVpdTruthPair(leafVpdGate?.then, "leaf")) {
    fail("sensor schema must pair leaf VPD derivation kind with its truthful basis");
  }
  if (
    !sameSet(
      [
        ...new Set(
          collectSchemaPropertyConsts(airVpdGate?.then?.properties?.derivation, "metricId"),
        ),
      ],
      VPD_INPUT_METRIC_IDS.vpd_kpa,
    )
  ) {
    fail("sensor air VPD derivation must require air-temperature and RH inputs");
  }
  if (
    !sameSet(
      [
        ...new Set(
          collectSchemaPropertyConsts(leafVpdGate?.then?.properties?.derivation, "metricId"),
        ),
      ],
      VPD_INPUT_METRIC_IDS.leaf_vpd_kpa,
    )
  ) {
    fail("sensor leaf VPD derivation must require air-temperature, RH, and leaf inputs");
  }

  const highRhCheck = defs.highRhCheck;
  requireKeys(
    highRhCheck,
    [
      "verificationId",
      "targetRelativeHumidityPct",
      "methodId",
      "referenceInstrumentId",
      "checkedAt",
      "referenceRelativeHumidityPct",
      "deviceAsFoundRelativeHumidityPct",
      "asFoundDeviationPctPoints",
      "adjustmentPerformed",
      "deviceAsLeftRelativeHumidityPct",
      "asLeftDeviationPctPoints",
      "uncertaintyPctPoints",
      "acceptanceCriteria",
      "disposition",
      "limitations",
    ],
    "sensor high-RH check",
  );
  if (
    highRhCheck.properties.targetRelativeHumidityPct?.type !== "number" ||
    highRhCheck.properties.targetRelativeHumidityPct?.minimum !== 75 ||
    highRhCheck.properties.targetRelativeHumidityPct?.maximum !== 100
  ) {
    fail("sensor high-RH check must enforce a 75–100% RH checkpoint");
  }
  requireRef(
    highRhCheck.properties.methodId,
    "common.schema.json#/$defs/nodeId",
    "sensor high-RH check methodId",
  );
  requireRef(
    highRhCheck.properties.referenceInstrumentId,
    "common.schema.json#/$defs/nodeId",
    "sensor high-RH check referenceInstrumentId",
  );
  requireKeys(
    defs.leafTemperatureBasis,
    [
      "methodId",
      "referenceInstrumentId",
      "measuredAt",
      "airTemperatureC",
      "leafTemperatureC",
      "offsetC",
      "sampleCount",
      "samplingLocations",
      "lightState",
      "uncertaintyC",
      "applications",
      "evidenceSourceIds",
      "limitations",
    ],
    "sensor leaf-temperature basis",
  );
  requireKeys(
    defs.verificationRecord,
    [
      "verificationId",
      "verifiedAt",
      "nextDueOn",
      "methodId",
      "referenceInstrumentId",
      "results",
      "sourceIds",
      "reviewerId",
      "supersedesVerificationId",
      "limitations",
    ],
    "sensor verification record",
  );
  requireKeys(
    schema.properties.calibration,
    [
      "protocolId",
      "verificationStatus",
      "currentVerificationId",
      "verificationHistory",
      "highRhCheck",
      "leafTemperatureBasis",
      "intervalDays",
      "unverifiedPolicy",
    ],
    "sensor calibration",
  );
  requireKeys(
    schema.properties.deviceIdentity,
    [
      "sensorNodeId",
      "manufacturer",
      "model",
      "hardwareRevision",
      "firmwareVersion",
      "documentationVersion",
      "channelId",
      "channelLabel",
      "channelType",
      "protocolFieldNames",
      "manualSourceId",
    ],
    "sensor device identity",
  );
  requireKeys(
    schema.properties.transport,
    [
      "integrationId",
      "mode",
      "protocol",
      "status",
      "readOnly",
      "directDeviceControl",
      "verifiedOn",
      "verifiedVersions",
      "evidenceSourceIds",
      "credentialBoundary",
      "limitations",
    ],
    "sensor transport",
  );
  if (
    schema.properties.transport.properties.readOnly?.const !== true ||
    schema.properties.transport.properties.directDeviceControl?.const !== false
  ) {
    fail("sensor transport must remain read-only and prohibit device control");
  }
  const verifiedTransportGate = schema.properties.transport.allOf?.find((entry) =>
    hasSchemaPropertyConst(entry.if, ["status"], "verified_read_only"),
  );
  if (
    schemaPropertyAt(verifiedTransportGate?.then, ["mode"])?.const !== "read_only_live" ||
    schemaPropertyAt(verifiedTransportGate?.then, ["verifiedVersions"])?.minItems < 1 ||
    schemaPropertyAt(verifiedTransportGate?.then, ["evidenceSourceIds"])?.minItems < 1
  ) {
    fail("verified sensor transport must require dated, versioned read-only evidence");
  }
  const capabilityItem = schema.properties.capabilities?.items;
  requireKeys(
    capabilityItem,
    [
      "capabilityId",
      "owner",
      "status",
      "supportedMetricIds",
      "evidenceSourceIds",
      "readOnly",
      "verdantMayInvoke",
      "limitations",
    ],
    "sensor capability",
  );
  if (capabilityItem.properties.verdantMayInvoke?.const !== false) {
    fail("sensor capabilities must never grant Verdant device invocation");
  }
  const verdantCapabilityGate = capabilityItem.allOf?.find((entry) =>
    hasSchemaPropertyConst(entry.if, ["owner"], "verdant_integration"),
  );
  if (schemaPropertyAt(verdantCapabilityGate?.then, ["readOnly"])?.const !== true) {
    fail("Verdant-owned sensor capabilities must be explicitly read-only");
  }

  const highRhGate = schema.allOf?.find((entry) =>
    sameSet(entry?.if?.properties?.measurements?.contains?.properties?.metricKey?.enum, [
      "humidity_pct",
      "vpd_kpa",
      "leaf_vpd_kpa",
    ]),
  );
  if (
    schemaPropertyAt(highRhGate?.then, ["calibration", "highRhCheck"])?.$ref !==
    "#/$defs/highRhCheck"
  ) {
    fail("sensor humidity and VPD pages must require an actual high-RH check");
  }
  const anyVpdGate = schema.allOf?.find((entry) =>
    sameSet(entry?.if?.properties?.measurements?.contains?.properties?.metricKey?.enum, [
      "vpd_kpa",
      "leaf_vpd_kpa",
    ]),
  );
  if (
    schemaPropertyAt(anyVpdGate?.then, ["calibration", "verificationStatus"])?.const !==
      "current" ||
    schemaPropertyAt(anyVpdGate?.then, ["calibration", "leafTemperatureBasis"])?.$ref !==
      "#/$defs/leafTemperatureBasis"
  ) {
    fail("sensor VPD pages must require current verification and a structured leaf basis");
  }
  const airBasisGate = schema.allOf?.find(
    (entry) =>
      entry?.if?.properties?.measurements?.contains?.properties?.metricKey?.const === "vpd_kpa",
  );
  const leafBasisGate = schema.allOf?.find(
    (entry) =>
      entry?.if?.properties?.measurements?.contains?.properties?.metricKey?.const ===
      "leaf_vpd_kpa",
  );
  if (
    schemaPropertyAt(airBasisGate?.then, ["calibration", "leafTemperatureBasis", "applications"])
      ?.contains?.const !== "context_only_for_air_vpd"
  ) {
    fail("sensor air VPD must disclose a measured leaf-temperature context");
  }
  if (
    schemaPropertyAt(leafBasisGate?.then, ["calibration", "leafTemperatureBasis", "applications"])
      ?.contains?.const !== "formula_input_for_leaf_vpd"
  ) {
    fail("sensor leaf VPD must use measured leaf temperature as a formula input");
  }
}

function validateEquipmentConditional(schema) {
  const verifiedRequiresEvidence = conditionalExists(
    schema,
    (value) => hasPropertyConst(value, "status", "verified"),
    (value) =>
      hasPropertyConstraint(value, "verifiedOn", (property) => property.type === "string") &&
      hasPropertyConstraint(value, "verifiedVersions", (property) => property.minItems >= 1) &&
      hasPropertyConstraint(value, "evidenceSourceIds", (property) => property.minItems >= 1),
  );
  if (!verifiedRequiresEvidence) {
    fail("equipment schema must require dated, versioned evidence for verified compatibility");
  }

  const allowedSources = schema.properties?.verdantDataPath?.properties?.allowedSources;
  if (
    !isRecord(allowedSources) ||
    allowedSources.const !== undefined ||
    allowedSources.type !== "array" ||
    allowedSources.minItems !== 1 ||
    allowedSources.uniqueItems !== true ||
    !sameSet(allowedSources.items?.enum, CANONICAL_SENSOR_SOURCES)
  ) {
    fail(
      "equipment allowedSources must be a nonempty unique subset of the canonical source vocabulary",
    );
  }
}

function validateCultivarContract(schema) {
  const identity = schema.properties?.identity;
  requireKeys(
    identity,
    ["cultivarNodeId", "lineageClaimIds", "verificationStatus", "provenance"],
    "cultivar identity",
  );
  requireKeys(
    identity.properties.provenance,
    [
      "materialType",
      "sourceName",
      "acquiredOn",
      "accessionId",
      "seedLotId",
      "motherId",
      "cloneBatchId",
      "generation",
      "phenotypeIds",
      "evidenceSourceIds",
      "healthSubjects",
      "screeningHistory",
      "quarantineHistory",
      "currentHealthDisposition",
      "unknowns",
    ],
    "cultivar provenance",
  );
  if (
    identity.properties.provenance.properties.quarantineStatus !== undefined ||
    identity.properties.provenance.properties.pathogenScreening !== undefined
  ) {
    fail("cultivar provenance must not retain mutable quarantine or pathogen status fields");
  }
  const verifiedRequiresProvenance = conditionalExists(
    schema,
    (value) => hasPropertyConst(value, "verificationStatus", "verified"),
    (value) =>
      hasPropertyConstraint(value, "lineageClaimIds", (property) => property.minItems >= 1) &&
      hasPropertyConstraint(value, "evidenceSourceIds", (property) => property.minItems >= 1),
  );
  if (!verifiedRequiresProvenance) {
    fail("cultivar schema must require lineage and provenance evidence when verified");
  }
  for (const definitionName of [
    "subjectScope",
    "screeningEvent",
    "quarantineEvent",
    "healthSubject",
    "healthDispositionSubject",
  ]) {
    if (!isRecord(schema.$defs?.[definitionName])) {
      fail(`cultivar schema must define $defs/${definitionName}`);
    }
  }
  requireKeys(
    schema.$defs.subjectScope,
    ["subjectType", "accessionId", "batchId", "plantId"],
    "cultivar subject scope",
  );
  requireKeys(
    schema.$defs.screeningEvent,
    [
      "eventId",
      "scope",
      "sampleId",
      "target",
      "result",
      "collectedOn",
      "resultedOn",
      "recordedOn",
      "methodId",
      "sourceLinks",
      "supersedesEventId",
      "retestOfEventIds",
      "correctionReason",
      "limitations",
    ],
    "cultivar screening event",
  );
  const definitiveGate = schema.$defs.screeningEvent.allOf?.find((entry) =>
    sameSet(entry?.if?.properties?.result?.enum, ["positive", "negative", "inconclusive"]),
  );
  if (
    schemaPropertyAt(definitiveGate?.then, ["sampleId"])?.type !== "string" ||
    schemaPropertyAt(definitiveGate?.then, ["collectedOn"])?.type !== "string" ||
    schemaPropertyAt(definitiveGate?.then, ["resultedOn"])?.type !== "string" ||
    schemaPropertyAt(definitiveGate?.then, ["methodId"])?.$ref !==
      "common.schema.json#/$defs/nodeId" ||
    schemaPropertyAt(definitiveGate?.then, ["sourceLinks"])?.minItems < 1
  ) {
    fail("cultivar definitive screening results must require sample, dates, method, and source");
  }
  const correctionGate = schema.$defs.screeningEvent.allOf?.find(
    (entry) =>
      entry?.if?.properties?.supersedesEventId?.$ref === "common.schema.json#/$defs/nodeId",
  );
  if (
    schemaPropertyAt(correctionGate?.then, ["correctionReason"])?.type !== "string" ||
    schemaPropertyAt(correctionGate?.then, ["correctionReason"])?.minLength < 12
  ) {
    fail("cultivar screening corrections must record a substantive reason");
  }
  requireKeys(
    schema.$defs.quarantineEvent,
    [
      "eventId",
      "episodeId",
      "scope",
      "target",
      "action",
      "occurredOn",
      "reason",
      "screeningEventIds",
      "isOverride",
      "recordedBy",
      "sourceLinks",
      "limitations",
    ],
    "cultivar quarantine event",
  );
  const releaseGate = schema.$defs.quarantineEvent.allOf?.find((entry) =>
    hasSchemaPropertyConst(entry.if, ["action"], "release"),
  );
  const overrideGate = schema.$defs.quarantineEvent.allOf?.find((entry) =>
    hasSchemaPropertyConst(entry.if, ["action"], "override"),
  );
  if (
    schemaPropertyAt(releaseGate?.then, ["isOverride"])?.const !== false ||
    schemaPropertyAt(releaseGate?.then, ["screeningEventIds"])?.minItems < 1
  ) {
    fail("cultivar quarantine release must require scoped screening evidence");
  }
  if (
    schemaPropertyAt(overrideGate?.then, ["isOverride"])?.const !== true ||
    schemaPropertyAt(overrideGate?.then, ["screeningEventIds"])?.maxItems !== 0
  ) {
    fail("cultivar quarantine override must remain explicit and cannot masquerade as clearance");
  }
  const disposition = identity.properties.provenance.properties.currentHealthDisposition;
  requireKeys(
    disposition,
    ["derivedOn", "methodId", "subjects", "limitations"],
    "cultivar current health disposition",
  );
  if (disposition.properties.methodId?.const !== "method:genetics-health-disposition:v1") {
    fail("cultivar current health disposition must pin its derivation method");
  }
  const screeningStates = schema.$defs.healthDispositionSubject.properties.screeningState;
  requireExactEnum(
    screeningStates,
    ["untested", "negative_scoped", "positive", "inconclusive"],
    "cultivar scoped screening state",
  );
  if (screeningStates.enum.some((value) => /clean|pathogen.?free/i.test(value))) {
    fail("cultivar health disposition must never claim unscoped clean status");
  }
}

function validateDeficiencyContract(schema) {
  requireKeys(
    schema,
    ["applicability", "whatNotToConclude", "followUp", "escalation"],
    "deficiency schema",
  );
  requireKeys(
    schema.properties.applicability,
    [
      "stageIds",
      "mediumIds",
      "facilityIds",
      "jurisdictionIds",
      "includedContexts",
      "excludedContexts",
    ],
    "deficiency applicability",
  );
  requireKeys(
    schema.properties.escalation,
    ["urgency", "triggers", "nextStep", "professionalBoundary"],
    "deficiency escalation",
  );
  if (
    schema.properties.differentials?.minItems < 3 ||
    !hasPropertyConstraint(schema.allOf, "differentialIds", (property) => property.minItems >= 3)
  ) {
    fail("deficiency schema must require at least three useful graph differential IDs");
  }
}

/**
 * Validate Verdant's schema-contract source files.
 *
 * This combines strict Draft 2020-12 compilation with Verdant-specific
 * structural invariants. Instance validation remains the caller's job, but the
 * returned source set is guaranteed to compile and preserve the reviewed
 * ontology, evidence, editorial, and safety contracts.
 */
export function validateSchemaDocuments(documents) {
  if (!(documents instanceof Map) || documents.size === 0) {
    fail("schema document map must not be empty");
  }
  if (!documents.has("common.schema.json")) fail("missing required schema common.schema.json");
  for (const requiredTemplate of REQUIRED_TEMPLATES) {
    if (!documents.has(requiredTemplate)) fail(`missing required template ${requiredTemplate}`);
  }

  const ids = new Set();
  for (const [fileName, schema] of documents) {
    requireRecord(schema, fileName);
    validateGenericSchemaShape(fileName, schema, documents);
    if (ids.has(schema.$id)) fail(`duplicate canonical $id ${schema.$id}`);
    ids.add(schema.$id);
  }

  validateCommonContract(documents.get("common.schema.json"));
  for (const requiredTemplate of REQUIRED_TEMPLATES) {
    validateTemplateWiring(requiredTemplate, documents.get(requiredTemplate));
  }
  validateSensorConditionals(documents.get("sensor.schema.json"));
  validateEquipmentConditional(documents.get("equipment.schema.json"));
  validateCultivarContract(documents.get("cultivar.schema.json"));
  validateDeficiencyContract(documents.get("deficiency.schema.json"));
  compileSchemaDocuments(documents);

  return {
    status: "pass",
    validationMode: "draft-2020-12+structural-contract",
    schemas: [...documents.keys()].sort(),
    templateCount: REQUIRED_TEMPLATES.length,
  };
}

function isMainModule() {
  return (
    Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

if (isMainModule()) {
  try {
    console.log(JSON.stringify(validateSchemaDocuments(loadSchemaDocuments())));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
