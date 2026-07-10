#!/usr/bin/env node
/**
 * Writes the Pheno Tracker Pro release receipt from redacted release artifacts.
 *
 * Defaults:
 *   smoke  artifacts/release-readiness/pheno-tracker-live-smoke/live-smoke-summary.json
 *   schema artifacts/release-readiness/pheno-tracker-live-smoke/schema-spot-check.json
 *   build  artifacts/release-readiness/pheno-tracker-live-smoke/deployed-build.json
 *   manual artifacts/release-readiness/pheno-tracker-live-smoke/manual-release-checks.json
 *   out    docs/releases/pheno-tracker-pro-release-receipt.md
 *
 * Missing or incomplete evidence keeps the receipt at HOLD. This script never
 * reads credential/session files and never prints raw input values.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const ARTIFACT_DIR = path.resolve("artifacts/release-readiness/pheno-tracker-live-smoke");
const DEFAULTS = {
  smoke: path.join(ARTIFACT_DIR, "live-smoke-summary.json"),
  schema: path.join(ARTIFACT_DIR, "schema-spot-check.json"),
  build: path.join(ARTIFACT_DIR, "deployed-build.json"),
  manual: path.join(ARTIFACT_DIR, "manual-release-checks.json"),
  out: path.resolve("docs/releases/pheno-tracker-pro-release-receipt.md"),
};

const CHECKPOINTS = [
  [1, "Free user gate"],
  [2, "Upgrade return path"],
  [3, "Pro access and onboarding"],
  [4, "Founder access"],
  [5, "Canceled/expired behavior"],
  [6, "Hunt setup persistence"],
  [7, "Workspace status split"],
  [8, "Incomplete comparison gate"],
  [9, "Missing-evidence navigation"],
  [10, "Direct incomplete /compare"],
  [11, "Comparison-ready flow"],
  [12, "Core Verdant regression"],
];

export function parseArgs(argv) {
  const args = { ...DEFAULTS, allowPartial: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--allow-partial") args.allowPartial = true;
    else if (["--smoke", "--schema", "--build", "--manual", "--out"].includes(arg)) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a path`);
      args[key] = path.resolve(value);
      i += 1;
    }
  }
  return args;
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function status(value) {
  return String(value ?? "PENDING").toUpperCase();
}

function yes(value) {
  return value === true || status(value) === "PASS" || status(value) === "YES";
}

function esc(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

// Same semantics as scripts/releases/fetch-pheno-live-build-id.mjs: the
// expected identifier must EXACTLY equal the bundle id or filename, or be a
// >=8-char hex prefix of the SHA-256. Prefixes of the id/filename never match.
export function expectedBuildMatches(build, manual) {
  const expected = String(manual?.expectedBuildId ?? "").trim();
  if (!expected) return null;
  if (build?.bundleId && String(build.bundleId) === expected) return true;
  if (build?.bundleFile && String(build.bundleFile) === expected) return true;
  const sha = build?.bundleSha256 ? String(build.bundleSha256).toLowerCase() : "";
  if (
    sha &&
    expected.length >= 8 &&
    /^[0-9a-f]+$/i.test(expected) &&
    sha.startsWith(expected.toLowerCase())
  ) {
    return true;
  }
  return false;
}

export function schemaResult(schema) {
  const required = ["evidence_goals", "notes", "setup_completed_at"];
  const columns = Array.isArray(schema?.columns) ? schema.columns : [];
  const columnsPass = required.every((name) => columns.includes(name));
  const functionPass = Number(schema?.entitlementFunctionCount ?? 0) === 1;
  const policiesPass =
    Number(schema?.restrictivePolicyTableCount ?? 0) === 13 &&
    schema?.allProPoliciesRestrictive === true;
  const ownerReadPass = schema?.ownerSelectVerified === true;
  return {
    columnsPass,
    functionPass,
    policiesPass,
    ownerReadPass,
    pass: columnsPass && functionPass && policiesPass && ownerReadPass,
  };
}

// Supported classifications for migrationPosture.classification.
export const MIGRATION_POSTURE_CLASSIFICATIONS = Object.freeze([
  "ADDITIVE",
  "NON_ADDITIVE_WITH_ROLLBACK_PLAN",
]);

const REQUIRED_EXCEPTION_FIELDS = [
  "migration",
  "changeType",
  "scope",
  "description",
  "impact",
  "rollbackProcedure",
];

/**
 * Evaluate the structured migration-posture claim under manual.rollback.
 *
 * Returns { pass, status, classification, exceptions, problems }.
 *   - pass is true ONLY when the structured contract is present, internally
 *     consistent, and reports PASS.
 *   - A legacy-only `rollback.additiveMigrations` field NEVER passes — the
 *     validator surfaces a clear pending reason and callers must supply the
 *     structured posture.
 */
export function evaluateMigrationPosture(rollback) {
  const problems = [];
  const posture = rollback?.migrationPosture;
  const legacyOnly =
    !posture &&
    rollback &&
    Object.prototype.hasOwnProperty.call(rollback, "additiveMigrations");

  if (!posture) {
    if (legacyOnly) {
      problems.push(
        "structured migration posture evidence required (legacy rollback.additiveMigrations cannot authorize GO)",
      );
    } else {
      problems.push("rollback.migrationPosture missing");
    }
    return {
      pass: false,
      status: "PENDING",
      classification: legacyOnly ? "LEGACY_ADDITIVE_FIELD" : "UNKNOWN",
      exceptions: [],
      problems,
    };
  }

  const status = String(posture.status ?? "").toUpperCase();
  const classification = String(posture.classification ?? "").toUpperCase();
  const exceptions = Array.isArray(posture.exceptions) ? posture.exceptions : [];

  if (status !== "PASS") problems.push(`migrationPosture.status must be PASS (got ${status || "empty"})`);
  if (!MIGRATION_POSTURE_CLASSIFICATIONS.includes(classification)) {
    problems.push(`migrationPosture.classification unsupported (got ${classification || "empty"})`);
  }

  if (classification === "ADDITIVE" && exceptions.length > 0) {
    problems.push("ADDITIVE classification must not carry exceptions");
  }
  if (classification === "NON_ADDITIVE_WITH_ROLLBACK_PLAN" && exceptions.length === 0) {
    problems.push("NON_ADDITIVE_WITH_ROLLBACK_PLAN requires at least one exception");
  }

  exceptions.forEach((ex, idx) => {
    if (!ex || typeof ex !== "object") {
      problems.push(`exception[${idx}] is not an object`);
      return;
    }
    for (const field of REQUIRED_EXCEPTION_FIELDS) {
      const value = ex[field];
      if (typeof value !== "string" || value.trim().length === 0) {
        problems.push(`exception[${idx}] missing ${field}`);
      }
    }
  });

  return {
    pass: problems.length === 0,
    status: status || "PENDING",
    classification: classification || "UNKNOWN",
    exceptions,
    problems,
  };
}



function smokeCheckpointMap(smoke, manual) {
  const map = new Map();
  for (const item of Array.isArray(smoke?.checkpoints) ? smoke.checkpoints : []) {
    if (Number.isInteger(Number(item?.id))) {
      map.set(Number(item.id), {
        status: status(item.status),
        evidence: esc(item.evidence || "automated smoke"),
      });
    }
  }
  const overrides = manual?.checkpoints && typeof manual.checkpoints === "object"
    ? manual.checkpoints
    : {};
  for (const [id, item] of Object.entries(overrides)) {
    map.set(Number(id), {
      status: status(typeof item === "string" ? item : item?.status),
      evidence: esc(typeof item === "string" ? "manual confirmation" : item?.evidence),
    });
  }
  return map;
}

/**
 * Render the "Recorded non-additive migration changes" table when the
 * structured posture actually carries exceptions. Additive-only postures
 * render nothing here (no misleading empty table).
 */
export function renderMigrationExceptionSection(postureCheck) {
  if (!postureCheck || !Array.isArray(postureCheck.exceptions) || postureCheck.exceptions.length === 0) {
    return [];
  }
  const lines = [
    "",
    "### Recorded non-additive migration changes",
    "",
    "| Migration | Change | Scope | Impact | Rollback procedure |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const ex of postureCheck.exceptions) {
    lines.push(
      `| ${esc(ex?.migration)} | ${esc(ex?.changeType)} | ${esc(ex?.scope)} | ${esc(ex?.impact)} | ${esc(ex?.rollbackProcedure)} |`,
    );
  }
  return lines;
}

export function renderReceipt({ smoke, schema, build, manual, allowPartial = false }) {
  const schemaCheck = schemaResult(schema);
  const buildMatch = expectedBuildMatches(build, manual);
  const deploymentReachable = status(smoke?.deployment) === "PASS" && status(build?.status) === "PASS";
  const deploymentManualPass =
    status(manual?.deployment?.noWhiteScreen) === "PASS" &&
    status(manual?.deployment?.consoleErrors) === "PASS";
  const buildIdentityPass = buildMatch === true;
  const smokePass =
    status(smoke?.final) === "PASS" &&
    status(smoke?.playwright) === "PASS" &&
    Number(smoke?.tests?.failed ?? 0) === 0 &&
    Number(smoke?.tests?.skipped ?? 0) === 0 &&
    Number(smoke?.tests?.passed ?? 0) > 0;

  const checkpointMap = smokeCheckpointMap(smoke, manual);
  const allCheckpointsPass = CHECKPOINTS.every(([id]) => checkpointMap.get(id)?.status === "PASS");

  const billingStatus = status(manual?.billing?.status);
  const billingResolved = manual?.billing?.required === false
    ? billingStatus === "NOT_REQUIRED" || billingStatus === "PASS"
    : billingStatus === "PASS";

  // GO also demands complete rollback readiness — a release without a
  // verified rollback path is not shippable, only reachable. The migration
  // posture is a structured claim: additive is only valid without
  // exceptions; non-additive is only valid when every exception carries a
  // complete rollback procedure. The legacy boolean `additiveMigrations`
  // never counts toward GO by itself.
  const postureCheck = evaluateMigrationPosture(manual?.rollback);
  const rollbackComplete =
    yes(manual?.rollback?.priorVersionIdentified) &&
    yes(manual?.rollback?.entryPointDisable) &&
    yes(manual?.rollback?.ownerReadPreserved) &&
    postureCheck.pass;

  const gatesPass =
    deploymentReachable &&
    deploymentManualPass &&
    buildIdentityPass &&
    schemaCheck.pass &&
    smokePass &&
    allCheckpointsPass &&
    billingResolved &&
    rollbackComplete;
  // --allow-partial exists to refresh a receipt before all evidence is in.
  // It can never mint a GO — a full run without the flag must confirm it.
  const decision = gatesPass && !allowPartial ? "GO" : "HOLD";

  const lines = [
    "# Pheno Tracker Pro Release Receipt",
    "",
    `**Release status:** ${decision}`,
    `**Production URL:** ${esc(build?.siteUrl || smoke?.target || "https://verdantgrowdiary.com")}`,
    `**Observed bundle:** ${esc(build?.bundleFile || "PENDING")}`,
    `**Bundle SHA-256:** ${esc(build?.bundleSha256 || "PENDING")}`,
    `**Expected build identifier:** ${esc(manual?.expectedBuildId || "PENDING")}`,
    `**Build identity match:** ${buildMatch === true ? "PASS" : buildMatch === false ? "FAIL" : "PENDING"}`,
    `**Published at:** ${esc(manual?.publishedAt || "PENDING")}`,
    `**Operator:** ${esc(manual?.operator || "PENDING")}`,
    "",
    "> HOLD remains mandatory until deployment identity, production schema, all 12 checkpoints, and billing disposition are recorded.",
    "",
    "## Deployment",
    "",
    "| Check | Evidence | Result |",
    "| --- | --- | --- |",
    `| Site and main bundle reachable | ${esc(build?.observedAt || smoke?.generatedAt || "PENDING")} | ${deploymentReachable ? "PASS" : "PENDING"} |`,
    `| Expected build matches observed bundle | ${esc(build?.bundleId || "PENDING")} | ${buildIdentityPass ? "PASS" : buildMatch === false ? "FAIL" : "PENDING"} |`,
    `| No white screen/startup error | ${esc(manual?.deployment?.evidence || "manual browser check required")} | ${status(manual?.deployment?.noWhiteScreen)} |`,
    `| No unexpected console errors | ${esc(manual?.deployment?.consoleEvidence || "manual DevTools check required")} | ${status(manual?.deployment?.consoleErrors)} |`,
    "",
    "## Production schema spot-check",
    "",
    "| Check | Actual | Result |",
    "| --- | --- | --- |",
    `| pheno_hunts onboarding columns | ${esc((schema?.columns || []).join(", ") || "PENDING")} | ${schemaCheck.columnsPass ? "PASS" : "PENDING"} |`,
    `| has_pheno_tracker_entitlement count | ${esc(schema?.entitlementFunctionCount ?? "PENDING")} | ${schemaCheck.functionPass ? "PASS" : "PENDING"} |`,
    `| RESTRICTIVE Pro-policy table coverage | ${esc(schema?.restrictivePolicyTableCount ?? "PENDING")}/13 | ${schemaCheck.policiesPass ? "PASS" : "PENDING"} |`,
    `| Owner SELECT behavior verified | ${esc(schema?.ownerSelectVerified ?? "PENDING")} | ${schemaCheck.ownerReadPass ? "PASS" : "PENDING"} |`,
    "",
    "## Automated live smoke",
    "",
    `- Result: **${smokePass ? "PASS" : status(smoke?.final)}**`,
    `- Tests: ${Number(smoke?.tests?.passed ?? 0)} passed / ${Number(smoke?.tests?.failed ?? 0)} failed / ${Number(smoke?.tests?.skipped ?? 0)} skipped / ${Number(smoke?.tests?.flaky ?? 0)} flaky`,
    `- Summary generated: ${esc(smoke?.generatedAt || "PENDING")}`,
    "",
    "## 12-checkpoint release matrix",
    "",
    "| # | Checkpoint | Evidence | Result |",
    "| ---: | --- | --- | --- |",
  ];

  for (const [id, label] of CHECKPOINTS) {
    const item = checkpointMap.get(id) ?? { status: "PENDING", evidence: "not recorded" };
    lines.push(`| ${id} | ${label} | ${esc(item.evidence)} | ${item.status} |`);
  }

  lines.push(
    "",
    "## Billing disposition",
    "",
    `- Required: ${manual?.billing?.required === false ? "No" : "Yes / not waived"}`,
    `- Status: ${billingStatus}`,
    `- Evidence: ${esc(manual?.billing?.evidence || "PENDING")}`,
    "",
    "## Rollback readiness",
    "",
    `- Prior Lovable version identified: ${status(manual?.rollback?.priorVersionIdentified)}`,
    `- Migration rollback posture: ${postureCheck.pass ? "PASS" : postureCheck.status}`,
    `- Migration classification: ${postureCheck.classification}`,
    `- Entry points can be disabled without deleting data: ${status(manual?.rollback?.entryPointDisable)}`,
    `- Owner read access preserved: ${status(manual?.rollback?.ownerReadPreserved)}`,
    ...renderMigrationExceptionSection(postureCheck),
    "",
    "## Final decision",
    "",
    `**${decision}**`,
    "",
    `Decision timestamp: ${new Date().toISOString()}`,
    `Decision owner: ${esc(manual?.decisionOwner || manual?.operator || "PENDING")}`,
    "",
    "### Input artifacts",
    "",
    "- `artifacts/release-readiness/pheno-tracker-live-smoke/deployed-build.json`",
    "- `artifacts/release-readiness/pheno-tracker-live-smoke/live-smoke-summary.json`",
    "- `artifacts/release-readiness/pheno-tracker-live-smoke/schema-spot-check.json`",
    "- `artifacts/release-readiness/pheno-tracker-live-smoke/manual-release-checks.json`",
    "",
  );

  return { decision, markdown: lines.join("\n") };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const smoke = readJson(args.smoke);
  const schema = readJson(args.schema);
  const build = readJson(args.build);
  const manual = readJson(args.manual) ?? {};
  const missing = [
    ["smoke", smoke],
    ["schema", schema],
    ["build", build],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0 && !args.allowPartial) {
    console.error(`BLOCKED: missing release input artifact(s): ${missing.join(", ")}`);
    console.error("Use --allow-partial only to refresh a HOLD receipt before all evidence exists.");
    process.exit(2);
  }

  const result = renderReceipt({
    smoke: smoke ?? {},
    schema: schema ?? {},
    build: build ?? {},
    manual,
    allowPartial: args.allowPartial,
  });
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${result.markdown}\n`);
  console.log(`receipt     ${path.relative(ROOT, args.out)}`);
  console.log(`decision    ${result.decision}`);
  process.exit(result.decision === "GO" ? 0 : 2);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(`FAIL: ${String(error?.message ?? error).split("\n")[0]}`);
    process.exit(1);
  }
}
