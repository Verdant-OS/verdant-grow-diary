#!/usr/bin/env node
// Tests for scripts/vitest-batch-utils.mjs using Node's built-in assert.
import { strict as assert } from "node:assert";
import {
  sortTestFiles,
  splitIntoBatches,
  splitIntoBatchesRoundRobin,
  selectBatch,
  splitIntoChunks,
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
  assert.deepEqual(
    sortTestFiles(["src/test/z.test.ts", "src/test/a.test.ts"]),
    ["src/test/a.test.ts", "src/test/z.test.ts"],
  );
});

t("sortTestFiles: rejects non-array", () => {
  assert.throws(() => sortTestFiles(null), TypeError);
});

t("splitIntoBatches: even split", () => {
  assert.deepEqual(splitIntoBatches(["a", "b", "c", "d"], 2), [
    ["a", "b"],
    ["c", "d"],
  ]);
});

t("splitIntoBatches: even-ish split, earlier batches get extras", () => {
  const r = splitIntoBatches(["a", "b", "c", "d", "e"], 3);
  assert.deepEqual(r, [["a", "b"], ["c", "d"], ["e"]]);
  assert.equal(r.flat().length, 5);
});

t("splitIntoBatches: more batches than files clamps to file count", () => {
  assert.deepEqual(splitIntoBatches(["a", "b"], 8), [["a"], ["b"]]);
});

t("splitIntoBatches: invalid batches throws", () => {
  assert.throws(() => splitIntoBatches(["a"], 0), RangeError);
  assert.throws(() => splitIntoBatches(["a"], -1), RangeError);
  assert.throws(() => splitIntoBatches(["a"], 1.5), RangeError);
});

t("splitIntoBatches: empty file list throws clearly", () => {
  assert.throws(() => splitIntoBatches([], 4), /no test files/i);
});

t("splitIntoBatchesRoundRobin: spreads files across batches", () => {
  const r = splitIntoBatchesRoundRobin(["a", "b", "c", "d", "e"], 3);
  assert.deepEqual(r, [["a", "d"], ["b", "e"], ["c"]]);
  assert.equal(r.flat().length, 5);
});

t("splitIntoBatchesRoundRobin: more batches than files clamps", () => {
  assert.deepEqual(splitIntoBatchesRoundRobin(["a", "b"], 8), [["a"], ["b"]]);
});

t("splitIntoBatchesRoundRobin: invalid batches throws", () => {
  assert.throws(() => splitIntoBatchesRoundRobin(["a"], 0), RangeError);
  assert.throws(() => splitIntoBatchesRoundRobin([], 4), RangeError);
});

t("selectBatch: contiguous picks correct slice", () => {
  const files = ["a", "b", "c", "d", "e"];
  assert.deepEqual(selectBatch(files, 3, 0), ["a", "b"]);
  assert.deepEqual(selectBatch(files, 3, 1), ["c", "d"]);
  assert.deepEqual(selectBatch(files, 3, 2), ["e"]);
});

t("selectBatch: round-robin picks correct slice", () => {
  const files = ["a", "b", "c", "d", "e"];
  assert.deepEqual(selectBatch(files, 3, 0, "round-robin"), ["a", "d"]);
  assert.deepEqual(selectBatch(files, 3, 1, "round-robin"), ["b", "e"]);
  assert.deepEqual(selectBatch(files, 3, 2, "round-robin"), ["c"]);
});

t("selectBatch: out-of-range throws", () => {
  assert.throws(() => selectBatch(["a", "b"], 2, 5), RangeError);
  assert.throws(() => selectBatch(["a"], 1, -1), RangeError);
});

t("splitIntoChunks: even split", () => {
  assert.deepEqual(splitIntoChunks(["a", "b", "c", "d"], 2), [
    ["a", "b"],
    ["c", "d"],
  ]);
});

t("splitIntoChunks: remainder is final chunk", () => {
  assert.deepEqual(splitIntoChunks(["a", "b", "c", "d", "e"], 2), [
    ["a", "b"],
    ["c", "d"],
    ["e"],
  ]);
});

t("splitIntoChunks: chunkSize >= length returns one chunk", () => {
  assert.deepEqual(splitIntoChunks(["a", "b"], 20), [["a", "b"]]);
});

t("splitIntoChunks: empty array returns empty list", () => {
  assert.deepEqual(splitIntoChunks([], 5), []);
});

t("splitIntoChunks: invalid chunkSize throws", () => {
  assert.throws(() => splitIntoChunks(["a"], 0), RangeError);
  assert.throws(() => splitIntoChunks(["a"], -1), RangeError);
  assert.throws(() => splitIntoChunks(["a"], 1.5), RangeError);
});

t("splitIntoChunks: preserves order and total count", () => {
  const files = Array.from({ length: 104 }, (_, i) => `f${i}`);
  const chunks = splitIntoChunks(files, 20);
  assert.equal(chunks.length, 6); // 5 full + 1 partial
  assert.equal(chunks.flat().length, 104);
  assert.deepEqual(chunks.flat(), files);
});

t("parseBatchArgs: defaults", () => {
  const o = parseBatchArgs([]);
  assert.equal(o.batches, 8);
  assert.equal(o.batch, null);
  assert.equal(o.reporter, "dot");
  assert.equal(o.continueOnFail, false);
  assert.equal(o.strategy, "contiguous");
  assert.equal(o.chunkSize, null);
  assert.equal(o.isolate, false);
  assert.equal(o.pool, null);
});

t("parseBatchArgs: parses flags", () => {
  const o = parseBatchArgs([
    "--batches=16",
    "--batch=1",
    "--reporter=verbose",
    "--continue-on-fail",
    "--strategy=round-robin",
    "--chunk-size=20",
    "--isolate",
    "--pool=forks",
  ]);
  assert.equal(o.batches, 16);
  assert.equal(o.batch, 1);
  assert.equal(o.reporter, "verbose");
  assert.equal(o.continueOnFail, true);
  assert.equal(o.strategy, "round-robin");
  assert.equal(o.chunkSize, 20);
  assert.equal(o.isolate, true);
  assert.equal(o.pool, "forks");
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

t("parseBatchArgs: rejects bad --strategy", () => {
  assert.throws(() => parseBatchArgs(["--strategy=random"]), RangeError);
});

t("parseBatchArgs: rejects bad --chunk-size", () => {
  assert.throws(() => parseBatchArgs(["--chunk-size=0"]), RangeError);
  assert.throws(() => parseBatchArgs(["--chunk-size=-3"]), RangeError);
  assert.throws(() => parseBatchArgs(["--chunk-size=foo"]), RangeError);
});

t("parseBatchArgs: rejects bad --pool", () => {
  assert.throws(() => parseBatchArgs(["--pool=bogus"]), RangeError);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
