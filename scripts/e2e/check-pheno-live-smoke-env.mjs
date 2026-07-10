#!/usr/bin/env node
/**
 * Local-only preflight for the Pheno Tracker production smoke.
 *
 * Prints environment-variable names and setup guidance only. It never prints
 * credentials, fixture ids, cookies, tokens, or session contents.
 *
 * Exit codes:
 *   0 = READY
 *   1 = invalid/conflicting configuration
 *   2 = required local inputs are missing
 */
import { pathToFileURL } from "node:url";

export const PHENO_LIVE_URL = "https://verdantgrowdiary.com";
export const PHENO_LIVE_CONFIRM_VALUE = "RUN_LIVE_PHENO_SMOKE";

export const PHENO_LIVE_REQUIRED_ENV = [
  "E2E_PHENO_LIVE_SMOKE_CONFIRM",
  "E2E_PHENO_FREE_EMAIL",
  "E2E_PHENO_FREE_PASSWORD",
  "E2E_PHENO_PRO_EMAIL",
  "E2E_PHENO_PRO_PASSWORD",
  "E2E_PHENO_FOUNDER_EMAIL",
  "E2E_PHENO_FOUNDER_PASSWORD",
  "E2E_PHENO_CANCELED_EMAIL",
  "E2E_PHENO_CANCELED_PASSWORD",
  "E2E_PHENO_HUNT_ID_MISSING_EVIDENCE",
  "E2E_PHENO_HUNT_ID_COMPARISON_READY",
];

function present(env, name) {
  const value = env[name];
  return typeof value === "string" && value.trim().length > 0;
}

export function evaluatePhenoLiveSmokeEnv(env = process.env) {
  const missing = PHENO_LIVE_REQUIRED_ENV.filter((name) => !present(env, name));
  const errors = [];
  const warnings = [];

  if (
    present(env, "E2E_PHENO_LIVE_SMOKE_CONFIRM") &&
    env.E2E_PHENO_LIVE_SMOKE_CONFIRM !== PHENO_LIVE_CONFIRM_VALUE
  ) {
    errors.push("E2E_PHENO_LIVE_SMOKE_CONFIRM does not contain the required confirmation value");
  }

  if (present(env, "E2E_BASE_URL")) {
    let configured;
    try {
      configured = new URL(env.E2E_BASE_URL.trim()).origin;
    } catch {
      errors.push("E2E_BASE_URL is not a valid URL");
    }
    if (configured && configured !== PHENO_LIVE_URL) {
      errors.push("E2E_BASE_URL conflicts with the fixed production target");
    }
  }

  if (present(env, "SUPABASE_SERVICE_ROLE_KEY")) {
    warnings.push(
      "SUPABASE_SERVICE_ROLE_KEY is present but is not used by the live smoke; keep it out of browser-visible environments",
    );
  }

  const status = errors.length > 0 ? "FAIL" : missing.length > 0 ? "BLOCKED" : "READY";
  const exitCode = status === "READY" ? 0 : status === "BLOCKED" ? 2 : 1;

  return {
    target: PHENO_LIVE_URL,
    status,
    exitCode,
    missing,
    errors,
    warnings,
    variables: PHENO_LIVE_REQUIRED_ENV.map((name) => ({
      name,
      status: present(env, name) ? "PRESENT" : "MISSING",
    })),
  };
}

export function printPhenoLiveSmokeChecklist(result, log = console.log) {
  log("Pheno Tracker live-smoke preflight");
  log("-----------------------------------");
  log(`Target: ${result.target}`);
  log("");
  log("Required local environment variables (names only):");
  for (const variable of result.variables) {
    log(`  ${variable.status.padEnd(7)} ${variable.name}`);
  }

  log("");
  log("Local-only setup checklist:");
  log("  1. Use a trusted local checkout of the release branch.");
  log("  2. Set credentials only in the current shell or an ignored local env file.");
  log("  3. Use dedicated Free / Pro / Founder / Canceled production test accounts.");
  log("  4. Use existing production-safe test hunts; this flow never seeds production.");
  log("  5. Keep service-role keys, passwords, JWTs, cookies, session files, and fixture ids out of logs and chat.");
  log(`  6. Set E2E_PHENO_LIVE_SMOKE_CONFIRM=${PHENO_LIVE_CONFIRM_VALUE} only when ready to hit production.`);
  log("  7. Run the deployed-build fingerprint, then the live smoke, then the receipt writer.");

  if (result.missing.length > 0) {
    log("");
    log(`Missing variable names: ${result.missing.join(", ")}`);
  }
  for (const warning of result.warnings) log(`WARNING: ${warning}`);
  for (const error of result.errors) log(`FAIL: ${error}`);

  log("");
  log(`Preflight status: ${result.status}`);
}

async function cli() {
  const result = evaluatePhenoLiveSmokeEnv(process.env);
  printPhenoLiveSmokeChecklist(result);
  process.exit(result.exitCode);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  cli().catch(() => process.exit(1));
}
