/**
 * Runtime contract test for the scanner guardrail CI wrapper's JSONL row
 * validation. Exercises the pure helpers exported from
 * scripts/run-scanner-guardrails-ci.mjs without requiring any actual
 * slow (>5s) sleeps.
 *
 * Safety: test-tooling only. No production code under test.
 */
import { describe, it, expect } from "vitest";
import {
  validateScannerSlowRow,
  parseAndValidateScannerSlowReport,
  SCANNER_SLOW_THRESHOLD_MS,
  // @ts-ignore - .mjs without types; helpers are pure JS.
} from "../../scripts/run-scanner-guardrails-ci.mjs";

const validRow = () => ({
  test: "does not leak raw_payload",
  suite: "scanner-guardrail",
  file: "src/test/example-scanner.test.ts",
  durationMs: 5200,
  thresholdMs: SCANNER_SLOW_THRESHOLD_MS,
  recordedAt: new Date("2026-06-17T12:00:00.000Z").toISOString(),
});

describe("scanner-guardrails-ci JSONL contract", () => {
  it("accepts a valid row", () => {
    expect(validateScannerSlowRow(validRow())).toEqual({ ok: true });
  });

  it("rejects rows missing required fields", () => {
    for (const field of ["test", "suite", "file", "durationMs", "thresholdMs", "recordedAt"]) {
      const row: Record<string, unknown> = validRow();
      delete row[field];
      const res = validateScannerSlowRow(row);
      expect(res.ok).toBe(false);
      expect(String((res as { error: string }).error)).toContain(field);
    }
  });

  it("rejects empty test, suite, or file", () => {
    for (const field of ["test", "suite", "file"] as const) {
      const row = { ...validRow(), [field]: "   " };
      expect(validateScannerSlowRow(row).ok).toBe(false);
    }
  });

  it("rejects absolute file paths", () => {
    expect(validateScannerSlowRow({ ...validRow(), file: "/abs/path/x.ts" }).ok).toBe(false);
    expect(validateScannerSlowRow({ ...validRow(), file: "C:/x/y.ts" }).ok).toBe(false);
  });

  it("rejects Windows-style backslash paths", () => {
    expect(validateScannerSlowRow({ ...validRow(), file: "src\\test\\x.ts" }).ok).toBe(false);
  });

  it("rejects non-finite durationMs", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, "100", null, undefined]) {
      expect(validateScannerSlowRow({ ...validRow(), durationMs: bad }).ok).toBe(false);
    }
  });

  it("rejects wrong thresholdMs", () => {
    expect(validateScannerSlowRow({ ...validRow(), thresholdMs: 1000 }).ok).toBe(false);
    expect(validateScannerSlowRow({ ...validRow(), thresholdMs: 0 }).ok).toBe(false);
  });

  it("rejects invalid recordedAt", () => {
    expect(validateScannerSlowRow({ ...validRow(), recordedAt: "not-a-date" }).ok).toBe(false);
    expect(validateScannerSlowRow({ ...validRow(), recordedAt: 12345 }).ok).toBe(false);
    expect(validateScannerSlowRow({ ...validRow(), recordedAt: "2026-06-17" }).ok).toBe(false);
  });

  it("parses multi-line JSONL and reports per-line errors", () => {
    const good = JSON.stringify(validRow());
    const bad = JSON.stringify({ ...validRow(), file: "/absolute.ts" });
    const malformed = "{not json";
    const content = [good, bad, malformed].join("\n") + "\n";
    const { rows, errors } = parseAndValidateScannerSlowReport(content);
    expect(rows.length).toBe(3);
    expect(errors[0]).toBeNull();
    expect(errors[1]).toMatch(/repo-relative/);
    expect(errors[2]).toMatch(/invalid JSON/);
  });
});
