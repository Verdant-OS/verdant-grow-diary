#!/usr/bin/env node
// Tests for scripts/assert-vitest-batched-workflow-safety.mjs (Node assert).
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { auditWorkflow } from "./assert-vitest-batched-workflow-safety.mjs";

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); failed++; }
}

console.log("vitest-workflow-safety");

const realPath = fileURLToPath(new URL("../.github/workflows/vitest-batched-full-suite.yml", import.meta.url));
const real = readFileSync(realPath, "utf8");

t("passes the current workflow (chunk-size=1, 16 jobs, gates, no deploy)", () => {
  const r = auditWorkflow(real);
  if (!r.ok) throw new Error("expected pass, errors:\n  " + r.errors.join("\n  "));
  assert.equal(r.ok, true);
});

t("fails when --chunk-size is not 1 (e.g. 8)", () => {
  const bad = real.replace(/--chunk-size=1\b/, "--chunk-size=8");
  const r = auditWorkflow(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /chunk-size must be 1/.test(e)), "expected chunk-size error");
});

t("fails when matrix has only 8 jobs", () => {
  const bad = real.replace(/batch:\s*\[[^\]]*\]/, "batch: [0, 1, 2, 3, 4, 5, 6, 7]");
  const r = auditWorkflow(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /0\.\.15/.test(e)), "expected matrix coverage error");
});

t("fails when a safety gate is removed (typecheck)", () => {
  const bad = real.replace(/\n\s*bun run typecheck\b/, "\n          echo removed-typecheck");
  const r = auditWorkflow(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /typecheck/.test(e)), "expected missing-gate error");
});

t("fails when a deploy/publish command is present", () => {
  const bad = real.replace(/- name: Install/, "- name: Deploy\n        run: supabase functions deploy foo\n\n      - name: Install");
  const r = auditWorkflow(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /Forbidden command/.test(e)), "expected forbidden-command error");
});

t("fails when NODE_OPTIONS heap cap is missing", () => {
  const bad = real.replace(/NODE_OPTIONS:\s*--max-old-space-size=4096/, "NODE_OPTIONS: --enable-source-maps");
  const r = auditWorkflow(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /max-old-space-size=4096/.test(e)));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
