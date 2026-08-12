#!/usr/bin/env node
/**
 * Pheno Tracker paid-user smoke — local orchestrator.
 *
 * One command drives the full local flow:
 *   1. Preflight
 *   2. Seed fixtures
 *   3. Load generated fixture env (e2e/.fixtures/pheno-paid-smoke.env)
 *   4. Post-seed hydration verify (comparison-ready via real adapter code)
 *   5. Create role sessions
 *   6. Playwright paid-user smoke
 *   7. Final summary
 *
 * Exit codes:
 *   0  full smoke PASS
 *   1  test / product / configuration FAIL
 *   2  BLOCKED or SKIPPED — required local dependencies missing
 *
 * Never prints secret values (service_role, emails, passwords, cookies,
 * JWTs, fixture ids). Only status labels + env-var names.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FIXTURE_ENV_PATH = path.resolve("e2e/.fixtures/pheno-paid-smoke.env");
const ROLE_ENV_PATH = path.resolve("e2e/.fixtures/pheno-paid-smoke-roles.env");
const HOSTED_MARKERS = ["supabase.co", "supabase.in", "lovable.app", "lovable.dev"];

const REQUIRED_LOCAL_ENVS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const REQUIRED_ROLE_CREDS = [
  ["Free", "E2E_PHENO_FREE_EMAIL", "E2E_PHENO_FREE_PASSWORD"],
  ["Pro Monthly", "E2E_PHENO_PRO_EMAIL", "E2E_PHENO_PRO_PASSWORD"],
  ["Pro Annual", "E2E_PHENO_PRO_ANNUAL_EMAIL", "E2E_PHENO_PRO_ANNUAL_PASSWORD"],
  ["Founder", "E2E_PHENO_FOUNDER_EMAIL", "E2E_PHENO_FOUNDER_PASSWORD"],
  ["Canceled", "E2E_PHENO_CANCELED_EMAIL", "E2E_PHENO_CANCELED_PASSWORD"],
];
let ephemeralRolesProvisioned = false;

function present(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

const summary = {
  preflight: "pending",
  seed: "pending",
  fixtureEnv: "pending",
  hydration: "pending",
  sessions: "pending",
  playwright: "pending",
};

function log(line) {
  console.log(line);
}
function header(title) {
  log("");
  log(`── ${title} ──────────────────────────────`);
}

function run(cmd, args, extraEnv = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: false,
  });
  return res.status ?? 1;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const names = [];
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const name = line.slice(0, eq).trim();
    process.env[name] = line.slice(eq + 1).trim();
    names.push(name);
  }
  return names.sort();
}

function finish(code, finalStatus) {
  if (ephemeralRolesProvisioned) {
    const cleanupCode = run("node", [
      "scripts/e2e/provision-pheno-paid-smoke-roles.mjs",
      "--cleanup",
    ]);
    for (const file of [
      FIXTURE_ENV_PATH,
      "e2e/.auth/pheno-free.json",
      "e2e/.auth/pheno-free.session-storage.json",
      "e2e/.auth/pheno-pro.json",
      "e2e/.auth/pheno-pro.session-storage.json",
      "e2e/.auth/pheno-pro-annual.json",
      "e2e/.auth/pheno-pro-annual.session-storage.json",
      "e2e/.auth/pheno-founder.json",
      "e2e/.auth/pheno-founder.session-storage.json",
      "e2e/.auth/pheno-canceled.json",
      "e2e/.auth/pheno-canceled.session-storage.json",
    ]) {
      fs.rmSync(file, { force: true });
    }
    if (cleanupCode !== 0) {
      code = 1;
      finalStatus = "FAIL (cleanup)";
    }
  }
  header("Final summary");
  for (const [k, v] of Object.entries(summary)) log(`  ${k.padEnd(11)} ${v}`);
  log(`  final       ${finalStatus}`);
  process.exit(code);
}

// ── Stage 0: mint disposable role credentials when none were supplied ───
const missingInitialRoles = REQUIRED_ROLE_CREDS.filter(([, e, p]) => !(present(e) && present(p)));
if (missingInitialRoles.length > 0 && REQUIRED_LOCAL_ENVS.every(present)) {
  header("Stage 0 — provision disposable local roles");
  const provisionCode = run("node", ["scripts/e2e/provision-pheno-paid-smoke-roles.mjs"]);
  if (provisionCode !== 0) finish(provisionCode === 2 ? 2 : 1, "BLOCKED");
  const roleNames = loadEnvFile(ROLE_ENV_PATH);
  log(`  PRESENT  ${roleNames.length} role variable(s) loaded (names only)`);
  ephemeralRolesProvisioned = true;
}

// ── Stage 1: initial preflight ────────────────────────────────────────────
header("Stage 1 — initial preflight");
const missingLocal = REQUIRED_LOCAL_ENVS.filter((n) => !present(n));
for (const n of REQUIRED_LOCAL_ENVS) log(`  ${present(n) ? "PRESENT " : "SKIPPED "} ${n}`);
for (const [label, e, p] of REQUIRED_ROLE_CREDS) {
  const ok = present(e) && present(p);
  log(`  ${ok ? "PRESENT " : "SKIPPED "} ${label} (${e}, ${p})`);
}

// Reject hosted host early.
if (present("SUPABASE_URL")) {
  let host = "";
  try {
    host = new URL(process.env.SUPABASE_URL).host.toLowerCase();
  } catch {
    /* noop */
  }
  if (HOSTED_MARKERS.some((m) => host.endsWith(m))) {
    log(`  FAIL  SUPABASE_URL host looks like production — refused`);
    summary.preflight = "FAIL (hosted host refused)";
    finish(1, "FAIL");
  }
}

const missingRoles = REQUIRED_ROLE_CREDS.filter(([, e, p]) => !(present(e) && present(p)));
if (missingLocal.length > 0 || missingRoles.length > 0) {
  summary.preflight = "SKIPPED (missing local env or required role credentials)";
  finish(2, "SKIPPED");
}
summary.preflight = "PRESENT";

// Run preflight script for its full report.
const pfCode = run("node", ["scripts/e2e/check-pheno-paid-smoke-env.mjs"]);
if (pfCode !== 0) {
  summary.preflight = "FAIL";
  finish(1, "FAIL");
}

// ── Stage 2: seed ─────────────────────────────────────────────────────────
header("Stage 2 — seed fixtures");
const seedCode = run("node", ["scripts/e2e/seed-pheno-paid-smoke-fixtures.mjs"]);
if (seedCode !== 0) {
  summary.seed = "FAIL";
  finish(1, "FAIL");
}
summary.seed = "OK";

// ── Stage 3: load generated fixture env ───────────────────────────────────
header("Stage 3 — load generated fixture env");
if (!fs.existsSync(FIXTURE_ENV_PATH)) {
  log("  FAIL  fixture env file was not created by the seeder");
  summary.fixtureEnv = "FAIL";
  finish(1, "FAIL");
}
const gitignore = fs.existsSync("e2e/.gitignore") ? fs.readFileSync("e2e/.gitignore", "utf8") : "";
if (!/\.fixtures\/?/.test(gitignore)) {
  log("  FAIL  e2e/.fixtures/ is not gitignored — refusing to load");
  summary.fixtureEnv = "FAIL";
  finish(1, "FAIL");
}
const fixtureVars = {};
for (const raw of fs.readFileSync(FIXTURE_ENV_PATH, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq === -1) continue;
  const name = line.slice(0, eq).trim();
  const value = line
    .slice(eq + 1)
    .trim()
    .replace(/^"(.*)"$/, "$1");
  if (name) fixtureVars[name] = value;
}
// Apply to this process for downstream children (do NOT echo values).
for (const [k, v] of Object.entries(fixtureVars)) process.env[k] = v;
const fixtureNames = Object.keys(fixtureVars).sort();
log(
  `  PRESENT  ${fixtureNames.length} fixture variable(s) loaded (names only): ${fixtureNames.join(", ")}`,
);
summary.fixtureEnv = "OK";

// ── Stage 4: post-seed hydration verify ───────────────────────────────────
header("Stage 4 — post-seed hydration verify");
// Plain bun (native TS + tsconfig paths): both bunx-tsx and node+tsx crash
// at exit on Windows with a libuv async-handle assertion from the esbuild
// service, turning a passing verify into FAIL.
const verifyCode = run("bun", ["scripts/e2e/verify-pheno-paid-smoke-fixtures.ts"]);
if (verifyCode === 2) {
  summary.hydration = "BLOCKED";
  finish(2, "BLOCKED");
}
if (verifyCode !== 0) {
  summary.hydration = "FAIL";
  finish(1, "FAIL");
}
summary.hydration = "HYDRATED";

// ── Stage 5: sessions ─────────────────────────────────────────────────────
header("Stage 5 — create role sessions");
const sessCode = run("node", ["scripts/e2e/create-pheno-paid-smoke-sessions.mjs"]);
if (sessCode !== 0) {
  summary.sessions = "FAIL";
  finish(1, "FAIL");
}
summary.sessions = "OK";
Object.assign(process.env, {
  E2E_PHENO_FREE_SESSION_FILE: "e2e/.auth/pheno-free.json",
  E2E_PHENO_PRO_SESSION_FILE: "e2e/.auth/pheno-pro.json",
  E2E_PHENO_PRO_ANNUAL_SESSION_FILE: "e2e/.auth/pheno-pro-annual.json",
  E2E_PHENO_FOUNDER_SESSION_FILE: "e2e/.auth/pheno-founder.json",
  E2E_PHENO_CANCELED_SESSION_FILE: "e2e/.auth/pheno-canceled.json",
});

// ── Stage 6: Playwright ──────────────────────────────────────────────────
header("Stage 6 — Playwright paid-user smoke");
const pwCode = run(
  "bunx",
  ["playwright", "test", "e2e/pheno-tracker-paid-user-smoke.spec.ts", "--project=chromium-mocked"],
  {
    // playwright.config.ts disables trace capture for real-auth runs when
    // this presence flag is set. The value is a non-credential sentinel;
    // actual role sessions still come only from the gitignored files above.
    E2E_TEST_EMAIL: "ephemeral-role-trace-disabled",
  },
);
if (pwCode !== 0) {
  summary.playwright = "FAIL";
  finish(1, "FAIL");
}
summary.playwright = "PASS";

finish(0, "PASS");
