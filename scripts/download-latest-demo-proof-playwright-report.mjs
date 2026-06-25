#!/usr/bin/env node
// Demo-Proof local helper: download the latest `demo-proof-playwright-report`
// artifact from the most recent run of the Demo-Proof Walkthrough read-only
// workflow via the GitHub CLI (`gh`), extract it, and open the report.
//
// Requirements:
//   * GitHub CLI installed (`gh`)
//   * Authenticated (`gh auth status`)
//   * Run from inside the repo checkout
//
// Output:
//   .artifacts/demo-proof-playwright-report/
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { ensureDir, extractZip, findIndexHtml, openPath } from "./demo-proof-artifact-utils.mjs";

const WORKFLOW_FILE = ".github/workflows/demo-proof-walkthrough-readonly.yml";
const ARTIFACT_NAME = "demo-proof-playwright-report";
const DEST = resolve(".artifacts/demo-proof-playwright-report");

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

// 1. gh present?
const ghCheck = sh("gh", ["--version"]);
if (ghCheck.error || ghCheck.status !== 0) {
  fail(
    [
      "GitHub CLI (`gh`) is not installed or not on PATH.",
      "Install: https://cli.github.com/  (e.g. `brew install gh`)",
    ].join("\n"),
  );
}

// 2. gh authenticated?
const ghAuth = sh("gh", ["auth", "status"]);
if (ghAuth.status !== 0) {
  fail(
    [
      "GitHub CLI is not authenticated.",
      "Run: gh auth login",
      ghAuth.stderr?.trim() ?? "",
    ].join("\n"),
  );
}

// 3. Find most recent run for the workflow.
console.log(`Looking up most recent run for: ${WORKFLOW_FILE}`);
const runList = sh("gh", [
  "run",
  "list",
  "--workflow",
  WORKFLOW_FILE,
  "--limit",
  "10",
  "--json",
  "databaseId,status,conclusion,headBranch,createdAt,displayTitle",
]);
if (runList.status !== 0) {
  fail(
    [
      "Failed to list workflow runs.",
      runList.stderr?.trim() ?? "",
      "If this is a fresh clone, ensure the repo has the workflow file and that you have access.",
    ].join("\n"),
  );
}

let runs;
try {
  runs = JSON.parse(runList.stdout || "[]");
} catch (e) {
  fail(`Could not parse gh run list output: ${e.message}`);
}
if (!Array.isArray(runs) || runs.length === 0) {
  fail(`No runs found for workflow ${WORKFLOW_FILE}.`);
}

const completed = runs.find((r) => r.status === "completed");
const chosen = completed ?? runs[0];
console.log(
  `Selected run #${chosen.databaseId} (${chosen.status}/${chosen.conclusion ?? "—"}) ` +
    `branch=${chosen.headBranch} title="${chosen.displayTitle}"`,
);
if (!completed) {
  console.log("Note: no completed run found; using most recent run regardless of status.");
}

// 4. Download artifact.
if (existsSync(DEST)) {
  rmSync(DEST, { recursive: true, force: true });
}
ensureDir(DEST);

console.log(`Downloading artifact "${ARTIFACT_NAME}" -> ${DEST}`);
const dl = sh(
  "gh",
  ["run", "download", String(chosen.databaseId), "--name", ARTIFACT_NAME, "--dir", DEST],
  { stdio: "inherit" },
);
if (dl.status !== 0) {
  fail(
    [
      `Failed to download artifact "${ARTIFACT_NAME}" from run #${chosen.databaseId}.`,
      "Possible reasons: artifact expired, not produced, or different name.",
      "List artifacts with:",
      `  gh run view ${chosen.databaseId} --log` ,
    ].join("\n"),
  );
}

// 5. If a zip landed inside DEST (some gh versions), extract it in place.
//    `gh run download --name <n>` typically extracts already, but be defensive.
const candidateZip = resolve(DEST, `${ARTIFACT_NAME}.zip`);
if (existsSync(candidateZip)) {
  const r = extractZip(candidateZip, DEST);
  if (!r.ok) {
    fail(`Downloaded a zip but could not extract it: ${r.error?.message ?? "unknown error"}`);
  }
}

// 6. Find + open index.html.
const indexHtml = findIndexHtml(DEST);
if (!indexHtml) {
  fail(
    [
      `Download succeeded but no index.html found under ${DEST}.`,
      "Try Playwright's viewer:",
      `  bunx playwright show-report ${DEST}`,
    ].join("\n"),
  );
}
console.log(`Report entry point: ${indexHtml}`);
const opened = openPath(indexHtml);
if (!opened.ok) {
  console.log(
    [
      "Could not auto-open the report. Open this path manually:",
      `  ${indexHtml}`,
      "Or use Playwright's viewer:",
      `  bunx playwright show-report ${DEST}`,
    ].join("\n"),
  );
}
