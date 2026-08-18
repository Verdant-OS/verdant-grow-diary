#!/usr/bin/env node
import { appendFileSync, lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SOLO_FOUNDER_POLICY,
  validateSoloFounderProductionAuthorization,
} from "./lib/solo-founder-production-authorization.mjs";

const MAX_JSON_BYTES = 65_536;

function reject() {
  throw new Error("solo_founder_authorization_rejected");
}

function safePositiveInteger(value) {
  return typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
}

function githubLogin(value) {
  return (
    typeof value === "string" &&
    /^(?:[A-Za-z0-9]|[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9]))$/.test(value)
  );
}

function sha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function requiredText(env, key) {
  const value = env[key];
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) reject();
  return value;
}

function readJson(env, key, readFile, stat) {
  const path = requiredText(env, key);
  const metadata = stat(path);
  if (!metadata || typeof metadata.size !== "number" || metadata.size < 0 || metadata.size > MAX_JSON_BYTES) {
    reject();
  }
  if (typeof metadata.isFile === "function" && !metadata.isFile()) reject();
  const raw = readFile(path);
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) reject();
  try {
    return JSON.parse(text);
  } catch {
    reject();
  }
}

function expectedFromEnvironment(env) {
  const repositoryId = safePositiveInteger(requiredText(env, "GITHUB_REPOSITORY_ID"));
  const runId = safePositiveInteger(requiredText(env, "GITHUB_RUN_ID"));
  const runAttempt = safePositiveInteger(requiredText(env, "GITHUB_RUN_ATTEMPT"));
  const actorId = safePositiveInteger(requiredText(env, "GITHUB_ACTOR_ID"));
  const repositoryFullName = requiredText(env, "GITHUB_REPOSITORY");
  const actorLogin = requiredText(env, "GITHUB_ACTOR");
  const triggeringActorLogin = requiredText(env, "GITHUB_TRIGGERING_ACTOR");
  const workflowPath = requiredText(env, "SOLO_FOUNDER_EXPECTED_WORKFLOW_PATH");
  const acknowledgement = requiredText(env, "SOLO_FOUNDER_ACKNOWLEDGEMENT");
  const headSha = requiredText(env, "GITHUB_SHA");
  if (
    repositoryId === null ||
    runId === null ||
    runAttempt !== 1 ||
    actorId !== SOLO_FOUNDER_POLICY.founderUserId ||
    repositoryFullName !== "Verdant-OS/verdant-grow-diary" ||
    actorLogin !== SOLO_FOUNDER_POLICY.founderLogin ||
    triggeringActorLogin !== SOLO_FOUNDER_POLICY.founderLogin ||
    !githubLogin(actorLogin) ||
    !githubLogin(triggeringActorLogin) ||
    !sha(headSha) ||
    acknowledgement !== SOLO_FOUNDER_POLICY.acknowledgement
  ) {
    reject();
  }
  return {
    repositoryId,
    repositoryFullName,
    runId,
    runAttempt,
    sha: headSha,
    actorId,
    actorLogin,
    triggeringActorId: actorId,
    triggeringActorLogin,
    workflowPath,
    acknowledgement,
  };
}

function evidenceEnvironmentLines(evidence) {
  const values = {
    SOLO_FOUNDER_DELIVERY_MODE: evidence.deliveryMode,
    SOLO_FOUNDER_VERIFIED_USER_ID: String(evidence.founderUserId),
    SOLO_FOUNDER_VERIFIED_LOGIN: evidence.founderLogin,
    SOLO_FOUNDER_VERIFIED_ENVIRONMENT: evidence.environmentName,
    SOLO_FOUNDER_ACKNOWLEDGEMENT_VERIFIED: String(evidence.acknowledgementVerified),
    SOLO_FOUNDER_ENVIRONMENT_CONTRACT_VERIFIED: String(evidence.environmentContractVerified),
    SOLO_FOUNDER_ENVIRONMENT_APPROVAL_VERIFIED: String(evidence.environmentApprovalVerified),
    SOLO_FOUNDER_MINIMUM_REVIEW_SECONDS: String(evidence.minimumReviewSeconds),
    SOLO_FOUNDER_MAXIMUM_REVIEW_SECONDS: String(evidence.maximumReviewSeconds),
  };
  return `${Object.entries(values)
    .map(([key, value]) => {
      if (!/^SOLO_FOUNDER_[A-Z0-9_]+$/.test(key) || /[\r\n]/.test(value)) reject();
      return `${key}=${value}`;
    })
    .join("\n")}\n`;
}

export function runSoloFounderProductionAuthorization({
  env = process.env,
  readFile = readFileSync,
  stat = lstatSync,
  appendFile = appendFileSync,
  logger = console,
} = {}) {
  try {
    const evidence = validateSoloFounderProductionAuthorization({
      currentRun: readJson(env, "CURRENT_RUN_JSON", readFile, stat),
      approvals: readJson(env, "CURRENT_RUN_APPROVALS_JSON", readFile, stat),
      environment: readJson(env, "SOLO_FOUNDER_ENVIRONMENT_JSON", readFile, stat),
      branchPolicies: readJson(env, "SOLO_FOUNDER_BRANCH_POLICIES_JSON", readFile, stat),
      expected: expectedFromEnvironment(env),
    });
    appendFile(requiredText(env, "GITHUB_ENV"), evidenceEnvironmentLines(evidence), {
      encoding: "utf8",
      mode: 0o600,
    });
    logger.log("Solo-founder production authorization validated.");
    return 0;
  } catch {
    logger.error("Solo-founder production authorization failed closed.");
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runSoloFounderProductionAuthorization();
}
