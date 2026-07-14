#!/usr/bin/env bunx tsx
/**
 * Static/unit tests for scripts/e2e/verify-pheno-paid-smoke-fixtures.ts
 * and scripts/e2e/run-pheno-paid-smoke-local.mjs.
 *
 * Runs the pure `verifyComparisonReadyRows` against synthetic row shapes and
 * asserts BLOCKED/HYDRATED behavior. Also spawns the CLIs in secret-free
 * environments to confirm SKIPPED / FAIL messaging and secret redaction.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const FORBIDDEN = [
  "SUPER_SECRET_SERVICE_ROLE_VALUE",
  "super-secret-password",
  "test@example.com",
  "fixture-uuid-abc-123",
];

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === "function") throw new Error("test must be sync");
    passed++; console.log(`  ok  ${name}`);
  } catch (e) {
    failed++; console.log(`  FAIL ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
async function testAsync(name, fn) {
  try { await fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}: ${e instanceof Error ? e.message : e}`); }
}

console.log("verify-pheno-paid-smoke-fixtures tests");
console.log("======================================");

// Pure verifier tests via direct TS import (this file is run under bunx tsx).
process.env.VERIFY_PHENO_SMOKE_LIB_ONLY = "1";
const { verifyComparisonReadyRows } = await import("./verify-pheno-paid-smoke-fixtures.ts");

function makePlants(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `plant-${i}`, name: `p${i}`, candidate_label: String.fromCharCode(65 + i),
    strain: null, stage: "flower", grow_id: "g", tent_id: "t",
    photo_url: null, is_archived: false,
  }));
}

test("HYDRATED when every candidate has score + smoke", () => {
  const plants = makePlants(2);
  const out = verifyComparisonReadyRows("hunt", {
    plants,
    scores: plants.map((p) => ({ plant_id: p.id, traits: {}, note: "dense resinous" })),
    smoke: plants.map((p) => ({
      plant_id: p.id, flavor_descriptors: ["citrus"], effect_descriptors: ["uplifting"],
      smoothness: 8, potency_impression: 7, verdict: "keeper",
    })),
    labs: [],
  });
  assert.equal(out.status, "HYDRATED");
  assert.equal(out.readiness, "comparison_ready");
  assert.equal(out.candidateCount, 2);
});

test("BLOCKED when a candidate has empty expression", () => {
  const plants = makePlants(2);
  const out = verifyComparisonReadyRows("hunt", {
    plants,
    scores: [{ plant_id: plants[0].id, traits: {}, note: "note" }],
    smoke: [{
      plant_id: plants[0].id, flavor_descriptors: ["citrus"], effect_descriptors: [],
      smoothness: null, potency_impression: null, verdict: "keeper",
    }],
    labs: [],
  });
  assert.equal(out.status, "BLOCKED");
});

test("BLOCKED when fewer than 2 candidates", () => {
  const plants = makePlants(1);
  const out = verifyComparisonReadyRows("hunt", {
    plants,
    scores: [{ plant_id: plants[0].id, traits: {}, note: "n" }],
    smoke: [{
      plant_id: plants[0].id, flavor_descriptors: [], effect_descriptors: [],
      smoothness: null, potency_impression: null, verdict: "keeper",
    }],
    labs: [],
  });
  assert.equal(out.status, "BLOCKED");
  assert.equal(out.reason, "fewer than 2 candidates");
});

test("BLOCKED when only raw lab rows exist and no phenotype signal", () => {
  const plants = makePlants(2);
  // Seeder writes dominant_terpenes as string[], which is filtered out by the
  // adapter (needs {name, pct} objects), so this lab produces no expression.
  const out = verifyComparisonReadyRows("hunt", {
    plants, scores: [], smoke: [],
    labs: plants.map((p) => ({
      plant_id: p.id, source: "estimate",
      thc_pct: null, cbd_pct: null, total_cannabinoids_pct: null,
      dominant_terpenes: ["limonene"],
    })),
  });
  assert.equal(out.status, "BLOCKED");
});

test("BLOCKED when readiness != comparison_ready even with expressions", () => {
  const plants = makePlants(2);
  // Only phenotype notes, no smoke test → pending_until_cure / harvest.
  const out = verifyComparisonReadyRows("hunt", {
    plants,
    scores: plants.map((p) => ({ plant_id: p.id, traits: {}, note: "dense" })),
    smoke: [], labs: [],
  });
  assert.equal(out.status, "BLOCKED");
  assert.notEqual(out.readiness, "comparison_ready");
});

// CLI tests (no secrets in env → SKIPPED, and no secret leakage in output).
delete process.env.VERIFY_PHENO_SMOKE_LIB_ONLY;

function runNode(cmd, args, env) {
  return spawnSync(cmd, args, { encoding: "utf8", env: { ...process.env, ...env } });
}

await testAsync("verify CLI reports SKIPPED with empty env", async () => {
  const r = runNode("bunx", ["tsx", "scripts/e2e/verify-pheno-paid-smoke-fixtures.ts"], {
    SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", E2E_SUPABASE_URL: "", E2E_SUPABASE_SERVICE_ROLE_KEY: "",
    E2E_PHENO_HUNT_ID_COMPARISON_READY: "",
  });
  const out = (r.stdout || "") + (r.stderr || "");
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${out}`);
  assert.match(out, /Result: SKIPPED/);
});

await testAsync("verify CLI FAILs on hosted Supabase host", async () => {
  const r = runNode("bunx", ["tsx", "scripts/e2e/verify-pheno-paid-smoke-fixtures.ts"], {
    SUPABASE_URL: "https://knkwiiywfkbqznbxwqfh.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "SUPER_SECRET_SERVICE_ROLE_VALUE",
    E2E_SUPABASE_URL: "", E2E_SUPABASE_SERVICE_ROLE_KEY: "",
    E2E_PHENO_HUNT_ID_COMPARISON_READY: "",
  });
  const out = (r.stdout || "") + (r.stderr || "");
  assert.equal(r.status, 1);
  assert.match(out, /FAIL/);
  for (const s of FORBIDDEN) assert.ok(!out.includes(s), `output leaked "${s}"`);
});

await testAsync("orchestrator CLI is SKIPPED (exit 2) with no local env", async () => {
  const r = runNode("node", ["scripts/e2e/run-pheno-paid-smoke-local.mjs"], {
    SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
    E2E_PHENO_FREE_EMAIL: "", E2E_PHENO_FREE_PASSWORD: "",
    E2E_PHENO_PRO_EMAIL: "", E2E_PHENO_PRO_PASSWORD: "",
    E2E_PHENO_CANCELED_EMAIL: "", E2E_PHENO_CANCELED_PASSWORD: "",
    E2E_PHENO_FOUNDER_EMAIL: "", E2E_PHENO_FOUNDER_PASSWORD: "",
  });
  const out = (r.stdout || "") + (r.stderr || "");
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}: ${out}`);
  assert.match(out, /final\s+SKIPPED/);
  assert.doesNotMatch(out, /playwright.*PASS/i);
});

await testAsync("orchestrator FAILs on hosted Supabase URL", async () => {
  const r = runNode("node", ["scripts/e2e/run-pheno-paid-smoke-local.mjs"], {
    SUPABASE_URL: "https://knkwiiywfkbqznbxwqfh.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "SUPER_SECRET_SERVICE_ROLE_VALUE",
    E2E_PHENO_FREE_EMAIL: "test@example.com", E2E_PHENO_FREE_PASSWORD: "super-secret-password",
    E2E_PHENO_PRO_EMAIL: "test@example.com", E2E_PHENO_PRO_PASSWORD: "super-secret-password",
    E2E_PHENO_CANCELED_EMAIL: "test@example.com", E2E_PHENO_CANCELED_PASSWORD: "super-secret-password",
  });
  const out = (r.stdout || "") + (r.stderr || "");
  assert.equal(r.status, 1);
  for (const s of FORBIDDEN) assert.ok(!out.includes(s), `output leaked "${s}"`);
});

console.log("");
console.log(`Passed: ${passed}  Failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
