#!/usr/bin/env node
/**
 * Verdant Batched Validation Runner v1
 *
 * Runs the full `src/test` Vitest suite in deterministic batches so it
 * completes in memory-limited / time-limited environments without one
 * huge `bunx vitest run`. Never skips, never hides failures, never
 * updates snapshots.
 *
 * Batching strategy is selectable via `--strategy=contiguous|round-robin`
 * (default contiguous, for backward compatibility). round-robin spreads
 * alphabetically clustered files across batches to avoid piling memory-heavy
 * suites (e.g. `ecowitt-*` jsdom tests) into a single worker.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

import {
  sortTestFiles,
  splitIntoBatches,
  selectBatch,
  parseBatchArgs,
  chunkArray,
} from "./vitest-batch-utils.mjs";

const ROOT = process.cwd();
const TEST_ROOT = resolve(ROOT, "src/test");

/**
 * Emit a machine-readable marker for the CI log parser. Markers carry only
 * numeric/string metadata (batch/chunk indices, counts, strategy, status,
 * exit codes) — never file contents, secrets, env values, or payloads.
 */
function emitMarker(kind, obj) {
  console.log(`${kind} ${JSON.stringify(obj)}`);
}

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

/** Run one Vitest invocation over `files`, forwarding isolation options. */
function runVitest(label, files, opts) {
  const cmd = "bunx";
  const args = ["vitest", "run", `--reporter=${opts.reporter}`];
  if (opts.isolate) args.push("--isolate");
  if (opts.pool) args.push(`--pool=${opts.pool}`);
  args.push(...files);
  console.log(`  ▶ ${label}: ${files.length} files\n    $ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT });
  const ok = res.status === 0;
  console.log(`  ◀ ${label}: ${ok ? "PASS" : "FAIL"} (exit ${res.status})`);
  return { ok, code: res.status };
}

/**
 * Run a batch, optionally splitting it into fixed-size chunks. Each chunk is a
 * fresh Vitest process, so heap is released between chunks — this is the
 * worker-isolation mechanism that prevents OOM accumulation.
 */
function runBatch(batchNumber, files, opts) {
  const chunks = opts.chunkSize ? chunkArray(files, opts.chunkSize) : [files];
  emitMarker("VERDANT_BATCH_START", {
    batch: batchNumber,
    batches: opts.batches,
    strategy: opts.strategy,
    chunkSize: opts.chunkSize ?? null,
    fileCount: files.length,
    chunks: chunks.length,
  });
  console.log(
    `\n▶ Batch ${batchNumber}: ${files.length} files in ${chunks.length} chunk(s)` +
      (opts.chunkSize ? ` (chunk-size=${opts.chunkSize})` : "") +
      (opts.isolate ? " [isolate]" : "") +
      (opts.pool ? ` [pool=${opts.pool}]` : ""),
  );
  let ok = true;
  let batchCode = 0;
  for (let c = 0; c < chunks.length; c++) {
    const label = `Batch ${batchNumber} chunk ${c + 1}/${chunks.length}`;
    emitMarker("VERDANT_CHUNK_START", {
      batch: batchNumber,
      chunk: c + 1,
      chunks: chunks.length,
      fileCount: chunks[c].length,
    });
    const { ok: chunkOk, code } = runVitest(label, chunks[c], opts);
    emitMarker("VERDANT_CHUNK_END", {
      batch: batchNumber,
      chunk: c + 1,
      status: chunkOk ? "pass" : "fail",
      exitCode: code,
    });
    if (!chunkOk) {
      ok = false;
      batchCode = code ?? 1;
      if (!opts.continueOnFail) break;
    }
  }
  console.log(
    `◀ Batch ${batchNumber}: ${ok ? "PASS" : "FAIL"} (${chunks.length} chunk(s))`,
  );
  emitMarker("VERDANT_BATCH_END", {
    batch: batchNumber,
    status: ok ? "pass" : "fail",
    exitCode: ok ? 0 : batchCode,
  });
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
        ? splitIntoBatches(all, opts.batches, opts.strategy)
        : [selectBatch(all, opts.batches, opts.batch, opts.strategy)];
  } catch (e) {
    console.error("✗", e.message);
    process.exit(2);
  }

  console.log(
    `Verdant Batched Validation Runner v1 — ${all.length} test files, ` +
      `${opts.batch === null ? opts.batches : 1} batch(es), ` +
      `strategy=${opts.strategy}, reporter=${opts.reporter}` +
      (opts.chunkSize ? `, chunk-size=${opts.chunkSize}` : "") +
      (opts.isolate ? ", isolate" : "") +
      (opts.pool ? `, pool=${opts.pool}` : "") +
      (opts.batch !== null ? ` (only batch ${opts.batch})` : "") +
      (opts.continueOnFail ? " [continue-on-fail]" : ""),
  );

  let anyFail = false;
  const failed = [];
  for (let i = 0; i < groups.length; i++) {
    const batchNumber = opts.batch === null ? i : opts.batch;
    const ok = runBatch(batchNumber, groups[i], opts);
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
