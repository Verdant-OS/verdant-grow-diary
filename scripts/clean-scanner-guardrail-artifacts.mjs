#!/usr/bin/env node
/**
 * Local operator convenience: remove the scanner guardrail slow-test
 * JSONL report (if any). The CI wrapper at
 * scripts/run-scanner-guardrails-ci.mjs already deletes stale reports
 * itself before each run — this script is purely for manual cleanup
 * between local invocations.
 *
 * Always exits 0.
 *
 * Safety: test-tooling only. No production code or scanner behavior changes.
 */
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCANNER_SLOW_REPORT_PATH = "test-results/scanner-guardrail-slow-tests.jsonl";

export function cleanScannerGuardrailArtifacts({ cwd = process.cwd(), log = console.log } = {}) {
  const p = resolve(cwd, SCANNER_SLOW_REPORT_PATH);
  if (existsSync(p)) {
    rmSync(p, { force: true });
    log(`[scanner-guardrails-clean] removed ${SCANNER_SLOW_REPORT_PATH}`);
    return { removed: true, path: p };
  }
  log(`[scanner-guardrails-clean] nothing to remove (${SCANNER_SLOW_REPORT_PATH} not present)`);
  return { removed: false, path: p };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  cleanScannerGuardrailArtifacts();
  process.exit(0);
}
