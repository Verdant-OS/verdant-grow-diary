#!/usr/bin/env node
/**
 * Targeted release-tooling tests for the Pheno release receipt writer and
 * validator, plus a static migration-truth pin. Uses only synthetic redacted
 * fixtures; never contacts production.
 *
 * Run:  bun scripts/releases/test-pheno-release-receipt.mjs
 */
import fs from "node:fs";
import path from "node:path";
import {
  evaluateMigrationPosture,
  renderReceipt,
  renderMigrationExceptionSection,
} from "./write-pheno-release-receipt.mjs";
import { validateReceipt } from "./validate-pheno-release-receipt.mjs";

const results = [];
let failed = 0;

function test(name, fn) {
  try {
    fn();
    results.push(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    results.push(`  FAIL  ${name}\n         ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// ── Fixtures ──────────────────────────────────────────────────────────────

const baseSmoke = {
  final: "PASS",
  playwright: "PASS",
  deployment: "PASS",
  target: "https://verdantgrowdiary.com",
  generatedAt: "2026-07-10T22:55:33.548Z",
  tests: { passed: 10, failed: 0, skipped: 0, flaky: 0 },
  checkpoints: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((id) => ({
    id,
    status: "PASS",
    evidence: `automated evidence ${id}`,
  })),
};
const baseSchema = {
  columns: ["evidence_goals", "notes", "setup_completed_at"],
  entitlementFunctionCount: 1,
  restrictivePolicyTableCount: 13,
  allProPoliciesRestrictive: true,
  ownerSelectVerified: true,
};
const baseBuild = {
  status: "PASS",
  siteUrl: "https://verdantgrowdiary.com",
  bundleId: "index-DFkEvjho",
  bundleFile: "index-DFkEvjho.js",
  bundleSha256: "00a1e4d34601b1987fecb529598657da9d3b4946da0393846b1393a5ccc1e7c1",
  observedAt: "2026-07-10T22:55:34.133Z",
};
const baseManualBase = {
  expectedBuildId: "index-DFkEvjho",
  publishedAt: "2026-07-10T16:45:00Z",
  operator: "test-operator",
  decisionOwner: "test-operator",
  deployment: {
    noWhiteScreen: "PASS",
    consoleErrors: "PASS",
    evidence: "manual",
    consoleEvidence: "manual",
  },
  billing: { required: false, status: "NOT_REQUIRED", evidence: "n/a" },
  checkpoints: { 9: { status: "PASS", evidence: "manual anchor click" } },
};

const additivePosture = {
  status: "PASS",
  classification: "ADDITIVE",
  exceptions: [],
};
const nonAdditivePosture = {
  status: "PASS",
  classification: "NON_ADDITIVE_WITH_ROLLBACK_PLAN",
  exceptions: [
    {
      migration: "20260709180000_pheno_hunts_owner_only_and_stress_scale_index.sql",
      changeType: "DROP_POLICY",
      scope: "public.pheno_hunts",
      description:
        'Removed the operator SELECT and UPDATE policies ("Operators view all pheno_hunts", "Operators update all pheno_hunts").',
      impact: "Operator cross-tenant access removed; owner SELECT access unchanged.",
      rollbackProcedure:
        "Recreate the two operator policies from repository history only if operator access must be restored.",
    },
  ],
};

function manualWithPosture(posture) {
  return {
    ...baseManualBase,
    rollback: {
      priorVersionIdentified: "PASS",
      migrationPosture: posture,
      entryPointDisable: "PASS",
      ownerReadPreserved: "PASS",
    },
  };
}
function manualLegacyOnly() {
  return {
    ...baseManualBase,
    rollback: {
      priorVersionIdentified: "PASS",
      additiveMigrations: "PASS",
      entryPointDisable: "PASS",
      ownerReadPreserved: "PASS",
    },
  };
}

function fullyRender(manual) {
  return renderReceipt({ smoke: baseSmoke, schema: baseSchema, build: baseBuild, manual });
}
function fullyValidate(manual, receiptText) {
  return validateReceipt({
    smoke: baseSmoke,
    schema: baseSchema,
    build: baseBuild,
    manual,
    receiptText,
  });
}

// ── Posture unit tests ────────────────────────────────────────────────────

test("evaluateMigrationPosture: additive without exceptions passes", () => {
  const p = evaluateMigrationPosture({ migrationPosture: additivePosture });
  assert(p.pass, `expected pass, problems=${p.problems.join(";")}`);
  assert(p.classification === "ADDITIVE");
});

test("evaluateMigrationPosture: additive WITH exceptions FAILs contract", () => {
  const p = evaluateMigrationPosture({
    migrationPosture: { ...additivePosture, exceptions: nonAdditivePosture.exceptions },
  });
  assert(!p.pass);
  assert(p.problems.some((m) => /ADDITIVE.*must not carry exceptions/.test(m)));
});

test("evaluateMigrationPosture: non-additive without exceptions FAILs", () => {
  const p = evaluateMigrationPosture({
    migrationPosture: { status: "PASS", classification: "NON_ADDITIVE_WITH_ROLLBACK_PLAN", exceptions: [] },
  });
  assert(!p.pass);
  assert(p.problems.some((m) => /requires at least one exception/.test(m)));
});

test("evaluateMigrationPosture: exception missing rollbackProcedure FAILs", () => {
  const bad = JSON.parse(JSON.stringify(nonAdditivePosture));
  bad.exceptions[0].rollbackProcedure = "";
  const p = evaluateMigrationPosture({ migrationPosture: bad });
  assert(!p.pass);
  assert(p.problems.some((m) => /missing rollbackProcedure/.test(m)));
});

test("evaluateMigrationPosture: unknown classification FAILs", () => {
  const p = evaluateMigrationPosture({
    migrationPosture: { status: "PASS", classification: "MYSTERY", exceptions: [] },
  });
  assert(!p.pass);
  assert(p.problems.some((m) => /unsupported/.test(m)));
});

test("evaluateMigrationPosture: legacy additiveMigrations only is not pass and flagged legacy", () => {
  const p = evaluateMigrationPosture({ additiveMigrations: "PASS" });
  assert(!p.pass);
  assert(p.classification === "LEGACY_ADDITIVE_FIELD");
  assert(p.problems.some((m) => /structured migration posture evidence required/.test(m)));
});

test("evaluateMigrationPosture: complete policy-drop exception is eligible", () => {
  const p = evaluateMigrationPosture({ migrationPosture: nonAdditivePosture });
  assert(p.pass, `expected pass, problems=${p.problems.join(";")}`);
});

// ── Writer output tests ───────────────────────────────────────────────────

test("writer: non-additive receipt records migration filename + policy names + rollback + owner-unchanged", () => {
  const { markdown, decision } = fullyRender(manualWithPosture(nonAdditivePosture));
  assert(decision === "GO", `expected GO, got ${decision}`);
  assert(markdown.includes("20260709180000_pheno_hunts_owner_only_and_stress_scale_index.sql"));
  assert(markdown.includes("Operators view all pheno_hunts"));
  assert(markdown.includes("Operators update all pheno_hunts"));
  assert(markdown.includes("owner SELECT access unchanged"));
  assert(markdown.includes("Recreate the two operator policies"));
  assert(markdown.includes("Migration classification: NON_ADDITIVE_WITH_ROLLBACK_PLAN"));
  assert(!markdown.includes("Additive migrations confirmed backward-compatible"));
});

test("writer: additive receipt renders no exception table and no unqualified additive claim", () => {
  const { markdown, decision } = fullyRender(manualWithPosture(additivePosture));
  assert(decision === "GO", `expected GO, got ${decision}`);
  assert(markdown.includes("Migration classification: ADDITIVE"));
  assert(!markdown.includes("Recorded non-additive migration changes"));
  assert(!markdown.includes("Additive migrations confirmed backward-compatible"));
});

test("writer: legacy-only rollback yields HOLD", () => {
  const { decision } = fullyRender(manualLegacyOnly());
  assert(decision === "HOLD", `expected HOLD, got ${decision}`);
});

test("writer: never leaks secrets", () => {
  const { markdown } = fullyRender(manualWithPosture(nonAdditivePosture));
  for (const tok of ["service_role", "SUPABASE_SERVICE_ROLE_KEY", "Bearer ", "sk-", "eyJhbGci"]) {
    assert(!markdown.includes(tok), `receipt leaked ${tok}`);
  }
});

// ── Validator tests ───────────────────────────────────────────────────────

test("validator: legacy-only manual → HOLD exit 2", () => {
  const manual = manualLegacyOnly();
  const { markdown } = fullyRender(manual);
  const r = fullyValidate(manual, markdown);
  assert(r.decision === "HOLD" && r.exitCode === 2, `got ${r.decision}/${r.exitCode}`);
  assert(r.problems.some((p) => /structured migration posture evidence required/.test(p)));
});

test("validator: complete non-additive posture → GO exit 0", () => {
  const manual = manualWithPosture(nonAdditivePosture);
  const { markdown } = fullyRender(manual);
  const r = fullyValidate(manual, markdown);
  assert(r.decision === "GO" && r.exitCode === 0, `got ${r.decision}/${r.exitCode} problems=${r.problems.join(";")}`);
});

test("validator: additive with unexpected exceptions → FAIL exit 1", () => {
  const bad = { ...additivePosture, exceptions: nonAdditivePosture.exceptions };
  const manual = manualWithPosture(bad);
  const { markdown } = fullyRender(manual);
  const r = fullyValidate(manual, markdown);
  assert(r.decision === "FAIL" && r.exitCode === 1, `got ${r.decision}/${r.exitCode}`);
});

test("validator: non-additive without exceptions → FAIL exit 1", () => {
  const bad = { status: "PASS", classification: "NON_ADDITIVE_WITH_ROLLBACK_PLAN", exceptions: [] };
  const manual = manualWithPosture(bad);
  const { markdown } = fullyRender(manual);
  const r = fullyValidate(manual, markdown);
  assert(r.decision === "FAIL" && r.exitCode === 1, `got ${r.decision}/${r.exitCode}`);
});

test("validator: exception missing rollbackProcedure → FAIL exit 1", () => {
  const bad = JSON.parse(JSON.stringify(nonAdditivePosture));
  bad.exceptions[0].rollbackProcedure = "";
  const manual = manualWithPosture(bad);
  const { markdown } = fullyRender(manual);
  const r = fullyValidate(manual, markdown);
  assert(r.decision === "FAIL" && r.exitCode === 1, `got ${r.decision}/${r.exitCode}`);
});

test("validator: unknown classification → FAIL exit 1", () => {
  const bad = { status: "PASS", classification: "MYSTERY", exceptions: [] };
  const manual = manualWithPosture(bad);
  const { markdown } = fullyRender(manual);
  const r = fullyValidate(manual, markdown);
  assert(r.decision === "FAIL" && r.exitCode === 1);
});

test("validator: stale receipt with unqualified additive claim → FAIL exit 1", () => {
  const manual = manualWithPosture(nonAdditivePosture);
  const { markdown } = fullyRender(manual);
  const stale = markdown.replace(
    /- Migration rollback posture:.*\n- Migration classification:.*/,
    "- Additive migrations confirmed backward-compatible: PASS",
  );
  const r = fullyValidate(manual, stale);
  assert(r.decision === "FAIL" && r.exitCode === 1, `got ${r.decision}/${r.exitCode}`);
});

test("validator: receipt classification mismatch with artifact → FAIL exit 1", () => {
  const manual = manualWithPosture(nonAdditivePosture);
  const { markdown } = fullyRender(manual);
  const stale = markdown.replace(
    "Migration classification: NON_ADDITIVE_WITH_ROLLBACK_PLAN",
    "Migration classification: ADDITIVE",
  );
  const r = fullyValidate(manual, stale);
  assert(r.decision === "FAIL" && r.exitCode === 1);
});

// ── Static migration-truth pin ────────────────────────────────────────────

test("migration-truth pin: 20260709180000 drops both expected operator policies", () => {
  const file = path.resolve(
    "supabase/migrations/20260709180000_pheno_hunts_owner_only_and_stress_scale_index.sql",
  );
  const sql = fs.readFileSync(file, "utf8");
  assert(/DROP POLICY IF EXISTS "Operators view all pheno_hunts"\s+ON public\.pheno_hunts/.test(sql));
  assert(/DROP POLICY IF EXISTS "Operators update all pheno_hunts"\s+ON public\.pheno_hunts/.test(sql));
});

test("migration-truth pin: canonical receipt records the same non-additive exception", () => {
  const receipt = fs.readFileSync(path.resolve("docs/releases/pheno-tracker-pro-release-receipt.md"), "utf8");
  assert(receipt.includes("20260709180000_pheno_hunts_owner_only_and_stress_scale_index.sql"));
  assert(receipt.includes("Migration classification: NON_ADDITIVE_WITH_ROLLBACK_PLAN"));
  assert(!receipt.includes("Additive migrations confirmed backward-compatible"));
});

test("archived GO ledger 2026-07-10 exists and is untouched by writer", () => {
  const p = path.resolve("docs/releases/pheno-tracker-pro-release-receipt-2026-07-10-go.md");
  assert(fs.existsSync(p), "archived ledger missing");
  // sanity: still records the operator-policy exception
  const t = fs.readFileSync(p, "utf8");
  assert(t.includes("20260709180000"));
});

// ── Report ────────────────────────────────────────────────────────────────

console.log(results.join("\n"));
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
