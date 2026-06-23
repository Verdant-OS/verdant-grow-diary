#!/usr/bin/env node
// Demo-Proof local helper: verify an extracted Playwright report directory.
// Confirms the target exists, is a directory, contains index.html (recursively),
// and prints the resolved entry point plus suggested open commands.
//
// Usage:
//   node scripts/verify-demo-proof-playwright-report.mjs [path]
// Default path: ./.artifacts/demo-proof-playwright-report/
import { existsSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { findIndexHtml } from "./demo-proof-artifact-utils.mjs";

const DEFAULT = ".artifacts/demo-proof-playwright-report";
const target = resolve(process.argv[2] ?? DEFAULT);

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

if (!existsSync(target)) {
  fail(
    [
      `Report directory not found: ${target}`,
      "",
      "Get a report by either:",
      "  bun run test:demo-proof:download-report   # via GitHub CLI",
      "  bun run test:demo-proof:open-report ./demo-proof-playwright-report.zip",
      "",
      "Or pass an explicit path:",
      "  node scripts/verify-demo-proof-playwright-report.mjs <path>",
    ].join("\n"),
  );
}

let st;
try {
  st = statSync(target);
} catch (e) {
  fail(`Cannot stat ${target}: ${e.message}`);
}
if (!st.isDirectory()) {
  fail(`Not a directory: ${target}`);
}

console.log(`Checked directory: ${target}`);
const indexHtml = findIndexHtml(target);
if (!indexHtml) {
  fail(
    [
      `No index.html found under: ${target}`,
      "If you only have a .zip artifact, extract it first:",
      `  bun run test:demo-proof:open-report ./demo-proof-playwright-report.zip`,
      "Or use Playwright's viewer directly:",
      `  bunx playwright show-report ${target}`,
    ].join("\n"),
  );
}

const rel = relative(process.cwd(), indexHtml) || indexHtml;
console.log(`Resolved index.html: ${indexHtml}`);
console.log("");
console.log("Suggested commands:");
console.log(`  bun run test:demo-proof:open-report ${relative(process.cwd(), target) || target}`);
console.log(`  bunx playwright show-report ${relative(process.cwd(), target) || target}`);
console.log(`  open ${rel}   # macOS (xdg-open on Linux, start on Windows)`);
process.exit(0);
