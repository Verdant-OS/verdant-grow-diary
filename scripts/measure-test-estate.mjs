#!/usr/bin/env node
/**
 * Re-derives every headline count in docs/audits/test-coverage-audit-2026-08-29.md.
 *
 * The audit claims its numbers are reproducible. Without this script that claim
 * could not be checked, which is the same defect the audit is about: a stated
 * measurement nobody can re-run is not evidence. Run it and compare:
 *
 *   node scripts/measure-test-estate.mjs
 *   node scripts/measure-test-estate.mjs --json
 *
 * Read-only. No network, no clock, no randomness. It shells out to `git ls-files`
 * so it measures TRACKED files only — an untracked scratch test never inflates a count.
 *
 * What it deliberately does NOT do: measure line or branch coverage. There is no
 * coverage instrumentation in this repository (audit finding F1), so those remain
 * NOT_MEASURED and this script must never be read as supplying them.
 */
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
const lines = (s) => s.trim().split("\n").filter(Boolean);
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

const IS_TEST = /\.(test|spec)\.(ts|tsx)$/;
const SCANS = /readFileSync|readFile\(|globSync|readdirSync/;
const IMPORTS_PRODUCT = /(?:from|import\()\s*["']@\/(?!test\/)/;
const RENDERS = /\brender\s*\(/;

const allSrc = lines(sh("git ls-files 'src/**'")).filter((f) => /\.(ts|tsx)$/.test(f));
const tests = allSrc.filter((f) => IS_TEST.test(f));
const product = allSrc.filter((f) => !IS_TEST.test(f) && !f.startsWith("src/test/"));

/* ---------- 1. Vitest lane: file, case and assertion counts ---------- */
const srcOf = new Map();
const body = (f) => {
  if (!srcOf.has(f)) srcOf.set(f, read(f));
  return srcOf.get(f);
};
const count = (s, re) => (s.match(re) || []).length;

let callSites = 0;
let expects = 0;
let skipCallSites = 0;
let onlyCallSites = 0;
const scanOnly = [];
let hybrid = 0;
let behavioural = 0;
let anyFileIo = 0;
let scanOnlyExpects = 0;
let scanOnlyCases = 0;
let scanOnlySubstring = 0;

for (const t of tests) {
  const s = body(t);
  const e = count(s, /\bexpect\(/g);
  const c = count(s, /\bit\(|\btest\(/g);
  expects += e;
  callSites += c;
  skipCallSites += count(s, /\b(it|test|describe)\.skip\(/g);
  onlyCallSites += count(s, /\b(it|test|describe)\.only\(/g);

  const scans = SCANS.test(s);
  if (scans) anyFileIo += 1;
  if (scans && !IMPORTS_PRODUCT.test(s) && !RENDERS.test(s)) {
    scanOnly.push(t);
    scanOnlyExpects += e;
    scanOnlyCases += c;
    scanOnlySubstring += count(s, /toContain\(/g) + count(s, /toMatch\(/g);
  } else if (scans) hybrid += 1;
  else behavioural += 1;
}

/* ---------- 2. Module reachability across the Vitest import graph ---------- */
const productSet = new Set(product);
const resolveSpec = (spec, from) => {
  let base;
  if (spec.startsWith("@/")) base = "src/" + spec.slice(2);
  else if (spec.startsWith("."))
    base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (productSet.has(c)) return c;
  }
  return null;
};
const edges = new Map();
const depsOf = (f) => {
  if (!edges.has(f)) {
    const out = new Set();
    for (const m of body(f).matchAll(/(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g)) {
      const r = resolveSpec(m[1], f);
      if (r) out.add(r);
    }
    edges.set(f, out);
  }
  return edges.get(f);
};

const direct = new Set();
for (const t of tests) {
  const s = body(t);
  const mocked = new Set(
    [...s.matchAll(/vi\.mock\(\s*["']([^"']+)["']/g)]
      .map((m) => resolveSpec(m[1], t))
      .filter(Boolean),
  );
  for (const m of s.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
    const r = resolveSpec(m[1], t);
    if (r && !mocked.has(r)) direct.add(r);
  }
}
const reached = new Set(direct);
const stack = [...direct];
while (stack.length) {
  for (const d of depsOf(stack.pop())) if (!reached.has(d)) (reached.add(d), stack.push(d));
}
const transitive = [...reached].filter((f) => !direct.has(f)).length;
const unreached = product.filter((f) => !reached.has(f));

/* ---------- 3. Which test files any workflow actually executes ---------- */
/**
 * Resolving "does any workflow run this file?" is easy to get wrong in BOTH
 * directions, and the first version of this script got it wrong in both. The
 * three defects, each found by checking a specific file by hand:
 *
 *   FALSE-LIVE  A spec named only inside a workflow's `on: ... paths:` filter
 *               was counted as executed. A trigger filter decides WHEN a
 *               workflow runs, never WHAT it runs. Two pheno specs were
 *               miscounted this way.
 *   FALSE-DEAD  `bun --env-file=.env run e2e:one-tent:ui` did not match a
 *               script-expansion regex that required `run` to follow the
 *               runner immediately, so quicklog-smoke.yml's execution of
 *               e2e/one-tent-loop-golden-path-ui.spec.ts was invisible.
 *   FALSE-DEAD  A workflow that runs `bun run scripts/e2e/<runner>.mjs` hides
 *               the spec list inside that runner. Three pheno-disabled-compare
 *               specs were miscounted this way.
 *
 * So: strip the trigger block, expand script chains tolerating flags, follow
 * one hop into repo runner scripts, and match on EXACT repo-relative path
 * equality. Exactness is not fussiness — a prototype that accepted directory
 * and glob tokens reported all 100 lane files as reached, because a bare `**`
 * token appears somewhere in the corpus. A guard that can never fail is worse
 * than no guard.
 */
const pkg = JSON.parse(read("package.json")).scripts ?? {};

const RUNNERS = new Set(["bun", "bunx", "npm", "yarn", "pnpm"]);
const SCRIPT_NAME = /^[A-Za-z0-9:_-]+$/;

/**
 * Package-script names a command text invokes: `bun run x`, and also
 * `bun --env-file=.env run x`, where flags sit between the runner and `run`.
 *
 * Tokenised, not matched with one regex. The regex form of this needed a
 * nested quantifier over the flag run — `(?:\s+--?[^\s]+)*` — which CodeQL
 * correctly flagged as exponential backtracking (alert 254, high). It is not
 * theoretical: on `"bun -" + "-! -".repeat(n)` the match time grew 3.8ms ->
 * 14.8 -> 66.2 -> 262.6 as n went 18 -> 24, i.e. 4x per 2 repetitions, on an
 * input of 101 characters. The ambiguity is `--?` against `[^\s]+`, which can
 * split a dash run two ways per token. Scanning tokens is linear and says what
 * it means.
 *
 * Only tokens that START WITH A DASH are skipped, so `bunx vitest run <file>`
 * is correctly NOT read as a package script — `vitest` is not a flag, and that
 * `run` belongs to vitest.
 */
function scriptNamesIn(text) {
  const names = [];
  const tokens = text.split(/\s+/);
  for (let i = 0; i < tokens.length; i += 1) {
    if (!RUNNERS.has(tokens[i])) continue;
    let j = i + 1;
    while (j < tokens.length && tokens[j].startsWith("-")) j += 1;
    if (tokens[j] !== "run") continue;
    const name = tokens[j + 1];
    if (name && SCRIPT_NAME.test(name)) names.push(name);
  }
  return names;
}

const expandScript = (name, depth = 0, seen = new Set()) => {
  if (depth > 8 || !pkg[name] || seen.has(name)) return "";
  seen.add(name);
  let out = pkg[name];
  for (const called of scriptNamesIn(pkg[name])) {
    out += ` ${expandScript(called, depth + 1, seen)}`;
  }
  return out;
};

/**
 * Remove the top-level `on:` block. GitHub workflow YAML puts top-level keys at
 * column 0, so the block runs until the next column-0 key. Textual rather than a
 * YAML parse so this stays dependency-free: js-yaml is only a transitive dep here.
 */
function stripTriggerBlock(text) {
  const lines = text.split("\n");
  const out = [];
  let inTrigger = false;
  for (const line of lines) {
    if (/^on:/.test(line)) {
      inTrigger = true;
      continue;
    }
    if (inTrigger && /^[^\s#]/.test(line)) inTrigger = false;
    if (!inTrigger) out.push(line);
  }
  return out.join("\n");
}

/** A repo runner script a workflow may delegate to. Never follow a test file. */
const RUNNER = /(?:^|[\s"'`])((?:scripts|e2e|tools)\/[A-Za-z0-9_./-]+\.(?:mjs|cjs|js|ts))/g;
const IS_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

let corpus = "";
for (const f of readdirSync(path.join(ROOT, ".github/workflows"))) {
  corpus += ` ${stripTriggerBlock(read(`.github/workflows/${f}`))}`;
}
// Expand package.json script chains named anywhere in the workflow bodies.
for (const called of scriptNamesIn(corpus)) {
  corpus += ` ${expandScript(called)}`;
}
// One hop: a workflow (or an expanded script) that delegates to a repo runner
// hides its file list inside that runner.
const followed = new Set();
for (const m of corpus.matchAll(new RegExp(RUNNER.source, "g"))) {
  const rel = m[1];
  if (followed.has(rel) || IS_TEST_FILE.test(rel)) continue;
  followed.add(rel);
  try {
    corpus += ` ${read(rel)}`;
  } catch {
    /* referenced but absent: nothing to add */
  }
}

/** Exact repo-relative path tokens the corpus actually names. */
const namedPaths = new Set(
  [...corpus.matchAll(/[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:ts|tsx|mjs|cjs|js|sql)/g)].map((m) => m[0]),
);

const lane = (label, files) => {
  const never = files.filter((f) => !namedPaths.has(f));
  return {
    label,
    total: files.length,
    executed: files.length - never.length,
    never: never.length,
    neverFiles: never,
  };
};

const denoTests = lines(sh("git ls-files 'supabase/functions/**'")).filter((f) =>
  /(\.test\.ts|_test\.ts)$/.test(f),
);
const e2eSpecs = lines(sh("git ls-files 'e2e/*.spec.ts'"));
const harnesses = readdirSync(path.join(ROOT, "scripts"))
  .filter((f) => /harness/.test(f) && /\.(ts|mjs)$/.test(f))
  .map((f) => `scripts/${f}`);
const pgtap = lines(sh("git ls-files 'supabase/tests/*.sql'"));

const lanes = [
  lane("deno edge tests", denoTests),
  lane("playwright specs", e2eSpecs),
  lane("runtime harnesses", harnesses),
  lane("pgTAP suites", pgtap),
];

const pct = (n, d) => `${((n / d) * 100).toFixed(1)}%`;
const report = {
  vitest: {
    testFiles: tests.length,
    productModules: product.length,
    itTestCallSites: callSites,
    expectCallSites: expects,
    skipCallSites,
    onlyCallSites,
    scanOnlyFiles: scanOnly.length,
    scanOnlyExpects,
    scanOnlyCases,
    scanOnlySubstringAssertions: scanOnlySubstring,
    hybridFiles: hybrid,
    behaviouralFiles: behavioural,
    filesDoingFileIo: anyFileIo,
  },
  reachability: {
    direct: direct.size,
    transitiveOnly: transitive,
    unreached: unreached.length,
    unreachedFiles: unreached,
  },
  lanes: lanes.map(({ label, total, executed, never }) => ({ label, total, executed, never })),
  neverExecuted: Object.fromEntries(lanes.map((l) => [l.label, l.neverFiles])),
  testFilesAcrossAllLanes: tests.length + denoTests.length + e2eSpecs.length + pgtap.length,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const v = report.vitest;
  console.log("Vitest lane");
  console.log(`  test files                     ${v.testFiles}`);
  console.log(`  product modules                ${v.productModules}`);
  console.log(
    `  it()/test() call sites         ${v.itTestCallSites}   (NOT executed cases - see the audit's limit 4)`,
  );
  console.log(`  expect() call sites            ${v.expectCallSites}`);
  console.log(`  .skip / .only call sites       ${v.skipCallSites} / ${v.onlyCallSites}`);
  console.log(
    `  scan-only files                ${v.scanOnlyFiles}  (${pct(v.scanOnlyFiles, v.testFiles)} of test files)`,
  );
  console.log(
    `  their expect() call sites      ${v.scanOnlyExpects}  (${pct(v.scanOnlyExpects, v.expectCallSites)} of all assertions)`,
  );
  console.log(
    `  of those, toContain/toMatch    ${v.scanOnlySubstringAssertions}  (${pct(v.scanOnlySubstringAssertions, v.scanOnlyExpects)} of the bucket, ${pct(v.scanOnlySubstringAssertions, v.expectCallSites)} of all assertions)`,
  );
  console.log(`  hybrid / behavioural files     ${v.hybridFiles} / ${v.behaviouralFiles}`);
  console.log(
    `  files doing any file I/O       ${v.filesDoingFileIo}  (${pct(v.filesDoingFileIo, v.testFiles)})`,
  );
  console.log("\nModule reachability (Vitest import graph only - Playwright is not in it)");
  console.log(`  directly imported by a test    ${report.reachability.direct}`);
  console.log(`  transitively reached only      ${report.reachability.transitiveOnly}`);
  console.log(`  unreached                      ${report.reachability.unreached}`);
  console.log("\nTest files a workflow actually executes");
  for (const l of report.lanes) {
    console.log(
      `  ${l.label.padEnd(20)} total ${String(l.total).padStart(3)}  executed ${String(l.executed).padStart(3)}  NEVER ${String(l.never).padStart(3)}`,
    );
  }
  console.log(`\nTest files across all four lanes  ${report.testFilesAcrossAllLanes}`);
}
