// Verdant controlled Vitest runner CLI (dispatcher).
//
// Subcommands:
//   run              --shard N/M [--batch-size K] [--run-dir DIR] [--batch-deadline-ms MS]
//   resume           --run-dir DIR
//   rerun-failed     --run-dir DIR
//   summarize        --run-dir DIR [--json] [--markdown OUT.md]
//   aggregate        DIR1 DIR2 ... [--manifest-hash HASH]
//   manifest         (prints deterministic manifest JSON)
//
// Deliberate defaults:
//   pool=forks, maxWorkers=8, minWorkers=2 — matching Slice G.1j.
//   No timeout, retry, isolation, or environment overrides.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { buildManifest, discoverTestFiles, MANIFEST_SCHEMA_VERSION } from "./manifest.mjs";
import { parseShardSpec, assignShard, splitIntoBatches } from "./sharding.mjs";
import {
  computeCommonConfigFingerprint,
  computeAssignmentFingerprint,
  computeShardFingerprint,
  computeWorkspaceFingerprint,
  fingerprintMismatch,
  FINGERPRINT_SCHEMA_VERSION,
  CONFIG_FINGERPRINT_SCHEMA_VERSION,
} from "./fingerprint.mjs";
import { REPORTER_SCHEMA_VERSION } from "./reporter.mjs";
import { summarizeRun, renderMarkdown, aggregateShards, readProgress } from "./summarizer.mjs";

// Run-record schema history:
//   v1..v2 — legacy pre-workspace-fingerprint runs.
//   v3     — folded toolchain identity into a single ambiguous
//            `sourceFingerprint` that also included shardIndex; caused
//            the 16-distinct-fingerprint aggregate defect.
//   v4     — split fingerprint model: commonConfigFingerprint (one per
//            run), assignmentFingerprint (one per shard), shardFingerprint
//            (composite). Pre-v4 runs are refused at resume/rerun-failed.
export const RUN_SCHEMA_VERSION = 4;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RUNNER_ROOT = __dirname;

export const DEFAULTS = Object.freeze({
  pool: "forks",
  maxWorkers: 8,
  minWorkers: 2,
  batchSize: 30,
  batchDeadlineMs: 480_000, // < 600s sandbox window
  runsRoot: ".vitest-runs",
});

export const EXIT = Object.freeze({
  GREEN: 0,
  TEST_FAILURES: 1,
  CONFIG_ERROR: 2,
  INTERRUPTED: 130,
});

function parseArgs(argv) {
  const args = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args.flags[key] = true;
      } else {
        args.flags[key] = next;
        i++;
      }
    } else {
      args.positional.push(a);
    }
  }
  return args;
}

function utcTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function makeRunId(shardIndex, shardTotal) {
  return `${utcTimestamp()}-s${shardIndex}of${shardTotal}-${crypto.randomBytes(3).toString("hex")}`;
}

const runnerRequire = createRequire(import.meta.url);

/**
 * Discover the actual Node, Bun, and Vitest runtime versions from the
 * installed executables and package metadata — never from optional
 * environment variables (which the workflow may leave unset) and never
 * by invoking a command that could download a different Vitest.
 *
 * Fails closed: a missing Bun executable or missing local Vitest package
 * throws with EXIT.CONFIG_ERROR so the run cannot proceed with a null
 * toolchain identity that would silently be reusable.
 *
 * Injectable for focused tests via `spawnSyncImpl` and `resolveVitestPkg`.
 */
export function discoverToolVersions({ spawnSyncImpl = spawnSync, resolveVitestPkg } = {}) {
  const node = process.version;
  let bun;
  try {
    const r = spawnSyncImpl("bun", ["--version"], { encoding: "utf8" });
    if (!r || r.error) throw r?.error ?? new Error("no spawn result");
    if (r.status !== 0) throw new Error(`bun --version exited ${r.status}`);
    bun = String(r.stdout ?? "").trim();
    if (!bun) throw new Error("empty bun --version output");
  } catch (err) {
    throw Object.assign(
      new Error(`Cannot discover Bun version from installed executable: ${err?.message ?? err}`),
      { code: EXIT.CONFIG_ERROR },
    );
  }
  let vitest;
  try {
    const pkgPath = resolveVitestPkg
      ? resolveVitestPkg()
      : runnerRequire.resolve("vitest/package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    vitest = pkg.version;
    if (!vitest || typeof vitest !== "string") throw new Error("missing version field");
  } catch (err) {
    throw Object.assign(
      new Error(`Cannot discover Vitest version from installed package: ${err?.message ?? err}`),
      { code: EXIT.CONFIG_ERROR },
    );
  }
  return { node, bun, vitest };
}

function toolVersions(discovered) {
  return {
    node: discovered.node,
    bun: discovered.bun,
    vitest: discovered.vitest,
    reporterSchema: REPORTER_SCHEMA_VERSION,
    manifestSchema: MANIFEST_SCHEMA_VERSION,
    fingerprintSchema: FINGERPRINT_SCHEMA_VERSION,
    configFingerprintSchema: CONFIG_FINGERPRINT_SCHEMA_VERSION,
  };
}

/** Compare persisted vs current toolchain; return null when identical, else a diff string. */
export function toolchainMismatch(previous, current) {
  if (!previous) return "toolchain absent from prior run";
  const keys = ["node", "bun", "vitest"];
  const diffs = [];
  for (const k of keys) {
    if (previous[k] !== current[k])
      diffs.push(`${k}: ${previous[k] ?? "<absent>"} → ${current[k]}`);
  }
  return diffs.length ? `toolchain drift: ${diffs.join("; ")}` : null;
}

/** Prepare a fresh run directory with run.json + manifest.json. */
export function initRun({
  repoRoot,
  runsRoot,
  shardIndex,
  shardTotal,
  batchSize,
  pool,
  maxWorkers,
  minWorkers,
  files,
  manifest,
  toolVersions: discoveredToolVersions,
}) {
  if (
    !discoveredToolVersions ||
    !discoveredToolVersions.node ||
    !discoveredToolVersions.bun ||
    !discoveredToolVersions.vitest
  ) {
    throw Object.assign(
      new Error(
        "initRun requires discovered {node,bun,vitest} toolVersions — refusing null identity",
      ),
      { code: EXIT.CONFIG_ERROR },
    );
  }
  const runId = makeRunId(shardIndex, shardTotal);
  const runDir = path.resolve(runsRoot, runId);
  fs.mkdirSync(path.join(runDir, "raw"), { recursive: true });

  const shardFiles = assignShard(files, shardIndex, shardTotal);
  const batches = splitIntoBatches(shardFiles, batchSize);

  const commonConfigFingerprint = computeCommonConfigFingerprint({
    manifestHash: manifest.hash,
    shardTotal,
    batchSize,
    pool,
    minWorkers,
    maxWorkers,
    runSchema: RUN_SCHEMA_VERSION,
    reporterSchema: REPORTER_SCHEMA_VERSION,
    manifestSchema: MANIFEST_SCHEMA_VERSION,
    workspaceFingerprintSchema: FINGERPRINT_SCHEMA_VERSION,
    configFingerprintSchema: CONFIG_FINGERPRINT_SCHEMA_VERSION,
    toolVersions: discoveredToolVersions,
  });
  const assignmentFingerprint = computeAssignmentFingerprint({
    shardIndex,
    shardTotal,
    assignedFiles: shardFiles,
  });
  const shardFp = computeShardFingerprint({
    commonConfigFingerprint,
    assignmentFingerprint,
    shardIndex,
    shardTotal,
  });
  const workspaceFingerprint = computeWorkspaceFingerprint(repoRoot);

  const runRecord = {
    schema: RUN_SCHEMA_VERSION,
    runId,
    createdAt: new Date().toISOString(),
    shardIndex,
    shardTotal,
    batchSize,
    batches: batches.map((b, i) => ({ index: i, count: b.length })),
    shardFileCount: shardFiles.length,
    pool,
    maxWorkers,
    minWorkers,
    manifestHash: manifest.hash,
    // v4 split identity model — see fingerprint.mjs.
    commonConfigFingerprint,
    assignmentFingerprint,
    shardFingerprint: shardFp,
    workspaceFingerprint,
    reporterSchema: REPORTER_SCHEMA_VERSION,
    toolVersions: toolVersions(discoveredToolVersions),
  };
  fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify(runRecord, null, 2));
  fs.writeFileSync(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(runDir, "shard-files.json"), JSON.stringify(shardFiles, null, 2));
  fs.writeFileSync(path.join(runDir, "start-time"), new Date().toISOString());
  fs.writeFileSync(path.join(runDir, "progress.jsonl"), "");
  return { runId, runDir, runRecord, shardFiles, batches };
}

function loadRun(runDir) {
  const runRecord = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(runDir, "manifest.json"), "utf8"));
  const shardFiles = JSON.parse(fs.readFileSync(path.join(runDir, "shard-files.json"), "utf8"));
  return { runRecord, manifest, shardFiles };
}

/** Run a single batch of test files as a fresh vitest child process. */
export async function runBatch({
  repoRoot,
  runDir,
  runRecord,
  batchIndex,
  batchFiles,
  batchDeadlineMs,
  vitestBin = "bunx",
  extraArgs = [],
  spawnImpl = spawn,
}) {
  const rawLog = path.join(runDir, "raw", `batch-${String(batchIndex).padStart(3, "0")}.log`);
  const reporterPath = path.join(RUNNER_ROOT, "reporter.mjs");
  const args = [
    "vitest",
    "run",
    `--pool=${runRecord.pool}`,
    `--maxWorkers=${runRecord.maxWorkers}`,
    `--minWorkers=${runRecord.minWorkers}`,
    `--reporter=${reporterPath}`,
    `--reporter=dot`,
    ...extraArgs,
    ...batchFiles,
  ];
  const env = {
    ...process.env,
    VERDANT_CTRL_PROGRESS_FILE: path.join(runDir, "progress.jsonl"),
    VERDANT_CTRL_RUN_ID: runRecord.runId,
    VERDANT_CTRL_SHARD_INDEX: String(runRecord.shardIndex),
    VERDANT_CTRL_SHARD_TOTAL: String(runRecord.shardTotal),
    VERDANT_CTRL_BATCH_INDEX: String(batchIndex),
    VERDANT_CTRL_REPO_ROOT: repoRoot,
  };
  const logStream = fs.openSync(rawLog, "a");
  const startedAt = Date.now();
  let child;
  try {
    child = spawnImpl(vitestBin, args, {
      cwd: repoRoot,
      env,
      stdio: ["ignore", logStream, logStream],
    });
  } catch (err) {
    fs.closeSync(logStream);
    return { batchIndex, exitCode: null, signal: null, timedOut: false, error: String(err) };
  }
  let timedOut = false;
  const timer = batchDeadlineMs
    ? setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGTERM");
          setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {}
          }, 5000).unref();
        } catch {}
      }, batchDeadlineMs)
    : null;
  const result = await new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
    child.on("error", (err) => resolve({ code: null, signal: null, error: String(err) }));
  });
  if (timer) clearTimeout(timer);
  try {
    fs.closeSync(logStream);
  } catch {}
  return {
    batchIndex,
    exitCode: result.code,
    signal: result.signal ?? null,
    timedOut,
    durationMs: Date.now() - startedAt,
    rawLog,
  };
}

/** Public: run a fresh shard (subcommand `run`). */
export async function commandRun(opts, deps = {}) {
  const {
    repoRoot,
    shardSpec,
    batchSize = DEFAULTS.batchSize,
    runsRoot = path.resolve(repoRoot, DEFAULTS.runsRoot),
    batchDeadlineMs = DEFAULTS.batchDeadlineMs,
    files: injectedFiles,
    vitestBin,
    spawnImpl,
    toolVersions: injectedToolVersions,
    discoverToolVersionsImpl = discoverToolVersions,
  } = opts;
  const { index, total } = parseShardSpec(shardSpec);
  const manifest = injectedFiles
    ? buildManifest(repoRoot, { files: injectedFiles })
    : buildManifest(repoRoot);
  const discoveredToolVersions = injectedToolVersions ?? discoverToolVersionsImpl();
  const initialized = initRun({
    repoRoot,
    runsRoot,
    shardIndex: index,
    shardTotal: total,
    batchSize,
    pool: DEFAULTS.pool,
    maxWorkers: DEFAULTS.maxWorkers,
    minWorkers: DEFAULTS.minWorkers,
    files: manifest.files,
    manifest,
    toolVersions: discoveredToolVersions,
  });
  return executeBatches(initialized, {
    repoRoot,
    batchDeadlineMs,
    vitestBin,
    spawnImpl,
    filesFilter: null,
    resumeMode: "fresh",
  });
}

/** Public: resume a run (subcommand `resume`). */
export async function commandResume(opts, deps = {}) {
  const {
    repoRoot,
    runDir,
    batchDeadlineMs = DEFAULTS.batchDeadlineMs,
    vitestBin,
    spawnImpl,
    toolVersions: injectedToolVersions,
    discoverToolVersionsImpl = discoverToolVersions,
  } = opts;
  const { runRecord, manifest, shardFiles } = loadRun(runDir);
  // 1. Refuse older run schema outright — legacy dirty-tree hashes and
  //    v2 runs (no enforced toolchain identity) cannot be silently
  //    promoted to the current workspace + toolchain contract.
  if ((runRecord.schema ?? 1) < RUN_SCHEMA_VERSION) {
    throw Object.assign(
      new Error(
        `Refusing to resume: run.json schema v${runRecord.schema ?? 1} predates toolchain-locked contract v${RUN_SCHEMA_VERSION}`,
      ),
      { code: EXIT.CONFIG_ERROR },
    );
  }
  if (
    !runRecord.workspaceFingerprint ||
    runRecord.workspaceFingerprint.schema !== FINGERPRINT_SCHEMA_VERSION
  ) {
    throw Object.assign(
      new Error(
        `Refusing to resume: workspace fingerprint schema mismatch (expected v${FINGERPRINT_SCHEMA_VERSION})`,
      ),
      { code: EXIT.CONFIG_ERROR },
    );
  }
  // 2. Recompute the workspace fingerprint BEFORE consulting progress.
  const currentWorkspace = computeWorkspaceFingerprint(repoRoot);
  const wsMismatch = fingerprintMismatch(
    runRecord.workspaceFingerprint.digest,
    currentWorkspace.digest,
  );
  if (wsMismatch) {
    throw Object.assign(new Error(`Refusing to resume: workspace ${wsMismatch}`), {
      code: EXIT.CONFIG_ERROR,
    });
  }
  // 3. Discover current runtime toolchain and refuse drift BEFORE
  //    inspecting completed-file events.
  const currentToolVersions = injectedToolVersions ?? discoverToolVersionsImpl();
  const tcMismatch = toolchainMismatch(runRecord.toolVersions, currentToolVersions);
  if (tcMismatch) {
    throw Object.assign(new Error(`Refusing to resume: ${tcMismatch}`), {
      code: EXIT.CONFIG_ERROR,
    });
  }
  // 4. Re-validate the v4 split identities. commonConfig must be
  //    identical (no shard-index component); the recomputed assignment
  //    must match the stored one; and the composite shardFingerprint
  //    must match. Any drift is rejected BEFORE completed-file reuse.
  const currentCommon = computeCommonConfigFingerprint({
    manifestHash: manifest.hash,
    shardTotal: runRecord.shardTotal,
    batchSize: runRecord.batchSize,
    pool: runRecord.pool,
    minWorkers: runRecord.minWorkers,
    maxWorkers: runRecord.maxWorkers,
    runSchema: RUN_SCHEMA_VERSION,
    reporterSchema: REPORTER_SCHEMA_VERSION,
    manifestSchema: MANIFEST_SCHEMA_VERSION,
    workspaceFingerprintSchema: FINGERPRINT_SCHEMA_VERSION,
    configFingerprintSchema: CONFIG_FINGERPRINT_SCHEMA_VERSION,
    toolVersions: currentToolVersions,
  });
  const commonMismatch = fingerprintMismatch(runRecord.commonConfigFingerprint, currentCommon);
  if (commonMismatch) {
    throw Object.assign(new Error(`Refusing to resume: commonConfig ${commonMismatch}`), {
      code: EXIT.CONFIG_ERROR,
    });
  }
  const currentAssignment = computeAssignmentFingerprint({
    shardIndex: runRecord.shardIndex,
    shardTotal: runRecord.shardTotal,
    assignedFiles: shardFiles,
  });
  const assignMismatch = fingerprintMismatch(runRecord.assignmentFingerprint, currentAssignment);
  if (assignMismatch) {
    throw Object.assign(new Error(`Refusing to resume: assignment ${assignMismatch}`), {
      code: EXIT.CONFIG_ERROR,
    });
  }
  const currentShardFp = computeShardFingerprint({
    commonConfigFingerprint: currentCommon,
    assignmentFingerprint: currentAssignment,
    shardIndex: runRecord.shardIndex,
    shardTotal: runRecord.shardTotal,
  });
  const shardMismatch = fingerprintMismatch(runRecord.shardFingerprint, currentShardFp);
  if (shardMismatch) {
    throw Object.assign(new Error(`Refusing to resume: shard ${shardMismatch}`), {
      code: EXIT.CONFIG_ERROR,
    });
  }
  const batches = splitIntoBatches(shardFiles, runRecord.batchSize);
  const {
    files: doneMap,
    conflicts,
    corruptLines,
  } = readProgress(path.join(runDir, "progress.jsonl"));
  if (conflicts.length || corruptLines.length) {
    throw Object.assign(
      new Error(
        `Refusing to resume: progress contains ${conflicts.length} conflicts and ${corruptLines.length} corrupt lines`,
      ),
      { code: EXIT.CONFIG_ERROR },
    );
  }
  const incompleteFilter = (file) => !doneMap.has(file);
  return executeBatches(
    { runId: runRecord.runId, runDir, runRecord, shardFiles, batches },
    {
      repoRoot,
      batchDeadlineMs,
      vitestBin,
      spawnImpl,
      filesFilter: incompleteFilter,
      resumeMode: "resume",
    },
  );
}

/** Public: rerun only failed files. Preserves prior progress separately. */
export async function commandRerunFailed(opts, deps = {}) {
  const {
    repoRoot,
    runDir,
    batchDeadlineMs = DEFAULTS.batchDeadlineMs,
    vitestBin,
    spawnImpl,
    toolVersions: injectedToolVersions,
    discoverToolVersionsImpl = discoverToolVersions,
  } = opts;
  const { runRecord, manifest, shardFiles } = loadRun(runDir);

  // Enforce the same schema + workspace fingerprint contract as `resume`
  // BEFORE reusing the prior failed-files list, which is itself an
  // outcome derived from the previous workspace state.
  if ((runRecord.schema ?? 1) < RUN_SCHEMA_VERSION) {
    throw Object.assign(
      new Error(
        `Refusing to rerun-failed: run.json schema v${runRecord.schema ?? 1} predates toolchain-locked contract v${RUN_SCHEMA_VERSION}`,
      ),
      { code: EXIT.CONFIG_ERROR },
    );
  }
  if (
    !runRecord.workspaceFingerprint ||
    runRecord.workspaceFingerprint.schema !== FINGERPRINT_SCHEMA_VERSION
  ) {
    throw Object.assign(
      new Error(
        `Refusing to rerun-failed: workspace fingerprint schema mismatch (expected v${FINGERPRINT_SCHEMA_VERSION})`,
      ),
      { code: EXIT.CONFIG_ERROR },
    );
  }
  const currentWorkspace = computeWorkspaceFingerprint(repoRoot);
  const wsMismatch = fingerprintMismatch(
    runRecord.workspaceFingerprint.digest,
    currentWorkspace.digest,
  );
  if (wsMismatch) {
    throw Object.assign(new Error(`Refusing to rerun-failed: workspace ${wsMismatch}`), {
      code: EXIT.CONFIG_ERROR,
    });
  }
  const currentToolVersions = injectedToolVersions ?? discoverToolVersionsImpl();
  const tcMismatch = toolchainMismatch(runRecord.toolVersions, currentToolVersions);
  if (tcMismatch) {
    throw Object.assign(new Error(`Refusing to rerun-failed: ${tcMismatch}`), {
      code: EXIT.CONFIG_ERROR,
    });
  }
  const { files: doneMap } = readProgress(path.join(runDir, "progress.jsonl"));
  const failed = [...doneMap.values()].filter((e) => e.status === "failed").map((e) => e.file);
  if (!failed.length) {
    return { runDir, batchesRun: 0, note: "no failed files to rerun" };
  }
  // Rerun into a sibling directory so the original record is preserved.
  const rerunDir = `${runDir}--rerun-${utcTimestamp()}`;
  const initialized = initRun({
    repoRoot,
    runsRoot: path.dirname(rerunDir),
    shardIndex: runRecord.shardIndex,
    shardTotal: runRecord.shardTotal,
    batchSize: runRecord.batchSize,
    pool: runRecord.pool,
    maxWorkers: runRecord.maxWorkers,
    minWorkers: runRecord.minWorkers,
    files: manifest.files, // full manifest so shard math matches
    manifest,
    toolVersions: currentToolVersions,
  });
  // Overwrite shard files to just the failed set for this rerun.
  fs.writeFileSync(
    path.join(initialized.runDir, "shard-files.json"),
    JSON.stringify(failed, null, 2),
  );
  initialized.shardFiles = failed;
  initialized.batches = splitIntoBatches(failed, runRecord.batchSize);
  return executeBatches(initialized, {
    repoRoot,
    batchDeadlineMs,
    vitestBin,
    spawnImpl,
    filesFilter: null,
    resumeMode: "rerun-failed",
  });
}

async function executeBatches(
  state,
  { repoRoot, batchDeadlineMs, vitestBin, spawnImpl, filesFilter, resumeMode },
) {
  const { runDir, runRecord, batches } = state;
  let interrupted = false;
  const onSig = () => {
    interrupted = true;
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);
  const batchResults = [];
  for (let i = 0; i < batches.length; i++) {
    if (interrupted) break;
    const files = filesFilter ? batches[i].filter(filesFilter) : batches[i];
    if (!files.length) continue;
    const result = await runBatch({
      repoRoot,
      runDir,
      runRecord,
      batchIndex: i,
      batchFiles: files,
      batchDeadlineMs,
      vitestBin,
      spawnImpl,
    });
    batchResults.push(result);
    // Always regenerate summary after each batch.
    writeSummaryArtifacts(runDir);
    if (result.timedOut) {
      // deadline expired — remaining files stay incomplete; do not fail.
      continue;
    }
  }
  process.off("SIGINT", onSig);
  process.off("SIGTERM", onSig);
  // Compute the pre-marker summary to determine exit code + marker eligibility.
  const pre = summarizeRun(runDir);
  const invalid =
    pre.conflicts.length > 0 ||
    pre.corruptLines.length > 0 ||
    pre.duplicateManifestFiles.length > 0 ||
    (pre.extraneousFiles && pre.extraneousFiles.length > 0);
  const cleanCompletion =
    !interrupted && pre.totals.failedFiles === 0 && pre.totals.incompleteFiles === 0 && !invalid;
  const exit = interrupted
    ? EXIT.INTERRUPTED
    : invalid
      ? EXIT.CONFIG_ERROR
      : pre.totals.failedFiles > 0 || pre.totals.incompleteFiles > 0
        ? EXIT.TEST_FAILURES
        : EXIT.GREEN;
  if (cleanCompletion) {
    fs.writeFileSync(path.join(runDir, "completed"), new Date().toISOString());
  }
  fs.writeFileSync(path.join(runDir, "exit-code"), String(exit));
  fs.writeFileSync(
    path.join(runDir, "run-meta"),
    JSON.stringify({ resumeMode, batchResults, interrupted, exit }, null, 2),
  );
  // Regenerate summary now that the marker (if any) exists so status is authoritative.
  const summary = writeSummaryArtifacts(runDir);
  return { runDir, exit, summary, interrupted, batchResults };
}

function writeSummaryArtifacts(runDir) {
  const summary = summarizeRun(runDir);
  fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(runDir, "summary.md"), renderMarkdown(summary));
  return summary;
}

/** Aggregate multiple shard directories. */
export function commandAggregate(opts) {
  const { runDirs, manifestPath } = opts;
  const manifest = manifestPath ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null;
  const shardSummaries = runDirs.map((d) => summarizeRun(d));
  const aggregate = aggregateShards(shardSummaries, { manifest });
  return { aggregate, shardSummaries };
}

// ---- CLI entry ----------------------------------------------------------

async function main(argv, { repoRoot = process.cwd() } = {}) {
  const [sub, ...rest] = argv;
  const args = parseArgs(rest);

  if (sub === "manifest") {
    const manifest = buildManifest(repoRoot);
    process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
    return EXIT.GREEN;
  }
  if (sub === "run") {
    const shardSpec = args.flags.shard || "1/1";
    const batchSize = Number(args.flags["batch-size"] ?? DEFAULTS.batchSize);
    const runsRoot = args.flags["runs-root"]
      ? path.resolve(args.flags["runs-root"])
      : path.resolve(repoRoot, DEFAULTS.runsRoot);
    const batchDeadlineMs = Number(args.flags["batch-deadline-ms"] ?? DEFAULTS.batchDeadlineMs);
    const { exit, runDir, summary } = await commandRun({
      repoRoot,
      shardSpec,
      batchSize,
      runsRoot,
      batchDeadlineMs,
    });
    process.stdout.write(`run dir: ${runDir}\nstatus: ${summary.status}\nexit: ${exit}\n`);
    return exit;
  }
  if (sub === "resume") {
    const { exit, runDir, summary } = await commandResume({
      repoRoot,
      runDir: path.resolve(args.flags["run-dir"]),
    });
    process.stdout.write(`resumed: ${runDir}\nstatus: ${summary.status}\nexit: ${exit}\n`);
    return exit;
  }
  if (sub === "rerun-failed") {
    const { exit, runDir } = await commandRerunFailed({
      repoRoot,
      runDir: path.resolve(args.flags["run-dir"]),
    });
    process.stdout.write(`rerun dir: ${runDir}\nexit: ${exit}\n`);
    return exit;
  }
  if (sub === "summarize") {
    const runDir = path.resolve(args.flags["run-dir"]);
    const summary = writeSummaryArtifacts(runDir);
    if (args.flags.json) process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    else process.stdout.write(renderMarkdown(summary));
    return summary.status === "complete" ? EXIT.GREEN : EXIT.TEST_FAILURES;
  }
  if (sub === "aggregate") {
    const dirs = args.positional.map((p) => path.resolve(p));
    const manifestPath = args.flags["manifest"] ? path.resolve(args.flags["manifest"]) : null;
    const { aggregate } = commandAggregate({ runDirs: dirs, manifestPath });
    process.stdout.write(JSON.stringify(aggregate, null, 2) + "\n");
    return aggregate.status === "complete" ? EXIT.GREEN : EXIT.TEST_FAILURES;
  }
  process.stderr.write(
    `Usage: verdant-vitest-controlled <run|resume|rerun-failed|summarize|aggregate|manifest> [--flags]\n`,
  );
  return EXIT.CONFIG_ERROR;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err?.stack || err?.message || err);
      process.exit(err?.code ?? EXIT.CONFIG_ERROR);
    },
  );
}

export { main };
