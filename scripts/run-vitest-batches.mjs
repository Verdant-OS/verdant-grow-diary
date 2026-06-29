#!/usr/bin/env node
/**
 * Verdant Batched Validation Runner v1
 *
 * Runs the full `src/test` Vitest suite in deterministic batches so it
 * completes in memory-limited / time-limited environments without one
 * huge `bunx vitest run`. Never skips, never hides failures, never
 * updates snapshots.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

import {
  sortTestFiles,
  splitIntoBatches,
  selectBatch,
  parseBatchArgs,
} from "./vitest-batch-utils.mjs";

const ROOT = process.cwd();
const TEST_ROOT = resolve(ROOT, "src/test");

function discoverTestFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of readdirSync(cur)) {
      const full = join(cur, entry);
      const s = statSync(full);
      if (s.isDirectory()) stack.push(full);
      else if (/\.test\.(ts|tsx)$/.test(entry)) {
        out.push(relative(ROOT, full));
      }
    }
  }
  return out;
}

function runBatch(batchNumber, files, reporter) {
  const cmd = "bunx";
  const args = ["vitest", "run", `--reporter=${reporter}`, ...files];
  console.log(
    `\n▶ Batch ${batchNumber}: ${files.length} files\n  $ ${cmd} ${args.join(" ")}`,
  );
  const res = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT });
  const ok = res.status === 0;
  console.log(`◀ Batch ${batchNumber}: ${ok ? "PASS" : "FAIL"} (exit ${res.status})`);
  return ok;
}

function main() {
  let opts;
  try {
    opts = parseBatchArgs(process.argv.slice(2));
  } catch (e) {
    console.error("✗ Invalid arguments:", e.message);
    process.exit(2);
  }

  const all = sortTestFiles(discoverTestFiles(TEST_ROOT));
  if (all.length === 0) {
    console.error("✗ No test files discovered under src/test");
    process.exit(2);
  }

  let groups;
  try {
    groups =
      opts.batch === null
        ? splitIntoBatches(all, opts.batches)
        : [selectBatch(all, opts.batches, opts.batch)];
  } catch (e) {
    console.error("✗", e.message);
    process.exit(2);
  }

  console.log(
    `Verdant Batched Validation Runner v1 — ${all.length} test files, ` +
      `${opts.batch === null ? opts.batches : 1} batch(es), reporter=${opts.reporter}` +
      (opts.batch !== null ? ` (only batch ${opts.batch})` : "") +
      (opts.continueOnFail ? " [continue-on-fail]" : ""),
  );

  let anyFail = false;
  const failed = [];
  for (let i = 0; i < groups.length; i++) {
    const batchNumber = opts.batch === null ? i : opts.batch;
    const ok = runBatch(batchNumber, groups[i], opts.reporter);
    if (!ok) {
      anyFail = true;
      failed.push(batchNumber);
      if (!opts.continueOnFail) break;
    }
  }

  console.log(
    `\nSummary: ${anyFail ? "FAIL" : "PASS"} — ` +
      `${groups.length - failed.length}/${groups.length} batch(es) passed` +
      (failed.length ? `, failed: ${failed.join(", ")}` : ""),
  );
  process.exit(anyFail ? 1 : 0);
}

main();
