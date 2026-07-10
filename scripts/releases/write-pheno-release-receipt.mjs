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

function parseArgs(argv) {
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

function expectedBuildMatches(build, manual) {
  const expected = String(manual?.expectedBuildId ?? "").trim();
  if (!expected) return null;
  const observed = [build?.bundleId, build?.bundleSha256, build?.bundleFile]
    .filter(Boolean)
    .map((value) => String(value));
  return observed.some((value) => value === expected || value.startsWith(expected));
}

function schemaResult(schema) {
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

function renderReceipt({ smoke, schema, build, manual }) {
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

  const decision =
    deploymentReachable &&
    deploymentManualPass &&
    buildIdentityPass &&
    schemaCheck.pass &&
    smokePass &&
    allCheckpointsPass &&
    billingResolved
      ? "GO"
      : "HOLD";

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
    `- Additive migrations confirmed backward-compatible: ${status(manual?.rollback?.additiveMigrations)}`,
    `- Entry points can be disabled without deleting data: ${status(manual?.rollback?.entryPointDisable)}`,
    `- Owner read access preserved: ${status(manual?.rollback?.ownerReadPreserved)}`,
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

  const result = renderReceipt({ smoke: smoke ?? {}, schema: schema ?? {}, build: build ?? {}, manual });
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${result.markdown}\n`);
  console.log(`receipt     ${path.relative(ROOT, args.out)}`);
  console.log(`decision    ${result.decision}`);
  process.exit(result.decision === "GO" ? 0 : 2);
}

try {
  main();
} catch (error) {
  console.error(`FAIL: ${String(error?.message ?? error).split("\n")[0]}`);
  process.exit(1);
}
