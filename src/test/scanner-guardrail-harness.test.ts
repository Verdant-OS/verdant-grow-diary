/**
 * Self-tests for the shared scanner guardrail harness.
 *
 * Verifies:
 *  - exported constants are stable
 *  - getCachedTsFiles returns the same list when called twice
 *    (cache hit; no second filesystem walk)
 *  - getCachedScannerFiles returns the same list when called twice
 *    for arbitrary scanner extension sets
 *  - getCachedTsFiles output only contains .ts / .tsx files
 *  - the slow-test JSONL report path is well-formed
 *  - slow-test report rows expose a stable machine-readable field contract
 *
 * No production code is exercised by this test.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SCANNER_GUARDRAIL_TIMEOUT_MS,
  SLOW_SCANNER_THRESHOLD_MS,
  SCANNER_GUARDRAIL_SLOW_TEST_REPORT_PATH,
  buildScannerSlowTestReportRow,
  getCachedScannerFiles,
  getCachedTsFiles,
  scannerIt,
  __resetScannerHarnessCachesForTests,
} from "./support/scannerGuardrailHarness";

describe("scannerGuardrailHarness", () => {
  it("exposes the documented timeout + threshold constants", () => {
    expect(SCANNER_GUARDRAIL_TIMEOUT_MS).toBe(30_000);
    expect(SLOW_SCANNER_THRESHOLD_MS).toBe(5_000);
    expect(SLOW_SCANNER_THRESHOLD_MS).toBeLessThan(
      SCANNER_GUARDRAIL_TIMEOUT_MS,
    );
  });

  it("exposes scannerIt as the scanner-suite test helper", () => {
    expect(scannerIt).toBe(it);
  });

  it("getCachedTsFiles returns identical reference on second call (cache hit)", () => {
    __resetScannerHarnessCachesForTests();
    const root = resolve(__dirname, "support");
    const first = getCachedTsFiles(root);
    const second = getCachedTsFiles(root);
    expect(second).toBe(first);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((p) => /\.(ts|tsx)$/.test(p))).toBe(true);
  });

  it("getCachedScannerFiles returns identical reference for matching scanner walks", () => {
    __resetScannerHarnessCachesForTests();
    const first = getCachedScannerFiles({
      root: resolve(__dirname, ".."),
      dirs: ["test/support"],
      exts: [".ts", ".tsx"],
    });
    const second = getCachedScannerFiles({
      root: resolve(__dirname, ".."),
      dirs: ["test/support"],
      exts: [".tsx", ".ts"],
    });
    expect(second).toBe(first);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((p) => /\.(ts|tsx)$/.test(p))).toBe(true);
  });

  it("builds stable slow-test JSONL report rows", () => {
    const row = buildScannerSlowTestReportRow({
      test: "contains zero unsafe references",
      suite: "ecowitt-only-sensor-direction",
      file: "src/test/ecowitt-only-sensor-direction.test.ts",
      durationMs: 5_000.6,
      thresholdMs: 5_000,
      recordedAt: "2026-06-16T00:00:00.000Z",
    });

    expect(Object.keys(row)).toEqual([
      "test",
      "suite",
      "file",
      "durationMs",
      "thresholdMs",
      "recordedAt",
    ]);
    expect(row).toEqual({
      test: "contains zero unsafe references",
      suite: "ecowitt-only-sensor-direction",
      file: "src/test/ecowitt-only-sensor-direction.test.ts",
      durationMs: 5_001,
      thresholdMs: 5_000,
      recordedAt: "2026-06-16T00:00:00.000Z",
    });
    expect(JSON.parse(JSON.stringify(row))).toEqual(row);
  });

  it("normalizes absolute test file paths to stable repo-relative POSIX paths", () => {
    const row = buildScannerSlowTestReportRow({
      test: "contains zero unsafe references",
      file: resolve(
        process.cwd(),
        "src/test/ecowitt-only-sensor-direction.test.ts",
      ),
      durationMs: 5_123,
      recordedAt: "2026-06-16T00:00:00.000Z",
    });

    expect(row.file).toBe("src/test/ecowitt-only-sensor-direction.test.ts");
    expect(row.file).not.toContain("\\");
  });

  it("derives a stable suite label from the test file when none is supplied", () => {
    const row = buildScannerSlowTestReportRow({
      test: "current repository is clean",
      file: "/repo/src/test/sensor-intelligence-safety.test.ts",
      durationMs: 5_123,
      recordedAt: "2026-06-16T00:00:00.000Z",
    });
    expect(row.suite).toBe("sensor-intelligence-safety");
  });

  it("harness source file documents safety constraints", () => {
    const src = readFileSync(
      resolve(__dirname, "support/scannerGuardrailHarness.ts"),
      "utf8",
    );
    // Soft documentation guardrail — keeps the safety intent visible
    // in the source file itself, so future edits cannot quietly remove it.
    expect(src).toMatch(/INFORMATIONAL ONLY/);
    expect(src).toMatch(/Does NOT skip tests/);
    expect(src).toMatch(/Does NOT alter scanner regexes/);
  });

  it("slow-test report path is under test-results/", () => {
    expect(SCANNER_GUARDRAIL_SLOW_TEST_REPORT_PATH).toMatch(
      /test-results.*scanner-guardrail-slow-tests\.jsonl/,
    );
    // Sanity: the directory is allowed to not exist yet (only created on
    // first slow test). Just confirm we don't accidentally write into src/.
    expect(existsSync(resolve(__dirname, "../../src/test-results"))).toBe(
      false,
    );
  });
});
