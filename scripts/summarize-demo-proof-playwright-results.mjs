#!/usr/bin/env node
// Demo-Proof local helper: summarize Playwright result artifacts found under
// a directory (default: ./test-results). Looks for trace.zip, *.webm, *.png.
//
// Usage:
//   node scripts/summarize-demo-proof-playwright-results.mjs [path]
//
// Exit codes:
//   0  -> summarized (even if nothing was found)
//   2  -> input path missing or unreadable
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const root = resolve(process.argv[2] ?? "test-results");

if (!existsSync(root)) {
  console.error(`Input path not found: ${root}`);
  console.error("Pass a path explicitly, e.g.:");
  console.error("  node scripts/summarize-demo-proof-playwright-results.mjs .artifacts/demo-proof-playwright-results");
  process.exit(2);
}

let st;
try {
  st = statSync(root);
} catch (e) {
  console.error(`Cannot stat ${root}: ${e.message}`);
  process.exit(2);
}
if (!st.isDirectory()) {
  console.error(`Not a directory: ${root}`);
  process.exit(2);
}

const traces = [];
const videos = [];
const screenshots = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full);
    } else if (e.isFile()) {
      const lower = e.name.toLowerCase();
      if (lower === "trace.zip") traces.push(full);
      else if (lower.endsWith(".webm")) videos.push(full);
      else if (lower.endsWith(".png")) screenshots.push(full);
    }
  }
}

walk(root);

const rel = (p) => relative(process.cwd(), p) || p;

console.log(`Demo-Proof Playwright results summary`);
console.log(`  Root searched: ${rel(root)}`);
console.log(`  Traces (trace.zip):   ${traces.length}`);
traces.forEach((p) => console.log(`    - ${rel(p)}`));
console.log(`  Videos (*.webm):      ${videos.length}`);
videos.forEach((p) => console.log(`    - ${rel(p)}`));
console.log(`  Screenshots (*.png):  ${screenshots.length}`);
screenshots.forEach((p) => console.log(`    - ${rel(p)}`));

if (traces.length === 0 && videos.length === 0 && screenshots.length === 0) {
  console.log("");
  console.log("No trace/video/screenshot artifacts found.");
  console.log("This is expected on passing runs: Playwright is configured to retain");
  console.log("traces and videos only on failure (see playwright.config.ts).");
}

process.exit(0);
