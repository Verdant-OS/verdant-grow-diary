import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  parseVitestLog,
  summarize,
  formatReport,
  inferGuardType,
} from "../../scripts/summarize-vitest-timeouts.mjs";

const TIMEOUT_SAMPLE = `
 FAIL  src/test/watering-history.test.ts > WateringHistoryPanel runtime safety > no runtime code calls create_watering_event RPC
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".

 FAIL  src/test/vpd-stage-normalization-ownership.test.ts > vpd ownership > ignores the allow-listed scanner and helper files
Error: Test timed out in 5000ms.
`;

const MIXED_SAMPLE = `
 FAIL  src/test/foo.test.ts > does a thing
AssertionError: expected 1 to equal 2

 FAIL  src/test/bar.test.ts > scans repo
Error: Test timed out in 5000ms.
`;

describe("summarize-vitest-timeouts", () => {
  it("parses timeout-only failures and groups by file", () => {
    const summary = summarize(parseVitestLog(TIMEOUT_SAMPLE));
    expect(summary.total).toBe(2);
    expect(summary.timeoutCount).toBe(2);
    expect(summary.nonTimeoutCount).toBe(0);
    expect(summary.byFile.has("src/test/watering-history.test.ts")).toBe(true);
    expect(summary.byFile.has("src/test/vpd-stage-normalization-ownership.test.ts")).toBe(true);
  });

  it("infers guard types from test text", () => {
    expect(inferGuardType("create_watering_event RPC trust-boundary")).toBe(
      "RPC trust-boundary static guard",
    );
    expect(inferGuardType("raw_payload leakage")).toBe(
      "raw payload / secret leakage guard",
    );
    expect(inferGuardType("device-control language")).toBe(
      "device-control language guard",
    );
    expect(inferGuardType("sensor provenance csv")).toBe(
      "sensor provenance/static ownership guard",
    );
    expect(inferGuardType("totally unrelated text")).toBe(
      "unknown static scanner guard",
    );
  });

  it("detects non-timeout assertion failures and refuses environmental-only verdict", () => {
    const summary = summarize(parseVitestLog(MIXED_SAMPLE));
    expect(summary.nonTimeoutCount).toBe(1);
    const report = formatReport(summary);
    expect(report).toContain("Non-timeout failures present");
    expect(report).not.toContain("All parsed failures are timeout-only");
  });

  it("marks timeout-only logs as environmental", () => {
    const report = formatReport(summarize(parseVitestLog(TIMEOUT_SAMPLE)));
    expect(report).toContain("All parsed failures are timeout-only");
    expect(report).not.toMatch(/publish[- ]ready/i);
  });

  it("handles empty logs", () => {
    const summary = summarize(parseVitestLog(""));
    expect(summary.total).toBe(0);
    expect(formatReport(summary)).toContain("No failures parsed");
  });

  it("CLI exits non-zero when no file path is provided", () => {
    let failed = false;
    try {
      execFileSync("node", ["scripts/summarize-vitest-timeouts.mjs"], {
        stdio: "pipe",
      });
    } catch (e: any) {
      failed = true;
      expect(e.status).not.toBe(0);
      expect(String(e.stderr)).toContain("Usage:");
    }
    expect(failed).toBe(true);
  });

  it("output contains no misleading publish-ready language", () => {
    const report = formatReport(summarize(parseVitestLog(MIXED_SAMPLE)));
    expect(report).not.toMatch(/publish[- ]ready|safe to publish|all green/i);
  });
});
