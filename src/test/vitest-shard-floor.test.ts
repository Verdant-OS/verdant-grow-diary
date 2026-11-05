/**
 * Required test shards must not go green with zero discovered tests (deep
 * audit 2026-11-05, finding F-04).
 *
 * `vitest run --shard=n/256 --passWithNoTests` exits 0 on empty discovery and
 * still writes a JSON report whose counters are all zero (measured locally:
 * `numTotalTestSuites: 0, numTotalTests: 0`). Each sub-shard therefore writes
 * that report and `scripts/assert-vitest-shard-ran-tests.mjs` fails the step
 * when it saw no tests. The workflow check below reads the parsed YAML, not a
 * regex over the file.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { evaluateVitestShardFloor } from "../../scripts/lib/vitestShardFloorRules.mjs";

const ROOT = resolve(__dirname, "../..");

describe("evaluateVitestShardFloor", () => {
  it("fails a report with zero suites or zero tests", () => {
    expect(evaluateVitestShardFloor({ numTotalTestSuites: 0, numTotalTests: 0 })).toEqual({
      ok: false,
      reason: "no_test_files",
    });
    expect(evaluateVitestShardFloor({ numTotalTestSuites: 3, numTotalTests: 0 })).toEqual({
      ok: false,
      reason: "no_tests",
    });
  });
  it("fails a missing or malformed report", () => {
    expect(evaluateVitestShardFloor(null)).toEqual({ ok: false, reason: "missing_report" });
    expect(evaluateVitestShardFloor({ numTotalTestSuites: "3", numTotalTests: 4 })).toEqual({
      ok: false,
      reason: "missing_report",
    });
  });
  it("passes a report that ran at least one test", () => {
    expect(evaluateVitestShardFloor({ numTotalTestSuites: 3, numTotalTests: 4 })).toEqual({
      ok: true,
      suites: 3,
      tests: 4,
    });
  });
});

describe("ci.yml full-suite shard step", () => {
  const workflow = parse(readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8")) as {
    jobs: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
  };
  const step = Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .find((s) => s.name === "Run test shard (eight sequential 1/256 processes)");

  it("writes a JSON report per sub-shard and asserts the floor on it", () => {
    expect(step?.run).toBeDefined();
    const run = step!.run as string;
    expect(run).toContain("--reporter=json");
    expect(run).toContain("--outputFile=");
    expect(run).toContain("node scripts/assert-vitest-shard-ran-tests.mjs");
    // The assert must run inside the per-sub-shard loop, after vitest.
    const vitestAt = run.indexOf("bunx vitest run");
    const assertAt = run.indexOf("node scripts/assert-vitest-shard-ran-tests.mjs");
    const doneAt = run.lastIndexOf("done");
    expect(vitestAt).toBeGreaterThan(-1);
    expect(assertAt).toBeGreaterThan(vitestAt);
    expect(doneAt).toBeGreaterThan(assertAt);
  });
});
