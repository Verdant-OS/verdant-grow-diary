// v4 shard artifact verifier.
//
// Reads each shard directory and proves the controlled-runner artifact
// contract holds: schemas, fingerprints (recomputed), manifest integrity,
// toolchain agreement, completion, and zero failed/incomplete files.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { MANIFEST_SCHEMA_VERSION, hashManifest, dedupeAndSort } from "./manifest.mjs";
import {
  FINGERPRINT_SCHEMA_VERSION,
  CONFIG_FINGERPRINT_SCHEMA_VERSION,
  computeAssignmentFingerprint,
  computeShardFingerprint,
} from "./fingerprint.mjs";
import { REPORTER_SCHEMA_VERSION } from "./reporter.mjs";
import { SUMMARY_SCHEMA_VERSION } from "./summarizer.mjs";
import { RUN_SCHEMA_VERSION } from "./cli.mjs";

export const EXPECTED_SCHEMAS = Object.freeze({
  run: RUN_SCHEMA_VERSION,
  summary: SUMMARY_SCHEMA_VERSION,
  manifest: MANIFEST_SCHEMA_VERSION,
  reporter: REPORTER_SCHEMA_VERSION,
  workspaceFingerprint: FINGERPRINT_SCHEMA_VERSION,
  configFingerprint: CONFIG_FINGERPRINT_SCHEMA_VERSION,
});

function safeReadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return { __error: err.message };
  }
}

/** Verify a single shard directory. Pure: takes the parsed inputs. */
export function verifyShardInputs({
  run,
  summary,
  manifest,
  shardFiles,
  completedMarkerExists,
  exitCodeText,
  allowIncomplete = false,
}) {
  const reasons = [];
  const add = (code, detail = {}) => reasons.push({ code, ...detail });

  if (!run || run.__error) add("run_json_unreadable", { error: run?.__error });
  if (!summary || summary.__error) add("summary_json_unreadable", { error: summary?.__error });
  if (!manifest || manifest.__error) add("manifest_json_unreadable", { error: manifest?.__error });
  if (!Array.isArray(shardFiles)) add("shard_files_unreadable");

  if (run && run.schema !== EXPECTED_SCHEMAS.run) {
    add("run_schema_mismatch", { expected: EXPECTED_SCHEMAS.run, actual: run.schema });
  }
  if (summary && summary.schema !== EXPECTED_SCHEMAS.summary) {
    add("summary_schema_mismatch", { expected: EXPECTED_SCHEMAS.summary, actual: summary.schema });
  }
  if (summary && summary.runSchema !== EXPECTED_SCHEMAS.run) {
    add("summary_run_schema_mismatch", {
      expected: EXPECTED_SCHEMAS.run,
      actual: summary.runSchema,
    });
  }
  if (run && run.reporterSchema !== EXPECTED_SCHEMAS.reporter) {
    add("reporter_schema_mismatch", {
      expected: EXPECTED_SCHEMAS.reporter,
      actual: run.reporterSchema,
    });
  }
  if (manifest && manifest.schema !== EXPECTED_SCHEMAS.manifest) {
    add("manifest_schema_mismatch", {
      expected: EXPECTED_SCHEMAS.manifest,
      actual: manifest.schema,
    });
  }
  if (run && run.workspaceFingerprint?.schema !== EXPECTED_SCHEMAS.workspaceFingerprint) {
    add("workspace_fingerprint_schema_mismatch", {
      expected: EXPECTED_SCHEMAS.workspaceFingerprint,
      actual: run.workspaceFingerprint?.schema ?? null,
    });
  }

  // Cross-consistency between run + summary identity fields.
  if (run && summary) {
    for (const field of [
      "commonConfigFingerprint",
      "assignmentFingerprint",
      "shardFingerprint",
      "manifestHash",
    ]) {
      if ((run[field] ?? null) !== (summary[field] ?? null)) {
        add("identity_field_divergence", {
          field,
          run: run[field] ?? null,
          summary: summary[field] ?? null,
        });
      }
    }
    if (
      (run.workspaceFingerprint?.digest ?? null) !== (summary.workspaceFingerprintDigest ?? null)
    ) {
      add("workspace_digest_divergence");
    }
    for (const t of ["node", "bun", "vitest"]) {
      const a = run.toolVersions?.[t] ?? null;
      const b = summary.toolVersions?.[t] ?? null;
      if (a !== b) add("toolchain_divergence", { tool: t, run: a, summary: b });
    }
  }

  // Manifest integrity: declared count, dedupe, recomputed hash.
  if (manifest && !manifest.__error && Array.isArray(manifest.files)) {
    if (manifest.count !== manifest.files.length) {
      add("manifest_count_mismatch", { declared: manifest.count, actual: manifest.files.length });
    }
    try {
      const sorted = dedupeAndSort(manifest.files);
      const recomputed = hashManifest(sorted);
      if (recomputed !== manifest.hash) {
        add("manifest_hash_mismatch", { stored: manifest.hash, recomputed });
      }
      if (run && manifest.hash !== run.manifestHash) {
        add("manifest_hash_run_divergence", { run: run.manifestHash, manifest: manifest.hash });
      }
    } catch (err) {
      add("manifest_duplicate_paths", { error: err.message });
    }

    // Every shard file must be in the manifest.
    if (Array.isArray(shardFiles)) {
      const set = new Set(manifest.files);
      const outside = shardFiles.filter((f) => !set.has(f));
      if (outside.length) add("shard_files_outside_manifest", { files: outside.slice(0, 10) });
    }
  }

  // Fingerprint recomputation.
  if (
    run &&
    Array.isArray(shardFiles) &&
    Number.isInteger(run.shardIndex) &&
    Number.isInteger(run.shardTotal)
  ) {
    try {
      const recomputedAssign = computeAssignmentFingerprint({
        shardIndex: run.shardIndex,
        shardTotal: run.shardTotal,
        assignedFiles: shardFiles,
      });
      if (recomputedAssign !== run.assignmentFingerprint) {
        add("assignment_fingerprint_mismatch", {
          stored: run.assignmentFingerprint,
          recomputed: recomputedAssign,
        });
      }
      if (run.commonConfigFingerprint && run.shardFingerprint) {
        const recomputedShard = computeShardFingerprint({
          commonConfigFingerprint: run.commonConfigFingerprint,
          assignmentFingerprint: recomputedAssign,
          shardIndex: run.shardIndex,
          shardTotal: run.shardTotal,
        });
        if (recomputedShard !== run.shardFingerprint) {
          add("shard_fingerprint_mismatch", {
            stored: run.shardFingerprint,
            recomputed: recomputedShard,
          });
        }
      }
    } catch (err) {
      add("fingerprint_recompute_failed", { error: err.message });
    }
  }

  // Completion + exit codes.
  if (!completedMarkerExists) add("missing_completed_marker");
  const fileExit = exitCodeText == null ? null : Number(String(exitCodeText).trim());
  if (fileExit == null || Number.isNaN(fileExit)) {
    add("missing_exit_code_file");
  } else if (fileExit !== 0) {
    add("nonzero_exit_code_file", { exitCode: fileExit });
  }
  if (summary && summary.exitCode != null && summary.exitCode !== 0) {
    add("nonzero_summary_exit_code", { exitCode: summary.exitCode });
  }
  if (summary && summary.status && summary.status !== "complete") {
    if (!(allowIncomplete && summary.status === "interrupted")) {
      add("summary_not_complete", { status: summary.status });
    }
  }

  // Zero failed/incomplete/extraneous/conflict/corrupt.
  const totals = summary?.totals || {};
  if ((totals.failedFiles || 0) > 0) add("failed_files_present", { count: totals.failedFiles });
  if ((totals.incompleteFiles || 0) > 0 && !allowIncomplete) {
    add("incomplete_files_present", { count: totals.incompleteFiles });
  }
  if ((summary?.extraneousFiles || []).length) add("extraneous_files_present");
  if ((summary?.conflicts || []).length) add("conflicts_present");
  if ((summary?.corruptLines || []).length) add("corrupt_lines_present");

  return { ok: reasons.length === 0, reasons };
}

/** File-system wrapper. */
export function verifyShardDirectory(shardDir, { allowIncomplete = false } = {}) {
  const run = safeReadJson(path.join(shardDir, "run.json"));
  const summary = safeReadJson(path.join(shardDir, "summary.json"));
  const manifest = safeReadJson(path.join(shardDir, "manifest.json"));
  let shardFiles = null;
  try {
    shardFiles = JSON.parse(fs.readFileSync(path.join(shardDir, "shard-files.json"), "utf8"));
  } catch {
    shardFiles = null;
  }
  const completedMarkerExists = fs.existsSync(path.join(shardDir, "completed"));
  let exitCodeText = null;
  try {
    exitCodeText = fs.readFileSync(path.join(shardDir, "exit-code"), "utf8");
  } catch {
    exitCodeText = null;
  }
  const result = verifyShardInputs({
    run,
    summary,
    manifest,
    shardFiles,
    completedMarkerExists,
    exitCodeText,
    allowIncomplete,
  });
  return { shardDir, ...result, run, summary, manifest };
}

function parseArgv(argv) {
  const out = { dirs: [], json: false, allowIncomplete: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--allow-incomplete") out.allowIncomplete = true;
    else out.dirs.push(a);
  }
  return out;
}

export async function main(argv) {
  const args = parseArgv(argv);
  if (!args.dirs.length) {
    process.stderr.write("Usage: verify-artifacts.mjs <shard-dir> [<shard-dir> ...] [--json]\n");
    return 64;
  }
  const results = args.dirs.map((d) =>
    verifyShardDirectory(path.resolve(d), { allowIncomplete: args.allowIncomplete }),
  );
  const ok = results.every((r) => r.ok);
  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok,
          shards: results.map((r) => ({ dir: r.shardDir, ok: r.ok, reasons: r.reasons })),
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    for (const r of results) {
      process.stdout.write(`${r.ok ? "OK " : "FAIL"} ${r.shardDir}\n`);
      for (const rn of r.reasons) process.stdout.write(`  - ${rn.code}\n`);
    }
  }
  return ok ? 0 : 2;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(String(err?.stack || err) + "\n");
      process.exit(1);
    },
  );
}
