#!/usr/bin/env node
/**
 * verify-release-workbooks
 * ------------------------
 * Local aggregator for the full release-workbook verification flow.
 *
 * Runs each step in order, captures exit code + duration + stderr/stdout,
 * prints a compact PASS/FAIL summary table, and exits non-zero on the
 * first failure (after streaming the full child output so the failure
 * is debuggable in place).
 *
 * Pure read-only over the repo aside from the generator step, which only
 * writes deterministic artifacts under docs/artifacts/. No network.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const STEPS = [
  {
    label: "Generate workbook templates",
    cmd: "bun",
    args: ["run", "docs:generate-release-workbook-templates"],
  },
  {
    label: "Premium workbook access docs",
    cmd: "bun",
    args: ["run", "docs:assert-premium-workbook-access"],
  },
  {
    label: "Release traceability mapping",
    cmd: "bun",
    args: ["run", "docs:assert-release-traceability"],
  },
  {
    label: "Release docs safety",
    cmd: "node",
    args: ["scripts/assert-release-docs-safety.mjs"],
  },
  {
    label: "Sensor safety",
    cmd: "node",
    args: ["scripts/sensor-safety-check.mjs"],
  },
  {
    label: "Workbook tests",
    cmd: "bunx",
    args: [
      "vitest", "run",
      "src/test/assert-premium-workbook-access-docs.test.ts",
      "src/test/assert-release-traceability-mapping.test.ts",
      "src/test/generate-release-workbook-templates.test.ts",
      "src/test/release-workbook-formula-snapshots.test.ts",
      "src/test/release-workbook-manifest.test.ts",
      "--reporter=dot",
    ],
  },
];

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function fmtSeconds(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

const results = [];
let firstFailure = null;

for (const step of STEPS) {
  if (firstFailure) {
    results.push({ ...step, status: "SKIP", ms: 0 });
    continue;
  }
  const t0 = Date.now();
  const r = spawnSync(step.cmd, step.args, {
    stdio: "inherit",
    env: process.env,
  });
  const ms = Date.now() - t0;
  const ok = r.status === 0 && !r.error;
  results.push({ ...step, status: ok ? "PASS" : "FAIL", ms, exit: r.status, err: r.error?.message });
  if (!ok) firstFailure = { ...step, ms, exit: r.status, err: r.error?.message };
}

const ok = !firstFailure;
console.log("");
console.log(`Release Workbook Verification: ${ok ? "PASS" : "FAIL"}`);
console.log("");
console.log(`${pad("Step", 42)}${pad("Result", 9)}Duration`);
for (const r of results) {
  console.log(`${pad(r.label, 42)}${pad(r.status, 9)}${fmtSeconds(r.ms)}`);
}
console.log("");

if (!ok) {
  const failedCmd = `${firstFailure.cmd} ${firstFailure.args.join(" ")}`;
  console.log("Failed command:");
  console.log(`  ${failedCmd}`);
  console.log("");
  console.log("Failure details:");
  console.log(
    `  exit=${firstFailure.exit ?? "n/a"}${firstFailure.err ? ` error=${firstFailure.err}` : ""}`,
  );
  console.log("  (full child output streamed above)");
  console.log("");
  console.log("Fix the mismatch above and rerun:");
  console.log("  bun run docs:verify-release-workbooks");
  process.exit(1);
}

console.log("All release workbook checks passed.");
