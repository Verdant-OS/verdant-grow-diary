#!/usr/bin/env node
// Demo-Proof local helper: conservative cleanup of locally extracted artifacts.
//
// Default (no flags):
//   * removes .artifacts/demo-proof-playwright-report/
//
// --results:
//   * additionally removes selected demo-proof-related files under test-results/
//     (trace.zip, *.webm, *.png) and clearly demo-proof-named folders
//
// --all:
//   * removes .artifacts/demo-proof-playwright-report/
//   * removes .artifacts/demo-proof-playwright-results/ (if present)
//   * applies the --results cleanup under test-results/
//
// Safety rails:
//   * refuses /, empty path, or anything outside the repo root
//   * never removes the entire test-results/ tree
//   * prints every deleted path; exit 0 even if nothing to delete
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve, relative, join, sep } from "node:path";

const REPO_ROOT = resolve(process.cwd());
const REPORT_DIR = resolve(REPO_ROOT, ".artifacts/demo-proof-playwright-report");
const RESULTS_ARTIFACT_DIR = resolve(REPO_ROOT, ".artifacts/demo-proof-playwright-results");
const TEST_RESULTS_DIR = resolve(REPO_ROOT, "test-results");

const args = new Set(process.argv.slice(2));
const all = args.has("--all");
const cleanResults = all || args.has("--results");

const deleted = [];

function assertSafe(p) {
  if (!p || p === "/" || p === REPO_ROOT) {
    throw new Error(`Refusing to delete unsafe path: ${p}`);
  }
  if (!(p === REPO_ROOT || p.startsWith(REPO_ROOT + sep))) {
    throw new Error(`Refusing to delete path outside repo: ${p}`);
  }
}

function rmPath(p) {
  assertSafe(p);
  if (!existsSync(p)) return false;
  rmSync(p, { recursive: true, force: true });
  deleted.push(relative(REPO_ROOT, p) || p);
  return true;
}

function isDemoProofNamedDir(name) {
  const n = name.toLowerCase();
  return n.includes("demo-proof") || n.includes("demoproof") || n.includes("demo_proof");
}

function cleanResultsTree(root) {
  if (!existsSync(root)) return;
  assertSafe(root);
  let st;
  try {
    st = statSync(root);
  } catch {
    return;
  }
  if (!st.isDirectory()) return;

  // 1. Remove any top-level demo-proof-named folders outright.
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.isDirectory() && isDemoProofNamedDir(e.name)) {
      rmPath(join(root, e.name));
    }
  }

  // 2. Recursively delete trace.zip / *.webm / *.png files only.
  const stack = [root];
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
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        const lower = e.name.toLowerCase();
        if (lower === "trace.zip" || lower.endsWith(".webm") || lower.endsWith(".png")) {
          rmPath(full);
        }
      }
    }
  }
}

try {
  rmPath(REPORT_DIR);
  if (all) {
    rmPath(RESULTS_ARTIFACT_DIR);
  }
  if (cleanResults) {
    cleanResultsTree(TEST_RESULTS_DIR);
  }
} catch (err) {
  console.error(`Cleanup aborted: ${err.message}`);
  process.exit(1);
}

if (deleted.length === 0) {
  console.log("Nothing to delete.");
} else {
  console.log(`Deleted ${deleted.length} path(s):`);
  for (const d of deleted) console.log(`  - ${d}`);
}
process.exit(0);
