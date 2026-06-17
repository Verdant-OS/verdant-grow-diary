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
  formatRowFieldDiff,
  buildGithubAnnotation,
  previewValue,
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

  it("returns field-level failure details on invalid rows", () => {
    const res = validateScannerSlowRow({ ...validRow(), file: "/abs/x.ts", thresholdMs: 3000 });
    expect(res.ok).toBe(false);
    const fields = (res as { failedFields: Array<{ field: string; expected: string; got: string }> })
      .failedFields;
    const names = fields.map((f) => f.field);
    expect(names).toContain("file");
    expect(names).toContain("thresholdMs");
    const fileFail = fields.find((f) => f.field === "file")!;
    expect(fileFail.expected).toMatch(/repo-relative/);
    expect(fileFail.got).toContain("/abs/x.ts");
    const thresholdFail = fields.find((f) => f.field === "thresholdMs")!;
    expect(thresholdFail.expected).toBe(String(SCANNER_SLOW_THRESHOLD_MS));
    expect(thresholdFail.got).toBe("3000");
  });

  it("formats a compact per-row field diff", () => {
    const res = validateScannerSlowRow({ ...validRow(), file: "/abs/x.ts", thresholdMs: 3000 });
    const diff = formatRowFieldDiff(
      2,
      (res as { failedFields: Array<{ field: string; expected: string; got: string; message: string }> })
        .failedFields,
    );
    expect(diff).toContain("[scanner-guardrails] line 2 failed fields:");
    expect(diff).toMatch(/- file: expected repo-relative/);
    expect(diff).toMatch(/- thresholdMs: expected 5000, got 3000/);
    // Compact — no giant payload dump.
    for (const line of diff.split("\n")) expect(line.length).toBeLessThan(200);
  });

  it("truncates oversized values in previews", () => {
    const huge = "x".repeat(500);
    const preview = previewValue(huge);
    expect(preview.length).toBeLessThanOrEqual(82);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("builds a GitHub Actions ::error annotation for the first offender", () => {
    const row = {
      ...validRow(),
      suite: "my-suite",
      test: "current repository is clean",
      file: "src/test/foo.test.ts",
      durationMs: 6123,
      thresholdMs: 3000,
    };
    const res = validateScannerSlowRow(row);
    const annotation = buildGithubAnnotation({
      reportPath: "test-results/scanner-guardrail-slow-tests.jsonl",
      lineNumber: 2,
      row,
      failedFields: (res as { failedFields: Array<{ field: string }> }).failedFields,
    });
    expect(annotation.startsWith("::error ")).toBe(true);
    expect(annotation).toContain("file=test-results/scanner-guardrail-slow-tests.jsonl");
    expect(annotation).toContain("line=2");
    expect(annotation).toContain("title=Scanner guardrail slow telemetry");
    expect(annotation).toContain("suite=my-suite");
    expect(annotation).toContain('test="current repository is clean"');
    expect(annotation).toContain("file=src/test/foo.test.ts");
    expect(annotation).toContain("durationMs=6123");
    expect(annotation).toContain("thresholdMs=3000");
    expect(annotation).toMatch(/failedFields=[a-zA-Z,]*thresholdMs/);
  });

  it("returns empty annotation when no failed fields are given", () => {
    expect(
      buildGithubAnnotation({
        reportPath: "x.jsonl",
        lineNumber: 1,
        row: validRow(),
        failedFields: [],
      }),
    ).toBe("");
  });
});
