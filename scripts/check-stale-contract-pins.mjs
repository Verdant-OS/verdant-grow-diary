#!/usr/bin/env node
/**
 * Find contract-pin tests that statically read a source file you changed.
 *
 * A "contract pin" here is any src/test file that reads another file's raw
 * text (via node:fs readFileSync) and asserts against its literal content —
 * usually a regex over source shape, rather than importing and exercising
 * behavior. That pattern is pervasive in this repo (~800 files at last
 * count) and it has one recurring failure mode: a PR reshapes the source a
 * pin reads, updates the pins it knows about, and misses the others that
 * happen to statically read the same file. Three real instances landed on
 * the deploy branch in a single day (2026-08-07): #809 rewired Coach.tsx and
 * missed two pins in other files; #780 refactored a QuickLog.tsx guard into
 * a pure resolver and missed one; the alert-persistence live-window doctrine
 * in #788 is the same shape, mid-flight. Each one was a REQUIRED check
 * blocking the whole board, discovered only by chasing a red CI run back to
 * pristine trunk.
 *
 * This script maps every contract-pin test to the source file(s) it reads,
 * then reports which pins are worth re-running for a given set of changed
 * source files — so that mapping is available BEFORE a PR merges, not
 * after CI turns trunk red.
 *
 * Detection is deliberately coarse: a test file counts as a "contract-pin
 * reader" of a path if it imports readFileSync from node:fs AND contains
 * that path as a string literal ending in a tracked extension, under a
 * tracked root (src/, supabase/, scripts/, config/). It does not parse call
 * expressions, so it cannot tell a real readFileSync target from an
 * unrelated string that happens to look like one (an error-message fixture,
 * a comment). That trades precision for recall on purpose: a false positive
 * here costs one extra test run; a false negative is exactly the bug this
 * script exists to catch. Treat its output as "worth checking," not as a
 * guarantee that every listed file is truly stale.
 *
 * Safety posture:
 *  - Read-only. Never modifies test files or source files.
 *  - `--run` executes vitest on the affected set and forwards its exit code;
 *    everything else only reads the working tree and (for --base) git.
 *  - Exit 0 on a clean report (or all affected tests passing with --run),
 *    1 on affected-test failures under --run, 2 on tooling error.
 *
 * Usage:
 *   node scripts/check-stale-contract-pins.mjs --base=origin/verdant-grow-diary
 *   node scripts/check-stale-contract-pins.mjs --files=src/pages/Coach.tsx,src/components/QuickLog.tsx
 *   node scripts/check-stale-contract-pins.mjs --base=HEAD~1 --run
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const TEST_DIR = "src/test";
const TEST_FILE_PATTERN = /\.test\.(ts|tsx)$/;
const TRACKED_ROOTS = Object.freeze(["src/", "supabase/", "scripts/", "config/"]);
const TRACKED_EXTENSIONS = Object.freeze([".ts", ".tsx", ".sql", ".mjs", ".cjs", ".json"]);
const READFILESYNC_IMPORT_PATTERN =
  /import\s*\{[^}]*\breadFileSync\b[^}]*\}\s*from\s*["']node:fs["']/;
// Repo-relative path literals in single or double quotes, under a tracked
// root, ending in a tracked extension. Deliberately excludes bare `@/...`
// alias imports (this codebase's own convention — see AGENTS.md), which is
// most of what keeps this from matching every import statement in the file.
const PATH_LITERAL_PATTERN = new RegExp(
  `["'](${TRACKED_ROOTS.map((r) => r.replace("/", "\\/")).join("|")})[\\w\\-./]+(${TRACKED_EXTENSIONS.map((e) => e.replace(".", "\\.")).join("|")})["']`,
  "g",
);

/** Recursively list files under `dir` (repo-relative), filtered by `pattern`. */
function listFilesRecursive(dir, pattern) {
  const out = [];
  const abs = resolve(REPO_ROOT, dir);
  let entries;
  try {
    entries = readdirSync(abs);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const relPath = dir === "" ? entry : `${dir}/${entry}`;
    const absPath = resolve(REPO_ROOT, relPath);
    const st = statSync(absPath);
    if (st.isDirectory()) {
      out.push(...listFilesRecursive(relPath, pattern));
    } else if (pattern.test(entry)) {
      out.push(relPath);
    }
  }
  return out;
}

/**
 * Pure: given one test file's raw text, return the repo-relative source
 * paths it statically references as a contract-pin reader, or [] if the
 * file does not import readFileSync from node:fs at all.
 */
export function extractReferencedSourceFiles(testFileContent, testFilePath) {
  if (!READFILESYNC_IMPORT_PATTERN.test(testFileContent)) return [];
  const found = new Set();
  for (const match of testFileContent.matchAll(PATH_LITERAL_PATTERN)) {
    const path = match[0].slice(1, -1);
    if (path !== testFilePath) found.add(path);
  }
  return [...found].sort();
}

/**
 * Pure: given `{ path, content }` entries for every contract-pin test file,
 * build the source-file -> [test files] index.
 */
export function buildContractPinIndex(testFiles) {
  const bySource = {};
  for (const { path, content } of testFiles) {
    for (const source of extractReferencedSourceFiles(content, path)) {
      (bySource[source] ??= new Set()).add(path);
    }
  }
  return Object.fromEntries(
    Object.entries(bySource).map(([source, tests]) => [source, [...tests].sort()]),
  );
}

/**
 * Pure: given the source->tests index and a list of changed source paths,
 * return `{ affectedTests: string[], bySource: Record<source, tests[]> }`
 * scoped to just the changed files that have any contract-pin reader.
 */
export function findAffectedContractTests(changedFiles, index) {
  const bySource = {};
  const affectedTests = new Set();
  for (const file of changedFiles) {
    const tests = index[file];
    if (!tests || tests.length === 0) continue;
    bySource[file] = tests;
    for (const t of tests) affectedTests.add(t);
  }
  return { affectedTests: [...affectedTests].sort(), bySource };
}

function buildIndexFromDisk() {
  const testPaths = listFilesRecursive(TEST_DIR, TEST_FILE_PATTERN);
  const testFiles = testPaths.map((path) => ({
    path,
    content: readFileSync(resolve(REPO_ROOT, path), "utf8"),
  }));
  return buildContractPinIndex(testFiles);
}

function gitChangedFiles(base) {
  const result = spawnSync("git", ["diff", "--name-only", base], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git diff --name-only ${base} failed: ${result.stderr || result.status}`);
  }
  return result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const args = { run: false };
  for (const arg of argv) {
    if (arg === "--run") args.run = true;
    else if (arg.startsWith("--base=")) args.base = arg.slice("--base=".length);
    else if (arg.startsWith("--files=")) args.files = arg.slice("--files=".length).split(",");
  }
  return args;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const changedFiles = args.files ?? gitChangedFiles(args.base ?? "HEAD~1");
    if (changedFiles.length === 0) {
      process.stdout.write("check-stale-contract-pins: no changed files to check.\n");
      return;
    }

    const index = buildIndexFromDisk();
    const { affectedTests, bySource } = findAffectedContractTests(changedFiles, index);

    if (affectedTests.length === 0) {
      process.stdout.write(
        "check-stale-contract-pins: OK — no contract-pin test statically reads any changed file.\n",
      );
      return;
    }

    process.stdout.write(
      `check-stale-contract-pins: ${affectedTests.length} contract-pin test(s) read a changed file — worth re-running:\n`,
    );
    for (const [source, tests] of Object.entries(bySource)) {
      process.stdout.write(`  ${source}\n`);
      for (const t of tests) process.stdout.write(`    -> ${t}\n`);
    }

    if (!args.run) {
      process.stdout.write(
        `\nRe-run with --run to execute these ${affectedTests.length} test file(s) now.\n`,
      );
      return;
    }

    process.stdout.write(`\nRunning ${affectedTests.length} affected test file(s)...\n`);
    const vitest = spawnSync("bunx", ["vitest", "run", ...affectedTests], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });
    process.exitCode = vitest.status ?? 1;
  } catch (error) {
    process.stderr.write(
      `check-stale-contract-pins: TOOLING ERROR: ${String(error?.message ?? error)}\n`,
    );
    process.exitCode = 2;
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
