import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  runtimeGuideDigest,
  runtimeGuideReceipt,
  validateCorpusReviewPacket,
} from "./validate-corpus-review-packet.mjs";
import { projectResolvedGuide, validateRepositoryCorpus } from "./validate-corpus.mjs";
import { compileSchemaDocuments, loadSchemaDocuments } from "./validate-schemas.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const GUIDE_PATH_PATTERN = /^\/guides\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GIT_OBJECT_ID_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const DECISION_STATUS = "approved_for_candidate_admission";
const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const TRUSTED_REVIEWER_REGISTRY_REPOSITORY_PATH =
  "docs/knowledge-library/trusted-reviewer-registry.json";
export const TRUSTED_REVIEWER_REGISTRY_DIGEST_REPOSITORY_PATH =
  "docs/knowledge-library/trusted-reviewer-registry.sha256";
let promotionSchemaValidators = null;
const CANDIDATE_UNMEASURED_FIELDS = new Map([
  ["publicationStatus", "NOT_MEASURED"],
  ["renderedCrawlStatus", "NOT_MEASURED"],
  ["productionStatus", "NOT_MEASURED"],
  ["releaseAuthorization", "NOT_AUTHORIZED"],
]);
const FORBIDDEN_CANDIDATE_DELIVERY_ALIASES = new Set([
  "analyticsStatus",
  "crawlStatus",
  "delivered",
  "deployed",
  "deploymentStatus",
  "indexed",
  "indexing",
  "isDeployed",
  "isIndexed",
  "isLive",
  "isPublished",
  "live",
  "measurementStatus",
  "production",
  "publication",
  "published",
]);
const TRUSTED_REVIEWER_ROLES = new Set([
  "author",
  "managing_editor",
  "evidence_reviewer",
  "cultivation_reviewer",
  "ai_verifier",
  "asset_creator",
  "page_owner",
]);

function fail(message) {
  throw new Error(`Knowledge corpus promotion blocked: ${message}`);
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

function requireSha256(value, label) {
  requireString(value, label);
  if (!SHA256_PATTERN.test(value)) fail(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function requireDate(value, label) {
  requireString(value, label);
  if (!ISO_DATE_PATTERN.test(value)) fail(`${label} must be an ISO date`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    fail(`${label} must be a real ISO date`);
  }
  return value;
}

function utcDate(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail("promotion admission clock must provide a valid Date");
  }
  return now.toISOString().slice(0, 10);
}

function requireUnique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} must be unique`);
}

function sameSet(values, expected) {
  return values.length === expected.size && values.every((value) => expected.has(value));
}

function requireExactKeys(value, expectedKeys, label) {
  requireRecord(value, label);
  const keys = Object.keys(value).sort(compareBytes);
  if (!sameSet(keys, new Set(expectedKeys))) {
    fail(`${label} must contain exactly: ${[...expectedKeys].sort(compareBytes).join(", ")}`);
  }
}

function requireNotAfter(value, upperBound, label) {
  requireDate(value, label);
  if (value > upperBound) fail(`${label} cannot be after admission date ${upperBound}`);
  return value;
}

function requireNotBefore(value, lowerBound, label) {
  requireDate(value, label);
  if (value < lowerBound) fail(`${label} cannot be before source artifact date ${lowerBound}`);
  return value;
}

function requireCurrentReviewWindow(reviewedOn, nextReviewOn, evaluatedOn, label) {
  requireNotAfter(reviewedOn, evaluatedOn, `${label} reviewedOn`);
  requireDate(nextReviewOn, `${label} nextReviewOn`);
  if (nextReviewOn <= reviewedOn) fail(`${label} nextReviewOn must be after reviewedOn`);
  if (nextReviewOn < evaluatedOn) fail(`${label} review expired before ${evaluatedOn}`);
}

function compareBytes(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareBlockers(left, right) {
  return compareBytes(`${left.code}\u0000${left.scopeId}`, `${right.code}\u0000${right.scopeId}`);
}

function validatePromotionSchema(fileName, value, label) {
  if (promotionSchemaValidators === null) {
    promotionSchemaValidators = compileSchemaDocuments(loadSchemaDocuments()).validators;
  }
  const validator = promotionSchemaValidators.get(fileName);
  if (typeof validator !== "function") fail(`${label} schema ${fileName} is unavailable`);
  if (validator(value)) return;
  const errors = (validator.errors ?? [])
    .map(
      (error) => `${error.instancePath || "/"} ${error.keyword} ${error.message ?? "is invalid"}`,
    )
    .join("; ");
  fail(`${label} fails strict schema validation${errors ? `: ${errors}` : ""}`);
}

function assertNoCandidateDeliveryClaims(value, path = "candidate corpus") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoCandidateDeliveryClaims(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_CANDIDATE_DELIVERY_ALIASES.has(key)) {
      fail(`${path}.${key} cannot claim downstream delivery evidence`);
    }
    if (CANDIDATE_UNMEASURED_FIELDS.has(key) && child !== CANDIDATE_UNMEASURED_FIELDS.get(key)) {
      fail(`${path}.${key} must remain ${CANDIDATE_UNMEASURED_FIELDS.get(key)}`);
    }
    assertNoCandidateDeliveryClaims(child, `${path}.${key}`);
  }
}

function runtimeReceiptSha256(guides, label) {
  const receipts = requireArray(guides, label, { minItems: 1 })
    .map((guide) => runtimeGuideReceipt(guide))
    .sort((left, right) => compareBytes(left.path, right.path));
  requireUnique(
    receipts.map((receipt) => receipt.path),
    `${label} paths`,
  );
  return canonicalSha256(receipts);
}

function collectSearchResearchArtifacts(artifacts) {
  const byId = new Map();
  const receiptIdByPath = new Map();
  const semanticDigestIds = new Map();
  for (const [index, artifact] of requireArray(artifacts, "promotion search-research artifacts", {
    minItems: 1,
  }).entries()) {
    const label = `promotion search-research artifacts[${index}]`;
    requireExactKeys(
      artifact,
      [
        "version",
        "artifactType",
        "receiptId",
        "path",
        "capturedOn",
        "source",
        "queries",
        "limitations",
      ],
      label,
    );
    if (artifact.version !== 1 || artifact.artifactType !== "knowledge_search_research_receipt") {
      fail(`promotion search-research artifact ${index} has an unsupported contract`);
    }
    const receiptId = requireString(
      artifact.receiptId,
      `promotion search-research artifacts[${index}].receiptId`,
    );
    if (byId.has(receiptId)) fail(`promotion search-research artifacts repeat ${receiptId}`);
    requireString(artifact.path, `promotion search-research artifact ${receiptId} path`);
    if (!GUIDE_PATH_PATTERN.test(artifact.path)) {
      fail(`promotion search-research artifact ${receiptId} path must be canonical`);
    }
    const duplicatePathReceiptId = receiptIdByPath.get(artifact.path);
    if (duplicatePathReceiptId) {
      fail(
        `promotion search-research artifacts ${duplicatePathReceiptId} and ${receiptId} repeat path ${artifact.path}`,
      );
    }
    receiptIdByPath.set(artifact.path, receiptId);
    requireDate(artifact.capturedOn, `promotion search-research artifact ${receiptId} capturedOn`);
    requireString(artifact.source, `promotion search-research artifact ${receiptId} source`, {
      minLength: 4,
    });
    requireArray(artifact.queries, `promotion search-research artifact ${receiptId} queries`, {
      minItems: 1,
    }).forEach((query, queryIndex) => {
      requireExactKeys(
        query,
        ["query", "observation"],
        `promotion search-research artifact ${receiptId} queries[${queryIndex}]`,
      );
      requireRecord(
        query,
        `promotion search-research artifact ${receiptId} queries[${queryIndex}]`,
      );
      requireString(
        query.query,
        `promotion search-research artifact ${receiptId} queries[${queryIndex}].query`,
        { minLength: 3 },
      );
      requireString(
        query.observation,
        `promotion search-research artifact ${receiptId} queries[${queryIndex}].observation`,
        { minLength: 8 },
      );
    });
    requireArray(
      artifact.limitations,
      `promotion search-research artifact ${receiptId} limitations`,
      { minItems: 1 },
    ).forEach((limitation, limitationIndex) =>
      requireString(
        limitation,
        `promotion search-research artifact ${receiptId} limitations[${limitationIndex}]`,
      ),
    );
    const semanticSha256 = canonicalSha256({
      capturedOn: artifact.capturedOn,
      source: artifact.source,
      queries: artifact.queries,
      limitations: artifact.limitations,
    });
    const duplicateReceiptId = semanticDigestIds.get(semanticSha256);
    if (duplicateReceiptId) {
      fail(
        `promotion search-research artifacts ${duplicateReceiptId} and ${receiptId} repeat the same evidence payload`,
      );
    }
    semanticDigestIds.set(semanticSha256, receiptId);
    byId.set(receiptId, { artifact, sha256: canonicalSha256(artifact), semanticSha256 });
  }
  return byId;
}

function collectOriginalAssetArtifacts(artifacts) {
  const byId = new Map();
  const receiptIdByPath = new Map();
  const receiptIdBySha256 = new Map();
  for (const [index, artifact] of requireArray(artifacts, "promotion original-asset artifacts", {
    minItems: 1,
  }).entries()) {
    requireRecord(artifact, `promotion original-asset artifacts[${index}]`);
    const keys = Object.keys(artifact).sort(compareBytes);
    if (!sameSet(keys, new Set(["bytes", "path", "receiptId"]))) {
      fail(
        `promotion original-asset artifact ${index} must contain only receiptId, path, and bytes`,
      );
    }
    const receiptId = requireString(
      artifact.receiptId,
      `promotion original-asset artifacts[${index}].receiptId`,
    );
    if (byId.has(receiptId)) fail(`promotion original-asset artifacts repeat ${receiptId}`);
    const path = requireString(
      artifact.path,
      `promotion original-asset artifact ${receiptId} path`,
    );
    if (!GUIDE_PATH_PATTERN.test(path)) {
      fail(`promotion original-asset artifact ${receiptId} path must be canonical`);
    }
    const duplicatePathReceiptId = receiptIdByPath.get(path);
    if (duplicatePathReceiptId) {
      fail(
        `promotion original-asset artifacts ${duplicatePathReceiptId} and ${receiptId} repeat path ${path}`,
      );
    }
    receiptIdByPath.set(path, receiptId);
    if (!(artifact.bytes instanceof Uint8Array) || artifact.bytes.byteLength === 0) {
      fail(`promotion original-asset artifact ${receiptId} bytes must be nonempty`);
    }
    const sha256 = createHash("sha256").update(artifact.bytes).digest("hex");
    const duplicateReceiptId = receiptIdBySha256.get(sha256);
    if (duplicateReceiptId) {
      fail(
        `promotion original-asset artifacts ${duplicateReceiptId} and ${receiptId} repeat identical bytes`,
      );
    }
    receiptIdBySha256.set(sha256, receiptId);
    byId.set(receiptId, { path, sha256 });
  }
  return byId;
}

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("canonical JSON cannot serialize a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort(compareBytes)
      .map((key) => {
        if (value[key] === undefined) fail(`canonical JSON cannot serialize undefined at ${key}`);
        return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
      })
      .join(",")}}`;
  }
  fail(`canonical JSON cannot serialize ${typeof value}`);
}

export function canonicalSha256(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function runGit(args, repositoryRoot) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) fail(`trusted reviewer authority Git lookup failed: ${result.error.message}`);
  return result;
}

function loadFixedPathAtGitRevision(baseRevision, repositoryPath, label, repositoryRoot) {
  const pathCheck = runGit(
    ["ls-tree", "--name-only", "-z", baseRevision, "--", repositoryPath],
    repositoryRoot,
  );
  if (pathCheck.status !== 0) fail(`${label} path could not be inspected at the authority base`);
  if (pathCheck.stdout === "") return { exists: false, text: null };
  if (pathCheck.stdout !== `${repositoryPath}\0`) {
    fail(`${label} path lookup returned an ambiguous result`);
  }
  const result = runGit(["show", `${baseRevision}:${repositoryPath}`], repositoryRoot);
  if (result.status !== 0) fail(`${label} could not be read from the authority base`);
  return { exists: true, text: result.stdout };
}

export function loadReviewerAuthorityAtGitBase(
  baseRevision,
  repositoryRoot = REPOSITORY_ROOT,
  { allowMissing = false } = {},
) {
  if (typeof baseRevision !== "string" || !GIT_OBJECT_ID_PATTERN.test(baseRevision)) {
    fail("reviewer-authority base revision must be an exact lowercase Git object ID");
  }
  const commitCheck = runGit(["cat-file", "-e", `${baseRevision}^{commit}`], repositoryRoot);
  if (commitCheck.status !== 0) {
    fail("reviewer-authority base revision is unavailable in the local Git checkout");
  }
  const registry = loadFixedPathAtGitRevision(
    baseRevision,
    TRUSTED_REVIEWER_REGISTRY_REPOSITORY_PATH,
    "trusted reviewer registry",
    repositoryRoot,
  );
  const digest = loadFixedPathAtGitRevision(
    baseRevision,
    TRUSTED_REVIEWER_REGISTRY_DIGEST_REPOSITORY_PATH,
    "trusted reviewer registry digest",
    repositoryRoot,
  );
  if (registry.exists !== digest.exists) {
    fail("authority base must contain both trusted reviewer files or neither");
  }
  if (!registry.exists) {
    if (allowMissing) {
      return {
        exists: false,
        baseRevision,
        reviewerRegistry: null,
        trustedReviewerRegistrySha256: null,
      };
    }
    fail("trusted reviewer authority is absent from the exact base revision");
  }
  let reviewerRegistry;
  try {
    reviewerRegistry = JSON.parse(registry.text);
  } catch (error) {
    fail(
      `trusted reviewer registry at the authority base is invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const trustedReviewerRegistrySha256 = digest.text.trim();
  requireSha256(trustedReviewerRegistrySha256, "authority-base reviewer-registry digest pin");
  if (trustedReviewerRegistrySha256 !== canonicalSha256(reviewerRegistry)) {
    fail("authority-base reviewer registry does not match its canonical digest pin");
  }
  return {
    exists: true,
    baseRevision,
    reviewerRegistry,
    trustedReviewerRegistrySha256,
  };
}

function validateTrustedReviewerRegistry(registry, expectedSha256, evaluatedOn) {
  requireExactKeys(
    registry,
    ["version", "artifactType", "registryId", "issuedOn", "reviewers"],
    "trusted reviewer registry",
  );
  if (registry.version !== 1 || registry.artifactType !== "knowledge_trusted_reviewer_registry") {
    fail("trusted reviewer registry has an unsupported contract");
  }
  const registryId = requireString(registry.registryId, "trusted reviewer registryId", {
    minLength: 12,
  });
  if (
    requireSha256(expectedSha256, "trusted reviewer registry trust-anchor digest") !==
    canonicalSha256(registry)
  ) {
    fail("trusted reviewer registry does not match the host-provided trust anchor");
  }
  requireNotAfter(registry.issuedOn, evaluatedOn, "trusted reviewer registry issuedOn");
  const reviewerById = new Map();
  const reviewerIdByAuthoritySubject = new Map();
  for (const [index, reviewer] of requireArray(
    registry.reviewers,
    "trusted reviewer registry reviewers",
    { minItems: 4 },
  ).entries()) {
    const label = `trusted reviewer registry reviewers[${index}]`;
    requireExactKeys(
      reviewer,
      [
        "id",
        "identityProvider",
        "identitySubject",
        "displayName",
        "qualifications",
        "conflictStatus",
        "conflictDisclosure",
        "permittedRoles",
        "activeFrom",
        "activeThrough",
      ],
      label,
    );
    const id = requireString(reviewer.id, `${label}.id`);
    if (reviewerById.has(id)) fail(`trusted reviewer registry repeats ${id}`);
    const identityProvider = requireString(reviewer.identityProvider, `${label}.identityProvider`, {
      minLength: 4,
    });
    const identitySubject = requireString(reviewer.identitySubject, `${label}.identitySubject`, {
      minLength: 4,
    });
    const authoritySubject = `${identityProvider}\u0000${identitySubject}`;
    const aliasId = reviewerIdByAuthoritySubject.get(authoritySubject);
    if (aliasId) {
      fail(`trusted reviewer registry aliases one external identity as ${aliasId} and ${id}`);
    }
    reviewerIdByAuthoritySubject.set(authoritySubject, id);
    requireString(reviewer.displayName, `${label}.displayName`, { minLength: 2 });
    requireArray(reviewer.qualifications, `${label}.qualifications`, { minItems: 1 }).forEach(
      (qualification, qualificationIndex) =>
        requireString(qualification, `${label}.qualifications[${qualificationIndex}]`, {
          minLength: 4,
        }),
    );
    if (!new Set(["none", "disclosed"]).has(reviewer.conflictStatus)) {
      fail(`trusted reviewer ${id} has invalid conflictStatus`);
    }
    requireString(reviewer.conflictDisclosure, `${label}.conflictDisclosure`, { minLength: 8 });
    const permittedRoles = requireArray(reviewer.permittedRoles, `${label}.permittedRoles`, {
      minItems: 1,
    }).map((role, roleIndex) => requireString(role, `${label}.permittedRoles[${roleIndex}]`));
    requireUnique(permittedRoles, `${label}.permittedRoles`);
    if (permittedRoles.some((role) => !TRUSTED_REVIEWER_ROLES.has(role))) {
      fail(`trusted reviewer ${id} declares an unsupported role`);
    }
    requireDate(reviewer.activeFrom, `${label}.activeFrom`);
    if (reviewer.activeThrough !== null)
      requireDate(reviewer.activeThrough, `${label}.activeThrough`);
    if (reviewer.activeThrough !== null && reviewer.activeThrough < reviewer.activeFrom) {
      fail(`trusted reviewer ${id} activeThrough precedes activeFrom`);
    }
    reviewerById.set(id, {
      ...reviewer,
      permittedRoleSet: new Set(permittedRoles),
      active:
        reviewer.activeFrom <= evaluatedOn &&
        (reviewer.activeThrough === null || reviewer.activeThrough >= evaluatedOn),
    });
  }
  return {
    registryId,
    issuedOn: registry.issuedOn,
    canonicalSha256: canonicalSha256(registry),
    reviewerById,
  };
}

function validateReviewerAuthorityProvenance(value) {
  requireExactKeys(value, ["source", "baseRevision"], "reviewer authority provenance");
  if (value.source === "git_base") {
    if (typeof value.baseRevision !== "string" || !GIT_OBJECT_ID_PATTERN.test(value.baseRevision)) {
      fail("Git-base reviewer authority requires an exact lowercase base revision");
    }
    return { source: value.source, baseRevision: value.baseRevision };
  }
  if (value.source === "test_fixture" && value.baseRevision === null) {
    return { source: value.source, baseRevision: null };
  }
  fail("reviewer authority provenance must be git_base or an explicit test_fixture");
}

function requireTrustedReviewer(trustedRegistry, id, role, label, atDate = null) {
  const reviewer = trustedRegistry.reviewerById.get(id);
  if (!reviewer) fail(`${label} references reviewer ${id} outside the trusted registry`);
  if (!reviewer.active) fail(`${label} references reviewer ${id} outside its active window`);
  if (!reviewer.permittedRoleSet.has(role)) {
    fail(`${label} reviewer ${id} is not trusted for role ${role}`);
  }
  if (
    atDate !== null &&
    (reviewer.activeFrom > atDate ||
      (reviewer.activeThrough !== null && reviewer.activeThrough < atDate))
  ) {
    fail(`${label} reviewer ${id} was not active on ${atDate}`);
  }
  return reviewer;
}

function validateReviewResult(packet, reviewResult) {
  requireRecord(packet, "source review packet");
  requireRecord(reviewResult, "source review result");
  if (
    reviewResult.contractStatus !== "pass" ||
    reviewResult.publicationReadiness !== "BLOCKED" ||
    reviewResult.publicationStatus !== "NOT_MEASURED" ||
    reviewResult.renderedCrawlStatus !== "NOT_MEASURED"
  ) {
    fail("source review result must be a valid blocked, unmeasured review receipt");
  }
  if (
    reviewResult.cohortId !== packet.cohort?.id ||
    reviewResult.pageCount !== packet.pages?.length ||
    reviewResult.claimCount !== packet.claims?.length ||
    reviewResult.sourceCount !== packet.sources?.length
  ) {
    fail("source review result identity and counts must match the packet");
  }
  const blockers = requireArray(reviewResult.blockers, "source review blockers", {
    minItems: 1,
  }).map((blocker, index) => {
    requireRecord(blocker, `source review blockers[${index}]`);
    return {
      code: requireString(blocker.code, `source review blockers[${index}].code`),
      scopeId: requireString(blocker.scopeId, `source review blockers[${index}].scopeId`),
      reason: requireString(blocker.reason, `source review blockers[${index}].reason`, {
        minLength: 8,
      }),
    };
  });
  requireUnique(
    blockers.map((blocker) => `${blocker.code}\u0000${blocker.scopeId}`),
    "source review blocker identities",
  );
  return blockers.sort(compareBlockers);
}

function normalizeReviewResult(packet, reviewResult) {
  const blockers = validateReviewResult(packet, reviewResult);
  return { ...reviewResult, blockers };
}

function assertNoDecisionDeliveryClaims(value, path = "promotion decision") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoDecisionDeliveryClaims(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (
      new Set([
        "publicationStatus",
        "renderedCrawlStatus",
        "productionStatus",
        "deploymentStatus",
        "measurementStatus",
        "releaseAuthorization",
      ]).has(key)
    ) {
      fail(`${path}.${key} cannot claim downstream delivery evidence`);
    }
    assertNoDecisionDeliveryClaims(child, `${path}.${key}`);
  }
}

function buildReceipt({ packet, reviewResult, resolvedGuides, promotionStatus, candidateCorpus }) {
  const blockers = validateReviewResult(packet, reviewResult);
  const guides = requireArray(resolvedGuides, "resolved guides", { minItems: 1 });
  const sourcePacketCanonicalSha256 = canonicalSha256(packet);
  const candidateCorpusSha256 = candidateCorpus ? canonicalSha256(candidateCorpus) : null;
  const receipt = {
    version: 1,
    artifactType: "knowledge_corpus_promotion_admission_receipt",
    contractStatus: "pass",
    promotionStatus,
    editorialState: reviewResult.editorialState,
    sourceRevisionId: packet.revisionId,
    sourcePacketCanonicalSha256,
    successorRevisionRequired: true,
    candidateCorpusSha256,
    publicationStatus: "NOT_MEASURED",
    renderedCrawlStatus: "NOT_MEASURED",
    productionStatus: "NOT_MEASURED",
    releaseAuthorization: "NOT_AUTHORIZED",
    counts: {
      pages: packet.pages.length,
      claims: packet.claims.length,
      sources: packet.sources.length,
      material: guides.reduce((count, guide) => count + guide.material.length, 0),
      internalLinks: guides.reduce((count, guide) => count + guide.internalLinks.length, 0),
      renderedSources: guides.reduce((count, guide) => count + guide.externalSources.length, 0),
      blockers: promotionStatus === "BLOCKED" ? blockers.length : 0,
    },
    blockers: promotionStatus === "BLOCKED" ? blockers : [],
  };
  return { ...receipt, receiptSha256: canonicalSha256(receipt) };
}

function validatePeopleAndRoles(decision, packet, trustedRegistry, decisionDate) {
  const people = requireArray(decision.people, "promotion decision people", { minItems: 4 });
  const personById = new Map();
  for (const [index, person] of people.entries()) {
    requireRecord(person, `promotion decision people[${index}]`);
    const id = requireString(person.id, `promotion decision people[${index}].id`);
    if (personById.has(id)) fail(`promotion decision repeats person ${id}`);
    requireString(person.displayName, `promotion decision person ${id} displayName`, {
      minLength: 2,
    });
    requireArray(person.qualifications, `promotion decision person ${id} qualifications`, {
      minItems: 1,
    }).forEach((qualification, qualificationIndex) =>
      requireString(
        qualification,
        `promotion decision person ${id} qualifications[${qualificationIndex}]`,
        { minLength: 4 },
      ),
    );
    if (!new Set(["none", "disclosed"]).has(person.conflictStatus)) {
      fail(`promotion decision person ${id} has invalid conflictStatus`);
    }
    requireString(person.conflictDisclosure, `promotion decision person ${id} conflictDisclosure`, {
      minLength: 8,
    });
    const trusted = trustedRegistry.reviewerById.get(id);
    if (!trusted || !trusted.active) {
      fail(`promotion decision person ${id} is not active in the trusted reviewer registry`);
    }
    if (
      trusted.activeFrom > decisionDate ||
      (trusted.activeThrough !== null && trusted.activeThrough < decisionDate)
    ) {
      fail(`promotion decision person ${id} was not active on ${decisionDate}`);
    }
    const trustedIdentity = {
      id: trusted.id,
      displayName: trusted.displayName,
      qualifications: trusted.qualifications,
      conflictStatus: trusted.conflictStatus,
      conflictDisclosure: trusted.conflictDisclosure,
    };
    if (canonicalSha256(person) !== canonicalSha256(trustedIdentity)) {
      fail(`promotion decision person ${id} diverges from the trusted reviewer registry`);
    }
    personById.set(id, person);
  }

  const roles = requireRecord(decision.roleAssignments, "promotion decision roleAssignments");
  const managingEditorId = requireString(
    roles.managingEditorId,
    "promotion decision managingEditorId",
  );
  const roleIds = {};
  for (const field of ["authorIds", "evidenceReviewerIds", "cultivationReviewerIds"]) {
    roleIds[field] = requireArray(roles[field], `promotion decision ${field}`, {
      minItems: 1,
    }).map((id, index) => requireString(id, `promotion decision ${field}[${index}]`));
    requireUnique(roleIds[field], `promotion decision ${field}`);
  }
  for (const id of [managingEditorId, ...Object.values(roleIds).flat()]) {
    if (!personById.has(id)) fail(`promotion role assignment references missing person ${id}`);
  }
  requireTrustedReviewer(
    trustedRegistry,
    managingEditorId,
    "managing_editor",
    "promotion managing editor",
    decisionDate,
  );
  for (const id of roleIds.authorIds) {
    requireTrustedReviewer(
      trustedRegistry,
      id,
      "author",
      "promotion author assignment",
      decisionDate,
    );
  }
  for (const id of roleIds.evidenceReviewerIds) {
    requireTrustedReviewer(
      trustedRegistry,
      id,
      "evidence_reviewer",
      "promotion evidence assignment",
      decisionDate,
    );
  }
  for (const id of roleIds.cultivationReviewerIds) {
    requireTrustedReviewer(
      trustedRegistry,
      id,
      "cultivation_reviewer",
      "promotion cultivation assignment",
      decisionDate,
    );
  }
  const authorSet = new Set(roleIds.authorIds);
  const evidenceSet = new Set(roleIds.evidenceReviewerIds);
  const cultivationSet = new Set(roleIds.cultivationReviewerIds);
  if (
    authorSet.has(managingEditorId) ||
    evidenceSet.has(managingEditorId) ||
    cultivationSet.has(managingEditorId) ||
    [...authorSet].some((id) => evidenceSet.has(id) || cultivationSet.has(id)) ||
    [...evidenceSet].some((id) => cultivationSet.has(id))
  ) {
    fail(
      "managing-editor, R2 author, evidence-reviewer, and cultivation-reviewer assignments must be independent",
    );
  }
  if (!packet.claims.some((claim) => claim.riskClass === "R2")) {
    fail("promotion admission is scoped to a packet with material R2 claims");
  }
  return { personById, managingEditorId, ...roleIds };
}

function validateClaimApprovals(
  decision,
  packet,
  roles,
  trustedRegistry,
  evaluatedOn,
  decisionDate,
  successorCreatedOn,
) {
  const expected = new Map(packet.claims.map((claim) => [claim.id, claim]));
  const approvals = requireArray(decision.claimApprovals, "promotion claimApprovals", {
    minItems: expected.size,
  });
  const seen = new Set();
  for (const [index, approval] of approvals.entries()) {
    requireRecord(approval, `promotion claimApprovals[${index}]`);
    const claimId = requireString(approval.claimId, `promotion claimApprovals[${index}].claimId`);
    const claim = expected.get(claimId);
    if (!claim) fail(`promotion claim approval references unknown claim ${claimId}`);
    if (seen.has(claimId)) fail(`promotion claim approvals repeat ${claimId}`);
    seen.add(claimId);
    if (
      requireSha256(approval.claimCanonicalSha256, `claim ${claimId} canonical digest`) !==
      canonicalSha256(claim)
    ) {
      fail(`promotion claim approval digest drifted for ${claimId}`);
    }
    if (approval.decision !== "approved") fail(`promotion claim ${claimId} is not approved`);
    if (!roles.evidenceReviewerIds.includes(approval.evidenceReviewerId)) {
      fail(`promotion claim ${claimId} lacks an assigned evidence reviewer`);
    }
    if (!roles.cultivationReviewerIds.includes(approval.cultivationReviewerId)) {
      fail(`promotion claim ${claimId} lacks an assigned cultivation reviewer`);
    }
    if (approval.evidenceReviewerId === approval.cultivationReviewerId) {
      fail(`promotion claim ${claimId} evidence and cultivation reviewers must be independent`);
    }
    requireCurrentReviewWindow(
      approval.approvedOn,
      approval.nextReviewOn,
      evaluatedOn,
      `promotion claim ${claimId}`,
    );
    requireNotBefore(
      approval.approvedOn,
      successorCreatedOn,
      `promotion claim ${claimId} approvedOn`,
    );
    requireNotAfter(approval.approvedOn, decisionDate, `promotion claim ${claimId} approvedOn`);
    requireTrustedReviewer(
      trustedRegistry,
      approval.evidenceReviewerId,
      "evidence_reviewer",
      `promotion claim ${claimId} evidence approval`,
      approval.approvedOn,
    );
    requireTrustedReviewer(
      trustedRegistry,
      approval.cultivationReviewerId,
      "cultivation_reviewer",
      `promotion claim ${claimId} cultivation approval`,
      approval.approvedOn,
    );
    requireArray(approval.limitations, `promotion claim ${claimId} limitations`, {
      minItems: 1,
    });
  }
  if (!sameSet([...seen], new Set(expected.keys()))) {
    fail("promotion claim approvals must exactly cover the source packet claims");
  }
  return new Map(approvals.map((approval) => [approval.claimId, approval]));
}

function validateSourceVerifications(
  decision,
  packet,
  roles,
  trustedRegistry,
  evaluatedOn,
  decisionDate,
  successorCreatedOn,
) {
  const expected = new Map(
    packet.sources
      .filter((source) => source.sourceType === "evidence")
      .map((source) => [source.id, source]),
  );
  const verifications = requireArray(
    decision.sourceVerifications,
    "promotion sourceVerifications",
    { minItems: expected.size },
  );
  const seen = new Set();
  for (const [index, verification] of verifications.entries()) {
    requireRecord(verification, `promotion sourceVerifications[${index}]`);
    const sourceId = requireString(
      verification.sourceId,
      `promotion sourceVerifications[${index}].sourceId`,
    );
    const source = expected.get(sourceId);
    if (!source)
      fail(`promotion source verification references unknown evidence source ${sourceId}`);
    if (seen.has(sourceId)) fail(`promotion source verifications repeat ${sourceId}`);
    seen.add(sourceId);
    if (
      requireSha256(verification.sourceCanonicalSha256, `source ${sourceId} canonical digest`) !==
      canonicalSha256(source)
    ) {
      fail(`promotion source verification digest drifted for ${sourceId}`);
    }
    if (!roles.evidenceReviewerIds.includes(verification.reviewerId)) {
      fail(`promotion source ${sourceId} lacks an assigned evidence reviewer`);
    }
    requireCurrentReviewWindow(
      verification.verifiedOn,
      verification.nextReviewOn,
      evaluatedOn,
      `promotion source ${sourceId}`,
    );
    requireNotBefore(
      verification.verifiedOn,
      successorCreatedOn,
      `promotion source ${sourceId} verifiedOn`,
    );
    requireNotAfter(
      verification.verifiedOn,
      decisionDate,
      `promotion source ${sourceId} verifiedOn`,
    );
    requireTrustedReviewer(
      trustedRegistry,
      verification.reviewerId,
      "evidence_reviewer",
      `promotion source ${sourceId} verification`,
      verification.verifiedOn,
    );
    if (
      verification.authorshipStatus !== "verified" ||
      verification.publicationDateStatus !== "verified" ||
      verification.correctionStatus !== "checked_current" ||
      verification.retractionStatus !== "not_retracted"
    ) {
      fail(`promotion source ${sourceId} verification is incomplete`);
    }
    if (!new Set(["link_only", "licensed", "public_domain"]).has(verification.licenseDisposition)) {
      fail(`promotion source ${sourceId} has no safe citation/reuse disposition`);
    }
    requireArray(verification.limitations, `promotion source ${sourceId} limitations`, {
      minItems: 1,
    });
  }
  if (!sameSet([...seen], new Set(expected.keys()))) {
    fail("promotion source verifications must exactly cover every evidence source");
  }
  return new Map(verifications.map((verification) => [verification.sourceId, verification]));
}

function validatePageReviews({
  decision,
  packet,
  resolvedGuides,
  roles,
  trustedRegistry,
  evaluatedOn,
  decisionDate,
  searchArtifactById,
  assetArtifactById,
  successorCreatedOn,
}) {
  const packetPageByPath = new Map(packet.pages.map((page) => [page.path, page]));
  const guideByPath = new Map(resolvedGuides.map((guide) => [guide.path, guide]));
  const usedSearchArtifactIds = new Set();
  const usedAssetArtifactIds = new Set();
  const reviews = requireArray(decision.pageReviews, "promotion pageReviews", {
    minItems: packetPageByPath.size,
  });
  const seen = new Set();
  for (const [index, review] of reviews.entries()) {
    requireRecord(review, `promotion pageReviews[${index}]`);
    const path = requireString(review.path, `promotion pageReviews[${index}].path`);
    const packetPage = packetPageByPath.get(path);
    const guide = guideByPath.get(path);
    if (!packetPage || !guide) fail(`promotion page review references unknown path ${path}`);
    if (seen.has(path)) fail(`promotion page reviews repeat ${path}`);
    seen.add(path);
    requireCurrentReviewWindow(
      review.reviewedOn,
      review.nextReviewOn,
      evaluatedOn,
      `promotion page ${path}`,
    );
    requireNotBefore(review.reviewedOn, successorCreatedOn, `promotion page ${path} reviewedOn`);
    requireNotAfter(review.reviewedOn, decisionDate, `promotion page ${path} reviewedOn`);
    if (!roles.personById.has(review.ownerId)) fail(`promotion page ${path} has an unknown owner`);
    requireTrustedReviewer(
      trustedRegistry,
      review.ownerId,
      "page_owner",
      `promotion page ${path} owner`,
      review.reviewedOn,
    );
    if (
      requireSha256(review.runtimeGuideSha256, `promotion page ${path} runtime digest`) !==
      runtimeGuideDigest(guide)
    ) {
      fail(`promotion page ${path} runtime receipt drifted`);
    }
    if (guide.externalSources.length === 0) {
      fail(`promotion page ${path} still renders no visible source rows`);
    }
    const runtimeLinkByLocation = new Map();
    for (const runtimeLink of guide.internalLinks) {
      if (runtimeLinkByLocation.has(runtimeLink.location)) {
        fail(`promotion page ${path} repeats runtime link location ${runtimeLink.location}`);
      }
      runtimeLinkByLocation.set(runtimeLink.location, runtimeLink.path);
    }
    const sourceIds = requireArray(
      review.visibleSourceIds,
      `promotion page ${path} visibleSourceIds`,
      {
        minItems: 1,
      },
    );
    if (!sameSet(sourceIds, new Set(packetPage.proposedVisibleSourceIds))) {
      fail(`promotion page ${path} visible-source review must cover every proposed source`);
    }
    const expectedLinks = new Set(
      packetPage.proposedLinks.map(
        (link) => `${link.location}\u0000${link.path}\u0000${link.slot}`,
      ),
    );
    const linkManifest = requireArray(review.linkManifest, `promotion page ${path} linkManifest`, {
      minItems: expectedLinks.size,
    });
    const actualLinks = linkManifest.map((link, linkIndex) => {
      requireRecord(link, `promotion page ${path} linkManifest[${linkIndex}]`);
      if (link.decision !== "approved") fail(`promotion page ${path} has an unapproved link`);
      const location = requireString(link.location, `promotion page ${path} link location`);
      const destination = requireString(link.path, `promotion page ${path} link path`);
      if (runtimeLinkByLocation.get(location) !== destination) {
        fail(
          `promotion page ${path} approved link ${location} does not match the reviewed runtime destination`,
        );
      }
      if (link.reviewerId !== roles.managingEditorId) {
        fail(`promotion page ${path} link ${location} lacks managing-editor approval`);
      }
      requireNotAfter(
        link.reviewedOn,
        review.reviewedOn,
        `promotion page ${path} link ${location} reviewedOn`,
      );
      requireNotBefore(
        link.reviewedOn,
        successorCreatedOn,
        `promotion page ${path} link ${location} reviewedOn`,
      );
      requireTrustedReviewer(
        trustedRegistry,
        link.reviewerId,
        "managing_editor",
        `promotion page ${path} link ${location}`,
        link.reviewedOn,
      );
      requireArray(link.limitations, `promotion page ${path} link ${location} limitations`, {
        minItems: 1,
      });
      return `${location}\u0000${destination}\u0000${requireString(link.slot, `promotion page ${path} link slot`)}`;
    });
    requireUnique(actualLinks, `promotion page ${path} link manifest`);
    if (!sameSet(actualLinks, expectedLinks)) {
      fail(`promotion page ${path} link manifest must exactly cover the proposed semantic links`);
    }
    const search = requireRecord(review.searchResearch, `promotion page ${path} searchResearch`);
    const searchReceiptId = requireString(
      search.receiptId,
      `promotion page ${path} search receiptId`,
    );
    const searchArtifact = searchArtifactById.get(searchReceiptId);
    if (!searchArtifact) {
      fail(`promotion page ${path} search receipt ${searchReceiptId} has no supplied artifact`);
    }
    if (searchArtifact.artifact.path !== path) {
      fail(`promotion page ${path} search receipt ${searchReceiptId} is bound to another path`);
    }
    if (
      requireSha256(search.querySetSha256, `promotion page ${path} query-set digest`) !==
      searchArtifact.sha256
    ) {
      fail(`promotion page ${path} search receipt ${searchReceiptId} digest does not match`);
    }
    usedSearchArtifactIds.add(searchReceiptId);
    requireNotAfter(
      search.capturedOn,
      review.reviewedOn,
      `promotion page ${path} search capturedOn`,
    );
    requireNotBefore(
      search.capturedOn,
      successorCreatedOn,
      `promotion page ${path} search capturedOn`,
    );
    if (!roles.evidenceReviewerIds.includes(search.reviewerId)) {
      fail(`promotion page ${path} search reviewer is not an assigned evidence reviewer`);
    }
    requireTrustedReviewer(
      trustedRegistry,
      search.reviewerId,
      "evidence_reviewer",
      `promotion page ${path} search review`,
      search.capturedOn,
    );
    requireString(search.source, `promotion page ${path} search source`, { minLength: 4 });
    requireArray(search.limitations, `promotion page ${path} search limitations`, { minItems: 1 });
    if (
      searchArtifact.artifact.capturedOn !== search.capturedOn ||
      searchArtifact.artifact.source !== search.source
    ) {
      fail(`promotion page ${path} search decision does not match the supplied artifact metadata`);
    }

    const asset = requireRecord(review.originalAsset, `promotion page ${path} originalAsset`);
    const assetReceiptId = requireString(asset.receiptId, `promotion page ${path} asset receiptId`);
    const assetArtifact = assetArtifactById.get(assetReceiptId);
    if (!assetArtifact) {
      fail(`promotion page ${path} asset receipt ${assetReceiptId} has no supplied artifact bytes`);
    }
    if (assetArtifact.path !== path) {
      fail(`promotion page ${path} asset receipt ${assetReceiptId} is bound to another path`);
    }
    if (
      requireSha256(asset.artifactSha256, `promotion page ${path} asset digest`) !==
      assetArtifact.sha256
    ) {
      fail(`promotion page ${path} asset receipt ${assetReceiptId} digest does not match`);
    }
    usedAssetArtifactIds.add(assetReceiptId);
    if (!roles.personById.has(asset.creatorId) || !roles.personById.has(asset.reviewerId)) {
      fail(`promotion page ${path} original asset references unknown people`);
    }
    if (
      !roles.evidenceReviewerIds.includes(asset.reviewerId) ||
      asset.creatorId === asset.reviewerId
    ) {
      fail(`promotion page ${path} original asset requires independent evidence review`);
    }
    requireString(asset.method, `promotion page ${path} asset method`, { minLength: 8 });
    requireString(asset.provenance, `promotion page ${path} asset provenance`, { minLength: 8 });
    requireString(asset.licenseDisposition, `promotion page ${path} asset licenseDisposition`, {
      minLength: 4,
    });
    requireNotAfter(asset.reviewedOn, review.reviewedOn, `promotion page ${path} asset reviewedOn`);
    requireNotBefore(
      asset.reviewedOn,
      successorCreatedOn,
      `promotion page ${path} asset reviewedOn`,
    );
    requireTrustedReviewer(
      trustedRegistry,
      asset.creatorId,
      "asset_creator",
      `promotion page ${path} original asset creator`,
      asset.reviewedOn,
    );
    requireTrustedReviewer(
      trustedRegistry,
      asset.reviewerId,
      "evidence_reviewer",
      `promotion page ${path} original asset review`,
      asset.reviewedOn,
    );
  }
  if (!sameSet([...seen], new Set(packetPageByPath.keys()))) {
    fail("promotion page reviews must exactly cover the packet pages");
  }
  if (!sameSet([...usedSearchArtifactIds], new Set(searchArtifactById.keys()))) {
    fail("promotion search-research artifacts must exactly cover the page review receipts");
  }
  if (!sameSet([...usedAssetArtifactIds], new Set(assetArtifactById.keys()))) {
    fail("promotion original-asset artifacts must exactly cover the page review receipts");
  }
}

function validateDecision({
  sourcePacket,
  successorPacket,
  decision,
  candidateCorpus,
  resolvedGuides,
  trustedRegistry,
  evaluatedOn,
  searchArtifactById,
  assetArtifactById,
}) {
  requireRecord(decision, "promotion decision");
  assertNoDecisionDeliveryClaims(decision);
  validatePromotionSchema("corpus-promotion-decision.schema.json", decision, "promotion decision");
  if (decision.version !== 1 || decision.artifactType !== "knowledge_corpus_promotion_decision") {
    fail("promotion decision must declare the supported version and artifact type");
  }
  requireString(decision.decisionId, "promotion decision decisionId", { minLength: 12 });
  if (
    decision.reviewerRegistryId !== trustedRegistry.registryId ||
    requireSha256(
      decision.reviewerRegistryCanonicalSha256,
      "promotion decision reviewer-registry digest",
    ) !== trustedRegistry.canonicalSha256
  ) {
    fail("promotion decision does not bind the trusted reviewer registry");
  }
  if (
    decision.sourceRevisionId !== sourcePacket.revisionId ||
    requireSha256(decision.sourcePacketCanonicalSha256, "promotion decision source digest") !==
      canonicalSha256(sourcePacket)
  ) {
    fail("promotion decision must bind the exact immutable source revision and canonical digest");
  }
  requireString(decision.successorRevisionId, "promotion decision successorRevisionId", {
    minLength: 12,
  });
  if (
    decision.successorRevisionId !== successorPacket.revisionId ||
    decision.successorRevisionId === sourcePacket.revisionId ||
    decision.supersedesRevisionId !== sourcePacket.revisionId ||
    requireSha256(
      decision.successorPacketCanonicalSha256,
      "promotion decision successor packet digest",
    ) !== canonicalSha256(successorPacket)
  ) {
    fail(
      "promotion requires the exact immutable successor packet that supersedes the source packet",
    );
  }
  if (
    requireSha256(
      decision.candidateCorpusCanonicalSha256,
      "promotion decision candidate corpus digest",
    ) !== canonicalSha256(candidateCorpus)
  ) {
    fail("promotion decision must approve the exact candidate corpus bytes");
  }
  if (decision.decisionStatus !== DECISION_STATUS) {
    fail(`promotion decisionStatus must be ${DECISION_STATUS}`);
  }
  requireNotAfter(decision.decidedOn, evaluatedOn, "promotion decision decidedOn");
  requireNotAfter(
    trustedRegistry.issuedOn,
    decision.decidedOn,
    "trusted reviewer registry issuedOn",
  );
  requireNotAfter(
    successorPacket.createdOn,
    decision.decidedOn,
    "successor review packet createdOn",
  );
  const roles = validatePeopleAndRoles(
    decision,
    successorPacket,
    trustedRegistry,
    decision.decidedOn,
  );
  const ai = requireRecord(decision.aiVerification, "promotion decision aiVerification");
  if (!roles.personById.has(ai.verifierId)) fail("promotion AI verifier is not a declared person");
  if (roles.authorIds.includes(ai.verifierId)) {
    fail("promotion AI verifier must be independent from the authors");
  }
  if (ai.decision !== "verified") fail("promotion AI assistance remains unverified");
  requireCurrentReviewWindow(
    ai.verifiedOn,
    ai.nextReviewOn,
    evaluatedOn,
    "promotion AI verification",
  );
  requireNotBefore(ai.verifiedOn, successorPacket.createdOn, "promotion AI verifiedOn");
  requireNotAfter(ai.verifiedOn, decision.decidedOn, "promotion AI verifiedOn");
  requireTrustedReviewer(
    trustedRegistry,
    ai.verifierId,
    "ai_verifier",
    "promotion AI verifier",
    ai.verifiedOn,
  );
  requireArray(ai.limitations, "promotion AI limitations", { minItems: 1 });
  const approvalByClaimId = validateClaimApprovals(
    decision,
    successorPacket,
    roles,
    trustedRegistry,
    evaluatedOn,
    decision.decidedOn,
    successorPacket.createdOn,
  );
  const verificationBySourceId = validateSourceVerifications(
    decision,
    successorPacket,
    roles,
    trustedRegistry,
    evaluatedOn,
    decision.decidedOn,
    successorPacket.createdOn,
  );
  for (const claim of successorPacket.claims) {
    const approval = approvalByClaimId.get(claim.id);
    for (const sourceLink of claim.sourceLinks) {
      const verification = verificationBySourceId.get(sourceLink.sourceId);
      if (verification && verification.verifiedOn > approval.approvedOn) {
        fail(
          `promotion source ${sourceLink.sourceId} was verified after approving claim ${claim.id}`,
        );
      }
    }
  }
  validatePageReviews({
    decision,
    packet: successorPacket,
    resolvedGuides,
    roles,
    trustedRegistry,
    evaluatedOn,
    decisionDate: decision.decidedOn,
    searchArtifactById,
    assetArtifactById,
    successorCreatedOn: successorPacket.createdOn,
  });
}

function validateSuccessorPacketIdentity(sourcePacket, successorPacket) {
  requireRecord(successorPacket, "promotion successor packet");
  if (
    successorPacket.revisionId === sourcePacket.revisionId ||
    successorPacket.supersedesRevisionId !== sourcePacket.revisionId
  ) {
    fail("promotion successor packet must be a new immutable revision of the source packet");
  }
  if (successorPacket.createdOn < sourcePacket.createdOn) {
    fail("promotion successor packet cannot predate the source packet");
  }
  if (
    successorPacket.cohort?.id !== sourcePacket.cohort?.id ||
    !sameSet(successorPacket.cohort?.paths ?? [], new Set(sourcePacket.cohort?.paths ?? []))
  ) {
    fail("promotion successor packet must preserve the exact cohort identity and path set");
  }

  const sourcePageByPath = new Map(sourcePacket.pages.map((page) => [page.path, page]));
  const successorPages = requireArray(successorPacket.pages, "promotion successor packet pages", {
    minItems: sourcePageByPath.size,
  });
  requireUnique(
    successorPages.map((page) => page.path),
    "promotion successor packet page paths",
  );
  if (successorPages.length !== sourcePageByPath.size) {
    fail("promotion successor packet must preserve the exact page set");
  }
  for (const page of successorPages) {
    const sourcePage = sourcePageByPath.get(page.path);
    if (
      !sourcePage ||
      page.pageFamily !== sourcePage.pageFamily ||
      !sameSet(page.claimIds ?? [], new Set(sourcePage.claimIds ?? []))
    ) {
      fail(`promotion successor page ${String(page.path)} changes stable page or claim identity`);
    }
  }

  for (const [label, sourceEntries, successorEntries] of [
    ["claim", sourcePacket.claims, successorPacket.claims],
    ["source", sourcePacket.sources, successorPacket.sources],
  ]) {
    const sourceIds = sourceEntries.map((entry) => entry.id);
    const successorIds = successorEntries.map((entry) => entry.id);
    requireUnique(sourceIds, `promotion source packet ${label} IDs`);
    requireUnique(successorIds, `promotion successor packet ${label} IDs`);
    if (!sameSet(successorIds, new Set(sourceIds))) {
      fail(`promotion successor packet must preserve the exact ${label} identity set`);
    }
  }
}

function validateCandidateIdentity(candidateCorpus, packet, decision) {
  const candidateCohorts = requireArray(candidateCorpus.cohorts, "candidate corpus cohorts", {
    minItems: 1,
  });
  if (candidateCohorts.length !== 1 || candidateCohorts[0].id !== packet.cohort.id) {
    fail("candidate corpus must contain exactly the reviewed cohort");
  }
  const candidateCohortPaths = requireArray(
    candidateCohorts[0].paths,
    "candidate corpus cohort paths",
    { minItems: 1 },
  );
  if (!sameSet(candidateCohortPaths, new Set(packet.cohort.paths))) {
    fail("candidate corpus cohort paths must exactly match the reviewed packet");
  }

  const packetPageByPath = new Map(packet.pages.map((page) => [page.path, page]));
  const candidatePages = requireArray(candidateCorpus.pages, "candidate corpus pages", {
    minItems: packetPageByPath.size,
  });
  if (candidatePages.length !== packetPageByPath.size) {
    fail("candidate corpus pages must exactly cover the reviewed packet");
  }
  for (const candidatePage of candidatePages) {
    const packetPage = packetPageByPath.get(candidatePage.path);
    if (
      !packetPage ||
      candidatePage.pageFamily !== packetPage.pageFamily ||
      candidatePage.riskClass !== packetPage.riskClass
    ) {
      fail(`candidate page ${String(candidatePage.path)} diverges from the reviewed page family`);
    }
    const candidateClaimIds = requireArray(
      candidatePage.claimIds,
      `candidate page ${candidatePage.path} claimIds`,
      { minItems: 1 },
    );
    if (!sameSet(candidateClaimIds, new Set(packetPage.claimIds))) {
      fail(`candidate page ${candidatePage.path} claim IDs diverge from the reviewed packet`);
    }
  }

  const candidatePageClaims = requireArray(candidateCorpus.claims, "candidate corpus claims", {
    minItems: 1,
  }).filter((claim) => claim.scope?.type === "page");
  const candidatePageClaimIds = candidatePageClaims.map((claim) => claim.nodeId);
  requireUnique(candidatePageClaimIds, "candidate page claim IDs");
  if (!sameSet(candidatePageClaimIds, new Set(packet.claims.map((claim) => claim.id)))) {
    fail("candidate page claims must exactly equal the reviewed packet claims");
  }
  const packetClaimById = new Map(packet.claims.map((claim) => [claim.id, claim]));
  for (const candidateClaim of candidatePageClaims) {
    const reviewedClaim = packetClaimById.get(candidateClaim.nodeId);
    const reviewedPage = packetPageByPath.get(reviewedClaim.path);
    const expectedSourceIds = reviewedClaim.sourceLinks.map((link) => link.sourceId);
    const candidateMaterialKeys = candidateClaim.material.map((entry) => entry.key);
    const candidateMaterialKeySet = new Set(candidateMaterialKeys);
    const reviewedClaimMaterialKeySet = new Set(reviewedClaim.materialKeys);
    const reviewedNonClaimMaterialKeySet = new Set(
      reviewedPage.nonClaimMaterial.flatMap((entry) => entry.keys),
    );
    const omitsReviewedClaimMaterial = reviewedClaim.materialKeys.some(
      (key) => !candidateMaterialKeySet.has(key),
    );
    const containsUnreviewedMaterial = candidateMaterialKeys.some(
      (key) => !reviewedClaimMaterialKeySet.has(key) && !reviewedNonClaimMaterialKeySet.has(key),
    );
    if (
      candidateClaim.summary !== reviewedClaim.text ||
      candidateClaim.riskClass !== reviewedClaim.riskClass ||
      candidateClaim.evidenceState !== "supported" ||
      !sameSet(candidateClaim.riskDomains, new Set(reviewedClaim.riskDomains)) ||
      !sameSet(candidateClaim.sourceIds, new Set(expectedSourceIds)) ||
      canonicalSha256(candidateClaim.limitations) !== canonicalSha256(reviewedClaim.limitations) ||
      omitsReviewedClaimMaterial ||
      containsUnreviewedMaterial
    ) {
      fail(`candidate claim ${candidateClaim.nodeId} diverges from its reviewed successor claim`);
    }
  }

  const candidateSources = requireArray(candidateCorpus.sources, "candidate corpus sources", {
    minItems: 1,
  });
  const candidateSourceIds = candidateSources.map((source) => source.nodeId);
  requireUnique(candidateSourceIds, "candidate source IDs");
  if (!sameSet(candidateSourceIds, new Set(packet.sources.map((source) => source.id)))) {
    fail("candidate evidence/provenance sources must exactly equal the reviewed packet sources");
  }
  const packetSourceById = new Map(packet.sources.map((source) => [source.id, source]));
  for (const candidateSource of candidateSources) {
    const reviewedSource = packetSourceById.get(candidateSource.nodeId);
    if (
      candidateSource.url !== reviewedSource.url ||
      candidateSource.evidenceTier !== reviewedSource.evidenceTier ||
      candidateSource.accessedOn !== reviewedSource.accessedOn ||
      candidateSource.stableIdentifier !== reviewedSource.stableIdentifier ||
      canonicalSha256(candidateSource.limitations) !== canonicalSha256(reviewedSource.limitations)
    ) {
      fail(
        `candidate source ${candidateSource.nodeId} diverges from its reviewed successor source`,
      );
    }
  }
  if (
    candidateCorpus.successorRevisionId !== decision.successorRevisionId ||
    candidateCorpus.decisionId !== decision.decisionId ||
    candidateCorpus.reviewerRegistryId !== decision.reviewerRegistryId ||
    candidateCorpus.reviewerRegistryCanonicalSha256 !== decision.reviewerRegistryCanonicalSha256
  ) {
    fail(
      "candidate successor, reviewer-registry, and decision identity must match the promotion decision",
    );
  }
}

function validateCandidateReviewerBindings(
  candidateCorpus,
  trustedRegistry,
  decisionDate,
  successorCreatedOn,
) {
  for (const receipt of candidateCorpus.applicabilityReceipts) {
    requireNotBefore(
      receipt.reviewedOn,
      successorCreatedOn,
      `candidate applicability receipt ${receipt.id} reviewedOn`,
    );
    requireNotAfter(
      receipt.reviewedOn,
      decisionDate,
      `candidate applicability receipt ${receipt.id} reviewedOn`,
    );
    requireTrustedReviewer(
      trustedRegistry,
      receipt.reviewerId,
      "managing_editor",
      `candidate applicability receipt ${receipt.id}`,
      receipt.reviewedOn,
    );
  }
  for (const edge of candidateCorpus.edges) {
    for (const reviewerId of edge.provenance.reviewerIds) {
      requireTrustedReviewer(
        trustedRegistry,
        reviewerId,
        "managing_editor",
        `candidate graph edge ${edge.id}`,
        decisionDate,
      );
    }
  }
}

function evaluateCorpusPromotionWithAuthority({
  packet,
  reviewResult,
  decision = null,
  candidateCorpus = null,
  successorPacket = null,
  reviewerRegistry = null,
  trustedReviewerRegistrySha256 = null,
  reviewerAuthorityProvenance = null,
  evaluatedOn = null,
  searchResearchArtifacts = null,
  originalAssetArtifacts = null,
  cohortRegistry,
  resolvedGuides,
  runtimeGuides = null,
  registryPaths,
}) {
  validatePromotionSchema("corpus-review-packet.schema.json", packet, "source review packet");
  const authoritativeReview = validateCorpusReviewPacket({
    packet,
    cohortRegistry,
    resolvedGuides,
  });
  if (
    canonicalSha256(normalizeReviewResult(packet, reviewResult)) !==
    canonicalSha256(normalizeReviewResult(packet, authoritativeReview))
  ) {
    fail("source review result does not match a fresh review of the exact packet and runtime");
  }
  const blockedReceipt = buildReceipt({
    packet,
    reviewResult: authoritativeReview,
    resolvedGuides,
    promotionStatus: "BLOCKED",
    candidateCorpus: null,
  });
  if (
    decision === null &&
    candidateCorpus === null &&
    successorPacket === null &&
    reviewerRegistry === null &&
    trustedReviewerRegistrySha256 === null &&
    reviewerAuthorityProvenance === null &&
    evaluatedOn === null &&
    searchResearchArtifacts === null &&
    originalAssetArtifacts === null
  ) {
    return blockedReceipt;
  }
  if (
    decision === null ||
    candidateCorpus === null ||
    successorPacket === null ||
    reviewerRegistry === null ||
    trustedReviewerRegistrySha256 === null ||
    reviewerAuthorityProvenance === null ||
    evaluatedOn === null ||
    searchResearchArtifacts === null ||
    originalAssetArtifacts === null
  ) {
    fail(
      "a promotion decision, candidate corpus, immutable successor packet, trusted reviewer registry and digest, authority provenance, admission date, search artifacts, and original-asset bytes must be supplied together",
    );
  }
  if (!Array.isArray(runtimeGuides) || runtimeGuides.length === 0) {
    fail("candidate promotion requires the freshly resolved raw runtime guide registry entries");
  }
  requireRecord(decision, "promotion decision");
  assertNoDecisionDeliveryClaims(decision);
  validatePromotionSchema("corpus-promotion-decision.schema.json", decision, "promotion decision");
  requireRecord(candidateCorpus, "candidate corpus");
  assertNoCandidateDeliveryClaims(candidateCorpus);
  validatePromotionSchema(
    "repository-corpus-candidate.schema.json",
    candidateCorpus,
    "candidate corpus",
  );

  requireDate(evaluatedOn, "promotion evaluatedOn");
  const authorityProvenance = validateReviewerAuthorityProvenance(reviewerAuthorityProvenance);
  const trustedRegistry = validateTrustedReviewerRegistry(
    reviewerRegistry,
    trustedReviewerRegistrySha256,
    evaluatedOn,
  );
  validatePromotionSchema(
    "corpus-review-packet.schema.json",
    successorPacket,
    "successor review packet",
  );
  validateSuccessorPacketIdentity(packet, successorPacket);
  const candidateResolvedGuides = runtimeGuides
    .map((guide) => projectResolvedGuide(guide))
    .sort((left, right) => compareBytes(left.path, right.path));
  const successorReview = validateCorpusReviewPacket({
    packet: successorPacket,
    cohortRegistry,
    resolvedGuides: candidateResolvedGuides,
  });
  if (
    candidateCorpus.sourceRevisionId !== packet.revisionId ||
    candidateCorpus.sourcePacketCanonicalSha256 !== canonicalSha256(packet) ||
    candidateCorpus.successorRevisionId !== successorPacket.revisionId ||
    candidateCorpus.successorPacketCanonicalSha256 !== canonicalSha256(successorPacket) ||
    candidateCorpus.reviewerRegistryId !== trustedRegistry.registryId ||
    candidateCorpus.reviewerRegistryCanonicalSha256 !== trustedRegistry.canonicalSha256 ||
    candidateCorpus.decisionId !== decision.decisionId
  ) {
    fail("candidate corpus provenance does not match the promotion decision");
  }
  const searchArtifactById = collectSearchResearchArtifacts(searchResearchArtifacts);
  const assetArtifactById = collectOriginalAssetArtifacts(originalAssetArtifacts);
  validateDecision({
    sourcePacket: packet,
    successorPacket,
    decision,
    candidateCorpus,
    resolvedGuides: candidateResolvedGuides,
    trustedRegistry,
    evaluatedOn,
    searchArtifactById,
    assetArtifactById,
  });
  validateCandidateIdentity(candidateCorpus, successorPacket, decision);
  validateRepositoryCorpus({
    corpus: candidateCorpus,
    cohortRegistry,
    resolvedGuides: runtimeGuides,
    registryPaths,
    publishedPaths: [],
    mode: "editorial_candidate",
  });
  validateCandidateReviewerBindings(
    candidateCorpus,
    trustedRegistry,
    decision.decidedOn,
    successorPacket.createdOn,
  );

  const eligible = buildReceipt({
    packet,
    reviewResult: authoritativeReview,
    resolvedGuides: candidateResolvedGuides,
    promotionStatus: "ELIGIBLE_FOR_CANONICAL_CORPUS",
    candidateCorpus,
  });
  const { receiptSha256: _discardedReceiptSha256, ...eligibleBody } = eligible;
  const productionTrust = authorityProvenance.source === "git_base";
  const finalReceipt = {
    ...eligibleBody,
    promotionStatus: productionTrust ? "ELIGIBLE_FOR_CANONICAL_CORPUS" : "TEST_ONLY_NOT_ADMISSIBLE",
    productionTrust,
    sourceRevisionId: packet.revisionId,
    successorRevisionId: successorPacket.revisionId,
    successorPacketCanonicalSha256: canonicalSha256(successorPacket),
    successorReviewReceiptSha256: canonicalSha256(successorReview),
    decisionId: decision.decisionId,
    decisionCanonicalSha256: canonicalSha256(decision),
    reviewerRegistryId: trustedRegistry.registryId,
    reviewerRegistryCanonicalSha256: trustedRegistry.canonicalSha256,
    reviewerAuthority: {
      source: authorityProvenance.source,
      baseRevision: authorityProvenance.baseRevision,
    },
    evaluatedOn,
    sourceRuntimeReceiptSha256: runtimeReceiptSha256(resolvedGuides, "source runtime receipts"),
    candidateRuntimeReceiptSha256: runtimeReceiptSha256(
      candidateResolvedGuides,
      "candidate runtime receipts",
    ),
  };
  return { ...finalReceipt, receiptSha256: canonicalSha256(finalReceipt) };
}

export function assertProductionPromotionAdmissionReceipt(receipt, expectedBaseRevision) {
  requireRecord(receipt, "production promotion admission receipt");
  if (
    typeof expectedBaseRevision !== "string" ||
    !GIT_OBJECT_ID_PATTERN.test(expectedBaseRevision)
  ) {
    fail("production admission validation requires one exact lowercase Git base object ID");
  }
  const { receiptSha256, ...receiptBody } = receipt;
  if (
    requireSha256(receiptSha256, "production promotion admission receipt digest") !==
    canonicalSha256(receiptBody)
  ) {
    fail("production promotion admission receipt digest does not match its canonical body");
  }
  if (
    receipt.artifactType !== "knowledge_corpus_promotion_admission_receipt" ||
    receipt.promotionStatus !== "ELIGIBLE_FOR_CANONICAL_CORPUS" ||
    receipt.productionTrust !== true
  ) {
    fail("promotion admission receipt is not production-trusted and eligible");
  }
  if (
    !isRecord(receipt.reviewerAuthority) ||
    receipt.reviewerAuthority.source !== "git_base" ||
    receipt.reviewerAuthority.baseRevision !== expectedBaseRevision
  ) {
    fail("promotion admission receipt is not bound to the expected exact Git authority base");
  }
  const authority = loadReviewerAuthorityAtGitBase(expectedBaseRevision);
  if (
    receipt.reviewerRegistryId !== authority.reviewerRegistry.registryId ||
    receipt.reviewerRegistryCanonicalSha256 !== authority.trustedReviewerRegistrySha256
  ) {
    fail("promotion admission receipt reviewer authority does not match the exact Git base");
  }
  return receipt;
}

export function evaluateCorpusPromotion(args) {
  requireRecord(args, "promotion evaluator arguments");
  if (
    "reviewerRegistry" in args ||
    "trustedReviewerRegistrySha256" in args ||
    "reviewerAuthorityProvenance" in args
  ) {
    fail("production promotion evaluation cannot accept caller-supplied reviewer authority");
  }
  const promotionInputs = [
    args.decision,
    args.candidateCorpus,
    args.successorPacket,
    args.searchResearchArtifacts,
    args.originalAssetArtifacts,
  ];
  const suppliedPromotionInputs = promotionInputs.filter(
    (value) => value !== null && value !== undefined,
  ).length;
  if (suppliedPromotionInputs === 0) return evaluateCorpusPromotionWithAuthority(args);
  if (suppliedPromotionInputs !== promotionInputs.length) {
    fail(
      "a promotion decision, candidate corpus, immutable successor packet, trusted reviewer registry and digest, authority provenance, admission date, search artifacts, and original-asset bytes must be supplied together",
    );
  }
  requireRecord(args.decision, "promotion decision");
  assertNoDecisionDeliveryClaims(args.decision);
  requireRecord(args.candidateCorpus, "candidate corpus");
  assertNoCandidateDeliveryClaims(args.candidateCorpus);
  if ("evaluatedOn" in args) {
    fail("production promotion evaluation derives evaluatedOn from the trusted UTC clock");
  }
  const authorityBaseRevision = process.env.KNOWLEDGE_BASE_REVISION?.trim() ?? "";
  if (!GIT_OBJECT_ID_PATTERN.test(authorityBaseRevision)) {
    fail("production promotion evaluation requires an exact trusted Knowledge base revision");
  }
  const authority = loadReviewerAuthorityAtGitBase(authorityBaseRevision);
  const receipt = evaluateCorpusPromotionWithAuthority({
    ...args,
    reviewerRegistry: authority.reviewerRegistry,
    trustedReviewerRegistrySha256: authority.trustedReviewerRegistrySha256,
    reviewerAuthorityProvenance: {
      source: "git_base",
      baseRevision: authority.baseRevision,
    },
    evaluatedOn: utcDate(),
  });
  return assertProductionPromotionAdmissionReceipt(receipt, authorityBaseRevision);
}

export function evaluateCorpusPromotionForTest(args, authority) {
  if (process.env.NODE_TEST_CONTEXT !== "child-v8") {
    fail("test-only promotion authority injection is unavailable outside a test process");
  }
  requireRecord(authority, "test reviewer authority");
  requireExactKeys(
    authority,
    ["reviewerRegistry", "trustedReviewerRegistrySha256"],
    "test reviewer authority",
  );
  return evaluateCorpusPromotionWithAuthority({
    ...args,
    ...authority,
    reviewerAuthorityProvenance: { source: "test_fixture", baseRevision: null },
  });
}
