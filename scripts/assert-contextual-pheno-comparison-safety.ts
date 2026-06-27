#!/usr/bin/env bun
/**
 * assert-contextual-pheno-comparison-safety
 *
 * Changed-file static safety scan for Contextual Pheno Comparison v0.
 * Runs under Bun so it can import the shared TS scanner utility.
 *
 * Modes:
 *   --changed           Read changed files from `git diff` against the
 *                       base ref (defaults to origin/main).
 *   --files <list>      Comma- or newline-separated explicit file list.
 *   --stdin             Read newline-separated file list from STDIN.
 *
 * Exits 0 when no findings (including the no-relevant-files case).
 * Exits 1 when findings are produced. On failure prints:
 *   - grouped local report
 *   - GitHub Actions ::error annotations (when GITHUB_ACTIONS=true)
 *   - compact JSON diagnostics line prefixed with "JSON_DIAGNOSTICS: "
 *
 * Read-only. No network. No model calls. No deploys.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  filterChangedContextualPhenoFiles,
  scanChangedFiles,
  formatLocalReport,
  formatGithubAnnotations,
  formatFindingsJson,
} from "../src/test/utils/contextualPhenoComparisonStaticSafety.ts";

function parseArgs(argv: string[]) {
  const args = {
    mode: "changed" as "changed" | "stdin" | "files",
    files: [] as string[],
    baseRef: process.env.GITHUB_BASE_REF
      ? `origin/${process.env.GITHUB_BASE_REF}`
      : "origin/main",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--changed") args.mode = "changed";
    else if (a === "--stdin") args.mode = "stdin";
    else if (a === "--files") {
      args.mode = "files";
      const list = argv[++i] ?? "";
      args.files = list
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === "--base") {
      args.baseRef = argv[++i] ?? args.baseRef;
    }
  }
  return args;
}

function getChangedFromGit(baseRef: string): string[] {
  const candidates = [
    `git diff --name-only ${baseRef}...HEAD`,
    `git diff --name-only ${baseRef} HEAD`,
    `git diff --name-only HEAD~1 HEAD`,
  ];
  for (const cmd of candidates) {
    try {
      const out = execSync(cmd, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return out.split("\n").map((s) => s.trim()).filter(Boolean);
    } catch {
      // try next candidate
    }
  }
  return [];
}

function readStdin(): string[] {
  try {
    const buf = readFileSync(0, "utf8");
    return buf.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const args = parseArgs(process.argv.slice(2));
let changed: string[];
if (args.mode === "files") changed = args.files;
else if (args.mode === "stdin") changed = readStdin();
else changed = getChangedFromGit(args.baseRef);

const relevant = filterChangedContextualPhenoFiles(changed);
if (relevant.length === 0) {
  console.log("No Contextual Pheno Comparison files changed.");
  process.exit(0);
}

console.log(
  `Scanning ${relevant.length} changed Contextual Pheno Comparison file(s):`,
);
for (const p of relevant) console.log(`  - ${p}`);

const findings = scanChangedFiles(changed);
if (findings.length === 0) {
  console.log(
    "Contextual Pheno Comparison static safety: PASS (changed-file mode).",
  );
  process.exit(0);
}

console.error(formatLocalReport(findings));
if (process.env.GITHUB_ACTIONS === "true") {
  console.log(formatGithubAnnotations(findings));
}
console.log(`JSON_DIAGNOSTICS: ${formatFindingsJson(findings)}`);
process.exit(1);
