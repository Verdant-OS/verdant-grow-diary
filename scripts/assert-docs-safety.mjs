#!/usr/bin/env node
/**
 * assert-docs-safety
 * ------------------
 * Unified docs safety runner. Executes the docs-only safety scanners in
 * sequence and aggregates pass/fail counts.
 *
 * Included scanners:
 *   1. automated-phenotyping-docs-safety
 *      (scripts/assert-automated-phenotyping-docs-safety.mjs)
 *   2. release-docs-safety
 *      (scripts/assert-release-docs-safety.mjs)
 *   3. sensor-safety-check
 *      (scripts/sensor-safety-check.mjs)
 *
 * Each scanner is run as a child process so failures in one do not
 * short-circuit the rest. The runner exits non-zero if any scanner
 * fails.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();

const SCANNERS = [
  {
    name: "automated-phenotyping-docs-safety",
    script: join(ROOT, "scripts", "assert-automated-phenotyping-docs-safety.mjs"),
  },
  {
    name: "release-docs-safety",
    script: join(ROOT, "scripts", "assert-release-docs-safety.mjs"),
  },
  {
    name: "sensor-safety-check",
    script: join(ROOT, "scripts", "sensor-safety-check.mjs"),
  },
];

let failed = 0;
const results = [];

for (const s of SCANNERS) {
  const r = spawnSync(process.execPath, [s.script], { stdio: "inherit" });
  const ok = r.status === 0;
  if (!ok) failed++;
  results.push({ name: s.name, ok, status: r.status ?? -1 });
}

console.log("\nassert-docs-safety summary:");
for (const r of results) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.ok ? "" : ` (exit ${r.status})`}`);
}
console.log(
  `\n${SCANNERS.length - failed}/${SCANNERS.length} scanner(s) passed.`,
);
process.exit(failed === 0 ? 0 : 1);
