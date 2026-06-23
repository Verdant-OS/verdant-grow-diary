#!/usr/bin/env node
// Demo-Proof local helper: one-command artifact review.
//
// Runs (in order):
//   1. verify report      (fails fast if missing)
//   2. summarize results  (non-fatal if results dir missing)
//   3. open artifacts     (non-fatal if no trace/video/screenshot)
//   4. cleanup            (only when --cleanup / --cleanup-all)
//
// Flags:
//   --cleanup            run normal cleanup after review
//   --cleanup-all        run cleanup --all after review
//   --report <path>      custom report path (default .artifacts/demo-proof-playwright-report)
//   --results <path>     custom results path (default test-results)
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
let reportPath = ".artifacts/demo-proof-playwright-report";
let resultsPath = "test-results";
let cleanup = false;
let cleanupAll = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--cleanup") cleanup = true;
  else if (a === "--cleanup-all") cleanupAll = true;
  else if (a === "--report") reportPath = args[++i];
  else if (a === "--results") resultsPath = args[++i];
  else {
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }
}

function phase(title) {
  console.log("");
  console.log(`=== ${title} ===`);
}

function run(script, extraArgs = []) {
  const r = spawnSync("node", [resolve("scripts", script), ...extraArgs], { stdio: "inherit" });
  return r.status ?? 1;
}

phase("1/4 verify report");
const verifyExit = run("verify-demo-proof-playwright-report.mjs", [reportPath]);
if (verifyExit !== 0) {
  console.error("");
  console.error("verify-report failed — report missing or unusable. Aborting review.");
  process.exit(verifyExit);
}

phase("2/4 summarize results");
run("summarize-demo-proof-playwright-results.mjs", [resultsPath]);

phase("3/4 open artifacts");
run("open-demo-proof-playwright-artifacts.mjs", [resultsPath]);

if (cleanup || cleanupAll) {
  phase("4/4 cleanup");
  const cleanupArgs = cleanupAll ? ["--all"] : [];
  const cleanExit = run("cleanup-demo-proof-artifacts.mjs", cleanupArgs);
  if (cleanExit !== 0) process.exit(cleanExit);
} else {
  phase("4/4 cleanup (skipped — pass --cleanup or --cleanup-all)");
}

console.log("");
console.log("Review complete.");
process.exit(0);
