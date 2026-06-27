import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  parseArgs,
  formatReport,
  runPhenotyping,
  // @ts-ignore - .mjs import without type declarations
} from "../../scripts/assert-docs-safety.mjs";

const SCRIPT = join(process.cwd(), "scripts/assert-docs-safety.mjs");

function run(args: string[] = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

describe("assert-docs-safety — argument parsing", () => {
  it("defaults to strict mode", () => {
    expect(parseArgs([])).toEqual({ dryRun: false });
  });
  it("--dry-run enables dry-run", () => {
    expect(parseArgs(["--dry-run"])).toEqual({ dryRun: true });
  });
  it("--diff aliases --dry-run", () => {
    expect(parseArgs(["--diff"])).toEqual({ dryRun: true });
  });
});

describe("assert-docs-safety — focused report formatting", () => {
  const sampleFailures = [
    {
      name: "automated-phenotyping",
      ok: false,
      failures: [
        {
          scanner: "automated-phenotyping",
          filePath: "docs/automated-phenotyping-protocol-v1.0.md",
          section: "Sample Filled Phenotyping Output Log",
          line: 42,
          check: "low-confidence-human-final-score",
          expected: "Human Final Score must be blank when Confidence is Low",
          actual: '"8/10"',
          reason: "Low-confidence automated output cannot carry a final human score.",
        },
      ],
    },
    { name: "release", ok: true, failures: [] },
    { name: "sensor", ok: true, failures: [] },
  ];

  it("FAIL report includes file, section, line, check, expected, actual, reason", () => {
    const r = formatReport(sampleFailures);
    expect(r).toContain("Docs Safety Report: FAIL");
    expect(r).toContain("File: docs/automated-phenotyping-protocol-v1.0.md");
    expect(r).toContain("Section: Sample Filled Phenotyping Output Log");
    expect(r).toContain("Line: 42");
    expect(r).toContain("Check: low-confidence-human-final-score");
    expect(r).toContain("Expected: Human Final Score must be blank");
    expect(r).toContain('Actual: "8/10"');
    expect(r).toContain("Reason: Low-confidence");
    expect(r).toContain("- release: PASS");
  });

  it("dry-run report appends the DRY RUN notice", () => {
    const r = formatReport(sampleFailures, { dryRun: true });
    expect(r).toContain("DRY RUN: failures were reported but exit code is 0");
  });

  it("PASS report is concise per-scanner", () => {
    const r = formatReport([
      { name: "automated-phenotyping", ok: true, failures: [] },
      { name: "release", ok: true, failures: [] },
      { name: "sensor", ok: true, failures: [] },
    ]);
    expect(r.startsWith("Docs Safety Report: PASS")).toBe(true);
    expect(r).toContain("- automated-phenotyping: PASS");
    expect(r).toContain("- release: PASS");
    expect(r).toContain("- sensor: PASS");
    expect(r).not.toContain("FAIL");
  });
});

describe("assert-docs-safety — phenotyping structured failures", () => {
  it("real protocol file produces no phenotyping failures", () => {
    const r = runPhenotyping();
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });
});

describe("assert-docs-safety — CLI exit codes", () => {
  it("strict mode exits 0 when the repo is clean", () => {
    const r = run();
    expect(r.status).toBe(0);
    expect((r.stdout + r.stderr)).toContain("Docs Safety Report: PASS");
  });

  it("--dry-run always exits 0", () => {
    const r = run(["--dry-run"]);
    expect(r.status).toBe(0);
  });

  it("--diff aliases --dry-run (exits 0)", () => {
    const r = run(["--diff"]);
    expect(r.status).toBe(0);
  });
});
