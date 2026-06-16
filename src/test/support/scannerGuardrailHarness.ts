/**
 * Shared test harness for filesystem-scanning guardrail suites.
 *
 * Purpose:
 *  - Standardise the per-file Vitest timeout bump previously copy/pasted
 *    into each scanner guardrail file.
 *  - Capture per-test timing for scanner guardrails and emit a
 *    machine-readable JSONL report for any test exceeding
 *    SLOW_SCANNER_THRESHOLD_MS. The report is INFORMATIONAL ONLY — it
 *    never fails a test.
 *  - Provide a small read-only cache for recursive `.ts/.tsx` walks so
 *    that scanner suites can share the same walk result across tests
 *    without re-walking the filesystem per-`it`.
 *
 * Safety:
 *  - Does NOT change global Vitest timeout (uses vi.setConfig per file).
 *  - Does NOT skip tests.
 *  - Does NOT alter scanner regexes, allowlists, or assertions.
 *  - Does NOT touch production code.
 */
import { vi, beforeEach, afterEach, it as vitestIt } from "vitest";
import { appendFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const SCANNER_GUARDRAIL_TIMEOUT_MS = 30_000;
export const SLOW_SCANNER_THRESHOLD_MS = 5_000;

const REPORT_PATH = resolve(
  process.cwd(),
  "test-results",
  "scanner-guardrail-slow-tests.jsonl",
);

/** Stable JSONL row contract for the scanner slow-test telemetry report. */
export interface ScannerSlowTestReportRow {
  test: string;
  suite: string;
  file: string;
  durationMs: number;
  thresholdMs: number;
  recordedAt: string;
}

/**
 * Pure builder for a JSONL row. Exported so harness self-tests can
 * validate the row shape deterministically without depending on real
 * test timing.
 */
export function buildScannerSlowTestReportRow(input: {
  test: string;
  suite: string;
  file: string;
  durationMs: number;
  recordedAt?: string;
}): ScannerSlowTestReportRow {
  const test = input.test.trim();
  const suite = input.suite.trim();
  const file = input.file.trim();
  if (!test) throw new Error("scanner slow-test row: empty test name");
  if (!suite) throw new Error("scanner slow-test row: empty suite label");
  if (!file) throw new Error("scanner slow-test row: empty file path");
  if (!Number.isFinite(input.durationMs)) {
    throw new Error("scanner slow-test row: non-finite durationMs");
  }
  return {
    test,
    suite,
    file,
    durationMs: Math.round(input.durationMs),
    thresholdMs: SLOW_SCANNER_THRESHOLD_MS,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
}

/**
 * Install the standard scanner guardrail timeout + slow-test timing
 * capture for the current test file.
 *
 * Call once at the top of a scanner test file:
 *
 *   installScannerGuardrail({ file: __filename });
 *
 * Optional opts.timeoutMs overrides the per-file timeout (default 30s).
 */
export function installScannerGuardrail(opts: {
  file: string;
  timeoutMs?: number;
}): void {
  const timeoutMs = opts.timeoutMs ?? SCANNER_GUARDRAIL_TIMEOUT_MS;
  vi.setConfig({ testTimeout: timeoutMs, hookTimeout: timeoutMs });

  let startedAt = 0;
  let currentName = "";
  let currentSuite = "";

  beforeEach((ctx) => {
    startedAt = performance.now();
    const task = (ctx as { task?: { name?: string; suite?: { name?: string } } })
      .task;
    currentName = task?.name ?? "";
    currentSuite = task?.suite?.name ?? "";
  });

  afterEach(() => {
    const durationMs = performance.now() - startedAt;
    if (durationMs < SLOW_SCANNER_THRESHOLD_MS) return;
    try {
      const row = buildScannerSlowTestReportRow({
        test: currentName || "(unknown test)",
        suite: currentSuite || "(unknown suite)",
        file: opts.file,
        durationMs,
      });
      mkdirSync(dirname(REPORT_PATH), { recursive: true });
      appendFileSync(REPORT_PATH, JSON.stringify(row) + "\n");
    } catch {
      // Informational only — never fail a guardrail because of report I/O.
    }
  });
}

/**
 * Convenience wrapper. New scanner tests should prefer:
 *
 *   scannerIt("does not leak X", () => { ... });
 *
 * over a bare `it(...)` so the standardised per-test timeout cannot
 * accidentally be dropped. Behaviour is identical to `it` aside from
 * carrying the harness timeout default.
 */
export const scannerIt: typeof vitestIt = ((
  name: Parameters<typeof vitestIt>[0],
  fn?: Parameters<typeof vitestIt>[1],
  timeout?: Parameters<typeof vitestIt>[2],
) => {
  return vitestIt(name, fn, timeout ?? SCANNER_GUARDRAIL_TIMEOUT_MS);
}) as typeof vitestIt;

/**
 * Cached recursive walk for `.ts`/`.tsx` files (configurable).
 *
 * Safe to share across tests within the same Vitest worker because
 * scanner suites only read the file list (and the file contents)
 * — they never mutate it.
 */
const walkCache = new Map<string, string[]>();

export function getCachedTsFiles(
  root: string,
  exts: RegExp = /\.(ts|tsx)$/,
): string[] {
  const key = `${root}::${exts.source}`;
  const hit = walkCache.get(key);
  if (hit) return hit;

  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (exts.test(entry)) out.push(full);
    }
  };
  walk(root);
  walkCache.set(key, out);
  return out;
}

/** Test-only helper to reset the walk cache (used by harness self-tests). */
export function __resetScannerHarnessCachesForTests(): void {
  walkCache.clear();
}
