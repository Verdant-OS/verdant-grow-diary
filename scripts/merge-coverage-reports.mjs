#!/usr/bin/env node
/**
 * merge-coverage-reports.mjs
 *
 * Merges one or more raw Istanbul `coverage-final.json` files (as produced by
 * `@vitest/coverage-v8`'s `json` reporter) into a single Cobertura XML report.
 *
 * Vitest's full test suite runs as several sequential `--shard` vitest
 * processes (see `.github/workflows/ci.yml`'s `full-suite` job), each of
 * which only sees a slice of the suite. Cobertura XML itself cannot be
 * merged after the fact, so each process instead writes a raw Istanbul
 * coverage map (full per-line/per-branch hit counts), and this script merges
 * those maps with `istanbul-lib-coverage` before rendering the combined
 * Cobertura report with `istanbul-reports`' native Cobertura reporter — the
 * same reporter `@vitest/coverage-v8` uses internally for its own `cobertura`
 * output. This is a merge of real hit-count data, not a reconstruction.
 *
 * Usage:
 *   node scripts/merge-coverage-reports.mjs <rawCoverageDir> <outputDir>
 *
 * <rawCoverageDir> is searched recursively for files named
 * `coverage-final.json`; <outputDir>/cobertura-coverage.xml is written.
 */
import istanbulLibCoverage from "istanbul-lib-coverage";
import istanbulLibReport from "istanbul-lib-report";
import reports from "istanbul-reports";
import { readFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const { createCoverageMap } = istanbulLibCoverage;
const { createContext } = istanbulLibReport;

export function findCoverageFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      found.push(...findCoverageFiles(full));
    } else if (entry === "coverage-final.json") {
      found.push(full);
    }
  }
  return found;
}

export function mergeCoverageFiles(files) {
  const coverageMap = createCoverageMap({});
  for (const file of files) {
    const data = JSON.parse(readFileSync(file, "utf8"));
    coverageMap.merge(data);
  }
  return coverageMap;
}

export function writeCoberturaReport(coverageMap, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const context = createContext({ dir: outputDir, coverageMap });
  reports.create("cobertura", {}).execute(context);
}

export function parseArgs(argv) {
  const [rawCoverageDir, outputDir] = argv;
  if (!rawCoverageDir || !outputDir) {
    return null;
  }
  return { rawCoverageDir, outputDir };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error("Usage: node scripts/merge-coverage-reports.mjs <rawCoverageDir> <outputDir>");
    process.exit(1);
  }

  const files = findCoverageFiles(args.rawCoverageDir);
  if (files.length === 0) {
    console.error(`No coverage-final.json files found under ${args.rawCoverageDir}`);
    process.exit(1);
  }

  const coverageMap = mergeCoverageFiles(files);
  writeCoberturaReport(coverageMap, args.outputDir);

  console.log(
    `Merged ${files.length} coverage report(s) covering ${Object.keys(coverageMap.data).length} file(s) into ${args.outputDir}/cobertura-coverage.xml`,
  );
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("merge-coverage-reports.mjs");
if (invokedDirectly) main();
