#!/usr/bin/env node
// Demo-Proof local helper: open the most relevant Playwright artifacts found
// under a results directory (default ./test-results/).
//
// Selects: first trace.zip, first *.webm, first *.png (deterministic sort).
// - Trace: prints `bunx playwright show-trace <path>` and attempts to spawn it.
// - Video / screenshot: opens with the OS opener.
//
// Usage:
//   node scripts/open-demo-proof-playwright-artifacts.mjs [path]
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { spawn } from "node:child_process";
import { openPath } from "./demo-proof-artifact-utils.mjs";

const root = resolve(process.argv[2] ?? "test-results");

if (!existsSync(root)) {
  console.error(`Input path not found: ${root}`);
  console.error("Pass a path explicitly, e.g.:");
  console.error("  node scripts/open-demo-proof-playwright-artifacts.mjs .artifacts/demo-proof-playwright-results");
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
  entries.sort((a, b) => a.name.localeCompare(b.name));
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

console.log(`Demo-Proof Playwright artifact inspection`);
console.log(`  Root searched: ${rel(root)}`);
console.log(`  Traces: ${traces.length} | Videos: ${videos.length} | Screenshots: ${screenshots.length}`);

if (traces.length + videos.length + screenshots.length === 0) {
  console.log("");
  console.log("No trace/video/screenshot artifacts found. This is expected on passing");
  console.log("runs when Playwright retains artifacts only on failure.");
  process.exit(0);
}

const pickedTrace = traces[0];
const pickedVideo = videos[0];
const pickedShot = screenshots[0];

if (pickedTrace) {
  console.log("");
  console.log(`Trace: ${rel(pickedTrace)}`);
  console.log(`  Inspect: bunx playwright show-trace ${rel(pickedTrace)}`);
  // Best-effort spawn; do not block.
  try {
    const child = spawn("bunx", ["playwright", "show-trace", pickedTrace], {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", () => {
      /* trace viewer unavailable; user can run the printed command */
    });
    child.unref();
  } catch {
    /* ignore */
  }
}

if (pickedVideo) {
  console.log("");
  console.log(`Video: ${rel(pickedVideo)}`);
  const r = openPath(pickedVideo);
  if (!r.ok) {
    console.log(`  Could not auto-open. Open manually: ${pickedVideo}`);
  }
}

if (pickedShot) {
  console.log("");
  console.log(`Screenshot: ${rel(pickedShot)}`);
  const r = openPath(pickedShot);
  if (!r.ok) {
    console.log(`  Could not auto-open. Open manually: ${pickedShot}`);
  }
}

console.log("");
console.log(`Tip: list all artifacts with`);
console.log(`  bun run test:demo-proof:summarize-results ${rel(root)}`);
process.exit(0);
