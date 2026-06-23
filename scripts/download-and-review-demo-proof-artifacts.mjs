#!/usr/bin/env node
// Demo-Proof local helper: download BOTH demo-proof-playwright-report and
// demo-proof-playwright-results from a workflow run (latest or --run-id <id>)
// via the GitHub CLI, extract zips if present, then run the review flow:
//   verify-report -> tree-report -> summarize-results -> open-artifacts
//
// Flags:
//   --run-id <id>   explicit workflow run id
//   --cleanup       run normal cleanup after review
//   --cleanup-all   run cleanup --all after review
import { existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { extractZip, ensureDir } from "./demo-proof-artifact-utils.mjs";

const WORKFLOW = ".github/workflows/demo-proof-walkthrough-readonly.yml";
const REPORT_NAME = "demo-proof-playwright-report";
const RESULTS_NAME = "demo-proof-playwright-results";
const REPORT_DEST = resolve(".artifacts", REPORT_NAME);
const RESULTS_DEST = resolve(".artifacts", RESULTS_NAME);

let runId = null;
let cleanup = false;
let cleanupAll = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--run-id") runId = args[++i];
  else if (a === "--cleanup") cleanup = true;
  else if (a === "--cleanup-all") cleanupAll = true;
  else {
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }
}

function sh(cmd, argv, opts = {}) {
  return spawnSync(cmd, argv, { encoding: "utf8", ...opts });
}
function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

if (sh("gh", ["--version"]).status !== 0) {
  fail("GitHub CLI (`gh`) is not installed or not on PATH. Install: https://cli.github.com/");
}
if (sh("gh", ["auth", "status"]).status !== 0) {
  fail("GitHub CLI is not authenticated. Run: gh auth login");
}

if (!runId) {
  console.log(`Looking up most recent run for: ${WORKFLOW}`);
  const list = sh("gh", [
    "run", "list", "--workflow", WORKFLOW, "--limit", "10",
    "--json", "databaseId,status,conclusion,headBranch,displayTitle",
  ]);
  if (list.status !== 0) {
    fail([
      "Failed to list workflow runs.",
      list.stderr?.trim() ?? "",
      "Ensure repo + workflow exist and you have access.",
    ].join("\n"));
  }
  let runs;
  try { runs = JSON.parse(list.stdout || "[]"); } catch (e) { fail(`Parse error: ${e.message}`); }
  if (!Array.isArray(runs) || runs.length === 0) fail(`No runs found for ${WORKFLOW}.`);
  const completed = runs.find((r) => r.status === "completed");
  const chosen = completed ?? runs[0];
  runId = String(chosen.databaseId);
  console.log(`Selected run #${runId} (${chosen.status}/${chosen.conclusion ?? "—"})`);
}

function downloadAndMaybeExtract(name, dest) {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  ensureDir(dest);
  console.log(`Downloading "${name}" -> ${dest}`);
  const dl = sh("gh", ["run", "download", runId, "--name", name, "--dir", dest], { stdio: "inherit" });
  if (dl.status !== 0) {
    fail(`Failed to download artifact "${name}" from run #${runId}. May be expired/missing.`);
  }
  // Defensive: extract any top-level .zip inside dest (some gh versions).
  for (const entry of readdirSync(dest)) {
    const full = join(dest, entry);
    if (entry.endsWith(".zip") && statSync(full).isFile()) {
      const r = extractZip(full, dest);
      if (!r.ok) fail(`Could not extract ${full}: ${r.error?.message ?? "unknown"}`);
    }
  }
}

downloadAndMaybeExtract(REPORT_NAME, REPORT_DEST);
downloadAndMaybeExtract(RESULTS_NAME, RESULTS_DEST);

function runStep(name, scriptArgs) {
  console.log("");
  console.log(`=== ${name} ===`);
  const r = spawnSync("node", scriptArgs, { stdio: "inherit" });
  return r.status ?? 1;
}

const verifyExit = runStep("verify-report", [
  resolve("scripts/verify-demo-proof-playwright-report.mjs"), REPORT_DEST,
]);
if (verifyExit !== 0) process.exit(verifyExit);

const treeExit = runStep("tree-report", [
  resolve("scripts/tree-demo-proof-playwright-report.mjs"), REPORT_DEST,
]);
if (treeExit !== 0) process.exit(treeExit);

runStep("summarize-results", [
  resolve("scripts/summarize-demo-proof-playwright-results.mjs"), RESULTS_DEST,
]);
runStep("open-artifacts", [
  resolve("scripts/open-demo-proof-playwright-artifacts.mjs"), RESULTS_DEST,
]);

if (cleanup || cleanupAll) {
  const cleanArgs = [resolve("scripts/cleanup-demo-proof-artifacts.mjs")];
  if (cleanupAll) cleanArgs.push("--all");
  const c = runStep("cleanup", cleanArgs);
  if (c !== 0) process.exit(c);
}

console.log("");
console.log(`Download + review complete (run #${runId}).`);
process.exit(0);
