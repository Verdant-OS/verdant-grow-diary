#!/usr/bin/env node
/**
 * Tests for scripts/check-client-secret-boundary-ci.mjs.
 * Pure helper tests — no `gh` network calls.
 */
import {
  parseArgs,
  sanitizeLine,
  summarizeRun,
  formatSummaryLines,
  DEFAULT_REPO,
  DEFAULT_BRANCH,
  WORKFLOWS,
  GUARD_STEP_MARKER,
  GUARD_OK_MARKER,
} from "./check-client-secret-boundary-ci.mjs";
import assert from "node:assert/strict";

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

t("defaults match the Verdant repo + branch", () => {
  assert.equal(DEFAULT_REPO, "Verdant-OS/verdant-grow-diary");
  assert.equal(DEFAULT_BRANCH, "verdant-grow-diary");
  assert.deepEqual(WORKFLOWS, ["ci.yml", "docs-safety.yml"]);
});

t("parseArgs supports --repo/--branch/--limit overrides", () => {
  const a = parseArgs(["--repo=acme/x", "--branch=main", "--limit=3"]);
  assert.deepEqual(a, { repo: "acme/x", branch: "main", limit: 3 });
});

t("parseArgs falls back to defaults", () => {
  const a = parseArgs([]);
  assert.equal(a.repo, DEFAULT_REPO);
  assert.equal(a.branch, DEFAULT_BRANCH);
  assert.equal(a.limit, 1);
});

t("sanitizeLine redacts JWT-shaped tokens", () => {
  const out = sanitizeLine(
    "auth: eyJabcdefghij.klmnopqrstuv.wxyz1234567890ZZZZ trailing",
  );
  assert.ok(out.includes("[redacted-jwt]"));
  assert.ok(!out.includes("eyJabcdefghij"));
});

t("sanitizeLine redacts service_role assignments", () => {
  const out = sanitizeLine("SUPABASE_SERVICE_ROLE_KEY=supersecretvalue");
  assert.ok(out.includes("[redacted]"));
  assert.ok(!out.includes("supersecretvalue"));
});

t("sanitizeLine redacts Bearer tokens", () => {
  const out = sanitizeLine("Authorization: Bearer abc.def.ghi");
  assert.ok(out.includes("Bearer [redacted]"));
});

t("sanitizeLine clamps overly long lines", () => {
  const out = sanitizeLine("x".repeat(500));
  assert.ok(out.length <= 201);
});

t("summarizeRun PASSes only when run completed/success + both markers present", () => {
  const s = summarizeRun({
    workflow: "ci.yml",
    run: { status: "completed", conclusion: "success", headSha: "abc123def4567890", url: "https://x" },
    hasGuardStep: true,
    hasGuardOk: true,
  });
  assert.equal(s.pass, true);
  assert.equal(s.headSha.length, 12);
});

t("summarizeRun FAILs when guard ok marker is missing", () => {
  const s = summarizeRun({
    workflow: "ci.yml",
    run: { status: "completed", conclusion: "success", headSha: "x", url: "u" },
    hasGuardStep: true,
    hasGuardOk: false,
  });
  assert.equal(s.pass, false);
});

t("summarizeRun FAILs when run is missing entirely", () => {
  const s = summarizeRun({
    workflow: "docs-safety.yml",
    run: null,
    hasGuardStep: false,
    hasGuardOk: false,
  });
  assert.equal(s.pass, false);
  assert.equal(s.status, "missing");
});

t("summarizeRun FAILs when conclusion is failure", () => {
  const s = summarizeRun({
    workflow: "ci.yml",
    run: { status: "completed", conclusion: "failure", headSha: "x", url: "u" },
    hasGuardStep: true,
    hasGuardOk: true,
  });
  assert.equal(s.pass, false);
});

t("formatSummaryLines never echoes raw log content", () => {
  const lines = formatSummaryLines(
    summarizeRun({
      workflow: "ci.yml",
      run: { status: "completed", conclusion: "success", headSha: "x", url: "u" },
      hasGuardStep: true,
      hasGuardOk: true,
    }),
  );
  const joined = lines.join("\n");
  assert.ok(!joined.includes("eyJ"));
  assert.ok(!/Bearer\s+\S+/.test(joined));
  assert.ok(joined.includes("result:"));
});

t("marker constants stay in sync with the guard script output", () => {
  assert.equal(GUARD_STEP_MARKER, "Client secret boundary guard");
  assert.equal(GUARD_OK_MARKER, "Client secret boundary OK.");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nAll tests passed.`);
