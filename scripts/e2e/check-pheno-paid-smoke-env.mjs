#!/usr/bin/env node
/**
 * Pheno Tracker paid-user smoke preflight.
 *
 * Reports PRESENT / SKIPPED for each optional session credential and hunt
 * fixture id. Never prints the actual value of any secret, email, password,
 * session token, service_role key, cookie, or hunt id — only presence.
 *
 * Exit codes:
 *   0  → env either fully missing (SKIPPED) or all claimed inputs are usable.
 *   1  → env claims a session file path that does not exist or is unreadable.
 *
 * Never fails on missing env — a fully-missing environment is a clean SKIP
 * so CI runs stay green in projects without paid-user fixtures.
 */
import fs from "node:fs";

const SESSION_FILE_ENVS = [
  "E2E_PHENO_FREE_SESSION_FILE",
  "E2E_PHENO_PRO_SESSION_FILE",
  "E2E_PHENO_FOUNDER_SESSION_FILE",
  "E2E_PHENO_CANCELED_SESSION_FILE",
];

const CREDENTIAL_ENV_PAIRS = [
  ["Free user", "E2E_PHENO_FREE_EMAIL", "E2E_PHENO_FREE_PASSWORD"],
  ["Pro user", "E2E_PHENO_PRO_EMAIL", "E2E_PHENO_PRO_PASSWORD"],
  ["Founder Lifetime user", "E2E_PHENO_FOUNDER_EMAIL", "E2E_PHENO_FOUNDER_PASSWORD"],
  ["Canceled/expired user", "E2E_PHENO_CANCELED_EMAIL", "E2E_PHENO_CANCELED_PASSWORD"],
];

const FIXTURE_ENVS = [
  ["Missing-evidence hunt (required)", "E2E_PHENO_HUNT_ID_MISSING_EVIDENCE", true],
  ["Comparison-ready hunt (required)", "E2E_PHENO_HUNT_ID_COMPARISON_READY", true],
  ["Pending harvest hunt (optional)", "E2E_PHENO_HUNT_ID_PENDING_HARVEST", false],
  ["Pending cure hunt (optional)", "E2E_PHENO_HUNT_ID_PENDING_CURE", false],
  ["Replication pending hunt (optional)", "E2E_PHENO_HUNT_ID_REPLICATION_PENDING", false],
];

function present(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

const lines = [];
let anyPresent = false;
let hardFail = false;

lines.push("Pheno Tracker paid-user smoke — env preflight");
lines.push("--------------------------------------------");

lines.push("");
lines.push("Session credentials:");
for (const [label, emailEnv, passEnv] of CREDENTIAL_ENV_PAIRS) {
  const has = present(emailEnv) && present(passEnv);
  if (has) anyPresent = true;
  lines.push(`  ${has ? "PRESENT " : "SKIPPED "} ${label}`);
}

lines.push("");
lines.push("Pre-generated session files:");
for (const envName of SESSION_FILE_ENVS) {
  const raw = process.env[envName];
  if (!raw) {
    lines.push(`  SKIPPED  ${envName}`);
    continue;
  }
  anyPresent = true;
  const exists = fs.existsSync(raw) && fs.statSync(raw).isFile();
  if (!exists) {
    hardFail = true;
    lines.push(`  FAIL     ${envName} (path set but not readable)`);
  } else {
    lines.push(`  PRESENT  ${envName}`);
  }
}

lines.push("");
lines.push("Hunt fixture ids:");
for (const [label, envName /*, required*/] of FIXTURE_ENVS) {
  const has = present(envName);
  if (has) anyPresent = true;
  lines.push(`  ${has ? "PRESENT " : "SKIPPED "} ${label}`);
}

lines.push("");
lines.push("Local fixture env file (e2e/.fixtures/pheno-paid-smoke.env):");
const fixtureEnvPath = "e2e/.fixtures/pheno-paid-smoke.env";
if (fs.existsSync(fixtureEnvPath)) {
  anyPresent = true;
  lines.push(`  PRESENT  (source it before running the smoke; never commit it)`);
} else {
  lines.push(`  SKIPPED  (run scripts/e2e/seed-pheno-paid-smoke-fixtures.mjs to create)`);
}

lines.push("");
if (hardFail) {
  lines.push("Result: FAIL — a session file env var is set but the file is missing/unreadable.");
  console.log(lines.join("\n"));
  process.exit(1);
}
if (!anyPresent) {
  lines.push("Result: SKIPPED — no fixtures or sessions configured. Smoke will no-op.");
} else {
  lines.push("Result: PRESENT — smoke will run whatever scenarios have inputs; others skip cleanly.");
}
console.log(lines.join("\n"));
process.exit(0);
