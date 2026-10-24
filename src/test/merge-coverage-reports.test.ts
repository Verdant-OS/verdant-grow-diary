import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findCoverageFiles,
  mergeCoverageFiles,
  writeCoberturaReport,
  parseArgs,
} from "../../scripts/merge-coverage-reports.mjs";

function istanbulFileCoverage(hits: number[]) {
  // Minimal valid istanbul-lib-coverage per-file entry: one statement per
  // hit count, no functions/branches. Sufficient for merge + report checks.
  const statementMap: Record<string, unknown> = {};
  const s: Record<string, number> = {};
  hits.forEach((hitCount, index) => {
    statementMap[String(index)] = {
      start: { line: index + 1, column: 0 },
      end: { line: index + 1, column: 10 },
    };
    s[String(index)] = hitCount;
  });
  return {
    path: "/repo/src/example.ts",
    statementMap,
    fnMap: {},
    branchMap: {},
    s,
    f: {},
    b: {},
  };
}

describe("merge-coverage-reports — parseArgs", () => {
  it("returns null when either argument is missing", () => {
    expect(parseArgs([])).toBeNull();
    expect(parseArgs(["only-one-dir"])).toBeNull();
  });

  it("returns the raw coverage dir and output dir when both are present", () => {
    expect(parseArgs(["raw", "out"])).toEqual({ rawCoverageDir: "raw", outputDir: "out" });
  });
});

describe("merge-coverage-reports — findCoverageFiles", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("recursively finds coverage-final.json files and ignores other files", () => {
    dir = mkdtempSync(join(tmpdir(), "merge-coverage-find-"));
    mkdirSync(join(dir, "1"), { recursive: true });
    mkdirSync(join(dir, "2"), { recursive: true });
    writeFileSync(join(dir, "1", "coverage-final.json"), "{}");
    writeFileSync(join(dir, "2", "coverage-final.json"), "{}");
    writeFileSync(join(dir, "2", "not-coverage.json"), "{}");

    const found = findCoverageFiles(dir).sort();

    expect(found).toEqual(
      [join(dir, "1", "coverage-final.json"), join(dir, "2", "coverage-final.json")].sort(),
    );
  });
});

describe("merge-coverage-reports — mergeCoverageFiles + writeCoberturaReport", () => {
  let rawDir: string;
  let outDir: string;

  afterEach(() => {
    if (rawDir) rmSync(rawDir, { recursive: true, force: true });
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  it("merges per-shard hit counts by summing them, not overwriting", () => {
    rawDir = mkdtempSync(join(tmpdir(), "merge-coverage-raw-"));
    outDir = mkdtempSync(join(tmpdir(), "merge-coverage-out-"));

    // Two "sub-shards", each writing its own coverage-final.json (as
    // @vitest/coverage-v8's json reporter does per --shard invocation), both
    // exercised the same file's statements with different hit counts — a
    // real merge sums them; a naive "last write wins" would silently drop
    // the first shard's hits.
    mkdirSync(join(rawDir, "shard-a"), { recursive: true });
    mkdirSync(join(rawDir, "shard-b"), { recursive: true });
    writeFileSync(
      join(rawDir, "shard-a", "coverage-final.json"),
      JSON.stringify({ "/repo/src/example.ts": istanbulFileCoverage([1, 0]) }),
    );
    writeFileSync(
      join(rawDir, "shard-b", "coverage-final.json"),
      JSON.stringify({ "/repo/src/example.ts": istanbulFileCoverage([2, 0]) }),
    );

    const files = findCoverageFiles(rawDir);
    const map = mergeCoverageFiles(files);

    const fileCoverage = map.fileCoverageFor("/repo/src/example.ts");
    expect(fileCoverage.s["0"]).toBe(3);
    expect(fileCoverage.s["1"]).toBe(0);

    writeCoberturaReport(map, outDir);
    const xml = readFileSync(join(outDir, "cobertura-coverage.xml"), "utf8");

    expect(xml).toContain("<?xml");
    expect(xml).toMatch(/filename="[^"]*repo\/src\/example\.ts"/);
    // 1 of 2 statements covered across the merged map.
    expect(xml).toMatch(/lines-valid="2"/);
    expect(xml).toMatch(/lines-covered="1"/);
  });
});
