#!/usr/bin/env node
/**
 * Re-derives every headline count in docs/audits/test-coverage-audit-2026-08-29.md.
 *
 * The audit claims its numbers are reproducible. Without this script that claim
 * could not be checked, which is the same defect the audit is about: a stated
 * measurement nobody can re-run is not evidence.
 *
 *   node scripts/measure-test-estate.mjs                 # measure HEAD
 *   node scripts/measure-test-estate.mjs --rev 5d6efc9   # measure a pinned revision
 *   node scripts/measure-test-estate.mjs --json
 *
 * EVERY input comes from the git object store at the resolved revision — never
 * from the working tree. That is what makes a published number attributable:
 * the report states the 40-hex commit it measured, and an untracked or modified
 * file cannot change any count. The earlier version mixed `git ls-files` with
 * `readdirSync`, so it silently measured whatever happened to be checked out
 * and could not reproduce a figure pinned to a different commit at all.
 *
 * Read-only. No network, no clock, no randomness.
 *
 * What it deliberately does NOT do: measure line or branch coverage. There is
 * no coverage instrumentation in this repository (audit finding F1), so those
 * remain NOT_MEASURED and this script must never be read as supplying them.
 *
 * The parsing lives in scripts/lib/testEstateRules.mjs and is regression-tested
 * by src/test/measure-test-estate-rules.test.ts.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  buildExecutableCorpus,
  classifyTest,
  namedPathsIn,
  resolveSpec,
  runtimeImportSpecifiers,
} from "./lib/testEstateRules.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
/**
 * Run git with an ARGV ARRAY — never a shell string.
 *
 * `--rev` is attacker-controllable in the general case (a CI job, a wrapper
 * script), and interpolating it into a shell command is command injection:
 * double quotes do not stop `$(…)`, backticks or `\`. `execFileSync` with an
 * argv array spawns git directly, so no shell ever parses the value.
 */
const git = (args, opts = {}) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28, ...opts });
const lines = (s) => s.trim().split("\n").filter(Boolean);

/* ---------- 0. Pin the revision ---------- */
const revArgIndex = process.argv.indexOf("--rev");
const REV_INPUT = revArgIndex !== -1 ? process.argv[revArgIndex + 1] : "HEAD";
if (revArgIndex !== -1 && !REV_INPUT) {
  console.error("--rev needs a revision, e.g. --rev 5d6efc9");
  process.exit(2);
}
let REV;
try {
  // `--` is not accepted by rev-parse before a rev, so guard the one shape
  // that would otherwise be read as a flag rather than a revision.
  if (REV_INPUT.startsWith("-")) throw new Error("not a revision");
  REV = git(["rev-parse", "--verify", `${REV_INPUT}^{commit}`], {
    stdio: ["pipe", "pipe", "ignore"], // git's own "fatal:" would precede our message
  }).trim();
} catch {
  console.error(`--rev: cannot resolve ${REV_INPUT} to a commit in this repository`);
  process.exit(2);
}

/** Every tracked path at REV. */
const treePaths = lines(git(["ls-tree", "-r", "--name-only", REV]));
const tracked = new Set(treePaths);

/**
 * Blob contents at REV, fetched in ONE `git cat-file --batch` pass.
 *
 * Per-file `git show` would be thousands of processes; this is one. Byte
 * offsets are used rather than character offsets because cat-file reports
 * sizes in bytes and the corpus contains multi-byte UTF-8.
 */
function readBlobs(paths) {
  const out = new Map();
  if (paths.length === 0) return out;
  const stdout = git(["cat-file", "--batch"], {
    encoding: "buffer",
    input: Buffer.from(paths.map((p) => `${REV}:${p}`).join("\n") + "\n", "utf8"),
    maxBuffer: 1 << 30,
  });
  let off = 0;
  for (const p of paths) {
    const nl = stdout.indexOf(0x0a, off);
    const header = stdout.subarray(off, nl).toString("utf8");
    const m = header.match(/^([0-9a-f]{40}) (\w+) (\d+)$/);
    if (!m) {
      // "<object> missing" — should not happen for a path from ls-tree.
      off = nl + 1;
      continue;
    }
    const size = Number(m[3]);
    out.set(p, stdout.subarray(nl + 1, nl + 1 + size).toString("utf8"));
    off = nl + 1 + size + 1;
  }
  return out;
}

const IS_TEST = /\.(test|spec)\.(ts|tsx)$/;

const allSrc = treePaths.filter((f) => f.startsWith("src/") && /\.(ts|tsx)$/.test(f));
const tests = allSrc.filter((f) => IS_TEST.test(f));
const product = allSrc.filter((f) => !IS_TEST.test(f) && !f.startsWith("src/test/"));
const productSet = new Set(product);

const srcOf = readBlobs(allSrc);
const body = (f) => srcOf.get(f) ?? "";

/* ---------- 1. Vitest lane: file, case and assertion counts ---------- */
const count = (s, re) => (s.match(re) || []).length;

let callSites = 0;
let expects = 0;
let skipCallSites = 0;
let onlyCallSites = 0;
const scanOnly = [];
let hybrid = 0;
let hybridExpects = 0;
let hybridCases = 0;
let behavioural = 0;
let behaviouralExpects = 0;
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

  if (/readFileSync|readFile\(|globSync|readdirSync/.test(s)) anyFileIo += 1;

  const kind = classifyTest({ source: s, file: t, productSet });
  if (kind === "scan-only") {
    scanOnly.push(t);
    scanOnlyExpects += e;
    scanOnlyCases += c;
    scanOnlySubstring += count(s, /toContain\(/g) + count(s, /toMatch\(/g);
  } else if (kind === "hybrid") {
    hybrid += 1;
    hybridExpects += e;
    hybridCases += c;
  } else {
    behavioural += 1;
    behaviouralExpects += e;
  }
}

/* ---------- 2. Module reachability across the Vitest import graph ---------- */
const edges = new Map();
const depsOf = (f) => {
  if (!edges.has(f)) {
    const out = new Set();
    for (const spec of runtimeImportSpecifiers(body(f))) {
      const r = resolveSpec(spec, f, productSet);
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
      .map((m) => resolveSpec(m[1], t, productSet))
      .filter(Boolean),
  );
  for (const spec of runtimeImportSpecifiers(s)) {
    const r = resolveSpec(spec, t, productSet);
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
const workflowPaths = treePaths.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f));
const workflowBlobs = readBlobs(workflowPaths);
const pkg = JSON.parse(readBlobs(["package.json"]).get("package.json") ?? "{}").scripts ?? {};

const runnerCache = new Map();
const readRunner = (rel) => {
  if (!tracked.has(rel)) return null;
  if (!runnerCache.has(rel)) runnerCache.set(rel, readBlobs([rel]).get(rel) ?? null);
  return runnerCache.get(rel);
};

const corpus = buildExecutableCorpus({
  workflowTexts: workflowPaths.map((f) => workflowBlobs.get(f) ?? ""),
  scripts: pkg,
  readRunner,
});
const namedPaths = namedPathsIn(corpus);

const denoTests = treePaths.filter(
  (f) => f.startsWith("supabase/functions/") && /(\.test\.ts|_test\.ts)$/.test(f),
);
const e2eSpecs = treePaths.filter((f) => /^e2e\/[^/]+\.spec\.ts$/.test(f));
const harnesses = treePaths.filter(
  (f) => /^scripts\/[^/]+$/.test(f) && /harness/.test(f) && /\.(ts|mjs)$/.test(f),
);
const pgtap = treePaths.filter((f) => /^supabase\/tests\/[^/]+\.sql$/.test(f));

/**
 * A lane file is executed when a command names it by full repo-relative path,
 * or by bare basename.
 *
 * Basename matching is needed because runners resolve against their own root:
 * `bunx playwright test agent-integrations-smoke.spec.ts` runs
 * `e2e/agent-integrations-smoke.spec.ts` via playwright.config's
 * `testDir: "./e2e"`. Requiring the prefix reported that spec as never-run
 * while CI executed it on every matching PR.
 *
 * It is only safe because the corpus is now COMMAND LINES ONLY: a basename
 * appearing there is an argument to a runner, not prose in an allowlist.
 *
 * AMBIGUOUS basenames are excluded and must be named in full. Two edge
 * functions both ship a `contract.test.ts`, so a bare token could not say which
 * one ran; resolving it to either would be a fabricated reading.
 */
const laneFiles = [...denoTests, ...e2eSpecs, ...harnesses, ...pgtap];
const basenameCount = new Map();
for (const f of laneFiles) {
  const b = f.slice(f.lastIndexOf("/") + 1);
  basenameCount.set(b, (basenameCount.get(b) ?? 0) + 1);
}
const laneExecuted = (f) => {
  if (namedPaths.has(f)) return true;
  const b = f.slice(f.lastIndexOf("/") + 1);
  return basenameCount.get(b) === 1 && namedPaths.has(b);
};

const lane = (label, files) => {
  const never = files.filter((f) => !laneExecuted(f));
  return {
    label,
    total: files.length,
    executed: files.length - never.length,
    never: never.length,
    neverFiles: never,
  };
};

const lanes = [
  lane("deno edge tests", denoTests),
  lane("playwright specs", e2eSpecs),
  lane("runtime harnesses", harnesses),
  lane("pgTAP suites", pgtap),
];

const pct = (n, d) => `${((n / d) * 100).toFixed(1)}%`;
const report = {
  revision: REV,
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
    hybridExpects,
    hybridCases,
    behaviouralFiles: behavioural,
    behaviouralExpects,
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
  console.log(`Measured at revision ${report.revision}`);
  console.log("\nVitest lane");
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
  console.log(`  hybrid expects / cases         ${v.hybridExpects} / ${v.hybridCases}`);
  console.log(`  behavioural expects            ${v.behaviouralExpects}`);
  console.log(
    `  files doing any file I/O       ${v.filesDoingFileIo}  (${pct(v.filesDoingFileIo, v.testFiles)})`,
  );
  console.log("\nModule reachability (runtime edges only; `import type` is erased and excluded)");
  console.log(`  directly imported by a test    ${report.reachability.direct}`);
  console.log(`  transitively reached only      ${report.reachability.transitiveOnly}`);
  console.log(`  unreached                      ${report.reachability.unreached}`);
  console.log("\nTest files a workflow actually executes (run: command lines only)");
  for (const l of report.lanes) {
    console.log(
      `  ${l.label.padEnd(20)} total ${String(l.total).padStart(3)}  executed ${String(l.executed).padStart(3)}  NEVER ${String(l.never).padStart(3)}`,
    );
  }
  console.log(`\nTest files across all four lanes  ${report.testFilesAcrossAllLanes}`);
}
