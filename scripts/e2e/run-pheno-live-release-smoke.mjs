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
 *   1 = preflight FAIL, deployment/fingerprint, session, or Playwright FAIL
 *   2 = preflight BLOCKED (required local inputs missing) — nothing was run
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  evaluatePhenoLiveSmokeEnv,
  printPhenoLiveSmokeChecklist,
} from "./check-pheno-live-smoke-env.mjs";
import {
  statsFromReport,
  evaluateStats,
  deriveCheckpoints,
} from "./pheno-live-smoke-report.mjs";

const LIVE_URL = "https://verdantgrowdiary.com";
const FINGERPRINT_SCRIPT = "scripts/releases/fetch-pheno-live-build-id.mjs";
const ARTIFACT_DIR = path.resolve("artifacts/release-readiness/pheno-tracker-live-smoke");
const PLAYWRIGHT_JSON_PATH = path.join(ARTIFACT_DIR, "playwright-report.json");
const SUMMARY_JSON_PATH = path.join(ARTIFACT_DIR, "live-smoke-summary.json");
const SUMMARY_MD_PATH = path.join(ARTIFACT_DIR, "live-smoke-summary.md");

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
  fingerprint: "PENDING",
  preflight: "PENDING",
  sessions: "PENDING",
  playwright: "PENDING",
  tests: { passed: 0, failed: 0, skipped: 0, flaky: 0, total: 0 },
  checkpoints: [],
  final: "HOLD",
};

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

function readPlaywrightReport() {
  if (!fs.existsSync(PLAYWRIGHT_JSON_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(PLAYWRIGHT_JSON_PATH, "utf8"));
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
    `- Preflight: ${summary.preflight}`,
    `- Deployment reachable: ${summary.deployment}`,
    `- Build fingerprint: ${summary.fingerprint}`,
    `- Role sessions: ${summary.sessions}`,
    `- Playwright: ${summary.playwright}`,
    `- Tests: ${summary.tests.passed} passed / ${summary.tests.failed} failed / ${summary.tests.skipped} skipped / ${summary.tests.flaky} flaky`,
    `- Final: **${summary.final}**`,
    "",
    "## Checkpoints",
    "",
    "| # | Checkpoint | Status |",
    "|---|------------|--------|",
    ...summary.checkpoints.map((c) => `| ${c.id} | ${c.label} | ${c.status} |`),
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
  log(`  preflight   ${summary.preflight}`);
  log(`  deployment  ${summary.deployment}`);
  log(`  fingerprint ${summary.fingerprint}`);
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

  section("Stage 1 — local-only preflight (no network)");
  // Shared preflight module: names-only reporting, BLOCKED on missing
  // inputs (exit 2, nothing runs), FAIL on invalid confirmation or a
  // conflicting E2E_BASE_URL (exit 1), service-role presence warns only.
  const preflight = evaluatePhenoLiveSmokeEnv(process.env);
  printPhenoLiveSmokeChecklist(preflight, log);
  if (preflight.status === "BLOCKED") {
    summary.preflight = "BLOCKED (required local inputs missing)";
    finish(2, "BLOCKED");
  }
  if (preflight.status !== "READY") {
    summary.preflight = "FAIL (invalid or conflicting configuration)";
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

  section("Stage 3 — deployed-build fingerprint");
  // Records bundle id / SHA-256 / headers to deployed-build.json and FAILS
  // on an expected-identifier mismatch — before any session is minted.
  const fingerprintCode = run(process.execPath, [FINGERPRINT_SCRIPT]);
  if (fingerprintCode !== 0) {
    summary.fingerprint = "FAIL (bundle unreachable or expected build identifier mismatch)";
    finish(1, "FAIL");
  }
  summary.fingerprint = "PASS";

  section("Stage 4 — mint dedicated role sessions");
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

  section("Stage 5 — Playwright live paid-user smoke");
  const playwrightCode = run(
    "bunx",
    [
      "playwright",
      "test",
      "e2e/pheno-tracker-paid-user-smoke.spec.ts",
      // Real minted sessions, no route mocking — this is the live smoke.
      "--project=chromium-authed",
      // Skip the shared auth.setup dependency: every describe binds its own
      // storage state (role sessions or explicit anonymous), and a skipped
      // setup would otherwise count as a skipped test and fail the gate.
      "--no-deps",
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

  const report = readPlaywrightReport();
  const stats = statsFromReport(report);
  if (stats) summary.tests = stats;
  summary.checkpoints = deriveCheckpoints(report);
  if (playwrightCode !== 0) {
    summary.playwright = "FAIL";
    finish(1, "FAIL");
  }
  const verdict = evaluateStats(stats);
  if (!verdict.ok) {
    summary.playwright = `FAIL (${verdict.reason})`;
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
