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
 *  - Provide small read-only caches for recursive scanner walks so suites can
 *    share the same walk result across tests without re-walking the filesystem
 *    per-`it`.
 *
 * Safety:
 *  - Does NOT change global Vitest timeout (uses vi.setConfig per file).
 *  - Does NOT skip tests.
 *  - Does NOT alter scanner regexes, allowlists, or assertions.
 *  - Does NOT touch production code.
 */
import { vi, beforeEach, afterEach, it } from "vitest";
import { appendFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export const SCANNER_GUARDRAIL_TIMEOUT_MS = 30_000;
export const SLOW_SCANNER_THRESHOLD_MS = 5_000;

export const SCANNER_GUARDRAIL_SLOW_TEST_REPORT_PATH = resolve(
  process.cwd(),
  "test-results",
  "scanner-guardrail-slow-tests.jsonl",
);

/**
 * Optional alias for new scanner suites. Existing suites may keep importing
 * Vitest's `it`; the per-file timeout/telemetry comes from
 * installScannerGuardrail either way.
 */
export const scannerIt = it;

export type ScannerGuardrailSlowTestReportRow = Readonly<{
  /** Vitest `it(...)` label. */
  test: string;
  /** Stable suite label, usually derived from the scanner test filename. */
  suite: string;
  /** Test file path supplied by the scanner suite. */
  file: string;
  /** Rounded measured duration for the test body + hooks. */
  durationMs: number;
  /** Slow-test threshold that caused this row to be emitted. */
  thresholdMs: number;
  /** ISO timestamp for informational triage only. */
  recordedAt: string;
}>;

function deriveSuiteLabel(file: string): string {
  return basename(file)
    .replace(/\.test\.(t|j)sx?$/i, "")
    .replace(/\.(t|j)sx?$/i, "")
    .trim() || "scanner-guardrail";
}

export function buildScannerSlowTestReportRow(input: {
  test: string;
  file: string;
  durationMs: number;
  thresholdMs?: number;
  suite?: string;
  suiteLabel?: string;
  recordedAt?: string;
}): ScannerGuardrailSlowTestReportRow {
  const suite = (input.suiteLabel ?? input.suite ?? deriveSuiteLabel(input.file)).trim();
  return {
    test: input.test || "(unknown test)",
    suite: suite || "scanner-guardrail",
    file: input.file,
    durationMs: Math.round(input.durationMs),
    thresholdMs: input.thresholdMs ?? SLOW_SCANNER_THRESHOLD_MS,
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
 * Optional opts.suite/suiteLabel overrides the telemetry suite label.
 */
export function installScannerGuardrail(opts: {
  file: string;
  timeoutMs?: number;
  suite?: string;
  suiteLabel?: string;
}): void {
  const timeoutMs = opts.timeoutMs ?? SCANNER_GUARDRAIL_TIMEOUT_MS;
  const suiteLabel = opts.suiteLabel ?? opts.suite ?? deriveSuiteLabel(opts.file);
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
      mkdirSync(dirname(SCANNER_GUARDRAIL_SLOW_TEST_REPORT_PATH), { recursive: true });
      appendFileSync(
        SCANNER_GUARDRAIL_SLOW_TEST_REPORT_PATH,
        JSON.stringify(
          buildScannerSlowTestReportRow({
            test: currentName,
            suite: suiteLabel,
            file: opts.file,
            durationMs,
            thresholdMs: SLOW_SCANNER_THRESHOLD_MS,
          }),
        ) + "\n",
      );
    } catch {
      // Informational only — never fail a guardrail because of report I/O.
    }
  });
}

const DEFAULT_SCANNER_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
]);

/** Cached recursive scanner walk for arbitrary source extensions. */
const scannerFileCache = new Map<string, string[]>();

export function getCachedScannerFiles(opts: {
  root: string;
  dirs?: string[];
  exts?: Iterable<string>;
  skipDirs?: Iterable<string>;
}): string[] {
  const root = resolve(opts.root);
  const dirs = [...(opts.dirs ?? ["."])].sort();
  const exts = new Set(opts.exts ?? [".ts", ".tsx"]);
  const skipDirs = new Set([
    ...DEFAULT_SCANNER_SKIP_DIRS,
    ...(opts.skipDirs ?? []),
  ]);
  const key = JSON.stringify({
    root,
    dirs,
    exts: [...exts].sort(),
    skipDirs: [...skipDirs].sort(),
  });
  const hit = scannerFileCache.get(key);
  if (hit) return hit;

  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (skipDirs.has(entry)) continue;
        walk(full);
      } else if (st.isFile()) {
        const dot = entry.lastIndexOf(".");
        const ext = dot >= 0 ? entry.slice(dot) : "";
        if (exts.has(ext)) out.push(full);
      }
    }
  };

  for (const dir of dirs) walk(resolve(root, dir));
  out.sort();
  scannerFileCache.set(key, out);
  return out;
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
    for (const entry of readdirSync(dir).sort()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (exts.test(entry)) out.push(full);
    }
  };
  walk(root);
  out.sort();
  walkCache.set(key, out);
  return out;
}

/** Test-only helper to reset the walk cache (used by harness self-tests). */
export function __resetScannerHarnessCachesForTests(): void {
  walkCache.clear();
  scannerFileCache.clear();
}
