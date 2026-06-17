#!/usr/bin/env node
/**
 * Scanner guardrail CI wrapper.
 *
 * Responsibilities (test tooling only — no production behavior):
 *   1. Delete any stale slow-test JSONL report from a previous run.
 *   2. Run `bun run test:scanner-guardrails` (the underlying vitest suite).
 *   3. If a report was emitted, parse + validate every row, then exit
 *      non-zero (slow scanner rows mean the timeout sentinel tripped).
 *   4. If no report exists after a successful run, print a healthy
 *      message and exit 0.
 *
 * The pure validation helpers are exported so a runtime contract test
 * can exercise them without needing a real >5s sleep.
 *
 * Safety:
 *   - No production code changes.
 *   - No scanner regex/allowlist/assertion changes.
 *   - No global Vitest timeout changes.
 *   - No schema/RLS/Edge/auth/AI/Action Queue/alert/automation/device-control.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCANNER_SLOW_REPORT_PATH = "test-results/scanner-guardrail-slow-tests.jsonl";
export const SCANNER_SLOW_THRESHOLD_MS = 5_000;

const REQUIRED_FIELDS = ["test", "suite", "file", "durationMs", "thresholdMs", "recordedAt"];

/**
 * Validate a single parsed JSONL row against the stable telemetry contract.
 * Returns { ok: true } or { ok: false, error: string }.
 */
export function validateScannerSlowRow(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return { ok: false, error: "row is not a plain object" };
  }
  for (const field of REQUIRED_FIELDS) {
    if (!(field in row)) return { ok: false, error: `missing required field: ${field}` };
  }
  for (const field of ["test", "suite", "file"]) {
    const v = row[field];
    if (typeof v !== "string" || v.trim().length === 0) {
      return { ok: false, error: `${field} must be a non-empty string` };
    }
  }
  const file = row.file;
  if (file.includes("\\")) {
    return { ok: false, error: "file must be POSIX (no backslashes)" };
  }
  if (file.startsWith("/") || /^[A-Za-z]:\//.test(file)) {
    return { ok: false, error: "file must be repo-relative (not absolute)" };
  }
  if (typeof row.durationMs !== "number" || !Number.isFinite(row.durationMs)) {
    return { ok: false, error: "durationMs must be a finite number" };
  }
  if (row.thresholdMs !== SCANNER_SLOW_THRESHOLD_MS) {
    return { ok: false, error: `thresholdMs must equal ${SCANNER_SLOW_THRESHOLD_MS}` };
  }
  if (typeof row.recordedAt !== "string") {
    return { ok: false, error: "recordedAt must be a string" };
  }
  const t = Date.parse(row.recordedAt);
  if (!Number.isFinite(t) || new Date(t).toISOString() !== row.recordedAt) {
    return { ok: false, error: "recordedAt must be a valid ISO timestamp" };
  }
  return { ok: true };
}

/**
 * Parse JSONL content and validate every row. Returns
 * { rows, errors } where errors[i] is null for ok rows.
 */
export function parseAndValidateScannerSlowReport(content) {
  const lines = content.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const rows = [];
  const errors = [];
  for (let i = 0; i < lines.length; i++) {
    let parsed;
    try {
      parsed = JSON.parse(lines[i]);
    } catch (err) {
      rows.push(null);
      errors.push(`line ${i + 1}: invalid JSON (${(err && err.message) || "parse error"})`);
      continue;
    }
    rows.push(parsed);
    const res = validateScannerSlowRow(parsed);
    errors.push(res.ok ? null : `line ${i + 1}: ${res.error}`);
  }
  return { rows, errors };
}

function repoRelativeReportPath() {
  return resolve(process.cwd(), SCANNER_SLOW_REPORT_PATH);
}

function deleteStaleReport() {
  const p = repoRelativeReportPath();
  if (existsSync(p)) {
    rmSync(p, { force: true });
    console.log(`[scanner-guardrails-ci] removed stale report: ${SCANNER_SLOW_REPORT_PATH}`);
  }
}

function runScannerSuite() {
  const res = spawnSync("bun", ["run", "test:scanner-guardrails"], {
    stdio: "inherit",
    env: process.env,
  });
  return res.status ?? 1;
}

function inspectReport() {
  const p = repoRelativeReportPath();
  if (!existsSync(p)) {
    console.log(
      "[scanner-guardrails-ci] healthy: no scanner guardrail tests exceeded " +
        `${SCANNER_SLOW_THRESHOLD_MS}ms (no report emitted).`,
    );
    return 0;
  }
  const content = readFileSync(p, "utf8");
  const { rows, errors } = parseAndValidateScannerSlowReport(content);
  console.error(
    `[scanner-guardrails-ci] FAIL: ${rows.length} slow scanner row(s) emitted ` +
      `(threshold=${SCANNER_SLOW_THRESHOLD_MS}ms). Report: ${SCANNER_SLOW_REPORT_PATH}`,
  );
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (errors[i]) {
      console.error(`  - ${errors[i]}`);
    } else if (r) {
      console.error(
        `  - [${r.suite}] ${r.test} (${r.durationMs}ms) @ ${r.file}`,
      );
    }
  }
  return 1;
}

export async function main() {
  deleteStaleReport();
  const code = runScannerSuite();
  if (code !== 0) {
    console.error(`[scanner-guardrails-ci] scanner suite failed with exit code ${code}`);
    // Still inspect — a slow row may be the actual cause.
    inspectReport();
    return code;
  }
  return inspectReport();
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then((code) => process.exit(code));
}
