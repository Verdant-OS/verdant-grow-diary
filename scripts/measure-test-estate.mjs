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
  bucketOf,
  buildExecutableCorpus,
  countCallSites,
  mockReplacedSpecifiers,
  namedPathsIn,
  reachableClosure,
  resolveSpec,
  runtimeImportSpecifiers,
  testFileReach,
  testFileRuntimeSpecifiers,
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
// `.d.ts` files are erased by the transpiler and can never be a runtime import
// edge, so counting them as product modules puts two permanently-unreachable
// files in the denominator and in the unreached list.
const product = allSrc.filter(
  (f) => !IS_TEST.test(f) && !f.startsWith("src/test/") && !f.endsWith(".d.ts"),
);
const productSet = new Set(product);
// Test helpers are not product modules, but a test reaches product code and
// does file I/O THROUGH them, so classification has to walk them. See defect 25.
const helperSet = new Set(
  allSrc.filter((f) => !IS_TEST.test(f) && f.startsWith("src/test/") && !f.endsWith(".d.ts")),
);

/**
 * Modules whose import means a test EXECUTES repository code.
 *
 * Wider than `productSet` on purpose. Reachability answers "which `src/` module
 * does a test load", so its denominator stays `src/`-only. Classification
 * answers "does this test run repository code at all", and `scripts/` and
 * `supabase/functions/` are repository code — an edge function is product code
 * that happens not to live in `src/`. Building this from `src/` alone filed 57
 * tests that import and run those modules as scan-only. See defect 28.
 */
const OUTSIDE_SRC_ROOTS = ["scripts/", "supabase/functions/"];
const executableSet = new Set([
  ...product,
  ...treePaths.filter(
    (f) =>
      OUTSIDE_SRC_ROOTS.some((r) => f.startsWith(r)) &&
      /\.(ts|tsx|mjs|cjs|js)$/.test(f) &&
      !IS_TEST.test(f) &&
      !f.endsWith(".d.ts"),
  ),
]);

const srcOf = readBlobs(allSrc);
const body = (f) => srcOf.get(f) ?? "";

/* ---------- 1. Vitest lane: file, case and assertion counts ---------- */
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
let readsContent = 0;
let readsSrc = 0;
let scanOnlyExpects = 0;
let scanOnlyCases = 0;
let scanOnlySubstring = 0;

for (const t of tests) {
  const s = body(t);
  // Every count below is of CALLS, parsed. Matching these by text invented 870
  // case sites (`/re/.test(x)` reads as `test(`) and 18 assertions (`expect(`
  // inside a string), and missed 731 real `it.skip` / `it.each` case sites.
  const n = countCallSites(s, t);
  const e = n.expects;
  const c = n.cases;
  expects += e;
  callSites += c;
  skipCallSites += n.skips;
  onlyCallSites += n.onlys;

  // ONE walk per test: the same reach answers I/O, src-path reads and bucket.
  const reach = testFileReach({ source: s, file: t, executableSet, helperSet, sourceOf: body });
  if (reach.scans) readsContent += 1;
  if (reach.readsSrc) readsSrc += 1;

  const kind = bucketOf(reach);
  if (kind === "scan-only") {
    scanOnly.push(t);
    scanOnlyExpects += e;
    scanOnlyCases += c;
    scanOnlySubstring += n.substringAssertions;
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
    for (const spec of runtimeImportSpecifiers(body(f), f)) {
      const r = resolveSpec(spec, f, productSet);
      if (r) out.add(r);
    }
    edges.set(f, out);
  }
  return edges.get(f);
};

/**
 * Reachability is walked PER TEST, with that test's replaced modules blocked at
 * every depth, and the results unioned.
 *
 * `vi.mock` is hoisted and applies to the whole module graph of its test file,
 * so a module the test reaches only THROUGH a component is replaced too. One
 * context-free walk over the union of all seeds discards that: four Plant Detail
 * tests factory-mock `@/hooks/useLogAiDoctorReadinessToDiary` and their
 * components import it, so a global walk added it straight back. Blocking at the
 * seeds alone is not enough — the block has to survive the traversal.
 *
 * Unioning per-test results keeps a module reached when ANY test loads it for
 * real, which is the question the figure answers.
 */
const closure = (seeds, blocked) => reachableClosure({ seeds, blocked, depsOf });

const direct = new Set();
const reached = new Set();
// Tests that replace nothing all share one unblocked walk: with no blocking, the
// closure of a union equals the union of the closures, so this is exactly
// equivalent to walking each of them separately, and vastly cheaper.
const unblockedSeeds = new Set();

for (const t of tests) {
  const s = body(t);
  // Vitest mock semantics live in the rules module, not here, so the figure the
  // script emits cannot drift from the method the audit publishes.
  const seeds = [];
  for (const spec of testFileRuntimeSpecifiers(s, t)) {
    const r = resolveSpec(spec, t, productSet);
    if (r) (direct.add(r), seeds.push(r));
  }
  const blocked = new Set(
    mockReplacedSpecifiers(s, t)
      .map((spec) => resolveSpec(spec, t, productSet))
      .filter(Boolean),
  );
  if (blocked.size === 0) {
    for (const r of seeds) unblockedSeeds.add(r);
    continue;
  }
  for (const m of closure(seeds, blocked)) reached.add(m);
}
for (const m of closure(unblockedSeeds, new Set())) reached.add(m);

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
    filesReadingFileContent: readsContent,
    filesReadingSrcPaths: readsSrc,
  },
  reachability: {
    direct: direct.size,
    transitiveOnly: transitive,
    unreached: unreached.length,
    unreachedFiles: unreached,
  },
  lanes: lanes.map(({ label, total, executed, never }) => ({ label, total, executed, never })),
  neverExecuted: Object.fromEntries(lanes.map((l) => [l.label, l.neverFiles])),
  // The four TEST-FILE lanes only. Runtime harnesses are a fifth lane, counted
  // in `lanes` but deliberately not here — they are scripts, not test files.
  testFilesAcrossFourTestLanes: tests.length + denoTests.length + e2eSpecs.length + pgtap.length,
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
  // Bare `expect(...)` calls only. Assertion-bearing utilities invoked as a
  // PROPERTY of expect — `expect.fail(…)`, `expect.unreachable(…)` — are not
  // counted; there are 14 at the pinned revision. See the audit's §9.0 defect 26.
  console.log(`  expect() call sites            ${v.expectCallSites}`);
  console.log(`  .skip / .only call sites       ${v.skipCallSites} / ${v.onlyCallSites}`);
  console.log(
    `  scan-only files                ${v.scanOnlyFiles}  (${pct(v.scanOnlyFiles, v.testFiles)} of test files)`,
  );
  console.log(
    `  their expect() call sites      ${v.scanOnlyExpects}  (${pct(v.scanOnlyExpects, v.expectCallSites)} of bare expect() calls)`,
  );
  console.log(
    `  of those, toContain/toMatch    ${v.scanOnlySubstringAssertions}  (${pct(v.scanOnlySubstringAssertions, v.scanOnlyExpects)} of the bucket, ${pct(v.scanOnlySubstringAssertions, v.expectCallSites)} of bare expect() calls)`,
  );
  console.log(`  hybrid / behavioural files     ${v.hybridFiles} / ${v.behaviouralFiles}`);
  console.log(`  hybrid expects / cases         ${v.hybridExpects} / ${v.hybridCases}`);
  console.log(`  behavioural expects            ${v.behaviouralExpects}`);
  console.log(
    `  files reading file content     ${v.filesReadingFileContent}  (${pct(v.filesReadingFileContent, v.testFiles)})`,
  );
  console.log(`  files reading a src/ path      ${v.filesReadingSrcPaths}`);
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
  console.log(`\nTest files across the four test lanes  ${report.testFilesAcrossFourTestLanes}`);
  console.log(
    `  (runtime harnesses are a fifth lane, ${report.lanes[2].total} scripts, counted above)`,
  );
}
