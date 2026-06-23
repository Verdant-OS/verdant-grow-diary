#!/usr/bin/env node
// Demo-Proof local helper: print a bounded file tree of an extracted Playwright
// HTML report and highlight the resolved index.html.
//
// Usage:
//   node scripts/tree-demo-proof-playwright-report.mjs [path]
// Default path: .artifacts/demo-proof-playwright-report/
//
// Exit 0 if index.html is found, non-zero otherwise.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { findIndexHtml } from "./demo-proof-artifact-utils.mjs";

const DEFAULT = ".artifacts/demo-proof-playwright-report";
const MAX_DEPTH = 3;
const MAX_ENTRIES = 80;

const target = resolve(process.argv[2] ?? DEFAULT);

if (!existsSync(target)) {
  console.error(`Report directory not found: ${target}`);
  console.error("Get a report by either:");
  console.error("  bun run test:demo-proof:download-report");
  console.error("  bun run test:demo-proof:open-report ./demo-proof-playwright-report.zip");
  process.exit(2);
}
let st;
try {
  st = statSync(target);
} catch (e) {
  console.error(`Cannot stat ${target}: ${e.message}`);
  process.exit(2);
}
if (!st.isDirectory()) {
  console.error(`Not a directory: ${target}`);
  process.exit(2);
}

const indexHtml = findIndexHtml(target);

console.log(`Checked root: ${target}`);
console.log(`Resolved index.html: ${indexHtml ?? "(none found)"}`);
console.log("");
console.log("Tree (depth<=" + MAX_DEPTH + ", max " + MAX_ENTRIES + " entries):");

let printed = 0;
let truncated = false;

function printTree(dir, depth, prefix) {
  if (depth > MAX_DEPTH) return;
  if (printed >= MAX_ENTRIES) {
    truncated = true;
    return;
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (let i = 0; i < entries.length; i++) {
    if (printed >= MAX_ENTRIES) {
      truncated = true;
      return;
    }
    const e = entries[i];
    const isLast = i === entries.length - 1;
    const branch = isLast ? "└─ " : "├─ ";
    const full = join(dir, e.name);
    const isIndex = e.isFile() && e.name === "index.html" && indexHtml && resolve(full) === resolve(indexHtml);
    const marker = isIndex ? "   ← index.html" : "";
    const suffix = e.isDirectory() ? "/" : "";
    console.log(`${prefix}${branch}${e.name}${suffix}${marker}`);
    printed++;
    if (e.isDirectory()) {
      const nextPrefix = prefix + (isLast ? "   " : "│  ");
      printTree(full, depth + 1, nextPrefix);
    }
  }
}

printTree(target, 1, "");

if (truncated) {
  console.log("");
  console.log("(tree truncated — increase limits in the script if you need more)");
}

if (!indexHtml) {
  console.error("");
  console.error("No index.html found. Extract the report first:");
  console.error("  bun run test:demo-proof:open-report ./demo-proof-playwright-report.zip");
  process.exit(1);
}

console.log("");
console.log(`Open with: bun run test:demo-proof:open-report ${relative(process.cwd(), target) || target}`);
process.exit(0);
