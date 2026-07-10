#!/usr/bin/env node
/**
 * Pheno Tracker Pro — one-command local release gate (stages 1–8).
 *
 * Orchestrates the existing stage scripts; it copies none of their logic:
 *   1. working-copy safety            (git status / git diff --check)
 *   2. environment preflight          scripts/e2e/check-pheno-live-smoke-env.mjs
 *   3. deployed-build fingerprint     scripts/releases/fetch-pheno-live-build-id.mjs
 *   4. live role smoke                scripts/e2e/run-pheno-live-release-smoke.mjs
 *   5. production schema evidence     artifacts/.../schema-spot-check.json
 *   6. manual release evidence        artifacts/.../manual-release-checks.json
 *   7. receipt write + validation     write-/validate-pheno-release-receipt.mjs
 *   8. final repository safety        (git status / git diff --check)
 *
 * Credentials load from a gitignored env file (default
 * e2e/.fixtures/pheno-live-smoke.env, override PHENO_LIVE_SMOKE_ENV_FILE)
 * into CHILD process environments only. Values are never printed, never
 * persisted beyond this process, and SUPABASE_SERVICE_ROLE_KEY is stripped.
 * The gate never seeds production.
 *
 * Exit codes: 0 = validated GO · 1 = failure/unsafe/malformed · 2 = HOLD/BLOCKED.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { schemaResult } from "./write-pheno-release-receipt.mjs";
import { evaluateStats } from "../e2e/pheno-live-smoke-report.mjs";

const DEFAULT_ENV_FILE = "e2e/.fixtures/pheno-live-smoke.env";
const ARTIFACT_REL = "artifacts/release-readiness/pheno-tracker-live-smoke";
const STAGE_SCRIPTS = {
  preflight: "scripts/e2e/check-pheno-live-smoke-env.mjs",
  fingerprint: "scripts/releases/fetch-pheno-live-build-id.mjs",
  smoke: "scripts/e2e/run-pheno-live-release-smoke.mjs",
  receipt: "scripts/releases/write-pheno-release-receipt.mjs",
  validator: "scripts/releases/validate-pheno-release-receipt.mjs",
};
// The only tracked file a gate run may legitimately dirty.
const ALLOWED_DIRTY_PATHS = new Set(["docs/releases/pheno-tracker-pro-release-receipt.md"]);

/** Parse KEY=VALUE lines: blank/# skipped, first '=' splits, matching quotes stripped. */
export function parseEnvFile(content) {
  const values = {};
  for (const raw of String(content).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const name = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (name) values[name] = value;
  }
  return values;
}

/** Refuse missing, outside-repo, or non-ignored credential files. */
export function verifyCredentialFile({ envFile, repoRoot, exists, isIgnored }) {
  const resolved = path.resolve(repoRoot, envFile);
  const rel = path.relative(repoRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, exitCode: 1, reason: "credential file resolves outside the repository" };
  }
  if (!exists(resolved)) {
    return { ok: false, exitCode: 2, reason: "credential file not found (BLOCKED)" };
  }
  if (!isIgnored(resolved)) {
    return {
      ok: false,
      exitCode: 1,
      reason: "credential file is tracked or not gitignored — refusing to load it",
    };
  }
  return { ok: true, resolved };
}

/** Working-copy safety: conflict markers, tracked secrets, unexpected changes. */
export function evaluateWorkingCopy({ statusLines, diffCheckOutput, trackedSecretFiles }) {
  const problems = [];
  for (const line of statusLines) {
    if (!line.trim()) continue;
    const p = line.slice(3).trim().replace(/\\/g, "/").replace(/^"|"$/g, "");
    if (!ALLOWED_DIRTY_PATHS.has(p)) problems.push(`unexpected working-copy change: ${p}`);
  }
  if (/conflict marker/i.test(diffCheckOutput)) {
    problems.push("merge-conflict markers present (git diff --check)");
  }
  for (const file of trackedSecretFiles) {
    problems.push(`credential/session file is TRACKED by git: ${file.replace(/\\/g, "/")}`);
  }
  return { ok: problems.length === 0, problems };
}

export function createDefaultDeps() {
  const repoRoot = process.cwd();
  return {
    repoRoot,
    env: process.env,
    log: (line) => console.log(line),
    exists: (p) => fs.existsSync(p),
    readFile: (p) => fs.readFileSync(p, "utf8"),
    writeFile: (p, content) => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    },
    gitStatusLines: () =>
      (spawnSync("git", ["status", "--short"], { encoding: "utf8" }).stdout ?? "")
        .split("\n")
        .filter(Boolean),
    gitDiffCheck: () =>
      (spawnSync("git", ["diff", "--check"], { encoding: "utf8" }).stdout ?? ""),
    gitTrackedSecretFiles: () =>
      (spawnSync("git", ["ls-files", "e2e/.fixtures", "e2e/.auth"], { encoding: "utf8" })
        .stdout ?? "")
        .split("\n")
        .filter(Boolean),
    gitIsIgnored: (p) =>
      spawnSync("git", ["check-ignore", "-q", p], { encoding: "utf8" }).status === 0,
    // Stage scripts inherit stdio so their (already redacted) output streams.
    runStage: (script, childEnv) =>
      spawnSync(process.execPath, [script], {
        stdio: "inherit",
        shell: false,
        env: childEnv,
      }).status ?? 1,
    now: () => new Date().toISOString(),
  };
}

function isPass(value) {
  return String(value ?? "").toUpperCase() === "PASS";
}

export async function runGate(deps) {
  const d = deps ?? createDefaultDeps();
  const artifactDir = path.resolve(d.repoRoot, ARTIFACT_REL);
  const readJsonSafe = (p) => {
    if (!d.exists(p)) return null;
    try {
      return JSON.parse(d.readFile(p));
    } catch {
      return undefined; // exists but malformed
    }
  };

  const summary = {
    startedAt: d.now(),
    workingCopy: "NOT RUN",
    preflight: "NOT RUN",
    buildIdentity: "NOT RUN",
    schema: "NOT RUN",
    manualEvidence: "NOT RUN",
    sessions: "NOT RUN",
    playwright: { passed: 0, failed: 0, skipped: 0, flaky: 0 },
    checkpoint8: "NOT RUN",
    checkpoint9Automated: "NOT RUN",
    checkpoint9Manual: "NOT RUN",
    receipt: "NOT RUN",
    final: "NOT RUN",
    problems: [],
  };

  const finish = (exitCode, finalLabel) => {
    summary.final = finalLabel;
    summary.finishedAt = d.now();
    d.writeFile(
      path.join(artifactDir, "release-gate-summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
    );
    d.writeFile(
      path.join(artifactDir, "release-gate-summary.md"),
      [
        "# Pheno Tracker Pro release-gate summary",
        "",
        `- Started: ${summary.startedAt}`,
        `- Finished: ${summary.finishedAt}`,
        `- workingCopy: ${summary.workingCopy}`,
        `- preflight: ${summary.preflight}`,
        `- buildIdentity: ${summary.buildIdentity}`,
        `- schema: ${summary.schema}`,
        `- manualEvidence: ${summary.manualEvidence}`,
        `- sessions: ${summary.sessions}`,
        `- playwright: ${summary.playwright.passed} passed / ${summary.playwright.failed} failed / ${summary.playwright.skipped} skipped / ${summary.playwright.flaky} flaky`,
        `- checkpoint8: ${summary.checkpoint8}`,
        `- checkpoint9 automated: ${summary.checkpoint9Automated}`,
        `- checkpoint9 manual: ${summary.checkpoint9Manual}`,
        `- receipt: ${summary.receipt}`,
        `- final: ${summary.final}`,
        ...(summary.problems.length ? ["", "## Pending / problems", ""] : []),
        ...summary.problems.map((p) => `- ${p}`),
        "",
        "> Redacted evidence only. No credentials, fixture ids, cookies, tokens, or session contents.",
        "",
      ].join("\n"),
    );
    d.log(`workingCopy   ${summary.workingCopy}`);
    d.log(`preflight     ${summary.preflight}`);
    d.log(`buildIdentity ${summary.buildIdentity}`);
    d.log(`schema        ${summary.schema}`);
    d.log(`manualEvidence ${summary.manualEvidence}`);
    d.log(`sessions      ${summary.sessions}`);
    d.log(
      `playwright    ${summary.playwright.passed}/${summary.playwright.failed}/${summary.playwright.skipped}/${summary.playwright.flaky}`,
    );
    d.log(`checkpoint8   ${summary.checkpoint8}`);
    d.log(`checkpoint9 automated ${summary.checkpoint9Automated}`);
    d.log(`checkpoint9 manual    ${summary.checkpoint9Manual}`);
    d.log(`receipt       ${summary.receipt}`);
    d.log(`final         ${summary.final}`);
    return { exitCode, summary };
  };

  // ── Stage 1 — working-copy safety ─────────────────────────────────────
  const workingCopy = evaluateWorkingCopy({
    statusLines: d.gitStatusLines(),
    diffCheckOutput: d.gitDiffCheck(),
    trackedSecretFiles: d.gitTrackedSecretFiles(),
  });
  if (!workingCopy.ok) {
    summary.workingCopy = "FAIL";
    summary.problems.push(...workingCopy.problems);
    return finish(1, "FAIL");
  }
  summary.workingCopy = "PASS";

  // ── Credential file (verified BEFORE loading) ─────────────────────────
  const envFile = d.env.PHENO_LIVE_SMOKE_ENV_FILE || DEFAULT_ENV_FILE;
  const credential = verifyCredentialFile({
    envFile,
    repoRoot: d.repoRoot,
    exists: d.exists,
    isIgnored: d.gitIsIgnored,
  });
  if (!credential.ok) {
    summary.preflight = credential.exitCode === 2 ? "BLOCKED" : "FAIL";
    summary.problems.push(credential.reason);
    return finish(credential.exitCode, summary.preflight);
  }
  const loaded = parseEnvFile(d.readFile(credential.resolved));
  // A template that was never filled must BLOCK here — otherwise preflight
  // sees every variable as "present" and the smoke burns real production
  // login attempts with placeholder credentials. Names only, never values.
  const placeholderNames = Object.entries(loaded)
    .filter(([, value]) => value.includes("REPLACE_ME"))
    .map(([name]) => name);
  if (placeholderNames.length > 0) {
    summary.preflight = "BLOCKED";
    summary.problems.push(
      `credential file still contains placeholder values for: ${placeholderNames.join(", ")}`,
    );
    return finish(2, "BLOCKED");
  }
  const childEnv = { ...d.env, ...loaded };
  delete childEnv.SUPABASE_SERVICE_ROLE_KEY;

  // ── Stage 2 — environment preflight ───────────────────────────────────
  const preflightCode = d.runStage(STAGE_SCRIPTS.preflight, childEnv);
  if (preflightCode === 2) {
    summary.preflight = "BLOCKED";
    summary.problems.push("preflight BLOCKED: required variables missing");
    return finish(2, "BLOCKED");
  }
  if (preflightCode !== 0) {
    summary.preflight = "FAIL";
    summary.problems.push("preflight FAIL: invalid confirmation or conflicting target");
    return finish(1, "FAIL");
  }
  summary.preflight = "READY";

  // ── Stage 3 — deployed-build fingerprint ──────────────────────────────
  const fingerprintCode = d.runStage(STAGE_SCRIPTS.fingerprint, childEnv);
  const build = readJsonSafe(path.join(artifactDir, "deployed-build.json"));
  if (fingerprintCode !== 0 || !build || build.expectedMatch !== true) {
    summary.buildIdentity = build?.expectedMatch === false ? "MISMATCH" : "UNPROVEN";
    summary.problems.push(
      "deployed-build identity not proven: set PHENO_EXPECTED_LIVE_BUILD_ID to the published bundle identifier and re-run",
    );
    return finish(1, "FAIL");
  }
  summary.buildIdentity = "MATCH";

  // ── Stage 4 — live role smoke ─────────────────────────────────────────
  const smokeCode = d.runStage(STAGE_SCRIPTS.smoke, childEnv);
  const smoke = readJsonSafe(path.join(artifactDir, "live-smoke-summary.json"));
  const stats = smoke?.tests ?? null;
  if (stats) {
    summary.playwright = {
      passed: Number(stats.passed ?? 0),
      failed: Number(stats.failed ?? 0),
      skipped: Number(stats.skipped ?? 0),
      flaky: Number(stats.flaky ?? 0),
    };
  }
  const checkpointById = new Map(
    (Array.isArray(smoke?.checkpoints) ? smoke.checkpoints : []).map((c) => [Number(c.id), c]),
  );
  summary.checkpoint8 = checkpointById.get(8)?.status ?? "PENDING";
  summary.checkpoint9Automated = checkpointById.get(9)?.status ?? "PENDING";
  summary.sessions = smoke?.sessions === "PASS" ? "PASS" : "FAIL";
  // "Exit 0 but Playwright never launched" must never read as PASS.
  const verdict = evaluateStats(
    stats ? { ...summary.playwright, total: Object.values(summary.playwright).reduce((a, b) => a + b, 0) } : null,
  );
  if (smokeCode !== 0 || smoke?.playwright !== "PASS" || smoke?.final !== "PASS" || !verdict.ok) {
    summary.problems.push(`live smoke did not PASS (${verdict.ok ? "runner reported failure" : verdict.reason})`);
    return finish(1, "FAIL");
  }

  // ── Stage 5 — production schema evidence ──────────────────────────────
  const schema = readJsonSafe(path.join(artifactDir, "schema-spot-check.json"));
  if (!schema || !schemaResult(schema).pass) {
    summary.schema = "HOLD";
    summary.problems.push(
      "schema-spot-check.json missing or failing (needs 3 columns / 1 entitlement function / 13 RESTRICTIVE tables / owner SELECT verified, recorded from the operator-controlled production SQL check)",
    );
    return finish(2, "HOLD");
  }
  summary.schema = "PASS";

  // ── Stage 6 — manual release evidence ─────────────────────────────────
  const manual = readJsonSafe(path.join(artifactDir, "manual-release-checks.json"));
  const manualProblems = [];
  if (!manual) {
    manualProblems.push("manual-release-checks.json missing");
    summary.checkpoint9Manual = "MISSING";
  } else {
    if (!isPass(manual.deployment?.noWhiteScreen)) manualProblems.push("no-white-screen confirmation missing");
    if (!isPass(manual.deployment?.consoleErrors)) manualProblems.push("console-error result missing");
    const billingStatus = String(manual.billing?.status ?? "").toUpperCase();
    const billingResolved =
      manual.billing?.required === false
        ? billingStatus === "NOT_REQUIRED" || billingStatus === "PASS"
        : billingStatus === "PASS";
    if (!billingResolved) manualProblems.push("billing disposition unresolved");
    for (const [key, label] of [
      ["priorVersionIdentified", "rollback: prior version"],
      ["additiveMigrations", "rollback: additive migrations"],
      ["entryPointDisable", "rollback: entry-point disable"],
      ["ownerReadPreserved", "rollback: owner read preserved"],
    ]) {
      if (!isPass(manual.rollback?.[key])) manualProblems.push(`${label} missing`);
    }
    if (!String(manual.operator ?? "").trim()) manualProblems.push("operator missing");
    if (!String(manual.publishedAt ?? "").trim()) manualProblems.push("publish timestamp missing");
    const cp9 = manual.checkpoints?.["9"] ?? manual.checkpoints?.[9];
    const cp9Status = typeof cp9 === "string" ? cp9 : cp9?.status;
    summary.checkpoint9Manual = isPass(cp9Status) ? "PRESENT" : "MISSING";
    if (!isPass(cp9Status)) {
      manualProblems.push(
        "checkpoint 9 manual live evidence missing (required by current receipt policy in addition to automated anchor proof)",
      );
    }
  }
  if (manualProblems.length > 0) {
    summary.manualEvidence = "HOLD";
    summary.problems.push(...manualProblems);
    return finish(2, "HOLD");
  }
  summary.manualEvidence = "PASS";

  // ── Stage 7 — receipt write + validation ──────────────────────────────
  const receiptCode = d.runStage(STAGE_SCRIPTS.receipt, childEnv);
  if (receiptCode === 1) {
    summary.receipt = "FAIL";
    summary.problems.push("receipt writer reported malformed input");
    return finish(1, "FAIL");
  }
  const validatorCode = d.runStage(STAGE_SCRIPTS.validator, childEnv);
  if (validatorCode === 1) {
    summary.receipt = "FAIL";
    summary.problems.push("receipt validation failed (stale or inconsistent receipt)");
    return finish(1, "FAIL");
  }
  summary.receipt = validatorCode === 0 ? "GO" : "HOLD";

  // ── Stage 8 — final repository safety ─────────────────────────────────
  const finalCopy = evaluateWorkingCopy({
    statusLines: d.gitStatusLines(),
    diffCheckOutput: d.gitDiffCheck(),
    trackedSecretFiles: d.gitTrackedSecretFiles(),
  });
  const credentialStillIgnored = d.gitIsIgnored(credential.resolved);
  if (!finalCopy.ok || !credentialStillIgnored) {
    summary.problems.push(
      ...finalCopy.problems,
      ...(credentialStillIgnored ? [] : ["credential file is no longer gitignored"]),
    );
    return finish(1, "FAIL");
  }

  if (validatorCode !== 0) {
    summary.problems.push("receipt validation reported HOLD: required evidence incomplete");
    return finish(2, "HOLD");
  }
  return finish(0, "GO");
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  runGate().then(
    ({ exitCode }) => process.exit(exitCode),
    (error) => {
      console.error(`FAIL: ${String(error?.message ?? error).split("\n")[0]}`);
      process.exit(1);
    },
  );
}
