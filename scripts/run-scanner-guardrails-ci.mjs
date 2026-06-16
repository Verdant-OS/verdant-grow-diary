#!/usr/bin/env node
// Runs the scanner guardrail sentinel and validates slow-test telemetry.
// Test tooling only. No production code, retries, timeout bumps, or scanner rule changes.

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPORT_PATH = resolve(
  process.cwd(),
  "test-results",
  "scanner-guardrail-slow-tests.jsonl",
);
const EXPECTED_THRESHOLD_MS = 5_000;
const EXPECTED_KEYS = [
  "test",
  "suite",
  "file",
  "durationMs",
  "thresholdMs",
  "recordedAt",
];

function fail(message) {
  console.error(`[scanner-guardrails] ${message}`);
  process.exitCode = 1;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function validateReportRow(row, lineNumber) {
  const keys = Object.keys(row);
  if (JSON.stringify(keys) !== JSON.stringify(EXPECTED_KEYS)) {
    fail(
      `line ${lineNumber}: expected keys ${EXPECTED_KEYS.join(", ")}, got ${keys.join(", ")}`,
    );
  }
  if (!isNonEmptyString(row.test)) fail(`line ${lineNumber}: test must be a non-empty string`);
  if (!isNonEmptyString(row.suite)) fail(`line ${lineNumber}: suite must be a non-empty string`);
  if (!isNonEmptyString(row.file)) fail(`line ${lineNumber}: file must be a non-empty string`);
  if (typeof row.file === "string" && (isAbsolute(row.file) || row.file.includes("\\"))) {
    fail(`line ${lineNumber}: file must be a stable repo-relative POSIX path`);
  }
  if (!isFiniteNumber(row.durationMs)) fail(`line ${lineNumber}: durationMs must be finite`);
  if (!isFiniteNumber(row.thresholdMs)) fail(`line ${lineNumber}: thresholdMs must be finite`);
  if (row.thresholdMs !== EXPECTED_THRESHOLD_MS) {
    fail(`line ${lineNumber}: thresholdMs must be ${EXPECTED_THRESHOLD_MS}`);
  }
  if (!isIsoTimestamp(row.recordedAt)) {
    fail(`line ${lineNumber}: recordedAt must be an ISO timestamp string`);
  }
}

function validateSlowTestReport() {
  if (!existsSync(REPORT_PATH)) {
    console.log("[scanner-guardrails] No slow scanner rows emitted.");
    return;
  }

  const text = readFileSync(REPORT_PATH, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    console.log("[scanner-guardrails] Slow scanner report exists but contains no rows.");
    return;
  }

  for (const [index, line] of lines.entries()) {
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      fail(`line ${index + 1}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    validateReportRow(row, index + 1);
  }

  fail(
    `${lines.length} scanner guardrail slow-test row(s) emitted; each scanner test must stay below ${EXPECTED_THRESHOLD_MS}ms`,
  );
}

function runScannerGuardrails() {
  if (existsSync(REPORT_PATH)) unlinkSync(REPORT_PATH);

  const bunBin = process.platform === "win32" ? "bun.cmd" : "bun";
  const result = spawnSync(bunBin, ["run", "test:scanner-guardrails"], {
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[scanner-guardrails] failed to start bun: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runScannerGuardrails();
validateSlowTestReport();
process.exit(process.exitCode ?? 0);
