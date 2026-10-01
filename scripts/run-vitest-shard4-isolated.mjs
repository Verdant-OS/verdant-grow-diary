#!/usr/bin/env node
/**
 * Run the fourth canonical Vitest shard with a fresh process every ten files.
 * Vitest's own sequencer chooses the 4/4 file set, so this remains disjoint
 * from the package scripts for shards 1–3 without relying on 256-way rounding.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BaseSequencer } from "vitest/node";

const QUARTER_INDEX = 4;
const QUARTER_COUNT = 4;
const CHUNK_SIZE = 10;
const MAX_OLD_SPACE_MB = 8192;
const VITEST_BIN = resolve("node_modules/vitest/vitest.mjs");
export const VITEST_FLAGS = Object.freeze([
  "run",
  "--reporter=dot",
  "--pool=forks",
  "--maxWorkers=1",
  "--no-file-parallelism",
  "--isolate",
]);

export async function planIsolatedShard4(files, root = process.cwd()) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Vitest discovery returned no test files");
  }
  const resolvedRoot = resolve(root);
  const paths = files.map((file) => {
    if (typeof file !== "string" || file.length === 0) {
      throw new Error("Vitest discovery returned an invalid file path");
    }
    const absolute = resolve(file);
    const local = relative(resolvedRoot, absolute);
    if (!local || local === ".." || local.startsWith("../") || local.startsWith("..\\")) {
      throw new Error("Vitest discovery returned a file outside the repository");
    }
    return absolute;
  });
  if (new Set(paths).size !== paths.length) {
    throw new Error("Vitest discovery returned duplicate test files");
  }

  // This is the same public sequencer that Vitest invokes for --shard=4/4.
  // The list command discovers all files but does not itself apply --shard.
  const specs = paths.map((moduleId) => ({ moduleId }));
  const selectedSpecs = await new BaseSequencer({
    config: { root: resolvedRoot, shard: { index: QUARTER_INDEX, count: QUARTER_COUNT } },
  }).shard(specs);
  const selected = selectedSpecs.map(({ moduleId }) => moduleId);
  if (selected.length === 0 || new Set(selected).size !== selected.length) {
    throw new Error("The fourth shard is empty or contains duplicate files");
  }
  const chunks = [];
  for (let i = 0; i < selected.length; i += CHUNK_SIZE) {
    chunks.push(selected.slice(i, i + CHUNK_SIZE));
  }
  return {
    totalFiles: paths.length,
    selected,
    chunks,
    chunkSize: CHUNK_SIZE,
    fingerprint: createHash("sha256").update(selected.join("\n")).digest("hex"),
  };
}

function discoverFiles(root) {
  const listed = spawnSync(process.execPath, [VITEST_BIN, "list", "--filesOnly", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (listed.error || listed.status !== 0) {
    throw new Error(`Vitest discovery failed (exit ${listed.status ?? "unknown"})`, {
      cause: listed.error,
    });
  }
  let rows;
  try {
    rows = JSON.parse(listed.stdout);
  } catch {
    throw new Error("Vitest discovery did not return JSON");
  }
  if (!Array.isArray(rows) || rows.some((row) => typeof row?.file !== "string")) {
    throw new Error("Vitest discovery returned an invalid file list");
  }
  return rows.map((row) => row.file);
}

export function runPlannedShard4(plan, root, spawn = spawnSync) {
  for (let i = 0; i < plan.chunks.length; i += 1) {
    console.log(`Shard 4/4 chunk ${i + 1}/${plan.chunks.length}: ${plan.chunks[i].length} files`);
    const nodeOptions = process.env.NODE_OPTIONS ?? "";
    const childEnvironment = {
      ...process.env,
      NODE_OPTIONS: /(?:^|\s)--max-old-space-size(?:=|\s)/.test(nodeOptions)
        ? nodeOptions
        : `${nodeOptions} --max-old-space-size=${MAX_OLD_SPACE_MB}`.trim(),
    };
    const run = spawn(process.execPath, [VITEST_BIN, ...VITEST_FLAGS, ...plan.chunks[i]], {
      cwd: root,
      stdio: "inherit",
      env: childEnvironment,
    });
    if (run.error || run.status !== 0) {
      throw new Error(`Shard 4/4 chunk ${i + 1} failed (exit ${run.status ?? "unknown"})`, {
        cause: run.error,
      });
    }
  }
}

async function main() {
  const planOnly = process.argv.length === 3 && process.argv[2] === "--plan-json";
  if (!planOnly && process.argv.length !== 2) {
    throw new Error("Usage: run-vitest-shard4-isolated.mjs [--plan-json]");
  }
  const root = resolve(process.cwd());
  const plan = await planIsolatedShard4(discoverFiles(root), root);
  if (planOnly) {
    process.stdout.write(
      JSON.stringify({
        totalFiles: plan.totalFiles,
        selectedFiles: plan.selected.map((file) => relative(root, file)),
        chunks: plan.chunks.map((chunk) => chunk.map((file) => relative(root, file))),
        chunkSize: plan.chunkSize,
        fingerprint: plan.fingerprint,
        vitestFlags: VITEST_FLAGS,
      }) + "\n",
    );
    return;
  }

  console.log(
    `Vitest shard 4/4: ${plan.selected.length}/${plan.totalFiles} files in ` +
      `${plan.chunks.length} isolated process(es); fingerprint ${plan.fingerprint}`,
  );
  runPlannedShard4(plan, root);
  console.log(`Vitest shard 4/4 PASS: ${plan.selected.length} files, ${plan.chunks.length} chunks`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
