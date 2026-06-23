#!/usr/bin/env node
// Demo-Proof local helper smoke test (Node built-in assert; zero deps).
// Validates path-safety guards for cleanup tooling.
import assert from "node:assert/strict";
import { isSafeArtifactDeletePath, assertSafeArtifactDeletePath } from "./demo-proof-artifact-utils.mjs";

const repoRoot = "/home/user/project";
let passed = 0;
let failed = 0;
function t(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL ${name}: ${e.message}`);
    failed++;
  }
}

console.log("isSafeArtifactDeletePath:");
t("rejects '/'", () => assert.equal(isSafeArtifactDeletePath("/", repoRoot), false));
t("rejects empty string", () => assert.equal(isSafeArtifactDeletePath("", repoRoot), false));
t("rejects repo root itself", () => assert.equal(isSafeArtifactDeletePath(repoRoot, repoRoot), false));
t("rejects path outside repo", () => assert.equal(isSafeArtifactDeletePath("/etc/passwd", repoRoot), false));
t("rejects non-string", () => assert.equal(isSafeArtifactDeletePath(null, repoRoot), false));
t("rejects empty repoRoot", () => assert.equal(isSafeArtifactDeletePath("/x/y", ""), false));
t("allows .artifacts/demo-proof-playwright-report", () =>
  assert.equal(isSafeArtifactDeletePath(`${repoRoot}/.artifacts/demo-proof-playwright-report`, repoRoot), true));
t("allows nested test-results trace.zip", () =>
  assert.equal(isSafeArtifactDeletePath(`${repoRoot}/test-results/some-spec/trace.zip`, repoRoot), true));
t("windows-style: rejects repo root", () =>
  assert.equal(isSafeArtifactDeletePath("C:\\repo", "C:\\repo"), false));
t("windows-style: allows nested", () =>
  assert.equal(isSafeArtifactDeletePath("C:\\repo\\.artifacts\\x", "C:\\repo"), true));

console.log("\nassertSafeArtifactDeletePath:");
t("throws on '/'", () => assert.throws(() => assertSafeArtifactDeletePath("/", repoRoot), /unsafe/));
t("throws on repo root", () => assert.throws(() => assertSafeArtifactDeletePath(repoRoot, repoRoot), /unsafe/));
t("does not throw on safe path", () =>
  assertSafeArtifactDeletePath(`${repoRoot}/.artifacts/demo-proof-playwright-report`, repoRoot));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
