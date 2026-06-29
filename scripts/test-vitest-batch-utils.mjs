#!/usr/bin/env node
// Tests for scripts/vitest-batch-utils.mjs using Node's built-in assert.
import { strict as assert } from "node:assert";
import {
  sortTestFiles,
  splitIntoBatches,
  selectBatch,
  parseBatchArgs,
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

t("selectBatch: picks correct slice", () => {
  const files = ["a", "b", "c", "d", "e"];
  assert.deepEqual(selectBatch(files, 3, 0), ["a", "b"]);
  assert.deepEqual(selectBatch(files, 3, 1), ["c", "d"]);
  assert.deepEqual(selectBatch(files, 3, 2), ["e"]);
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

t("parseBatchArgs: rejects bad --batches", () => {
  assert.throws(() => parseBatchArgs(["--batches=0"]), RangeError);
  assert.throws(() => parseBatchArgs(["--batches=abc"]), RangeError);
});

t("parseBatchArgs: rejects bad --batch", () => {
  assert.throws(() => parseBatchArgs(["--batch=-1"]), RangeError);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
