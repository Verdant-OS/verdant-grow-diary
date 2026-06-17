#!/usr/bin/env node
/**
 * Local operator convenience: remove the scanner guardrail slow-test
 * JSONL report (if any). The CI wrapper at
 * scripts/run-scanner-guardrails-ci.mjs already deletes stale reports
 * itself before each run — this script is purely for manual cleanup
 * between local invocations.
 *
 * Usage:
 *   node scripts/clean-scanner-guardrail-artifacts.mjs
 *   node scripts/clean-scanner-guardrail-artifacts.mjs <report-path>
 *
 * Behavior:
 *   - Default path: test-results/scanner-guardrail-slow-tests.jsonl
 *   - Optional positional arg overrides the path.
 *   - Deletes only that single file (no globs, no directories).
 *   - Refuses to delete a directory (exits 0, logs a notice).
 *   - Always exits 0.
 *
 * Safety: test-tooling only. No production code or scanner behavior changes.
 */
import { existsSync, rmSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCANNER_SLOW_REPORT_PATH = "test-results/scanner-guardrail-slow-tests.jsonl";

export function cleanScannerGuardrailArtifacts({
  cwd = process.cwd(),
  log = console.log,
  reportPath = SCANNER_SLOW_REPORT_PATH,
} = {}) {
  const relPath = reportPath || SCANNER_SLOW_REPORT_PATH;
  const absPath = isAbsolute(relPath) ? relPath : resolve(cwd, relPath);

  if (!existsSync(absPath)) {
    log(`[scanner-guardrails-clean] nothing to remove (${relPath} not present)`);
    return { removed: false, path: absPath, reportPath: relPath };
  }

  const st = statSync(absPath);
  if (st.isDirectory()) {
    log(`[scanner-guardrails-clean] refusing to remove directory: ${relPath}`);
    return { removed: false, path: absPath, reportPath: relPath, refusedDirectory: true };
  }

  rmSync(absPath, { force: true });
  log(`[scanner-guardrails-clean] removed ${relPath}`);
  return { removed: true, path: absPath, reportPath: relPath };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const argPath = process.argv[2];
  cleanScannerGuardrailArtifacts(argPath ? { reportPath: argPath } : {});
  process.exit(0);
}
