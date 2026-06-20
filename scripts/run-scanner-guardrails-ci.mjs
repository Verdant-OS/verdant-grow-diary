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
 * Flags:
 *   --verbose   Print report path, threshold, stale-report removal state,
 *               post-run report presence, row count, validation stats
 *               (valid/invalid/slow), and the value-preview truncation limit.
 *
 * Diagnostics:
 *   - Under GITHUB_ACTIONS=true, emits one `::error` annotation per
 *     invalid or slow telemetry row (not just the first offender).
 *   - Always prints compact, truncated per-row field-level diffs for
 *     human readers. No raw payload dumps, no secrets.
 *
 * Pure helpers are exported so the runtime contract test can exercise
 * them without needing a real >5s sleep.
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
export const MAX_VALUE_PREVIEW = 80;

const REQUIRED_FIELDS = ["test", "suite", "file", "durationMs", "thresholdMs", "recordedAt"];

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

export function formatRowFieldDiff(lineNumber, fields) {
  if (!fields || fields.length === 0) return "";
  const lines = [`[scanner-guardrails] line ${lineNumber} failed fields:`];
  for (const f of fields) {
    lines.push(`  - ${f.field}: expected ${f.expected}, got ${f.got}`);
  }
  return lines.join("\n");
}

/**
 * Build a GitHub Actions `::error` annotation string for a single
 * offending row. Returns "" when there are no failed fields.
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

/**
 * Compute summary stats for a parsed report. A row is "slow" when it is
 * structurally valid (passes the contract). A row is "invalid" when at
 * least one failed field was reported. Both categories are offenders.
 */
export function summarizeReport({ rows, failedFields }) {
  let valid = 0;
  let invalid = 0;
  for (let i = 0; i < rows.length; i++) {
    if (failedFields[i] && failedFields[i].length > 0) invalid += 1;
    else valid += 1;
  }
  return { total: rows.length, valid, invalid, slow: valid };
}

function repoRelativeReportPath() {
  return resolve(process.cwd(), SCANNER_SLOW_REPORT_PATH);
}

function deleteStaleReport() {
  const p = repoRelativeReportPath();
  if (existsSync(p)) {
    rmSync(p, { force: true });
    return true;
  }
  return false;
}

function runScannerSuite() {
  const res = spawnSync("bun", ["run", "test:scanner-guardrails"], {
    stdio: "inherit",
    env: process.env,
  });
  return res.status ?? 1;
}

function inspectReport({ verbose } = { verbose: false }) {
  const p = repoRelativeReportPath();
  const exists = existsSync(p);
  if (verbose) {
    console.log(`[scanner-guardrails-ci] report-exists-after-run=${exists}`);
  }
  if (!exists) {
    console.log(
      "[scanner-guardrails-ci] healthy: no scanner guardrail tests exceeded " +
        `${SCANNER_SLOW_THRESHOLD_MS}ms (no report emitted).`,
    );
    if (verbose) {
      console.log(
        `[scanner-guardrails-ci] verbose stats: rows=0 valid=0 invalid=0 slow=0 truncation-limit=${MAX_VALUE_PREVIEW}`,
      );
    }
    return 0;
  }
  const content = readFileSync(p, "utf8");
  const { rows, errors, failedFields } = parseAndValidateScannerSlowReport(content);
  const stats = summarizeReport({ rows, failedFields });
  console.error(
    `[scanner-guardrails-ci] FAIL: ${rows.length} slow scanner row(s) emitted ` +
      `(threshold=${SCANNER_SLOW_THRESHOLD_MS}ms). Report: ${SCANNER_SLOW_REPORT_PATH}`,
  );
  if (verbose) {
    console.error(
      `[scanner-guardrails-ci] verbose stats: rows=${stats.total} valid=${stats.valid} ` +
        `invalid=${stats.invalid} slow=${stats.slow} truncation-limit=${MAX_VALUE_PREVIEW}`,
    );
  }

  const inActions = process.env.GITHUB_ACTIONS === "true";
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

    if (inActions) {
      const fieldsForAnnotation =
        failedFields[i] && failedFields[i].length > 0
          ? failedFields[i]
          : [
              {
                field: "durationMs",
                expected: `<=${SCANNER_SLOW_THRESHOLD_MS}`,
                got: previewValue(r && r.durationMs),
                message: "slow scanner row",
              },
            ];
      const annotation = buildGithubAnnotation({
        reportPath: SCANNER_SLOW_REPORT_PATH,
        lineNumber,
        row: r,
        failedFields: fieldsForAnnotation,
      });
      if (annotation) console.error(annotation);
    }
  }
  return 1;
}

export function parseCliArgs(argv) {
  return { verbose: argv.includes("--verbose") };
}

export async function main({ argv = process.argv.slice(2) } = {}) {
  const { verbose } = parseCliArgs(argv);
  const removed = deleteStaleReport();
  if (verbose) {
    console.log(
      `[scanner-guardrails-ci] verbose: report-path=${SCANNER_SLOW_REPORT_PATH} ` +
        `threshold-ms=${SCANNER_SLOW_THRESHOLD_MS} stale-report-deleted=${removed} ` +
        `truncation-limit=${MAX_VALUE_PREVIEW}`,
    );
  } else if (removed) {
    console.log(`[scanner-guardrails-ci] removed stale report: ${SCANNER_SLOW_REPORT_PATH}`);
  }
  const code = runScannerSuite();
  if (code !== 0) {
    console.error(`[scanner-guardrails-ci] scanner suite failed with exit code ${code}`);
    inspectReport({ verbose });
    return code;
  }
  return inspectReport({ verbose });
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then((code) => process.exit(code));
}
