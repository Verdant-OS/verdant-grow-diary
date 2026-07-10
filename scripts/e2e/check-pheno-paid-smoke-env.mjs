#!/usr/bin/env node
/**
 * Pheno Tracker paid-user smoke preflight.
 *
 * Reports PRESENT / SEEDABLE / SKIPPED / BLOCKED per input. Never prints
 * secret values (emails, passwords, service_role, session tokens, cookies,
 * or hunt ids) — only presence and, when missing, the exact env var name.
 *
 * Exit codes:
 *   0 → env either fully missing (SKIPPED) or all claimed inputs are usable.
 *   1 → env claims a session file path that does not exist or is unreadable,
 *       or a configured Supabase URL points at a hosted production host.
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

const SUPABASE_URL_ENVS = ["E2E_SUPABASE_URL", "SUPABASE_URL"];
const SERVICE_ROLE_ENVS = ["SUPABASE_SERVICE_ROLE_KEY", "E2E_SUPABASE_SERVICE_ROLE_KEY"];
const ANON_KEY_ENVS = ["SUPABASE_ANON_KEY", "E2E_SUPABASE_ANON_KEY"];
const OWNER_EMAIL_ENVS = ["E2E_PHENO_PRO_EMAIL", "E2E_PHENO_FOUNDER_EMAIL"];

// Fixture ids and the note printed when they are absent. Seedable fixtures
// can be produced by scripts/e2e/seed-pheno-paid-smoke-fixtures.mjs when a
// local Supabase + service_role + owner email are available.
const FIXTURE_ENVS = [
  ["Missing-evidence hunt",  "E2E_PHENO_HUNT_ID_MISSING_EVIDENCE", { seedable: true }],
  ["Comparison-ready hunt",  "E2E_PHENO_HUNT_ID_COMPARISON_READY", { seedable: true }],
  ["Pending harvest hunt",   "E2E_PHENO_HUNT_ID_PENDING_HARVEST",  { seedable: true, optional: true }],
  ["Pending cure hunt",      "E2E_PHENO_HUNT_ID_PENDING_CURE",     { seedable: true, optional: true }],
  ["Replication pending",    "E2E_PHENO_HUNT_ID_REPLICATION_PENDING",
    { optional: true,
      note: "signal not persisted — engine treats as satisfied" }],
];

function present(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}
function anyPresent(names) { return names.some(present); }

const lines = [];
let anyPresentFlag = false;
let hardFail = false;

lines.push("Pheno Tracker paid-user smoke — env preflight");
lines.push("--------------------------------------------");

// ── Local Supabase (for the seeder + optional local backend) ────────────
lines.push("");
lines.push("Local Supabase (for fixture seeder):");
const hasUrl = anyPresent(SUPABASE_URL_ENVS);
const hasAnon = anyPresent(ANON_KEY_ENVS);
const hasService = anyPresent(SERVICE_ROLE_ENVS);
lines.push(`  ${hasUrl     ? "PRESENT " : "SKIPPED "} SUPABASE_URL`);
lines.push(`  ${hasAnon    ? "PRESENT " : "SKIPPED "} SUPABASE_ANON_KEY`);
lines.push(`  ${hasService ? "PRESENT " : "SKIPPED "} SUPABASE_SERVICE_ROLE_KEY`);
if (hasUrl) {
  const raw = process.env[SUPABASE_URL_ENVS.find(present)];
  let host = "";
  try { host = new URL(raw).host.toLowerCase(); } catch { /* noop */ }
  const productionMarkers = ["supabase.co", "supabase.in", "lovable.app", "lovable.dev"];
  if (productionMarkers.some((m) => host.endsWith(m))) {
    hardFail = true;
    lines.push(`  FAIL     SUPABASE_URL host "${host}" looks like production — refused.`);
  }
}
if (hasUrl || hasAnon || hasService) anyPresentFlag = true;
const canSeed = hasUrl && hasService && anyPresent(OWNER_EMAIL_ENVS);

// ── Session credentials ──────────────────────────────────────────────────
lines.push("");
lines.push("Session credentials:");
for (const [label, emailEnv, passEnv] of CREDENTIAL_ENV_PAIRS) {
  const hasEmail = present(emailEnv);
  const hasPass = present(passEnv);
  const has = hasEmail && hasPass;
  if (has) anyPresentFlag = true;
  if (has) {
    lines.push(`  PRESENT  ${label}`);
  } else {
    const missing = [];
    if (!hasEmail) missing.push(emailEnv);
    if (!hasPass) missing.push(passEnv);
    lines.push(`  SKIPPED  ${label} (missing: ${missing.join(", ")})`);
  }
}

// ── Pre-generated session files ──────────────────────────────────────────
lines.push("");
lines.push("Pre-generated session files:");
for (const envName of SESSION_FILE_ENVS) {
  const raw = process.env[envName];
  if (!raw) { lines.push(`  SKIPPED  ${envName}`); continue; }
  anyPresentFlag = true;
  const exists = fs.existsSync(raw) && fs.statSync(raw).isFile();
  if (!exists) {
    hardFail = true;
    lines.push(`  FAIL     ${envName} (path set but not readable)`);
  } else {
    lines.push(`  PRESENT  ${envName}`);
  }
}

// ── Hunt fixture ids ────────────────────────────────────────────────────
lines.push("");
lines.push("Hunt fixture ids:");
for (const [label, envName, opts] of FIXTURE_ENVS) {
  const has = present(envName);
  if (has) { anyPresentFlag = true; lines.push(`  PRESENT  ${label} (${envName})`); continue; }
  if (opts.note) {
    lines.push(`  SKIPPED  ${label} (${envName}) — ${opts.note}`);
    continue;
  }
  if (opts.seedable) {
    const status = canSeed ? "SEEDABLE" : "SKIPPED ";
    const suffix = canSeed
      ? " — run scripts/e2e/seed-pheno-paid-smoke-fixtures.mjs"
      : " — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + E2E_PHENO_PRO_EMAIL to seed";
    lines.push(`  ${status} ${label} (${envName})${suffix}`);
  } else {
    lines.push(`  SKIPPED  ${label} (${envName})`);
  }
}

// ── Local fixture env file ──────────────────────────────────────────────
lines.push("");
lines.push("Local fixture env file (e2e/.fixtures/pheno-paid-smoke.env):");
const fixtureEnvPath = "e2e/.fixtures/pheno-paid-smoke.env";
if (fs.existsSync(fixtureEnvPath)) {
  anyPresentFlag = true;
  lines.push("  PRESENT  (source it before running the smoke; never commit it)");
} else if (canSeed) {
  lines.push("  SEEDABLE (run scripts/e2e/seed-pheno-paid-smoke-fixtures.mjs to create)");
} else {
  lines.push("  SKIPPED  (see docs/pheno-paid-smoke-local-setup.md)");
}

lines.push("");
if (hardFail) {
  lines.push("Result: FAIL — see errors above.");
  console.log(lines.join("\n"));
  process.exit(1);
}
if (!anyPresentFlag) {
  lines.push("Result: SKIPPED — no fixtures or sessions configured. Smoke will no-op.");
} else {
  lines.push("Result: PRESENT — smoke will run whatever scenarios have inputs; others skip cleanly.");
}
console.log(lines.join("\n"));
process.exit(0);
