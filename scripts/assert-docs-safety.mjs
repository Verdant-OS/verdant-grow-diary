#!/usr/bin/env node
/**
 * assert-docs-safety
 * ------------------
 * Unified docs safety runner with a focused failure report.
 *
 * Scanners:
 *   1. automated-phenotyping  (in-process, structured failures)
 *      scripts/assert-automated-phenotyping-docs-safety.mjs
 *   2. release                (child process)
 *      scripts/assert-release-docs-safety.mjs
 *   3. sensor                 (child process)
 *      scripts/sensor-safety-check.mjs
 *
 * Modes:
 *   default   — strict; failures exit non-zero
 *   --dry-run — runs every scanner, prints the report, ALWAYS exits 0
 *   --diff    — alias for --dry-run
 *
 * The report prints scanner, file, section, line, check, expected, actual,
 * reason for every failure. On success, a one-liner per scanner is shown.
 *
 * CI must not pass --dry-run.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import {
  TARGET_FILE as PHENOTYPING_TARGET,
  toStructuredFailures as phenotypingFailures,
} from "./assert-automated-phenotyping-docs-safety.mjs";

const ROOT = process.cwd();

/**
 * @typedef {Object} DocsSafetyFailure
 * @property {string} scanner
 * @property {string} filePath
 * @property {string} [section]
 * @property {number} [line]
 * @property {string} check
 * @property {string} expected
 * @property {string} actual
 * @property {string} reason
 */

export function parseArgs(argv) {
  const set = new Set(argv);
  const dryRun = set.has("--dry-run") || set.has("--diff");
  return { dryRun };
}

/** Run the in-process phenotyping scanner. */
export function runPhenotyping() {
  const rel = relative(ROOT, PHENOTYPING_TARGET);
  if (!existsSync(PHENOTYPING_TARGET)) {
    return {
      name: "automated-phenotyping",
      ok: false,
      failures: [
        {
          scanner: "automated-phenotyping",
          filePath: rel,
          check: "target-file-missing",
          expected: "protocol file exists",
          actual: "file not found",
          reason: `Target file missing: ${rel}`,
        },
      ],
    };
  }
  const text = readFileSync(PHENOTYPING_TARGET, "utf8");
  const failures = phenotypingFailures(text, rel);
  return { name: "automated-phenotyping", ok: failures.length === 0, failures };
}

/** Run a child-process scanner; normalize its result into a single failure on non-zero exit. */
export function runChildScanner(name, scriptRelPath) {
  const script = join(ROOT, scriptRelPath);
  const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
  const ok = r.status === 0;
  if (ok) {
    return { name, ok, failures: [], stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  }
  const combined = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  /** @type {DocsSafetyFailure} */
  const failure = {
    scanner: name,
    filePath: scriptRelPath,
    check: "scanner-exit-nonzero",
    expected: "scanner exit code 0",
    actual: `exit ${r.status ?? -1}`,
    reason:
      combined.length > 0
        ? combined
        : "Scanner exited non-zero with no captured output.",
  };
  return {
    name,
    ok: false,
    failures: [failure],
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

/**
 * Format the focused failure report.
 * @param {Array<{name:string, ok:boolean, failures:DocsSafetyFailure[]}>} results
 */
export function formatReport(results, { dryRun = false } = {}) {
  const allFailures = results.flatMap((r) => r.failures);
  const lines = [];
  if (allFailures.length === 0) {
    lines.push("Docs Safety Report: PASS");
    for (const r of results) lines.push(`- ${r.name}: PASS`);
    return lines.join("\n");
  }
  lines.push("Docs Safety Report: FAIL");
  lines.push("");
  allFailures.forEach((f, i) => {
    lines.push(`${i + 1}) ${f.scanner}`);
    lines.push(`   File: ${f.filePath}`);
    if (f.section) lines.push(`   Section: ${f.section}`);
    if (typeof f.line === "number") lines.push(`   Line: ${f.line}`);
    lines.push(`   Check: ${f.check}`);
    lines.push(`   Expected: ${f.expected}`);
    lines.push(`   Actual: ${f.actual}`);
    lines.push(`   Reason: ${f.reason}`);
    lines.push("");
  });
  lines.push("Scanner summary:");
  for (const r of results) {
    lines.push(`- ${r.name}: ${r.ok ? "PASS" : `FAIL (${r.failures.length})`}`);
  }
  if (dryRun) {
    lines.push("");
    lines.push("DRY RUN: failures were reported but exit code is 0");
  }
  return lines.join("\n");
}

export function runAll() {
  return [
    runPhenotyping(),
    runChildScanner("release", "scripts/assert-release-docs-safety.mjs"),
    runChildScanner("sensor", "scripts/sensor-safety-check.mjs"),
  ];
}

function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const results = runAll();
  const report = formatReport(results, { dryRun });
  const anyFail = results.some((r) => !r.ok);
  // Use stdout for the focused report. Child stderr is captured into the
  // failure `reason` field already; we do not echo raw env or secrets.
  if (anyFail) {
    console.error(report);
  } else {
    console.log(report);
  }
  if (dryRun) process.exit(0);
  process.exit(anyFail ? 1 : 0);
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("assert-docs-safety.mjs");
if (invokedDirectly) main();
