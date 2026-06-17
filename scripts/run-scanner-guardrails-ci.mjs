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
 * Diagnostics:
 *   - Emits a single GitHub Actions `::error` annotation for the first
 *     offending row when running under GITHUB_ACTIONS, so PR reviewers
 *     get an inline failure surface.
 *   - Always prints a compact, truncated per-row field-level diff for
 *     human readers (no raw payload dumps, no secrets).
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
const MAX_VALUE_PREVIEW = 80;

/** Truncate any value for safe, compact log output (no giant payload dumps). */
export function previewValue(v) {
  let s;
  if (typeof v === "string") s = JSON.stringify(v);
  else if (v === undefined) s = "undefined";
  else {
    try {
      s = JSON.stringify(v);
    } catch {
      s = String(v);
    }
    if (s === undefined) s = String(v);
  }
  if (s.length > MAX_VALUE_PREVIEW) s = s.slice(0, MAX_VALUE_PREVIEW - 1) + "…";
  return s;
}

/**
 * Validate a single parsed JSONL row against the stable telemetry contract.
 * Returns { ok: true } when valid, otherwise
 * { ok: false, error: string, failedFields: Array<{ field, expected, got, message }> }.
 *
 * `failedFields[].got` is a compact, truncated preview — never a full payload.
 */
export function validateScannerSlowRow(row) {
  const failedFields = [];
  const push = (field, expected, got, message) =>
    failedFields.push({ field, expected, got: previewValue(got), message });

  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return {
      ok: false,
      error: "row is not a plain object",
      failedFields: [
        { field: "<row>", expected: "plain object", got: previewValue(row), message: "row is not a plain object" },
      ],
    };
  }
  for (const field of REQUIRED_FIELDS) {
    if (!(field in row)) {
      push(field, "present", undefined, `missing required field: ${field}`);
    }
  }
  for (const field of ["test", "suite", "file"]) {
    if (field in row) {
      const v = row[field];
      if (typeof v !== "string" || v.trim().length === 0) {
        push(field, "non-empty string", v, `${field} must be a non-empty string`);
      }
    }
  }
  if (typeof row.file === "string") {
    if (row.file.includes("\\")) {
      push("file", "repo-relative POSIX path", row.file, "file must be POSIX (no backslashes)");
    } else if (row.file.startsWith("/") || /^[A-Za-z]:\//.test(row.file)) {
      push("file", "repo-relative POSIX path", row.file, "file must be repo-relative (not absolute)");
    }
  }
  if ("durationMs" in row) {
    if (typeof row.durationMs !== "number" || !Number.isFinite(row.durationMs)) {
      push("durationMs", "finite number", row.durationMs, "durationMs must be a finite number");
    }
  }
  if ("thresholdMs" in row && row.thresholdMs !== SCANNER_SLOW_THRESHOLD_MS) {
    push(
      "thresholdMs",
      String(SCANNER_SLOW_THRESHOLD_MS),
      row.thresholdMs,
      `thresholdMs must equal ${SCANNER_SLOW_THRESHOLD_MS}`,
    );
  }
  if ("recordedAt" in row) {
    if (typeof row.recordedAt !== "string") {
      push("recordedAt", "ISO timestamp string", row.recordedAt, "recordedAt must be a string");
    } else {
      const t = Date.parse(row.recordedAt);
      if (!Number.isFinite(t) || new Date(t).toISOString() !== row.recordedAt) {
        push("recordedAt", "ISO timestamp string", row.recordedAt, "recordedAt must be a valid ISO timestamp");
      }
    }
  }

  if (failedFields.length === 0) return { ok: true };
  return { ok: false, error: failedFields[0].message, failedFields };
}

/**
 * Parse JSONL content and validate every row. Returns
 * { rows, errors, failedFields } — errors[i] is null for ok rows,
 * failedFields[i] is [] for ok rows.
 */
export function parseAndValidateScannerSlowReport(content) {
  const lines = content.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const rows = [];
  const errors = [];
  const failedFields = [];
  for (let i = 0; i < lines.length; i++) {
    let parsed;
    try {
      parsed = JSON.parse(lines[i]);
    } catch (err) {
      rows.push(null);
      errors.push(`line ${i + 1}: invalid JSON (${(err && err.message) || "parse error"})`);
      failedFields.push([
        { field: "<row>", expected: "valid JSON", got: previewValue(lines[i]), message: "invalid JSON" },
      ]);
      continue;
    }
    rows.push(parsed);
    const res = validateScannerSlowRow(parsed);
    if (res.ok) {
      errors.push(null);
      failedFields.push([]);
    } else {
      errors.push(`line ${i + 1}: ${res.error}`);
      failedFields.push(res.failedFields);
    }
  }
  return { rows, errors, failedFields };
}

/**
 * Build a compact, multi-line per-row field-level diff. Caller decides
 * whether to print it. Truncates values via previewValue.
 */
export function formatRowFieldDiff(lineNumber, fields) {
  if (!fields || fields.length === 0) return "";
  const lines = [`[scanner-guardrails] line ${lineNumber} failed fields:`];
  for (const f of fields) {
    lines.push(`  - ${f.field}: expected ${f.expected}, got ${f.got}`);
  }
  return lines.join("\n");
}

/**
 * Build a GitHub Actions `::error` annotation string for the first
 * offending row. Returns "" if no offending row exists.
 */
export function buildGithubAnnotation({ reportPath, lineNumber, row, failedFields }) {
  if (!failedFields || failedFields.length === 0) return "";
  const suite = (row && typeof row.suite === "string" ? row.suite : "<unknown>").replace(/[\r\n]/g, " ");
  const test = (row && typeof row.test === "string" ? row.test : "<unknown>").replace(/[\r\n]/g, " ");
  const file = (row && typeof row.file === "string" ? row.file : "<unknown>").replace(/[\r\n]/g, " ");
  const durationMs = row && typeof row.durationMs === "number" ? row.durationMs : "<unknown>";
  const thresholdMs =
    row && typeof row.thresholdMs === "number" ? row.thresholdMs : SCANNER_SLOW_THRESHOLD_MS;
  const failedFieldNames = failedFields.map((f) => f.field).join(",");
  const title = "Scanner guardrail slow telemetry";
  const body =
    `suite=${suite} test="${test}" file=${file} ` +
    `durationMs=${durationMs} thresholdMs=${thresholdMs} failedFields=${failedFieldNames}`;
  return `::error file=${reportPath},line=${lineNumber},title=${title}::${body}`;
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
  const { rows, errors, failedFields } = parseAndValidateScannerSlowReport(content);
  console.error(
    `[scanner-guardrails-ci] FAIL: ${rows.length} slow scanner row(s) emitted ` +
      `(threshold=${SCANNER_SLOW_THRESHOLD_MS}ms). Report: ${SCANNER_SLOW_REPORT_PATH}`,
  );

  let firstOffenderEmitted = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const lineNumber = i + 1;
    if (r && (!failedFields[i] || failedFields[i].length === 0)) {
      console.error(
        `  - line ${lineNumber} [${r.suite}] ${r.test} (${r.durationMs}ms) @ ${r.file}`,
      );
    } else {
      if (errors[i]) console.error(`  - ${errors[i]}`);
      const diff = formatRowFieldDiff(lineNumber, failedFields[i]);
      if (diff) console.error(diff);
    }

    if (!firstOffenderEmitted && process.env.GITHUB_ACTIONS === "true") {
      const annotation = buildGithubAnnotation({
        reportPath: SCANNER_SLOW_REPORT_PATH,
        lineNumber,
        row: r,
        // Treat a clean-but-slow row as an offender too (it tripped the sentinel).
        failedFields:
          failedFields[i] && failedFields[i].length > 0
            ? failedFields[i]
            : [{ field: "durationMs", expected: `<=${SCANNER_SLOW_THRESHOLD_MS}`, got: previewValue(r && r.durationMs), message: "slow scanner row" }],
      });
      if (annotation) {
        console.error(annotation);
        firstOffenderEmitted = true;
      }
    }
  }
  return 1;
}

export async function main() {
  deleteStaleReport();
  const code = runScannerSuite();
  if (code !== 0) {
    console.error(`[scanner-guardrails-ci] scanner suite failed with exit code ${code}`);
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
