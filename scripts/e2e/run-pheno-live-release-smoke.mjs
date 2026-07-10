#!/usr/bin/env node
/**
 * Pheno Tracker Pro — live release smoke runner.
 *
 * Runs the existing paid-user Playwright smoke against the production domain
 * using dedicated Free / Pro / Founder / Canceled credentials and existing
 * production-safe fixture hunts. It never seeds production and never prints
 * credentials, sessions, cookies, tokens, or fixture ids.
 *
 * Required confirmation:
 *   E2E_PHENO_LIVE_SMOKE_CONFIRM=RUN_LIVE_PHENO_SMOKE
 *
 * Required credentials:
 *   E2E_PHENO_{FREE,PRO,FOUNDER,CANCELED}_{EMAIL,PASSWORD}
 *
 * Required fixtures:
 *   E2E_PHENO_HUNT_ID_MISSING_EVIDENCE
 *   E2E_PHENO_HUNT_ID_COMPARISON_READY
 *
 * Exit codes:
 *   0 = live smoke PASS
 *   1 = preflight, deployment, session, or Playwright FAIL
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const LIVE_URL = "https://verdantgrowdiary.com";
const CONFIRM_VALUE = "RUN_LIVE_PHENO_SMOKE";
const ARTIFACT_DIR = path.resolve("artifacts/release-readiness/pheno-tracker-live-smoke");
const PLAYWRIGHT_JSON_PATH = path.join(ARTIFACT_DIR, "playwright-report.json");
const SUMMARY_JSON_PATH = path.join(ARTIFACT_DIR, "live-smoke-summary.json");
const SUMMARY_MD_PATH = path.join(ARTIFACT_DIR, "live-smoke-summary.md");

const ROLES = [
  { label: "Free", key: "free", email: "E2E_PHENO_FREE_EMAIL", password: "E2E_PHENO_FREE_PASSWORD" },
  { label: "Pro", key: "pro", email: "E2E_PHENO_PRO_EMAIL", password: "E2E_PHENO_PRO_PASSWORD" },
  { label: "Founder", key: "founder", email: "E2E_PHENO_FOUNDER_EMAIL", password: "E2E_PHENO_FOUNDER_PASSWORD" },
  { label: "Canceled", key: "canceled", email: "E2E_PHENO_CANCELED_EMAIL", password: "E2E_PHENO_CANCELED_PASSWORD" },
];

const REQUIRED_FIXTURES = [
  "E2E_PHENO_HUNT_ID_MISSING_EVIDENCE",
  "E2E_PHENO_HUNT_ID_COMPARISON_READY",
];

const SESSION_FILES = {
  E2E_PHENO_FREE_SESSION_FILE: "e2e/.auth/pheno-free.json",
  E2E_PHENO_PRO_SESSION_FILE: "e2e/.auth/pheno-pro.json",
  E2E_PHENO_FOUNDER_SESSION_FILE: "e2e/.auth/pheno-founder.json",
  E2E_PHENO_CANCELED_SESSION_FILE: "e2e/.auth/pheno-canceled.json",
};

const summary = {
  generatedAt: new Date().toISOString(),
  target: LIVE_URL,
  deployment: "PENDING",
  preflight: "PENDING",
  sessions: "PENDING",
  playwright: "PENDING",
  tests: { passed: 0, failed: 0, skipped: 0, flaky: 0, total: 0 },
  final: "HOLD",
};

function present(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function log(message = "") {
  console.log(message);
}

function section(title) {
  log();
  log(`── ${title} ─────────────────────────────────────────`);
}

function run(command, args, extraEnv = {}) {
  return spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...extraEnv },
  }).status ?? 1;
}

function safeStatsFromReport() {
  if (!fs.existsSync(PLAYWRIGHT_JSON_PATH)) return null;
  try {
    const report = JSON.parse(fs.readFileSync(PLAYWRIGHT_JSON_PATH, "utf8"));
    const stats = report?.stats ?? {};
    const passed = Number(stats.expected ?? 0);
    const failed = Number(stats.unexpected ?? 0);
    const skipped = Number(stats.skipped ?? 0);
    const flaky = Number(stats.flaky ?? 0);
    return { passed, failed, skipped, flaky, total: passed + failed + skipped + flaky };
  } catch {
    return null;
  }
}

function writeArtifacts() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(SUMMARY_JSON_PATH, `${JSON.stringify(summary, null, 2)}\n`);

  const lines = [
    "# Pheno Tracker Pro live smoke summary",
    "",
    `- Generated: ${summary.generatedAt}`,
    `- Target: ${summary.target}`,
    `- Deployment reachable: ${summary.deployment}`,
    `- Preflight: ${summary.preflight}`,
    `- Role sessions: ${summary.sessions}`,
    `- Playwright: ${summary.playwright}`,
    `- Tests: ${summary.tests.passed} passed / ${summary.tests.failed} failed / ${summary.tests.skipped} skipped / ${summary.tests.flaky} flaky`,
    `- Final: **${summary.final}**`,
    "",
    "> This summary intentionally excludes account emails, passwords, cookies, tokens, session contents, and fixture ids.",
    "> A PASS here completes the automated browser smoke only. The release receipt must still record deployment and schema spot-check evidence before HOLD becomes GO.",
    "",
  ];
  fs.writeFileSync(SUMMARY_MD_PATH, lines.join("\n"));
}

function finish(code, finalStatus) {
  summary.final = finalStatus;
  writeArtifacts();
  section("Final summary");
  log(`  deployment  ${summary.deployment}`);
  log(`  preflight   ${summary.preflight}`);
  log(`  sessions    ${summary.sessions}`);
  log(`  playwright  ${summary.playwright}`);
  log(`  tests       ${summary.tests.passed} passed / ${summary.tests.failed} failed / ${summary.tests.skipped} skipped / ${summary.tests.flaky} flaky`);
  log(`  final       ${summary.final}`);
  log(`  receipt     ${path.relative(process.cwd(), SUMMARY_MD_PATH)}`);
  process.exit(code);
}

async function checkDeployment() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(LIVE_URL, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Verdant-Pheno-Live-Smoke/1.0" },
    });
    const body = await response.text();
    return response.ok && body.trim().length > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.rmSync(PLAYWRIGHT_JSON_PATH, { force: true });

  section("Stage 1 — live-run confirmation and preflight");
  if (process.env.E2E_PHENO_LIVE_SMOKE_CONFIRM !== CONFIRM_VALUE) {
    log(`  FAIL  set E2E_PHENO_LIVE_SMOKE_CONFIRM=${CONFIRM_VALUE}`);
    summary.preflight = "FAIL (explicit confirmation missing)";
    finish(1, "FAIL");
  }

  if (present("E2E_BASE_URL") && process.env.E2E_BASE_URL.trim().replace(/\/$/, "") !== LIVE_URL) {
    log("  FAIL  E2E_BASE_URL conflicts with the fixed production target");
    summary.preflight = "FAIL (target mismatch)";
    finish(1, "FAIL");
  }

  const missing = [];
  for (const role of ROLES) {
    const ok = present(role.email) && present(role.password);
    log(`  ${ok ? "PRESENT" : "MISSING "} ${role.label} dedicated account credentials`);
    if (!ok) missing.push(role.email, role.password);
  }
  for (const name of REQUIRED_FIXTURES) {
    const ok = present(name);
    log(`  ${ok ? "PRESENT" : "MISSING "} ${name}`);
    if (!ok) missing.push(name);
  }
  if (missing.length > 0) {
    log(`  FAIL  missing environment variable names: ${[...new Set(missing)].join(", ")}`);
    summary.preflight = "FAIL (required live inputs missing)";
    finish(1, "FAIL");
  }
  summary.preflight = "PASS";

  section("Stage 2 — deployment reachability");
  if (!(await checkDeployment())) {
    summary.deployment = "FAIL";
    log("  FAIL  production URL did not return a successful non-empty response");
    finish(1, "FAIL");
  }
  summary.deployment = "PASS";
  log("  PASS  production URL is reachable");

  section("Stage 3 — mint dedicated role sessions");
  const sessionCode = run("node", ["scripts/e2e/create-pheno-paid-smoke-sessions.mjs"], {
    E2E_BASE_URL: LIVE_URL,
  });
  if (sessionCode !== 0) {
    summary.sessions = "FAIL";
    finish(1, "FAIL");
  }
  for (const [envName, relativePath] of Object.entries(SESSION_FILES)) {
    const absolute = path.resolve(relativePath);
    const snapshot = absolute.replace(/\.json$/, ".session-storage.json");
    if (!fs.existsSync(absolute) || !fs.existsSync(snapshot)) {
      log(`  FAIL  ${envName} session artifacts were not created`);
      summary.sessions = "FAIL";
      finish(1, "FAIL");
    }
    process.env[envName] = relativePath;
  }
  summary.sessions = "PASS";

  section("Stage 4 — Playwright live paid-user smoke");
  const playwrightCode = run(
    "bunx",
    [
      "playwright",
      "test",
      "e2e/pheno-tracker-paid-user-smoke.spec.ts",
      "--project=chromium-mocked",
      "--reporter=list,json",
    ],
    {
      E2E_BASE_URL: LIVE_URL,
      // Truthy sentinel disables traces containing real auth headers in playwright.config.ts.
      E2E_TEST_EMAIL: "live-pheno-smoke-configured",
      PLAYWRIGHT_JSON_OUTPUT_NAME: PLAYWRIGHT_JSON_PATH,
      ...SESSION_FILES,
    },
  );

  const stats = safeStatsFromReport();
  if (stats) summary.tests = stats;
  if (playwrightCode !== 0) {
    summary.playwright = "FAIL";
    finish(1, "FAIL");
  }
  if (!stats) {
    summary.playwright = "FAIL (JSON report missing)";
    finish(1, "FAIL");
  }
  if (stats.failed > 0 || stats.skipped > 0 || stats.passed === 0) {
    summary.playwright = `FAIL (${stats.failed} failed, ${stats.skipped} skipped)`;
    finish(1, "FAIL");
  }

  summary.playwright = "PASS";
  finish(0, "PASS");
}

main().catch(() => {
  summary.final = "FAIL";
  summary.playwright = summary.playwright === "PENDING" ? "FAIL (unexpected runner error)" : summary.playwright;
  writeArtifacts();
  process.exit(1);
});
