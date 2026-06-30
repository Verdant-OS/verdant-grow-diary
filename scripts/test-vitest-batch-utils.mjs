#!/usr/bin/env node
// Tests for scripts/vitest-batch-utils.mjs using Node's built-in assert.
import { strict as assert } from "node:assert";
import {
  sortTestFiles,
  splitIntoBatches,
  selectBatch,
  parseBatchArgs,
  chunkArray,
  BATCH_STRATEGIES,
  VITEST_POOLS,
} from "./vitest-batch-utils.mjs";

let passed = 0;
let failed = 0;
function t(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    failed++;
  }
}

console.log("vitest-batch-utils");

t("sortTestFiles: deterministic ascending sort", () => {
  assert.deepEqual(sortTestFiles(["b", "a", "c"]), ["a", "b", "c"]);
  // Stable across calls
  assert.deepEqual(
    sortTestFiles(["src/test/z.test.ts", "src/test/a.test.ts"]),
    ["src/test/a.test.ts", "src/test/z.test.ts"],
  );
});

t("sortTestFiles: rejects non-array", () => {
  assert.throws(() => sortTestFiles(null), TypeError);
});

t("splitIntoBatches: even split", () => {
  const r = splitIntoBatches(["a", "b", "c", "d"], 2);
  assert.deepEqual(r, [["a", "b"], ["c", "d"]]);
});

t("splitIntoBatches: even-ish split, earlier batches get extras", () => {
  const r = splitIntoBatches(["a", "b", "c", "d", "e"], 3);
  assert.deepEqual(r, [["a", "b"], ["c", "d"], ["e"]]);
  // total preserved
  assert.equal(r.flat().length, 5);
});

t("splitIntoBatches: more batches than files clamps to file count", () => {
  const r = splitIntoBatches(["a", "b"], 8);
  assert.deepEqual(r, [["a"], ["b"]]);
});

t("splitIntoBatches: invalid batches throws", () => {
  assert.throws(() => splitIntoBatches(["a"], 0), RangeError);
  assert.throws(() => splitIntoBatches(["a"], -1), RangeError);
  assert.throws(() => splitIntoBatches(["a"], 1.5), RangeError);
});

t("splitIntoBatches: empty file list throws clearly", () => {
  assert.throws(() => splitIntoBatches([], 4), /no test files/i);
});

// ---- Strategy: explicit "contiguous" stays backward compatible ----

t("splitIntoBatches: explicit contiguous == default (backward compatible)", () => {
  const files = ["a", "b", "c", "d", "e"];
  assert.deepEqual(
    splitIntoBatches(files, 3, "contiguous"),
    splitIntoBatches(files, 3),
  );
});

t("BATCH_STRATEGIES: exposes the supported strategies", () => {
  assert.deepEqual([...BATCH_STRATEGIES], ["contiguous", "round-robin"]);
});

// ---- Strategy: round-robin ----

t("splitIntoBatches: round-robin distributes by index modulo N", () => {
  // a(0)->0, b(1)->1, c(2)->0, d(3)->1, e(4)->0
  const r = splitIntoBatches(["a", "b", "c", "d", "e"], 2, "round-robin");
  assert.deepEqual(r, [["a", "c", "e"], ["b", "d"]]);
  // total preserved, nothing dropped or duplicated
  assert.equal(r.flat().length, 5);
});

t("splitIntoBatches: round-robin spreads adjacent sorted files across batches", () => {
  // Simulates the clustered `ecowitt-*` case: adjacent sorted names must NOT
  // land in the same batch.
  const files = [
    "ecowitt-a.test.tsx",
    "ecowitt-b.test.tsx",
    "ecowitt-c.test.tsx",
    "ecowitt-d.test.tsx",
  ];
  const r = splitIntoBatches(files, 4, "round-robin");
  assert.deepEqual(r, [
    ["ecowitt-a.test.tsx"],
    ["ecowitt-b.test.tsx"],
    ["ecowitt-c.test.tsx"],
    ["ecowitt-d.test.tsx"],
  ]);
  // Adjacent files end up in different batches (the whole point).
  const batchOf = (name) => r.findIndex((b) => b.includes(name));
  assert.notEqual(batchOf("ecowitt-a.test.tsx"), batchOf("ecowitt-b.test.tsx"));
});

t("splitIntoBatches: round-robin is deterministic across calls", () => {
  const files = ["a", "b", "c", "d", "e", "f", "g"];
  const r1 = splitIntoBatches(files, 3, "round-robin");
  const r2 = splitIntoBatches(files, 3, "round-robin");
  assert.deepEqual(r1, r2);
  // Each batch internally ascending (dealt from a sorted list in order).
  for (const b of r1) {
    assert.deepEqual(b, [...b].sort((a, z) => (a < z ? -1 : a > z ? 1 : 0)));
  }
});

t("splitIntoBatches: round-robin clamps when more batches than files", () => {
  const r = splitIntoBatches(["a", "b"], 8, "round-robin");
  assert.deepEqual(r, [["a"], ["b"]]);
});

t("splitIntoBatches: unknown strategy fails safely (RangeError)", () => {
  assert.throws(() => splitIntoBatches(["a", "b"], 2, "bogus"), RangeError);
});

t("selectBatch: picks correct slice (contiguous)", () => {
  const files = ["a", "b", "c", "d", "e"];
  assert.deepEqual(selectBatch(files, 3, 0), ["a", "b"]);
  assert.deepEqual(selectBatch(files, 3, 1), ["c", "d"]);
  assert.deepEqual(selectBatch(files, 3, 2), ["e"]);
});

t("selectBatch: --batch=I --batches=N --strategy=round-robin selects intended batch", () => {
  const files = ["a", "b", "c", "d", "e"];
  // round-robin with N=2: batch 0 = a,c,e ; batch 1 = b,d
  assert.deepEqual(selectBatch(files, 2, 0, "round-robin"), ["a", "c", "e"]);
  assert.deepEqual(selectBatch(files, 2, 1, "round-robin"), ["b", "d"]);
});

t("selectBatch: out-of-range throws", () => {
  assert.throws(() => selectBatch(["a", "b"], 2, 5), RangeError);
  assert.throws(() => selectBatch(["a"], 1, -1), RangeError);
});

t("parseBatchArgs: defaults", () => {
  const o = parseBatchArgs([]);
  assert.equal(o.batches, 8);
  assert.equal(o.batch, null);
  assert.equal(o.reporter, "dot");
  assert.equal(o.continueOnFail, false);
  assert.equal(o.strategy, "contiguous");
});

t("parseBatchArgs: parses flags", () => {
  const o = parseBatchArgs([
    "--batches=4",
    "--batch=2",
    "--reporter=verbose",
    "--continue-on-fail",
  ]);
  assert.equal(o.batches, 4);
  assert.equal(o.batch, 2);
  assert.equal(o.reporter, "verbose");
  assert.equal(o.continueOnFail, true);
});

t("parseBatchArgs: parses --strategy=round-robin", () => {
  assert.equal(parseBatchArgs(["--strategy=round-robin"]).strategy, "round-robin");
  assert.equal(parseBatchArgs(["--strategy=contiguous"]).strategy, "contiguous");
});

t("parseBatchArgs: rejects invalid --strategy", () => {
  assert.throws(() => parseBatchArgs(["--strategy=bogus"]), RangeError);
});

t("parseBatchArgs: rejects bad --batches", () => {
  assert.throws(() => parseBatchArgs(["--batches=0"]), RangeError);
  assert.throws(() => parseBatchArgs(["--batches=abc"]), RangeError);
});

t("parseBatchArgs: rejects bad --batch", () => {
  assert.throws(() => parseBatchArgs(["--batch=-1"]), RangeError);
});

// ---- Worker isolation: chunking + --chunk-size / --isolate / --pool ----

t("chunkArray: splits into fixed-size chunks (last may be short)", () => {
  assert.deepEqual(chunkArray(["a", "b", "c", "d", "e"], 2), [
    ["a", "b"],
    ["c", "d"],
    ["e"],
  ]);
  // exact multiple
  assert.deepEqual(chunkArray(["a", "b", "c", "d"], 2), [
    ["a", "b"],
    ["c", "d"],
  ]);
  // size larger than input → single chunk; nothing lost
  assert.deepEqual(chunkArray(["a", "b"], 20), [["a", "b"]]);
  assert.equal(chunkArray(["a", "b", "c", "d", "e"], 2).flat().length, 5);
});

t("chunkArray: rejects invalid size / non-array", () => {
  assert.throws(() => chunkArray(["a"], 0), RangeError);
  assert.throws(() => chunkArray(["a"], -1), RangeError);
  assert.throws(() => chunkArray(["a"], 1.5), RangeError);
  assert.throws(() => chunkArray(null, 2), TypeError);
});

t("parseBatchArgs: parses --chunk-size, --isolate, --pool (with validation)", () => {
  const o = parseBatchArgs([
    "--chunk-size=20",
    "--isolate",
    "--pool=forks",
  ]);
  assert.equal(o.chunkSize, 20);
  assert.equal(o.isolate, true);
  assert.equal(o.pool, "forks");
  // defaults keep prior behavior
  const d = parseBatchArgs([]);
  assert.equal(d.chunkSize, null);
  assert.equal(d.isolate, false);
  assert.equal(d.pool, null);
  // VITEST_POOLS is the validated set
  assert.ok(VITEST_POOLS.includes("forks"));
  // invalid values fail safely
  assert.throws(() => parseBatchArgs(["--chunk-size=0"]), RangeError);
  assert.throws(() => parseBatchArgs(["--chunk-size=abc"]), RangeError);
  assert.throws(() => parseBatchArgs(["--pool=bogus"]), RangeError);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
