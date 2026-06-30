#!/usr/bin/env node
/**
 * Pure/offline tests for scripts/check-client-secret-boundary-artifacts.mjs.
 * No `gh` calls.
 */
import {
  parseArgs,
  sanitizeLine,
  validateProofContent,
  formatSummary,
  REQUIRED_MARKERS,
  FORBIDDEN_PATTERNS,
  DEFAULT_REPO,
  DEFAULT_BRANCH,
  DEFAULT_OUT_DIR,
  ARTIFACTS,
  locateProofFile,
} from "./check-client-secret-boundary-artifacts.mjs";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failed = 0;
function t(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`not ok - ${name}\n  ${e.message}`);
  }
}

const VALID_PROOF = [
  "Client secret boundary guard: PASS",
  "Workflow: ci.yml",
  "Command: bun run test:client-secret-boundary",
  "Scanned client roots: src/components, src/pages, src/hooks, src/lib",
  "Blocked executable-code terms: SUPABASE_SERVICE_ROLE_KEY, service_role",
  "Secrets printed: no",
  "Raw logs uploaded: no",
].join("\n");

t("defaults match Verdant repo + branch + out dir", () => {
  assert.equal(DEFAULT_REPO, "Verdant-OS/verdant-grow-diary");
  assert.equal(DEFAULT_BRANCH, "verdant-grow-diary");
  assert.equal(DEFAULT_OUT_DIR, "artifacts/client-secret-boundary-proof-check");
  assert.equal(ARTIFACTS.length, 2);
  assert.deepEqual(
    ARTIFACTS.map((a) => a.artifact).sort(),
    ["client-secret-boundary-proof-ci", "client-secret-boundary-proof-docs-safety"],
  );
});

t("parseArgs supports overrides + run ids", () => {
  const a = parseArgs([
    "--repo=acme/x", "--branch=main", "--out-dir=tmp/x",
    "--ci-run-id=111", "--docs-run-id=222",
  ]);
  assert.deepEqual(a, {
    repo: "acme/x", branch: "main", outDir: "tmp/x",
    ciRunId: "111", docsRunId: "222",
  });
});

t("valid proof file passes validation", () => {
  const v = validateProofContent(VALID_PROOF);
  assert.equal(v.ok, true);
  assert.equal(v.missingMarkers.length, 0);
  assert.equal(v.contamination.length, 0);
});

t("missing a required marker fails", () => {
  const v = validateProofContent(VALID_PROOF.replace("Secrets printed: no", ""));
  assert.equal(v.ok, false);
  assert.ok(v.missingMarkers.some((m) => m.includes("Secrets printed")));
});

t("raw GitHub Actions log line fails", () => {
  const bad = VALID_PROOF + "\n2026-06-30T12:00:00.123Z some log content";
  const v = validateProofContent(bad);
  assert.equal(v.ok, false);
  assert.ok(v.contamination.includes("GitHub Actions log timestamp"));
});

t("##[group] log marker fails", () => {
  const bad = VALID_PROOF + "\n##[group]Run bun run test:client-secret-boundary";
  const v = validateProofContent(bad);
  assert.equal(v.ok, false);
  assert.ok(v.contamination.some((c) => c.includes("group marker")));
});

t("JWT-looking content fails", () => {
  const bad = VALID_PROOF + "\nleaked=eyJabcdefghij.klmnopqrstu.vwxyz1234567";
  const v = validateProofContent(bad);
  assert.equal(v.ok, false);
  assert.ok(v.contamination.includes("JWT-shaped token"));
});

t("Bearer token fails", () => {
  const bad = VALID_PROOF + "\nAuthorization: Bearer abc.def.ghi";
  const v = validateProofContent(bad);
  assert.equal(v.ok, false);
  assert.ok(v.contamination.includes("Bearer token"));
});

t("service_role assignment fails (but the literal phrase alone passes)", () => {
  // Literal phrase by itself is allowed (it appears in REQUIRED_MARKERS).
  assert.equal(validateProofContent(VALID_PROOF).ok, true);
  const bad = VALID_PROOF + "\nservice_role=supersecret";
  const v = validateProofContent(bad);
  assert.equal(v.ok, false);
  assert.ok(v.contamination.includes("service_role assignment"));
});

t("SUPABASE_SERVICE_ROLE_KEY assignment fails", () => {
  const bad = VALID_PROOF + "\nSUPABASE_SERVICE_ROLE_KEY=zzz";
  const v = validateProofContent(bad);
  assert.equal(v.ok, false);
  assert.ok(v.contamination.includes("SUPABASE_SERVICE_ROLE_KEY assignment"));
});

t("bridge secret column names fail", () => {
  for (const col of ["secret_ciphertext", "secret_nonce", "secret_hash", "token_hash"]) {
    const v = validateProofContent(VALID_PROOF + `\n${col}: abc`);
    assert.equal(v.ok, false, `${col} should be rejected`);
  }
});

t("env dump fails", () => {
  const v = validateProofContent(VALID_PROOF + "\nenv | grep KEY");
  assert.equal(v.ok, false);
  assert.ok(v.contamination.includes("env dump pipe"));
});

t("add-mask directive fails", () => {
  const v = validateProofContent(VALID_PROOF + "\n::add-mask::supersecret");
  assert.equal(v.ok, false);
});

t("locateProofFile returns null when artifact dir is missing", () => {
  const missing = join(tmpdir(), "csbproof-missing-" + Date.now());
  assert.equal(locateProofFile(missing), null);
});

t("locateProofFile finds nested .txt proof", () => {
  const dir = mkdtempSync(join(tmpdir(), "csbproof-"));
  const nested = join(dir, "nested");
  mkdirSync(nested);
  const file = join(nested, "client-secret-boundary-proof.txt");
  writeFileSync(file, VALID_PROOF, "utf8");
  assert.equal(locateProofFile(dir), file);
});

t("formatSummary never echoes raw body content", () => {
  const lines = formatSummary({
    workflow: "ci.yml",
    artifact: "client-secret-boundary-proof-ci",
    runId: "12345",
    proofFileName: "client-secret-boundary-proof.txt",
    missingMarkers: [],
    contamination: [],
    pass: true,
  });
  const joined = lines.join("\n");
  assert.ok(!joined.includes("Bearer"));
  assert.ok(!joined.includes("eyJ"));
  assert.ok(joined.includes("result:"));
  assert.ok(joined.includes("PASS"));
});

t("sanitizeLine strips JWT/Bearer/assignments", () => {
  const s = sanitizeLine("Bearer abc service_role=zzz eyJabcdefghij.klmnopqrstu.vwxyz1234567");
  assert.ok(s.includes("Bearer [redacted]"));
  assert.ok(s.includes("service_role=[redacted]"));
  assert.ok(s.includes("[redacted-jwt]"));
});

t("REQUIRED_MARKERS includes the six fixed proof keys", () => {
  assert.equal(REQUIRED_MARKERS.length, 6);
  assert.ok(REQUIRED_MARKERS.includes("Secrets printed: no"));
  assert.ok(REQUIRED_MARKERS.includes("Raw logs uploaded: no"));
});

t("FORBIDDEN_PATTERNS covers the documented contamination set", () => {
  const names = FORBIDDEN_PATTERNS.map((p) => p.name);
  for (const need of [
    "JWT-shaped token", "Bearer token", "service_role assignment",
    "SUPABASE_SERVICE_ROLE_KEY assignment",
    "secret_ciphertext column", "secret_nonce column",
    "secret_hash column", "token_hash column",
  ]) {
    assert.ok(names.includes(need), `missing forbidden pattern: ${need}`);
  }
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll tests passed.`);
