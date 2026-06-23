#!/usr/bin/env node
// Demo-Proof local helper: open a downloaded Playwright HTML report artifact.
// Accepts a .zip or a directory. Defaults to ./demo-proof-playwright-report.zip.
// Unzips into .artifacts/demo-proof-playwright-report/ and opens index.html.
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";

const input = resolve(process.argv[2] ?? "demo-proof-playwright-report.zip");
const OUT_DIR = resolve(".artifacts/demo-proof-playwright-report");

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

if (!existsSync(input)) {
  fail(
    [
      `Input not found: ${input}`,
      "",
      "Usage:",
      "  node scripts/open-demo-proof-playwright-report.mjs [path-to-zip-or-dir]",
      "",
      "Default input: ./demo-proof-playwright-report.zip",
      "Download the artifact from the GitHub Actions workflow run page",
      "(artifact name: demo-proof-playwright-report) and place it in the repo root,",
      "or pass an explicit path.",
    ].join("\n"),
  );
}

let reportDir;
const stat = statSync(input);
if (stat.isDirectory()) {
  reportDir = input;
} else if (input.toLowerCase().endsWith(".zip")) {
  mkdirSync(OUT_DIR, { recursive: true });
  const unzip = spawnSync("unzip", ["-o", "-q", input, "-d", OUT_DIR], { stdio: "inherit" });
  if (unzip.error || unzip.status !== 0) {
    fail(
      [
        `Failed to unzip: ${input}`,
        "Manual fallback:",
        `  mkdir -p ${OUT_DIR}`,
        `  unzip -o "${input}" -d ${OUT_DIR}`,
        "Then re-run this script pointing at the extracted directory:",
        `  node scripts/open-demo-proof-playwright-report.mjs ${OUT_DIR}`,
      ].join("\n"),
    );
  }
  reportDir = OUT_DIR;
} else {
  fail(`Unsupported input (expected .zip or directory): ${input}`);
}

function findIndexHtml(dir) {
  const direct = join(dir, "index.html");
  if (existsSync(direct)) return direct;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name === "index.html") return full;
    }
  }
  return null;
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

const opener =
  process.platform === "darwin"
    ? ["open", [indexHtml]]
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", indexHtml]]
      : ["xdg-open", [indexHtml]];

const r = spawnSync(opener[0], opener[1], { stdio: "ignore" });
if (r.error || (typeof r.status === "number" && r.status !== 0)) {
  console.log(
    [
      "Could not auto-open the report. Open this path manually:",
      `  ${indexHtml}`,
      "Or use Playwright's viewer:",
      `  bunx playwright show-report ${reportDir}`,
    ].join("\n"),
  );
}
