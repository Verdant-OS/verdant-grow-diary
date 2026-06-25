#!/usr/bin/env node
// Demo-Proof local helper: open a downloaded Playwright HTML report artifact.
//
// Accepts:
//   - ./demo-proof-playwright-report.zip                 (default)
//   - ./demo-proof-playwright-report/                    (extracted)
//   - ./.artifacts/demo-proof-playwright-report/         (extracted)
//   - explicit path argument (.zip or directory)
//
// Zip extraction uses a Node-built-in extractor (no system `unzip`, no deps).
// Output dir for .zip input: .artifacts/demo-proof-playwright-report/
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { extractZip, findIndexHtml, openPath } from "./demo-proof-artifact-utils.mjs";

const CANDIDATES = [
  "demo-proof-playwright-report.zip",
  "demo-proof-playwright-report",
  ".artifacts/demo-proof-playwright-report",
];
const OUT_DIR = resolve(".artifacts/demo-proof-playwright-report");

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function resolveInput() {
  const arg = process.argv[2];
  if (arg) return resolve(arg);
  for (const c of CANDIDATES) {
    const p = resolve(c);
    if (existsSync(p)) return p;
  }
  return resolve(CANDIDATES[0]);
}

const input = resolveInput();

if (!existsSync(input)) {
  fail(
    [
      `Input not found: ${input}`,
      "",
      "Usage:",
      "  node scripts/open-demo-proof-playwright-report.mjs [path-to-zip-or-dir]",
      "",
      "Searched defaults (in order):",
      ...CANDIDATES.map((c) => `  - ${c}`),
      "",
      "Download the artifact from the GitHub Actions workflow run page",
      "(artifact name: demo-proof-playwright-report) and place it in the repo root,",
      "or pass an explicit path. You can also run:",
      "  bun run test:demo-proof:download-report",
    ].join("\n"),
  );
}

let reportDir;
const stat = statSync(input);
if (stat.isDirectory()) {
  reportDir = input;
} else if (input.toLowerCase().endsWith(".zip")) {
  const r = extractZip(input, OUT_DIR);
  if (!r.ok) {
    // Best-effort fallback to system unzip if the built-in extractor failed.
    const unzip = spawnSync("unzip", ["-o", "-q", input, "-d", OUT_DIR], { stdio: "inherit" });
    if (unzip.error || unzip.status !== 0) {
      fail(
        [
          `Failed to extract: ${input}`,
          `  built-in extractor: ${r.error?.message ?? "unknown error"}`,
          `  system unzip fallback: ${unzip.error?.message ?? `exit ${unzip.status}`}`,
          "",
          "Manual fallback:",
          `  mkdir -p ${OUT_DIR}`,
          `  unzip -o "${input}" -d ${OUT_DIR}`,
          "Then re-run pointing at the extracted directory:",
          `  node scripts/open-demo-proof-playwright-report.mjs ${OUT_DIR}`,
        ].join("\n"),
      );
    }
  }
  reportDir = OUT_DIR;
} else {
  fail(`Unsupported input (expected .zip or directory): ${input}`);
}

const indexHtml = findIndexHtml(reportDir);
if (!indexHtml) {
  fail(
    [
      `Could not find index.html under: ${reportDir}`,
      "If the artifact requires Playwright's viewer, try:",
      `  bunx playwright show-report ${reportDir}`,
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
      `  bunx playwright show-report ${reportDir}`,
    ].join("\n"),
  );
}
