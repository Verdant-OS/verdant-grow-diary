import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  canonicalJson,
  canonicalSha256,
  loadReviewerAuthorityAtGitBase,
  TRUSTED_REVIEWER_REGISTRY_DIGEST_REPOSITORY_PATH,
  TRUSTED_REVIEWER_REGISTRY_REPOSITORY_PATH,
} from "./evaluate-corpus-promotion.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..");
const EMPTY_BOOTSTRAP_REGISTRY = Object.freeze({
  version: 1,
  artifactType: "knowledge_trusted_reviewer_registry",
  registryId: "verdant-knowledge-reviewers:unassigned-v1",
  issuedOn: "2026-08-26",
  reviewers: Object.freeze([]),
});
const EMPTY_BOOTSTRAP_DIGEST = "21c244fb4f64337cbe1a8493663897fa0abcf7483989766affb0566bc969ffdf";

function fail(message) {
  throw new Error(`Knowledge reviewer authority invalid: ${message}`);
}

function readCurrentAuthority(registryPath, digestPath) {
  let reviewerRegistry;
  try {
    reviewerRegistry = JSON.parse(readFileSync(registryPath, "utf8"));
  } catch (error) {
    fail(
      `current trusted reviewer registry is not readable JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  let trustedReviewerRegistrySha256;
  try {
    trustedReviewerRegistrySha256 = readFileSync(digestPath, "utf8").trim();
  } catch (error) {
    fail(
      `current trusted reviewer digest is unreadable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!/^[a-f0-9]{64}$/.test(trustedReviewerRegistrySha256)) {
    fail("current trusted reviewer digest must be one lowercase SHA-256 value");
  }
  const actualDigest = canonicalSha256(reviewerRegistry);
  if (actualDigest !== trustedReviewerRegistrySha256) {
    fail("current trusted reviewer registry does not match its canonical digest");
  }
  return { reviewerRegistry, trustedReviewerRegistrySha256 };
}

export function runReviewerAuthorityValidation({
  baseRevision = null,
  historyRequired = false,
  repositoryRoot = root,
  currentRegistryPath = path.join(repositoryRoot, TRUSTED_REVIEWER_REGISTRY_REPOSITORY_PATH),
  currentDigestPath = path.join(repositoryRoot, TRUSTED_REVIEWER_REGISTRY_DIGEST_REPOSITORY_PATH),
} = {}) {
  const current = readCurrentAuthority(currentRegistryPath, currentDigestPath);
  if (historyRequired && !baseRevision) {
    fail("required authority comparison needs an exact Git base revision");
  }
  if (!baseRevision) {
    return {
      status: "pass",
      authorityBaseline: "current_only_not_release_evidence",
      registryId: current.reviewerRegistry.registryId ?? null,
      reviewerCount: Array.isArray(current.reviewerRegistry.reviewers)
        ? current.reviewerRegistry.reviewers.length
        : null,
      canonicalSha256: current.trustedReviewerRegistrySha256,
    };
  }

  let base;
  try {
    base = loadReviewerAuthorityAtGitBase(baseRevision, repositoryRoot, {
      allowMissing: true,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (!base.exists) {
    if (
      canonicalJson(current.reviewerRegistry) !== canonicalJson(EMPTY_BOOTSTRAP_REGISTRY) ||
      current.trustedReviewerRegistrySha256 !== EMPTY_BOOTSTRAP_DIGEST
    ) {
      fail(
        "the first authority baseline may introduce only the exact empty, owner-unassigned registry",
      );
    }
    return {
      status: "pass",
      authorityBaseline: "initial_empty_bootstrap",
      baseRevision,
      registryId: EMPTY_BOOTSTRAP_REGISTRY.registryId,
      reviewerCount: 0,
      canonicalSha256: EMPTY_BOOTSTRAP_DIGEST,
    };
  }

  if (
    canonicalJson(current.reviewerRegistry) !== canonicalJson(base.reviewerRegistry) ||
    current.trustedReviewerRegistrySha256 !== base.trustedReviewerRegistrySha256
  ) {
    fail(
      "reviewer authority changed relative to the exact target; authority updates require a separate owner-controlled process and cannot ride a corpus-promotion change",
    );
  }
  return {
    status: "pass",
    authorityBaseline: "immutable_git_base",
    baseRevision,
    registryId: base.reviewerRegistry.registryId ?? null,
    reviewerCount: Array.isArray(base.reviewerRegistry.reviewers)
      ? base.reviewerRegistry.reviewers.length
      : null,
    canonicalSha256: base.trustedReviewerRegistrySha256,
  };
}

function main() {
  const baseRevision = process.env.KNOWLEDGE_BASE_REVISION?.trim() || null;
  const historyRequired = process.env.KNOWLEDGE_HISTORY_REQUIRED === "true";
  console.log(
    JSON.stringify(runReviewerAuthorityValidation({ baseRevision, historyRequired }), null, 2),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
