import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canonicalSha256,
  TRUSTED_REVIEWER_REGISTRY_DIGEST_REPOSITORY_PATH,
  TRUSTED_REVIEWER_REGISTRY_REPOSITORY_PATH,
} from "./evaluate-corpus-promotion.mjs";
import { runReviewerAuthorityValidation } from "./validate-reviewer-authority.mjs";

const EMPTY_REGISTRY = {
  version: 1,
  artifactType: "knowledge_trusted_reviewer_registry",
  registryId: "verdant-knowledge-reviewers:unassigned-v1",
  issuedOn: "2026-08-26",
  reviewers: [],
};

function git(root, ...args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function writeAuthority(root, registry = EMPTY_REGISTRY, { digest = true } = {}) {
  const registryPath = path.join(root, TRUSTED_REVIEWER_REGISTRY_REPOSITORY_PATH);
  const digestPath = path.join(root, TRUSTED_REVIEWER_REGISTRY_DIGEST_REPOSITORY_PATH);
  mkdirSync(path.dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  if (digest) writeFileSync(digestPath, `${canonicalSha256(registry)}\n`, "utf8");
  return { registryPath, digestPath };
}

function createRepository({ authorityAtBase = "absent" } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "verdant-reviewer-authority-"));
  git(root, "init");
  git(root, "config", "user.email", "tests@verdant.invalid");
  git(root, "config", "user.name", "Verdant tests");
  writeFileSync(path.join(root, "README.txt"), "authority fixture\n", "utf8");
  if (authorityAtBase === "complete") writeAuthority(root);
  if (authorityAtBase === "registry_only") writeAuthority(root, EMPTY_REGISTRY, { digest: false });
  git(root, "add", ".");
  git(root, "commit", "-m", "fixture base");
  return { root, baseRevision: git(root, "rev-parse", "HEAD") };
}

function validateFixture(root, baseRevision, historyRequired = true) {
  return runReviewerAuthorityValidation({
    baseRevision,
    historyRequired,
    repositoryRoot: root,
    currentRegistryPath: path.join(root, TRUSTED_REVIEWER_REGISTRY_REPOSITORY_PATH),
    currentDigestPath: path.join(root, TRUSTED_REVIEWER_REGISTRY_DIGEST_REPOSITORY_PATH),
  });
}

test("permits only the exact empty registry when establishing the first authority baseline", () => {
  const { root, baseRevision } = createRepository();
  try {
    writeAuthority(root);
    const result = validateFixture(root, baseRevision);
    assert.equal(result.status, "pass");
    assert.equal(result.authorityBaseline, "initial_empty_bootstrap");
    assert.equal(result.reviewerCount, 0);

    const forged = structuredClone(EMPTY_REGISTRY);
    forged.registryId = "verdant-knowledge-reviewers:forged-v1";
    forged.reviewers.push({ id: "reviewer:forged" });
    writeAuthority(root, forged);
    assert.throws(
      () => validateFixture(root, baseRevision),
      /first authority baseline may introduce only the exact empty/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("binds the candidate-tree authority to the exact immutable Git base", () => {
  const { root, baseRevision } = createRepository({ authorityAtBase: "complete" });
  try {
    const unchanged = validateFixture(root, baseRevision);
    assert.equal(unchanged.authorityBaseline, "immutable_git_base");

    const forged = structuredClone(EMPTY_REGISTRY);
    forged.registryId = "verdant-knowledge-reviewers:replacement-v1";
    writeAuthority(root, forged);
    assert.throws(
      () => validateFixture(root, baseRevision),
      /reviewer authority changed relative to the exact target/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails closed for a partial authority base or a missing required base revision", () => {
  const partial = createRepository({ authorityAtBase: "registry_only" });
  try {
    writeAuthority(partial.root);
    assert.throws(
      () => validateFixture(partial.root, partial.baseRevision),
      /authority base must contain both trusted reviewer files or neither/,
    );
  } finally {
    rmSync(partial.root, { recursive: true, force: true });
  }

  const local = createRepository();
  try {
    writeAuthority(local.root);
    assert.throws(
      () => validateFixture(local.root, null),
      /required authority comparison needs an exact Git base revision/,
    );
  } finally {
    rmSync(local.root, { recursive: true, force: true });
  }
});
