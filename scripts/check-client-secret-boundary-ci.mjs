#!/usr/bin/env node
/**
 * Remote CI verifier for the Client Secret Boundary guard.
 *
 * Uses the `gh` CLI to fetch the most recent runs of `ci.yml` and
 * `docs-safety.yml` on a given branch and confirms that:
 *   - the run completed,
 *   - conclusion is success,
 *   - the guard step ran (`Client secret boundary guard`),
 *   - the guard printed its success marker (`Client secret boundary OK.`).
 *
 * Hard rules:
 *   - Never print full logs, env, tokens, or raw payloads.
 *   - Only print short sanitized summary lines.
 *   - Network calls go exclusively through `gh`.
 *
 * Usage:
 *   node scripts/check-client-secret-boundary-ci.mjs \
 *     [--repo=Verdant-OS/verdant-grow-diary] \
 *     [--branch=verdant-grow-diary] \
 *     [--limit=1]
 */
import { spawnSync } from "node:child_process";

export const DEFAULT_REPO = "Verdant-OS/verdant-grow-diary";
export const DEFAULT_BRANCH = "verdant-grow-diary";
export const DEFAULT_LIMIT = 1;
export const WORKFLOWS = ["ci.yml", "docs-safety.yml"];

export const GUARD_STEP_MARKER = "Client secret boundary guard";
export const GUARD_OK_MARKER = "Client secret boundary OK.";

export function parseArgs(argv) {
  const out = { repo: DEFAULT_REPO, branch: DEFAULT_BRANCH, limit: DEFAULT_LIMIT };
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "repo") out.repo = v;
    else if (k === "branch") out.branch = v;
    else if (k === "limit") out.limit = Number.parseInt(v, 10) || DEFAULT_LIMIT;
  }
  return out;
}

/** Strict, narrow sanitizer for any line we might print. */
export function sanitizeLine(line) {
  if (typeof line !== "string") return "";
  // Strip anything that looks like a JWT or bearer secret.
  let s = line.replace(/eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, "[redacted-jwt]");
  s = s.replace(/(SUPABASE_SERVICE_ROLE_KEY|service_role)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  s = s.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  s = s.replace(/(token|secret|key|password)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}

/** Build the summary record for a single workflow result. */
export function summarizeRun({ workflow, run, hasGuardStep, hasGuardOk }) {
  const ok =
    !!run &&
    run.status === "completed" &&
    run.conclusion === "success" &&
    hasGuardStep &&
    hasGuardOk;
  return {
    workflow,
    url: run?.url ?? "(no run found)",
    headSha: run?.headSha ? String(run.headSha).slice(0, 12) : "(unknown)",
    status: run?.status ?? "missing",
    conclusion: run?.conclusion ?? "missing",
    guardStepPresent: hasGuardStep,
    guardOkLogged: hasGuardOk,
    pass: ok,
  };
}

function runGh(args) {
  const res = spawnSync("gh", args, { encoding: "utf8" });
  if (res.error) {
    throw new Error(`gh CLI not available: ${res.error.message}`);
  }
  if (res.status !== 0) {
    throw new Error(
      `gh ${args[0]} exited ${res.status}: ${sanitizeLine(res.stderr || "")}`,
    );
  }
  return res.stdout ?? "";
}

export function fetchLatestRun({ repo, branch, workflow, limit }) {
  const out = runGh([
    "run",
    "list",
    "--repo",
    repo,
    "--workflow",
    workflow,
    "--branch",
    branch,
    "--limit",
    String(limit),
    "--json",
    "databaseId,status,conclusion,headSha,url,displayTitle",
  ]);
  const arr = JSON.parse(out);
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0];
}

/**
 * Inspect a run's logs for the guard markers WITHOUT echoing logs.
 * Uses `gh run view --log` and only scans for marker presence.
 */
export function inspectGuardLogs({ repo, runId }) {
  let logs = "";
  try {
    logs = runGh(["run", "view", String(runId), "--repo", repo, "--log"]);
  } catch {
    return { hasGuardStep: false, hasGuardOk: false };
  }
  return {
    hasGuardStep: logs.includes(GUARD_STEP_MARKER),
    hasGuardOk: logs.includes(GUARD_OK_MARKER),
  };
}

export function formatSummaryLines(summary) {
  return [
    `workflow:            ${summary.workflow}`,
    `latest run:          ${summary.url}`,
    `head sha:            ${summary.headSha}`,
    `status:              ${summary.status}`,
    `conclusion:          ${summary.conclusion}`,
    `guard step present:  ${summary.guardStepPresent ? "yes" : "no"}`,
    `guard ok logged:     ${summary.guardOkLogged ? "yes" : "no"}`,
    `result:              ${summary.pass ? "PASS" : "FAIL"}`,
  ].map(sanitizeLine);
}

export async function main(argv = process.argv.slice(2)) {
  const { repo, branch, limit } = parseArgs(argv);
  console.log(`# Client Secret Boundary — Remote CI verifier`);
  console.log(`repo:   ${sanitizeLine(repo)}`);
  console.log(`branch: ${sanitizeLine(branch)}`);
  console.log("");

  const summaries = [];
  for (const workflow of WORKFLOWS) {
    let run = null;
    let guard = { hasGuardStep: false, hasGuardOk: false };
    try {
      run = fetchLatestRun({ repo, branch, workflow, limit });
      if (run) guard = inspectGuardLogs({ repo, runId: run.databaseId });
    } catch (err) {
      console.error(sanitizeLine(`error: ${err.message}`));
    }
    const summary = summarizeRun({
      workflow,
      run,
      hasGuardStep: guard.hasGuardStep,
      hasGuardOk: guard.hasGuardOk,
    });
    summaries.push(summary);
    for (const line of formatSummaryLines(summary)) console.log(line);
    console.log("");
  }

  const allPass = summaries.length === WORKFLOWS.length && summaries.every((s) => s.pass);
  console.log(`overall: ${allPass ? "PASS" : "FAIL"}`);
  return allPass ? 0 : 1;
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  main().then((code) => process.exit(code));
}
