#!/usr/bin/env node
// Demo-Proof local helper: extract a demo-proof-playwright-report.zip
// (or accept an already-extracted directory) into .artifacts/, then run
// verify-report and tree-report equivalents.
//
// Usage:
//   node scripts/extract-and-check-demo-proof-playwright-report.mjs [zip-or-dir]
// Default input: ./demo-proof-playwright-report.zip
import { existsSync, statSync, rmSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { extractZip, findIndexHtml, ensureDir } from "./demo-proof-artifact-utils.mjs";

const DEFAULT_INPUT = resolve("demo-proof-playwright-report.zip");
const DEST = resolve(".artifacts/demo-proof-playwright-report");

const input = resolve(process.argv[2] ?? DEFAULT_INPUT);

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

if (!existsSync(input)) {
  fail(
    [
      `Input not found: ${input}`,
      "",
      "Provide one of:",
      "  ./demo-proof-playwright-report.zip",
      "  ./.artifacts/demo-proof-playwright-report (already-extracted dir)",
      "",
      "Or download via:",
      "  bun run test:demo-proof:download-report",
    ].join("\n"),
  );
}

let reportDir;
const st = statSync(input);
if (st.isDirectory()) {
  console.log(`Source: ${input} (already-extracted directory)`);
  reportDir = input;
} else {
  console.log(`Source zip: ${input}`);
  if (existsSync(DEST)) rmSync(DEST, { recursive: true, force: true });
  ensureDir(DEST);
  const r = extractZip(input, DEST);
  if (!r.ok) {
    fail(`Extraction failed: ${r.error?.message ?? "unknown error"}`);
  }
  console.log(`Extracted ${r.entries.length} entries -> ${DEST}`);
  reportDir = DEST;
}

const indexHtml = findIndexHtml(reportDir);
console.log(`Resolved index.html: ${indexHtml ?? "(none)"}`);

// Delegate to verify-report + tree-report for consistent semantics.
const verify = spawnSync(
  "node",
  [resolve("scripts", "verify-demo-proof-playwright-report.mjs"), reportDir],
  { stdio: "inherit" },
);
if (verify.status !== 0) process.exit(verify.status ?? 1);

const tree = spawnSync(
  "node",
  [resolve("scripts", "tree-demo-proof-playwright-report.mjs"), reportDir],
  { stdio: "inherit" },
);
if (tree.status !== 0) process.exit(tree.status ?? 1);

console.log("");
console.log(`Extract+check complete: ${relative(process.cwd(), reportDir) || reportDir}`);
process.exit(0);
