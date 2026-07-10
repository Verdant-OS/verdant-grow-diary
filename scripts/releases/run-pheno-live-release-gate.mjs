#!/usr/bin/env node
/**
 * Pheno Tracker Pro — one-command local live release gate.
 *
 * Wraps the existing runner (`scripts/e2e/run-pheno-live-release-smoke.mjs`)
 * with an up-front local credential-file check so a placeholder-filled or
 * missing file NEVER reaches build fingerprint, session mint, or Playwright.
 *
 * Runs ONLY on the operator's local machine. Lovable's sandbox cannot see
 * the Windows filesystem — it can build and validate this tooling but only
 * the local operator can create, load, or execute the credential file.
 *
 * Credential file resolution:
 *   1. $PHENO_LIVE_SMOKE_ENV_FILE (absolute or relative to CWD/repo)
 *   2. ./e2e/.fixtures/pheno-live-smoke.env (repo-relative default)
 *
 * The file must:
 *   - resolve inside the repository (no cross-tree paths)
 *   - be reported ignored by `git check-ignore`
 *   - parse without duplicates or malformed lines
 *   - contain every required variable, no placeholders, correct confirmation
 *
 * Exit codes:
 *   0 = live smoke PASS (delegated)
 *   1 = FAIL (unsafe path, malformed file, invalid confirmation, or a
 *            downstream stage FAIL)
 *   2 = BLOCKED (credential file missing, missing values, or placeholders)
 *       — no production request is made
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyValue, parseEnvFileContents } from "../e2e/pheno-live-smoke-placeholders.mjs";
import {
  PHENO_LIVE_CONFIRM_VALUE,
  PHENO_LIVE_REQUIRED_ENV,
} from "../e2e/check-pheno-live-smoke-env.mjs";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..", "..");
const DEFAULT_ENV_FILE = path.join("e2e", ".fixtures", "pheno-live-smoke.env");
const CONFIRM_NAME = "E2E_PHENO_LIVE_SMOKE_CONFIRM";

/** @typedef {{workingCopy:string, preflight:string, buildIdentity:string, sessions:string, playwright:string, final:string}} StageSummary */

function makeStages() {
  return {
    workingCopy: "NOT RUN",
    preflight: "NOT RUN",
    buildIdentity: "NOT RUN",
    sessions: "NOT RUN",
    playwright: "NOT RUN",
    final: "NOT RUN",
  };
}

function printStages(stages) {
  console.log("");
  console.log(`workingCopy  ${stages.workingCopy}`);
  console.log(`preflight    ${stages.preflight}`);
  console.log(`buildIdentity ${stages.buildIdentity}`);
  console.log(`sessions     ${stages.sessions}`);
  console.log(`playwright   ${stages.playwright}`);
  console.log(`final        ${stages.final}`);
}

function exitBlocked(stages, reason) {
  stages.final = "BLOCKED";
  console.log("");
  console.log(`BLOCKED — ${reason}`);
  console.log("Lovable cannot access or verify files on your Windows machine.");
  console.log("Run `bun run release:pheno:local-check` on the local machine and re-run this gate.");
  printStages(stages);
  process.exit(2);
}

function exitFail(stages, reason) {
  stages.final = "FAIL";
  console.log("");
  console.log(`FAIL — ${reason}`);
  printStages(stages);
  process.exit(1);
}

/**
 * @param {import('../e2e/pheno-live-smoke-placeholders.mjs').parseEnvFileContents extends (c: string) => infer R ? R : never} parsed
 */
function verifyParsedCredentials(parsed) {
  const missing = [];
  const placeholders = [];
  const invalid = [];
  for (const name of PHENO_LIVE_REQUIRED_ENV) {
    if (!Object.prototype.hasOwnProperty.call(parsed.values, name)) {
      missing.push(name);
      continue;
    }
    const cls = classifyValue(parsed.values[name]);
    if (cls === "BLANK") missing.push(name);
    else if (cls === "PLACEHOLDER") placeholders.push(name);
    else if (name === CONFIRM_NAME && parsed.values[name] !== PHENO_LIVE_CONFIRM_VALUE) {
      invalid.push(name);
    }
  }
  return { missing, placeholders, invalid };
}

function resolveCredentialFile(cwd) {
  const raw = process.env.PHENO_LIVE_SMOKE_ENV_FILE;
  let candidate;
  if (raw && raw.trim().length > 0) {
    candidate = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
  } else {
    candidate = path.resolve(REPO_ROOT, DEFAULT_ENV_FILE);
  }
  return path.normalize(candidate);
}

function isInsideRepo(absolutePath) {
  const rel = path.relative(REPO_ROOT, absolutePath);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function main() {
  const stages = makeStages();
  const cwd = process.cwd();

  console.log("Pheno Tracker Pro — one-command live release gate");
  console.log("--------------------------------------------------");
  console.log("Local-machine-only. Credential values are never printed.");
  console.log("");

  // Stage 0 — working copy + credential file boundary
  const credFile = resolveCredentialFile(cwd);
  if (!isInsideRepo(credFile)) {
    stages.workingCopy = "FAIL";
    exitFail(stages, "credential file resolves outside this repository");
  }

  if (!fs.existsSync(credFile)) {
    stages.workingCopy = "BLOCKED";
    stages.preflight = "BLOCKED";
    exitBlocked(stages, "credential file not present on this machine");
  }

  // git check-ignore
  const gitCheck = spawnSync("git", ["check-ignore", "--quiet", "--", path.relative(REPO_ROOT, credFile)], {
    cwd: REPO_ROOT,
    stdio: "ignore",
  });
  if (gitCheck.status !== 0) {
    stages.workingCopy = "FAIL";
    exitFail(stages, "credential file is not gitignored");
  }

  // Parse without printing values
  let contents;
  try { contents = fs.readFileSync(credFile, "utf8"); }
  catch { stages.workingCopy = "FAIL"; exitFail(stages, "credential file could not be read"); }

  const parsed = parseEnvFileContents(contents);
  if (parsed.errors.length > 0 || parsed.duplicates.length > 0) {
    stages.workingCopy = "FAIL";
    const detail = [
      ...parsed.errors,
      ...parsed.duplicates.map((k) => `duplicate ${k}`),
    ].join("; ");
    exitFail(stages, `credential file is malformed (${detail})`);
  }

  const verify = verifyParsedCredentials(parsed);
  if (verify.invalid.length > 0) {
    stages.workingCopy = "FAIL";
    exitFail(stages, `invalid confirmation value in ${verify.invalid.join(", ")}`);
  }
  if (verify.missing.length > 0 || verify.placeholders.length > 0) {
    stages.workingCopy = "BLOCKED";
    stages.preflight = "BLOCKED";
    const detail = [
      verify.missing.length ? `missing: ${verify.missing.join(", ")}` : null,
      verify.placeholders.length ? `placeholders: ${verify.placeholders.join(", ")}` : null,
    ].filter(Boolean).join(" | ");
    exitBlocked(stages, `credential readiness — ${detail}`);
  }

  stages.workingCopy = "PASS";

  // Delegate to the existing runner with the credential values loaded into
  // the child process env only — never printed, never persisted.
  const childEnv = { ...process.env, ...parsed.values };
  console.log("workingCopy  PASS");
  console.log("Delegating to scripts/e2e/run-pheno-live-release-smoke.mjs …");
  console.log("");

  const result = spawnSync(process.execPath, ["scripts/e2e/run-pheno-live-release-smoke.mjs"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: childEnv,
  });

  const code = result.status ?? 1;
  stages.preflight = code === 2 ? "BLOCKED" : "PASS (delegated)";
  stages.buildIdentity = code === 0 ? "PASS (delegated)" : (code === 2 ? "NOT RUN" : "SEE RUNNER");
  stages.sessions = code === 0 ? "PASS (delegated)" : (code === 2 ? "NOT RUN" : "SEE RUNNER");
  stages.playwright = code === 0 ? "PASS (delegated)" : (code === 2 ? "NOT RUN" : "SEE RUNNER");
  stages.final = code === 0 ? "PASS" : code === 2 ? "BLOCKED" : "FAIL";
  printStages(stages);
  process.exit(code);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === __filename) {
  main();
}

export { resolveCredentialFile, verifyParsedCredentials, isInsideRepo };
