#!/usr/bin/env node
/**
 * Verdant Batched Validation Runner v1
 *
 * Runs the full `src/test` Vitest suite in deterministic batches so it
 * completes in memory-limited / time-limited environments without one
 * huge `bunx vitest run`. Never skips, never hides failures, never
 * updates snapshots.
 *
 * Supports:
 *   --batches=N            total batches (default 8)
 *   --batch=K              run only batch K (0-indexed)
 *   --strategy=contiguous|round-robin   (default contiguous)
 *   --chunk-size=N         inside a batch, run N files per vitest invocation
 *                          (releases worker memory between chunks)
 *   --isolate              pass --isolate to vitest
 *   --pool=forks|threads|vmThreads   pass --pool to vitest
 *   --reporter=dot|verbose
 *   --continue-on-fail
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

import {
  sortTestFiles,
  splitIntoBatches,
  splitIntoBatchesRoundRobin,
  selectBatch,
  splitIntoChunks,
  parseBatchArgs,
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

function buildVitestArgs(files, opts) {
  const args = ["vitest", "run", `--reporter=${opts.reporter}`];
  if (opts.isolate) args.push("--isolate");
  if (opts.pool) args.push(`--pool=${opts.pool}`);
  args.push(...files);
  return args;
}

function runVitest(label, files, opts) {
  const args = buildVitestArgs(files, opts);
  console.log(
    `\n▶ ${label}: ${files.length} files\n  $ bunx ${args.join(" ")}`,
  );
  const res = spawnSync("bunx", args, { stdio: "inherit", cwd: ROOT });
  const ok = res.status === 0;
  console.log(`◀ ${label}: ${ok ? "PASS" : "FAIL"} (exit ${res.status})`);
  return ok;
}

function runBatch(batchNumber, files, opts) {
  const chunks =
    opts.chunkSize && files.length > opts.chunkSize
      ? splitIntoChunks(files, opts.chunkSize)
      : [files];
  // Machine-readable markers for the CI receipt parser (metadata only — no
  // file contents, secrets, or payloads). The parser prefers these over the
  // human ▶/◀ lines for reliable batch/chunk attribution.
  emitMarker("VERDANT_BATCH_START", {
    batch: batchNumber,
    batches: opts.batches,
    strategy: opts.strategy,
    chunkSize: opts.chunkSize ?? null,
    fileCount: files.length,
    chunks: chunks.length,
  });
  if (chunks.length > 1) {
    console.log(
      `\n▶ Batch ${batchNumber}: ${files.length} files in ${chunks.length} chunk(s) of <= ${opts.chunkSize}`,
    );
  }
  let allOk = true;
  for (let c = 0; c < chunks.length; c++) {
    emitMarker("VERDANT_CHUNK_START", {
      batch: batchNumber,
      chunk: c + 1,
      chunks: chunks.length,
      fileCount: chunks[c].length,
    });
    const label =
      chunks.length > 1
        ? `Batch ${batchNumber} chunk ${c + 1}/${chunks.length}`
        : `Batch ${batchNumber}`;
    let ok = runVitest(label, chunks[c], opts);
    let retried = false;
    if (!ok && opts.retryFailedChunkOnce) {
      // Flake containment (owner-approved): one visible retry per failed
      // chunk. A chunk that fails twice is a real failure and fails the
      // batch exactly as before. The CHUNK_RETRY marker + retried flag
      // keep every retry auditable in the CI receipt.
      retried = true;
      console.log(`↻ ${label}: retrying failed chunk once (flake containment)`);
      emitMarker("VERDANT_CHUNK_RETRY", { batch: batchNumber, chunk: c + 1 });
      ok = runVitest(`${label} (retry)`, chunks[c], opts);
    }
    emitMarker("VERDANT_CHUNK_END", {
      batch: batchNumber,
      chunk: c + 1,
      status: ok ? "pass" : "fail",
      ...(retried ? { retried: 1 } : {}),
    });
    if (!ok) {
      allOk = false;
      if (!opts.continueOnFail) break;
    }
  }
  console.log(
    `◀ Batch ${batchNumber}: ${allOk ? "PASS" : "FAIL"} (${chunks.length} chunk(s))`,
  );
  emitMarker("VERDANT_BATCH_END", {
    batch: batchNumber,
    status: allOk ? "pass" : "fail",
  });
  return allOk;
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
    if (opts.batch === null) {
      groups =
        opts.strategy === "round-robin"
          ? splitIntoBatchesRoundRobin(all, opts.batches)
          : splitIntoBatches(all, opts.batches);
    } else {
      groups = [selectBatch(all, opts.batches, opts.batch, opts.strategy)];
    }
  } catch (e) {
    console.error("✗", e.message);
    process.exit(2);
  }

  console.log(
    `Verdant Batched Validation Runner v1 — ${all.length} test files, ` +
      `${groups.length} batch(es) actual (requested ${opts.batches}), ` +
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
