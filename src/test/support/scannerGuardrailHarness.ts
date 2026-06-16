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
import { vi, beforeEach, afterEach } from "vitest";
import { appendFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const SCANNER_GUARDRAIL_TIMEOUT_MS = 30_000;
export const SLOW_SCANNER_THRESHOLD_MS = 5_000;

const REPORT_PATH = resolve(
  process.cwd(),
  "test-results",
  "scanner-guardrail-slow-tests.jsonl",
);

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

  beforeEach((ctx) => {
    startedAt = performance.now();
    // ctx.task is a Vitest Task; .name is the `it` label.
    currentName = (ctx as { task?: { name?: string } }).task?.name ?? "";
  });

  afterEach(() => {
    const durationMs = performance.now() - startedAt;
    if (durationMs < SLOW_SCANNER_THRESHOLD_MS) return;
    try {
      mkdirSync(dirname(REPORT_PATH), { recursive: true });
      appendFileSync(
        REPORT_PATH,
        JSON.stringify({
          test: currentName,
          file: opts.file,
          durationMs: Math.round(durationMs),
          thresholdMs: SLOW_SCANNER_THRESHOLD_MS,
          recordedAt: new Date().toISOString(),
        }) + "\n",
      );
    } catch {
      // Informational only — never fail a guardrail because of report I/O.
    }
  });
}

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
