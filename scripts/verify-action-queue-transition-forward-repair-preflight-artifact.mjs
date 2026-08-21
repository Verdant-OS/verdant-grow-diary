#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { SOLO_FOUNDER_POLICY } from "./lib/solo-founder-production-authorization.mjs";
import { downloadArtifactArchive as downloadBoundedArtifactArchive } from "./verify-quicklog-corrections-preflight-artifact.mjs";

export const WORKFLOW_PATH = ".github/workflows/apply-action-queue-transition-forward-repair.yml";
export const ARTIFACT_PREFIX = "action-queue-transition-forward-repair-preflight";
export const MAX_ARCHIVE_BYTES = 65_536;
export const MAX_RECEIPT_BYTES = 32_768;

const ACCEPTED_RUN_WORKFLOW_PATHS = Object.freeze([
  WORKFLOW_PATH,
  `${WORKFLOW_PATH}@verdant-grow-diary`,
]);
const PROJECT_REF = "knkwiiywfkbqznbxwqfh";
const MIGRATION_VERSION = "20260819190852";
const MIGRATION_NAME = "action_queue_transition_forward_repair";
const MIGRATION_SHA256 = "FB887C43BE86AFFC39E59C2113E1D627053A6058E2B8DE06A6571D9F34F66C49";
const RECEIPT_MEMBER = "preflight-receipt.json";
const RECEIPT_KEYS = Object.freeze([
  "branch",
  "delivery_mode",
  "environment_approval_verified",
  "environment_contract_verified",
  "event",
  "founder_github_login",
  "founder_github_user_id",
  "head_sha",
  "migration_name",
  "migration_sha256",
  "migration_version",
  "maximum_review_seconds",
  "minimum_review_seconds",
  "operation",
  "outcome",
  "project_ref",
  "production_environment",
  "repository",
  "repository_id",
  "run_attempt",
  "run_id",
  "safe_to_apply",
  "schema_version",
  "solo_founder_acknowledgement_verified",
  "state_digest",
  "tool",
  "workflow_path",
]);

function reject() {
  throw new Error("preflight_artifact_rejected");
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function positiveInteger(value) {
  const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function lowercaseSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value) ? value : null;
}

function lowercaseDigest(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

function timestamp(value) {
  if (typeof value !== "string") return null;
  const numeric = Date.parse(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function repositoryMatches(value, expectedId, expectedName) {
  return (
    value &&
    typeof value === "object" &&
    positiveInteger(value.id) === expectedId &&
    value.full_name === expectedName
  );
}

function founderIdentity(value) {
  return (
    value &&
    typeof value === "object" &&
    positiveInteger(value.id) === SOLO_FOUNDER_POLICY.founderUserId &&
    value.login === SOLO_FOUNDER_POLICY.founderLogin
  );
}

export function validatePreflightArtifactMetadata({
  priorRun,
  currentRun,
  workflow,
  artifacts,
  expected,
}) {
  const repositoryId = positiveInteger(expected?.repositoryId);
  const currentRunId = positiveInteger(expected?.currentRunId);
  const preflightRunId = positiveInteger(expected?.preflightRunId);
  const preflightRunAttempt = positiveInteger(expected?.preflightRunAttempt);
  const preflightArtifactSha256 = lowercaseDigest(expected?.preflightArtifactSha256);
  const headSha = lowercaseSha(expected?.headSha);
  const observedNow = timestamp(expected?.now);
  if (
    !repositoryId ||
    !currentRunId ||
    !preflightRunId ||
    !preflightRunAttempt ||
    !preflightArtifactSha256 ||
    !headSha ||
    expected?.repository !== "Verdant-OS/verdant-grow-diary" ||
    observedNow === null
  ) {
    reject();
  }

  const priorRunId = positiveInteger(priorRun?.id);
  const observedCurrentRunId = positiveInteger(currentRun?.id);
  const runAttempt = positiveInteger(priorRun?.run_attempt);
  const currentRunAttempt = positiveInteger(currentRun?.run_attempt);
  const workflowId = positiveInteger(workflow?.id);
  const priorCreatedAt = timestamp(priorRun?.created_at);
  const priorUpdatedAt = timestamp(priorRun?.updated_at);
  const currentCreatedAt = timestamp(currentRun?.created_at);
  const workflowUpdatedAt = timestamp(workflow?.updated_at);
  if (
    priorRunId !== preflightRunId ||
    observedCurrentRunId !== currentRunId ||
    priorRunId === observedCurrentRunId ||
    runAttempt !== 1 ||
    currentRunAttempt !== 1 ||
    preflightRunAttempt !== runAttempt ||
    !workflowId ||
    priorRun?.workflow_id !== workflowId ||
    currentRun?.workflow_id !== workflowId ||
    !ACCEPTED_RUN_WORKFLOW_PATHS.includes(currentRun?.path) ||
    currentRun?.event !== "workflow_dispatch" ||
    !founderIdentity(priorRun?.actor) ||
    !founderIdentity(priorRun?.triggering_actor) ||
    !founderIdentity(currentRun?.actor) ||
    !founderIdentity(currentRun?.triggering_actor) ||
    currentRun?.head_branch !== "verdant-grow-diary" ||
    currentRun?.head_sha !== headSha ||
    !ACCEPTED_RUN_WORKFLOW_PATHS.includes(priorRun?.path) ||
    workflow?.path !== WORKFLOW_PATH ||
    workflow?.state !== "active" ||
    priorRun?.event !== "workflow_dispatch" ||
    priorRun?.status !== "completed" ||
    priorRun?.conclusion !== "success" ||
    priorRun?.head_branch !== "verdant-grow-diary" ||
    priorRun?.head_sha !== headSha ||
    !repositoryMatches(priorRun?.repository, repositoryId, expected.repository) ||
    !repositoryMatches(priorRun?.head_repository, repositoryId, expected.repository) ||
    !repositoryMatches(currentRun?.repository, repositoryId, expected.repository) ||
    !repositoryMatches(currentRun?.head_repository, repositoryId, expected.repository) ||
    priorCreatedAt === null ||
    priorUpdatedAt === null ||
    currentCreatedAt === null ||
    workflowUpdatedAt === null ||
    priorCreatedAt >= priorUpdatedAt ||
    priorUpdatedAt > currentCreatedAt ||
    workflowUpdatedAt > priorCreatedAt
  ) {
    reject();
  }

  const reviewAgeMs = currentCreatedAt - priorUpdatedAt;
  if (
    reviewAgeMs < SOLO_FOUNDER_POLICY.minimumReviewSeconds * 1000 ||
    reviewAgeMs > SOLO_FOUNDER_POLICY.maximumReviewSeconds * 1000
  ) {
    reject();
  }

  if (
    !artifacts ||
    !Array.isArray(artifacts.artifacts) ||
    !Number.isInteger(artifacts.total_count) ||
    artifacts.total_count !== artifacts.artifacts.length
  ) {
    reject();
  }
  const expectedName = `${ARTIFACT_PREFIX}-run-${priorRunId}-attempt-${runAttempt}`;
  const matching = artifacts.artifacts.filter((artifact) => artifact?.name === expectedName);
  if (matching.length !== 1) reject();
  const artifact = matching[0];
  const size = positiveInteger(artifact?.size_in_bytes);
  const artifactId = positiveInteger(artifact?.id);
  const digest =
    typeof artifact?.digest === "string" && artifact.digest.startsWith("sha256:")
      ? lowercaseDigest(artifact.digest.slice("sha256:".length))
      : null;
  const artifactRun = artifact?.workflow_run;
  const artifactCreatedAt = timestamp(artifact?.created_at);
  const artifactUpdatedAt = timestamp(artifact?.updated_at);
  const artifactExpiresAt = timestamp(artifact?.expires_at);
  if (
    !artifactId ||
    !size ||
    size > MAX_ARCHIVE_BYTES ||
    artifact.expired !== false ||
    digest !== preflightArtifactSha256 ||
    positiveInteger(artifactRun?.id) !== priorRunId ||
    positiveInteger(artifactRun?.repository_id) !== repositoryId ||
    positiveInteger(artifactRun?.head_repository_id) !== repositoryId ||
    artifactRun?.head_branch !== "verdant-grow-diary" ||
    artifactRun?.head_sha !== headSha ||
    artifactCreatedAt === null ||
    artifactUpdatedAt === null ||
    artifactExpiresAt === null ||
    artifactCreatedAt < priorCreatedAt ||
    artifactCreatedAt > artifactUpdatedAt ||
    artifactUpdatedAt > priorUpdatedAt ||
    artifactUpdatedAt >= currentCreatedAt ||
    artifactExpiresAt <= observedNow
  ) {
    reject();
  }
  return Object.freeze({ artifact, artifactId, archiveDigest: digest, runAttempt });
}

// Reuse the already-reviewed bounded two-hop GitHub download primitive. It
// accepts only the Verdant repository, sends the token only to api.github.com,
// requires an HTTPS credential-free signed URL, and enforces the same cap.
export async function downloadArtifactArchive(options) {
  try {
    return await downloadBoundedArtifactArchive(options);
  } catch {
    reject();
  }
}

function validateReceipt(value, expected, runAttempt, priorRun) {
  if (!exactKeys(value, RECEIPT_KEYS)) reject();
  if (
    value.schema_version !== 1 ||
    value.tool !== "apply-action-queue-transition-forward-repair" ||
    value.operation !== "PREFLIGHT" ||
    !["safe_to_apply", "schema_live_ledger_absent"].includes(value.outcome) ||
    value.safe_to_apply !== true ||
    value.repository !== expected.repository ||
    value.repository_id !== String(expected.repositoryId) ||
    value.workflow_path !== WORKFLOW_PATH ||
    value.run_id !== String(expected.preflightRunId) ||
    value.run_attempt !== runAttempt ||
    value.event !== "workflow_dispatch" ||
    value.branch !== "verdant-grow-diary" ||
    value.head_sha !== expected.headSha ||
    value.project_ref !== PROJECT_REF ||
    value.migration_version !== MIGRATION_VERSION ||
    value.migration_name !== MIGRATION_NAME ||
    value.migration_sha256 !== MIGRATION_SHA256 ||
    value.delivery_mode !== SOLO_FOUNDER_POLICY.deliveryMode ||
    value.founder_github_user_id !== SOLO_FOUNDER_POLICY.founderUserId ||
    value.founder_github_user_id !== priorRun.actor.id ||
    value.founder_github_login !== SOLO_FOUNDER_POLICY.founderLogin ||
    value.founder_github_login !== priorRun.actor.login ||
    value.production_environment !== SOLO_FOUNDER_POLICY.environmentName ||
    value.solo_founder_acknowledgement_verified !== true ||
    value.environment_contract_verified !== true ||
    value.environment_approval_verified !== true ||
    value.minimum_review_seconds !== SOLO_FOUNDER_POLICY.minimumReviewSeconds ||
    value.maximum_review_seconds !== SOLO_FOUNDER_POLICY.maximumReviewSeconds ||
    !lowercaseDigest(value.state_digest)
  ) {
    reject();
  }
  return value.state_digest;
}

function findEndOfCentralDirectory(archive) {
  for (
    let offset = archive.length - 22;
    offset >= Math.max(0, archive.length - 65_557);
    offset -= 1
  ) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function inspectSingleZipMember(archive) {
  const eocd = findEndOfCentralDirectory(archive);
  if (eocd < 0 || eocd + 22 > archive.length) reject();
  const disk = archive.readUInt16LE(eocd + 4);
  const centralDisk = archive.readUInt16LE(eocd + 6);
  const entriesOnDisk = archive.readUInt16LE(eocd + 8);
  const entriesTotal = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);
  const commentLength = archive.readUInt16LE(eocd + 20);
  if (
    disk !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== 1 ||
    entriesTotal !== 1 ||
    eocd + 22 + commentLength !== archive.length ||
    centralOffset + centralSize !== eocd ||
    centralOffset + 46 > eocd ||
    archive.readUInt32LE(centralOffset) !== 0x02014b50
  ) {
    reject();
  }
  const flags = archive.readUInt16LE(centralOffset + 8);
  const method = archive.readUInt16LE(centralOffset + 10);
  const expectedCrc = archive.readUInt32LE(centralOffset + 16);
  const compressedSize = archive.readUInt32LE(centralOffset + 20);
  const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
  const nameLength = archive.readUInt16LE(centralOffset + 28);
  const extraLength = archive.readUInt16LE(centralOffset + 30);
  const fileCommentLength = archive.readUInt16LE(centralOffset + 32);
  const diskStart = archive.readUInt16LE(centralOffset + 34);
  const externalAttributes = archive.readUInt32LE(centralOffset + 38);
  const localOffset = archive.readUInt32LE(centralOffset + 42);
  const centralEnd = centralOffset + 46 + nameLength + extraLength + fileCommentLength;
  const name = archive
    .subarray(centralOffset + 46, centralOffset + 46 + nameLength)
    .toString("utf8");
  const fileType = (externalAttributes >>> 16) & 0o170000;
  if (
    centralEnd !== eocd ||
    (flags & 0x1) !== 0 ||
    (flags & ~(0x8 | 0x800 | 0x2 | 0x4)) !== 0 ||
    ![0, 8].includes(method) ||
    diskStart !== 0 ||
    compressedSize < 1 ||
    compressedSize > MAX_ARCHIVE_BYTES ||
    uncompressedSize < 1 ||
    uncompressedSize > MAX_RECEIPT_BYTES ||
    name !== RECEIPT_MEMBER ||
    name.includes("\\") ||
    name.includes("..") ||
    (fileType !== 0 && fileType !== 0o100000) ||
    localOffset + 30 > centralOffset ||
    archive.readUInt32LE(localOffset) !== 0x04034b50
  ) {
    reject();
  }
  const localFlags = archive.readUInt16LE(localOffset + 6);
  const localMethod = archive.readUInt16LE(localOffset + 8);
  const localCrc = archive.readUInt32LE(localOffset + 14);
  const localCompressedSize = archive.readUInt32LE(localOffset + 18);
  const localUncompressedSize = archive.readUInt32LE(localOffset + 22);
  const localNameLength = archive.readUInt16LE(localOffset + 26);
  const localExtraLength = archive.readUInt16LE(localOffset + 28);
  const localName = archive
    .subarray(localOffset + 30, localOffset + 30 + localNameLength)
    .toString("utf8");
  const dataStart = localOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + compressedSize;
  if (
    localFlags !== flags ||
    localMethod !== method ||
    localName !== RECEIPT_MEMBER ||
    dataStart > centralOffset ||
    dataEnd > centralOffset
  ) {
    reject();
  }
  if ((flags & 0x8) === 0) {
    if (
      localCrc !== expectedCrc ||
      localCompressedSize !== compressedSize ||
      localUncompressedSize !== uncompressedSize ||
      dataEnd !== centralOffset
    ) {
      reject();
    }
  } else {
    const descriptorSize = centralOffset - dataEnd;
    const descriptorOffset = descriptorSize === 16 ? dataEnd + 4 : dataEnd;
    if (
      ![12, 16].includes(descriptorSize) ||
      (descriptorSize === 16 && archive.readUInt32LE(dataEnd) !== 0x08074b50) ||
      archive.readUInt32LE(descriptorOffset) !== expectedCrc ||
      archive.readUInt32LE(descriptorOffset + 4) !== compressedSize ||
      archive.readUInt32LE(descriptorOffset + 8) !== uncompressedSize
    ) {
      reject();
    }
  }
  return Object.freeze({ method, expectedCrc, compressedSize, uncompressedSize, dataStart });
}

function readSingleZipMember(archive) {
  const member = inspectSingleZipMember(archive);
  const compressed = archive.subarray(member.dataStart, member.dataStart + member.compressedSize);
  let receiptBytes;
  try {
    receiptBytes =
      member.method === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: MAX_RECEIPT_BYTES + 1 });
  } catch {
    reject();
  }
  if (
    !receiptBytes ||
    receiptBytes.length !== member.uncompressedSize ||
    receiptBytes.length < 1 ||
    receiptBytes.length > MAX_RECEIPT_BYTES ||
    crc32(receiptBytes) !== member.expectedCrc
  ) {
    reject();
  }
  return receiptBytes;
}

export async function verifyPreflightArtifactBundle({
  priorRun,
  currentRun,
  workflow,
  artifacts,
  archive,
  expected,
}) {
  const metadata = validatePreflightArtifactMetadata({
    priorRun,
    currentRun,
    workflow,
    artifacts,
    expected,
  });
  if (!Buffer.isBuffer(archive) || archive.length < 1 || archive.length > MAX_ARCHIVE_BYTES) {
    reject();
  }
  if (createHash("sha256").update(archive).digest("hex") !== metadata.archiveDigest) reject();
  const receiptBytes = readSingleZipMember(archive);
  let receipt;
  try {
    receipt = JSON.parse(receiptBytes.toString("utf8"));
  } catch {
    reject();
  }
  const receiptDigest = validateReceipt(receipt, expected, metadata.runAttempt, priorRun);
  return Object.freeze({ receiptDigest, artifactId: metadata.artifactId });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function main(env = process.env) {
  try {
    const expected = {
      repository: env.GITHUB_REPOSITORY,
      repositoryId: env.GITHUB_REPOSITORY_ID,
      currentRunId: env.GITHUB_RUN_ID,
      preflightRunId: env.PREFLIGHT_RUN_ID,
      preflightRunAttempt: env.EXPECTED_PREFLIGHT_RUN_ATTEMPT,
      preflightArtifactSha256: env.EXPECTED_PREFLIGHT_ARTIFACT_SHA256,
      headSha: env.EXPECTED_HEAD_SHA,
      now: new Date().toISOString(),
    };
    const priorRun = readJson(env.PREFLIGHT_RUN_JSON);
    const currentRun = readJson(env.CURRENT_RUN_JSON);
    const workflow = readJson(env.WORKFLOW_JSON);
    const artifacts = readJson(env.PREFLIGHT_ARTIFACTS_JSON);
    const metadata = validatePreflightArtifactMetadata({
      priorRun,
      currentRun,
      workflow,
      artifacts,
      expected,
    });
    const archive = await downloadArtifactArchive({
      repository: expected.repository,
      artifactId: metadata.artifactId,
      token: env.GITHUB_TOKEN,
    });
    const verified = await verifyPreflightArtifactBundle({
      priorRun,
      currentRun,
      workflow,
      artifacts,
      archive,
      expected,
    });
    if (!env.GITHUB_ENV) reject();
    appendFileSync(env.GITHUB_ENV, `PREFLIGHT_RECEIPT_DIGEST=${verified.receiptDigest}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    console.log("Authenticated Action Queue transition PREFLIGHT artifact validated.");
    return 0;
  } catch {
    console.error(
      "Authenticated Action Queue transition PREFLIGHT artifact validation failed closed.",
    );
    return 1;
  }
}

const isDirectInvocation =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) process.exitCode = await main();
