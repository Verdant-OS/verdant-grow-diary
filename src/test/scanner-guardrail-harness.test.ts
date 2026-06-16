/**
 * Self-tests for the shared scanner guardrail harness.
 *
 * Verifies:
 *  - exported constants are stable
 *  - getCachedTsFiles returns the same list when called twice
 *    (cache hit; no second filesystem walk)
 *  - getCachedTsFiles output only contains .ts / .tsx files
 *  - the slow-test JSONL report path is well-formed
 *
 * No production code is exercised by this test.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SCANNER_GUARDRAIL_TIMEOUT_MS,
  SLOW_SCANNER_THRESHOLD_MS,
  buildScannerSlowTestReportRow,
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

  it("getCachedTsFiles returns identical reference on second call (cache hit)", () => {
    __resetScannerHarnessCachesForTests();
    const root = resolve(__dirname, "support");
    const first = getCachedTsFiles(root);
    const second = getCachedTsFiles(root);
    expect(second).toBe(first);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((p) => /\.(ts|tsx)$/.test(p))).toBe(true);
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
    // Path is computed lazily inside afterEach; verify shape by inspecting
    // the source. We cannot import the private constant directly.
    const src = readFileSync(
      resolve(__dirname, "support/scannerGuardrailHarness.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /test-results[\s\S]*scanner-guardrail-slow-tests\.jsonl/,
    );
    // Sanity: the directory is allowed to not exist yet (only created on
    // first slow test). Just confirm we don't accidentally write into src/.
    expect(existsSync(resolve(__dirname, "../../src/test-results"))).toBe(
      false,
    );
  });

  it("buildScannerSlowTestReportRow produces the stable JSONL row shape", () => {
    const row = buildScannerSlowTestReportRow({
      test: "example slow scanner",
      suite: "example suite",
      file: "/repo/src/test/example.test.ts",
      durationMs: 5234.7,
      recordedAt: "2026-06-16T00:00:00.000Z",
    });
    expect(row).toEqual({
      test: "example slow scanner",
      suite: "example suite",
      file: "/repo/src/test/example.test.ts",
      durationMs: 5235,
      thresholdMs: SLOW_SCANNER_THRESHOLD_MS,
      recordedAt: "2026-06-16T00:00:00.000Z",
    });
    expect(typeof row.test).toBe("string");
    expect(row.test.length).toBeGreaterThan(0);
    expect(typeof row.suite).toBe("string");
    expect(row.suite.length).toBeGreaterThan(0);
    expect(typeof row.file).toBe("string");
    expect(row.file.length).toBeGreaterThan(0);
    expect(Number.isFinite(row.durationMs)).toBe(true);
    expect(row.thresholdMs).toBe(5_000);
    expect(new Date(row.recordedAt).toISOString()).toBe(row.recordedAt);
  });

  it("buildScannerSlowTestReportRow rejects empty/invalid input", () => {
    expect(() =>
      buildScannerSlowTestReportRow({
        test: "",
        suite: "s",
        file: "f",
        durationMs: 5001,
      }),
    ).toThrow(/empty test name/);
    expect(() =>
      buildScannerSlowTestReportRow({
        test: "t",
        suite: " ",
        file: "f",
        durationMs: 5001,
      }),
    ).toThrow(/empty suite label/);
    expect(() =>
      buildScannerSlowTestReportRow({
        test: "t",
        suite: "s",
        file: "",
        durationMs: 5001,
      }),
    ).toThrow(/empty file path/);
    expect(() =>
      buildScannerSlowTestReportRow({
        test: "t",
        suite: "s",
        file: "f",
        durationMs: Number.NaN,
      }),
    ).toThrow(/non-finite durationMs/);
  });

  scannerIt("scannerIt runs like vitest it and respects the harness", () => {
    expect(typeof scannerIt).toBe("function");
  });
});
