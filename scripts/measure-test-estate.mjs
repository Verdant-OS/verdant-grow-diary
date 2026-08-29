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
const pkg = JSON.parse(read("package.json")).scripts ?? {};
const RUN = /(?:bun|bunx|npm|yarn|pnpm)\s+run\s+([A-Za-z0-9:_-]+)/g;
const expand = (name, depth = 0) => {
  if (depth > 8 || !pkg[name]) return "";
  let out = pkg[name];
  for (const m of pkg[name].matchAll(new RegExp(RUN.source, "g")))
    out += ` ${expand(m[1], depth + 1)}`;
  return out;
};
let corpus = "";
for (const f of readdirSync(path.join(ROOT, ".github/workflows"))) {
  const s = read(`.github/workflows/${f}`);
  corpus += s;
  for (const m of s.matchAll(new RegExp(RUN.source, "g"))) corpus += ` ${expand(m[1])}`;
}
const lane = (label, files) => {
  const run = files.filter((f) => corpus.includes(f));
  return {
    label,
    total: files.length,
    executed: run.length,
    never: files.length - run.length,
    neverFiles: files.filter((f) => !corpus.includes(f)),
  };
};

const denoTests = lines(sh("git ls-files 'supabase/functions/**'")).filter((f) =>
  /(\.test\.ts|_test\.ts)$/.test(f),
);
const e2eSpecs = readdirSync(path.join(ROOT, "e2e")).filter((f) => f.endsWith(".spec.ts"));
const harnesses = readdirSync(path.join(ROOT, "scripts")).filter(
  (f) => /harness/.test(f) && /\.(ts|mjs)$/.test(f),
);
const pgtap = readdirSync(path.join(ROOT, "supabase/tests")).filter((f) => f.endsWith(".sql"));

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
