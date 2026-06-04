#!/usr/bin/env node
/**
 * One-Tent Loop smoke test audit.
 *
 * Runs the targeted Vitest suites that protect Verdant's core operating
 * loop (Grow → Tent → Plant → Manual Reading → Snapshot → Alert →
 * Action Queue → Completion → Follow-up Diary → Timeline) and prints a
 * pass/fail table to CI logs.
 *
 * - Fails nonzero if any required suite file is missing.
 * - Fails nonzero if any targeted suite fails.
 * - Does not duplicate business logic. Does not seed any data.
 *
 * Usage:
 *   node scripts/run-one-tent-loop-smoke-test-audit.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

/** Real, on-disk targeted suites for the One-Tent Loop smoke audit. */
const SUITES = [
  "src/test/manual-sensor-reading-entry.test.ts",
  "src/test/manual-sensor-source-label.test.ts",
  "src/test/manual-sensor-display-labels.test.ts",
  "src/test/manual-sensor-snapshot-rules.test.ts",
  "src/test/manual-sensor-snapshot-view-model.test.ts",
  "src/test/environment-alerts-persistence.test.ts",
  "src/test/environment-alerts-v1.test.ts",
  "src/test/alert-why-context.test.tsx",
  "src/test/alert-to-action-queue.test.ts",
  "src/test/action-queue-safety.test.ts",
  "src/test/alert-detail-add-to-action-queue.test.tsx",
  "src/lib/alertActionQueueHandoffRules.test.ts",
  "src/test/action-queue-row-linked-alert.test.tsx",
  "src/test/alert-detail-linked-action-count.test.tsx",
  "src/test/action-completion-followup.test.ts",
  "src/test/action-followup-visibility-ui.test.ts",
  "src/test/action-followup-timeline-visibility.test.ts",
  "src/test/action-queue-lifecycle-constraints.test.ts",
  "src/test/action-queue-transitions.test.ts",
  "src/test/grow-targets-editor.test.ts",
  "src/test/environment-stage-target-rules.test.ts",
];

const missing = SUITES.filter((p) => !existsSync(resolve(ROOT, p)));
if (missing.length > 0) {
  console.error("✗ One-Tent Loop smoke audit: missing required suite files:");
  for (const m of missing) console.error("  - " + m);
  process.exit(2);
}

console.log("▶ One-Tent Loop smoke test audit");
console.log("  Running " + SUITES.length + " targeted Vitest suites...\n");

const runner = existsSync(resolve(ROOT, "node_modules/.bin/vitest"))
  ? ["node_modules/.bin/vitest", ["run", "--reporter=json", "--reporter=default", ...SUITES]]
  : ["bunx", ["vitest", "run", "--reporter=json", "--reporter=default", ...SUITES]];

// Use JSON reporter to stdout via a temp file for parsing.
const jsonPath = resolve(ROOT, ".one-tent-loop-smoke-report.json");
const args = ["run", "--reporter=default", "--reporter=json", "--outputFile.json=" + jsonPath, ...SUITES];
const cmd = existsSync(resolve(ROOT, "node_modules/.bin/vitest"))
  ? "node_modules/.bin/vitest"
  : "bunx";
const finalArgs = cmd === "bunx" ? ["vitest", ...args] : args;

const res = spawnSync(cmd, finalArgs, { stdio: "inherit", cwd: ROOT });

let report = null;
try {
  if (existsSync(jsonPath)) {
    report = JSON.parse(readFileSync(jsonPath, "utf8"));
  }
} catch (e) {
  console.error("⚠ Could not parse Vitest JSON report:", e?.message ?? e);
}

const rows = [];
let totalPass = 0;
let totalFail = 0;
let totalSkip = 0;

if (report && Array.isArray(report.testResults)) {
  const byFile = new Map();
  for (const f of report.testResults) {
    const rel = f.name?.replace(ROOT + "/", "") ?? f.name;
    byFile.set(rel, f);
  }
  for (const suite of SUITES) {
    const f = byFile.get(suite) ?? byFile.get(resolve(ROOT, suite));
    if (!f) {
      rows.push({ suite, status: "MISSING", pass: 0, fail: 0, skip: 0 });
      totalFail += 1;
      continue;
    }
    let pass = 0, fail = 0, skip = 0;
    for (const a of f.assertionResults ?? []) {
      if (a.status === "passed") pass += 1;
      else if (a.status === "failed") fail += 1;
      else skip += 1;
    }
    totalPass += pass; totalFail += fail; totalSkip += skip;
    rows.push({
      suite,
      status: fail === 0 ? "PASS" : "FAIL",
      pass, fail, skip,
    });
  }
} else {
  // Fall back to exit code if JSON missing.
  for (const suite of SUITES) {
    rows.push({
      suite,
      status: res.status === 0 ? "PASS" : "UNKNOWN",
      pass: 0, fail: 0, skip: 0,
    });
  }
}

const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);
console.log("\n┌─ One-Tent Loop smoke audit results ───────────────────────────────");
console.log("│ " + pad("STATUS", 8) + pad("PASS", 6) + pad("FAIL", 6) + pad("SKIP", 6) + "SUITE");
console.log("├───────────────────────────────────────────────────────────────────");
for (const r of rows) {
  console.log(
    "│ " +
      pad(r.status, 8) +
      pad(String(r.pass), 6) +
      pad(String(r.fail), 6) +
      pad(String(r.skip), 6) +
      r.suite,
  );
}
console.log("└───────────────────────────────────────────────────────────────────");
console.log(
  `  Totals: ${totalPass} passed, ${totalFail} failed, ${totalSkip} skipped ` +
    `across ${SUITES.length} suites.`,
);

if (res.status !== 0 || totalFail > 0) {
  console.error("\n✗ One-Tent Loop smoke audit FAILED.");
  process.exit(res.status || 1);
}
console.log("\n✓ One-Tent Loop smoke audit PASSED.");
process.exit(0);
