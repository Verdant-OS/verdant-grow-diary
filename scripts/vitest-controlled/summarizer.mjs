// Read run artifacts and produce machine-readable JSON, Markdown, and
// terminal summaries. Structured progress is authoritative; raw logs
// are diagnostics only.
//
// Summary schema history:
//   v1 — pre-v4 identity model with `sourceFingerprint`.
//   v2 — v4 identity model: commonConfigFingerprint, assignmentFingerprint,
//        shardFingerprint; aggregate emits structured `reasons[]`.
import fs from "node:fs";
import path from "node:path";
import { computeAssignmentFingerprint, computeShardFingerprint } from "./fingerprint.mjs";

export const SUMMARY_SCHEMA_VERSION = 2;

/** Read progress.jsonl and reduce to a per-file map + batch events. */
export function readProgress(progressFile) {
  const files = new Map();
  const batches = [];
  const conflicts = [];
  const corruptLines = [];
  let raw;
  try {
    raw = fs.readFileSync(progressFile, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { files, batches, conflicts, corruptLines };
    throw err;
  }
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      corruptLines.push({ line: i + 1, preview: line.slice(0, 80) });
      continue;
    }
    if (ev.event === "file") {
      const prev = files.get(ev.file);
      if (!prev) {
        files.set(ev.file, ev);
      } else if (
        prev.status === ev.status &&
        prev.counts?.passed === ev.counts?.passed &&
        prev.counts?.failed === ev.counts?.failed &&
        prev.counts?.skipped === ev.counts?.skipped
      ) {
        // identical duplicate — ignore
      } else {
        conflicts.push({ file: ev.file, previous: prev, next: ev });
      }
    } else if (ev.event === "batch-end") {
      batches.push(ev);
    }
  }
  return { files, batches, conflicts, corruptLines };
}

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export function summarizeRun(runDir, { authoritativeManifest, expectedFiles } = {}) {
  const runJson = loadJson(path.join(runDir, "run.json"));
  const manifestJson = loadJson(path.join(runDir, "manifest.json"));
  const shardFilesJson = loadJson(path.join(runDir, "shard-files.json"));
  const manifest = authoritativeManifest ?? manifestJson;
  const progressFile = path.join(runDir, "progress.jsonl");
  const { files, batches, conflicts, corruptLines } = readProgress(progressFile);
  const completedMarker = fs.existsSync(path.join(runDir, "completed"));
  const exitCode = (() => {
    try {
      return Number(fs.readFileSync(path.join(runDir, "exit-code"), "utf8").trim());
    } catch {
      return null;
    }
  })();

  const expected =
    expectedFiles ??
    (Array.isArray(shardFilesJson) ? shardFilesJson : null) ??
    manifest?.files ??
    [...files.keys()].sort();
  const expectedSet = new Set(expected);
  const extraneous = [...files.keys()].filter((f) => !expectedSet.has(f));
  const perFile = expected.map((rel) => {
    const ev = files.get(rel);
    if (!ev) return { file: rel, status: "incomplete", counts: null, failedTests: [] };
    return {
      file: rel,
      status: ev.status,
      counts: ev.counts,
      duration: ev.duration,
      failedTests: ev.failedTests || [],
    };
  });

  const totals = perFile.reduce(
    (acc, r) => {
      if (r.status === "passed") acc.passedFiles++;
      else if (r.status === "failed") acc.failedFiles++;
      else if (r.status === "skipped") acc.skippedFiles++;
      else acc.incompleteFiles++;
      if (r.counts) {
        acc.passedTests += r.counts.passed || 0;
        acc.failedTests += r.counts.failed || 0;
        acc.skippedTests += r.counts.skipped || 0;
        acc.todoTests += r.counts.todo || 0;
      }
      return acc;
    },
    {
      passedFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      incompleteFiles: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      todoTests: 0,
    },
  );

  const incompleteFiles = perFile.filter((r) => r.status === "incomplete").map((r) => r.file);
  const failedFilesList = perFile.filter((r) => r.status === "failed").map((r) => r.file);
  const duplicatesInManifest = (() => {
    const seen = new Set();
    const d = [];
    for (const f of expected) {
      if (seen.has(f)) d.push(f);
      seen.add(f);
    }
    return d;
  })();

  let status;
  if (conflicts.length || corruptLines.length || duplicatesInManifest.length || extraneous.length) {
    status = "invalid";
  } else if (!completedMarker) {
    status = "interrupted";
  } else if (totals.failedFiles > 0 || totals.incompleteFiles > 0) {
    status = "failed";
  } else {
    status = "complete";
  }

  return {
    schema: SUMMARY_SCHEMA_VERSION,
    runId: runJson?.runId ?? null,
    runDir,
    shardIndex: runJson?.shardIndex ?? null,
    shardTotal: runJson?.shardTotal ?? null,
    manifestHash: manifest?.hash ?? null,
    // v4 identity fields (authoritative)
    commonConfigFingerprint: runJson?.commonConfigFingerprint ?? null,
    assignmentFingerprint: runJson?.assignmentFingerprint ?? null,
    shardFingerprint: runJson?.shardFingerprint ?? null,
    workspaceFingerprintDigest: runJson?.workspaceFingerprint?.digest ?? null,
    workspaceFingerprintSchema: runJson?.workspaceFingerprint?.schema ?? null,
    runSchema: runJson?.schema ?? null,
    reporterSchema: runJson?.reporterSchema ?? null,
    toolVersions: runJson?.toolVersions
      ? {
          node: runJson.toolVersions.node ?? null,
          bun: runJson.toolVersions.bun ?? null,
          vitest: runJson.toolVersions.vitest ?? null,
        }
      : null,
    status,
    exitCode,
    completed: completedMarker,
    shardFileCount: expected.length,
    // The assigned-file list is persisted so aggregate validation can
    // recompute assignmentFingerprint from paths reported by this shard
    // (not just trust the stored fingerprint).
    assignedFiles: [...expected],
    totals,
    perFile,
    incompleteFiles,
    failedFilesList,
    extraneousFiles: extraneous,
    conflicts,
    corruptLines,
    duplicateManifestFiles: duplicatesInManifest,
    batchCount: batches.length,
    rawLogPath: fs.existsSync(path.join(runDir, "raw", "batch-000.log"))
      ? path.join(runDir, "raw")
      : null,
    finalVitestSummaryObserved: batches.some((b) => b.event === "batch-end"),
  };
}

/** Render a compact Markdown summary. */
export function renderMarkdown(summary) {
  const t = summary.totals;
  const lines = [];
  lines.push(`# Vitest controlled run — shard ${summary.shardIndex}/${summary.shardTotal}`);
  lines.push("");
  lines.push(`- **Status:** \`${summary.status}\``);
  lines.push(`- **Run ID:** \`${summary.runId ?? "?"}\``);
  lines.push(`- **Manifest hash:** \`${(summary.manifestHash || "").slice(0, 12)}…\``);
  lines.push(`- **Common config:** \`${(summary.commonConfigFingerprint || "").slice(0, 12)}…\``);
  lines.push(`- **Assignment:** \`${(summary.assignmentFingerprint || "").slice(0, 12)}…\``);
  lines.push(`- **Exit code:** ${summary.exitCode ?? "(none)"}`);
  lines.push("");
  lines.push(`## File totals`);
  lines.push(
    `- passed: ${t.passedFiles} · failed: ${t.failedFiles} · skipped: ${t.skippedFiles} · incomplete: ${t.incompleteFiles}`,
  );
  lines.push(`## Test totals`);
  lines.push(
    `- passed: ${t.passedTests} · failed: ${t.failedTests} · skipped: ${t.skippedTests} · todo: ${t.todoTests}`,
  );
  if (summary.failedFilesList.length) {
    lines.push("");
    lines.push(`## Failed files`);
    for (const f of summary.failedFilesList) lines.push(`- \`${f}\``);
  }
  if (summary.incompleteFiles.length) {
    lines.push("");
    lines.push(`## Incomplete files`);
    for (const f of summary.incompleteFiles) lines.push(`- \`${f}\``);
  }
  if (summary.conflicts.length) {
    lines.push("");
    lines.push(`## Conflicting duplicate events`);
    for (const c of summary.conflicts) lines.push(`- \`${c.file}\``);
  }
  if (summary.corruptLines.length) {
    lines.push("");
    lines.push(`## Corrupt progress lines`);
    for (const c of summary.corruptLines) lines.push(`- line ${c.line}: \`${c.preview}\``);
  }
  return lines.join("\n") + "\n";
}

// Structured aggregate reason codes — the caller can filter/route on
// these instead of scraping the top-level status string.
export const AGGREGATE_REASON_CODES = Object.freeze([
  "incompatible_schema",
  "missing_shard",
  "duplicate_shard",
  "out_of_range_shard",
  "common_config_mismatch",
  "workspace_mismatch",
  "manifest_mismatch",
  "assignment_fingerprint_mismatch",
  "shard_fingerprint_mismatch",
  "toolchain_mismatch",
  "duplicate_file",
  "missing_file",
  "extra_file",
  "test_failure",
  "incomplete_result",
  "corrupt_artifact",
]);

/**
 * Aggregate multiple shard summaries under the v4 identity contract.
 *
 * Distinct `assignmentFingerprint` / `shardFingerprint` values across
 * shards are EXPECTED — they must never invalidate the aggregate. The
 * one field required to be identical run-wide is `commonConfigFingerprint`.
 */
export function aggregateShards(shardSummaries, { manifest } = {}) {
  const reasons = [];
  const addReason = (code, detail) => reasons.push({ code, ...detail });

  const declaredTotals = new Set(shardSummaries.map((s) => s.shardTotal).filter((n) => n != null));
  const declaredTotal = declaredTotals.size === 1 ? [...declaredTotals][0] : shardSummaries.length;

  // --- Shard-index integrity ---------------------------------------------
  const indexCounts = new Map();
  for (const s of shardSummaries) {
    const idx = s.shardIndex;
    if (!Number.isInteger(idx) || idx < 1 || (declaredTotal && idx > declaredTotal)) {
      addReason("out_of_range_shard", { shardIndex: idx, declaredTotal });
    }
    indexCounts.set(idx, (indexCounts.get(idx) ?? 0) + 1);
  }
  for (const [idx, c] of indexCounts) {
    if (c > 1) addReason("duplicate_shard", { shardIndex: idx, occurrences: c });
  }
  if (declaredTotals.size > 1) {
    addReason("incompatible_schema", { field: "shardTotal", values: [...declaredTotals] });
  }
  if (declaredTotal) {
    for (let i = 1; i <= declaredTotal; i++) {
      if (!indexCounts.has(i)) addReason("missing_shard", { shardIndex: i });
    }
  }

  // --- Cross-shard identity axes -----------------------------------------
  const commonSet = new Set(shardSummaries.map((s) => s.commonConfigFingerprint ?? ""));
  const workspaceSet = new Set(
    shardSummaries.map((s) => s.workspaceFingerprintDigest ?? "").filter((v) => v),
  );
  const manifestSet = new Set(shardSummaries.map((s) => s.manifestHash ?? ""));
  const runSchemaSet = new Set(shardSummaries.map((s) => s.runSchema).filter((v) => v != null));
  const reporterSchemaSet = new Set(
    shardSummaries.map((s) => s.reporterSchema).filter((v) => v != null),
  );
  const summarySchemaSet = new Set(shardSummaries.map((s) => s.schema).filter((v) => v != null));

  if (commonSet.size > 1) {
    addReason("common_config_mismatch", { values: [...commonSet] });
  }
  if (manifestSet.size > 1) {
    addReason("manifest_mismatch", { values: [...manifestSet] });
  }
  if (workspaceSet.size > 1) {
    addReason("workspace_mismatch", { values: [...workspaceSet] });
  }
  if (runSchemaSet.size > 1 || reporterSchemaSet.size > 1 || summarySchemaSet.size > 1) {
    addReason("incompatible_schema", {
      runSchemas: [...runSchemaSet],
      reporterSchemas: [...reporterSchemaSet],
      summarySchemas: [...summarySchemaSet],
    });
  }

  // --- Toolchain axes (retain legacy `toolchainMismatches` shape) --------
  const shardNodeVersions = new Set();
  const shardBunVersions = new Set();
  const shardVitestVersions = new Set();
  for (const s of shardSummaries) {
    const tv = s.toolVersions || {};
    shardNodeVersions.add(tv.node || "");
    shardBunVersions.add(tv.bun || "");
    shardVitestVersions.add(tv.vitest || "");
  }
  const toolchainMismatches = [];
  if (shardNodeVersions.size > 1)
    toolchainMismatches.push({ tool: "node", values: [...shardNodeVersions] });
  if (shardBunVersions.size > 1)
    toolchainMismatches.push({ tool: "bun", values: [...shardBunVersions] });
  if (shardVitestVersions.size > 1)
    toolchainMismatches.push({ tool: "vitest", values: [...shardVitestVersions] });
  for (const m of toolchainMismatches) addReason("toolchain_mismatch", m);

  // --- Assignment + composite shard fingerprint recomputation ------------
  for (const s of shardSummaries) {
    if (!Array.isArray(s.assignedFiles) || !s.assignmentFingerprint) continue;
    let recomputedAssignment;
    try {
      recomputedAssignment = computeAssignmentFingerprint({
        shardIndex: s.shardIndex,
        shardTotal: s.shardTotal,
        assignedFiles: s.assignedFiles,
      });
    } catch {
      addReason("corrupt_artifact", { shardIndex: s.shardIndex, field: "assignedFiles" });
      continue;
    }
    if (recomputedAssignment !== s.assignmentFingerprint) {
      addReason("assignment_fingerprint_mismatch", {
        shardIndex: s.shardIndex,
        stored: s.assignmentFingerprint,
        recomputed: recomputedAssignment,
      });
    }
    if (s.commonConfigFingerprint && s.shardFingerprint) {
      const recomputedShard = computeShardFingerprint({
        commonConfigFingerprint: s.commonConfigFingerprint,
        assignmentFingerprint: recomputedAssignment,
        shardIndex: s.shardIndex,
        shardTotal: s.shardTotal,
      });
      if (recomputedShard !== s.shardFingerprint) {
        addReason("shard_fingerprint_mismatch", {
          shardIndex: s.shardIndex,
          stored: s.shardFingerprint,
          recomputed: recomputedShard,
        });
      }
    }
  }

  // --- File coverage -----------------------------------------------------
  const seen = new Map();
  const duplicates = [];
  const merged = {
    passedFiles: 0,
    failedFiles: 0,
    skippedFiles: 0,
    incompleteFiles: 0,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    todoTests: 0,
  };
  const failedFiles = [];
  const incompleteFiles = [];
  for (const s of shardSummaries) {
    for (const r of s.perFile) {
      if (seen.has(r.file)) {
        duplicates.push({ file: r.file, shards: [seen.get(r.file), s.shardIndex] });
        addReason("duplicate_file", {
          file: r.file,
          shards: [seen.get(r.file), s.shardIndex],
        });
      } else {
        seen.set(r.file, s.shardIndex);
      }
      if (r.status === "passed") merged.passedFiles++;
      else if (r.status === "failed") {
        merged.failedFiles++;
        failedFiles.push(r.file);
        addReason("test_failure", { file: r.file, shardIndex: s.shardIndex });
      } else if (r.status === "skipped") merged.skippedFiles++;
      else {
        merged.incompleteFiles++;
        incompleteFiles.push(r.file);
        addReason("incomplete_result", { file: r.file, shardIndex: s.shardIndex });
      }
      if (r.counts) {
        merged.passedTests += r.counts.passed || 0;
        merged.failedTests += r.counts.failed || 0;
        merged.skippedTests += r.counts.skipped || 0;
        merged.todoTests += r.counts.todo || 0;
      }
    }
    if (s.status === "invalid") {
      if (s.conflicts?.length || s.corruptLines?.length) {
        addReason("corrupt_artifact", { shardIndex: s.shardIndex });
      }
      if (s.extraneousFiles?.length) {
        for (const f of s.extraneousFiles)
          addReason("extra_file", { file: f, shardIndex: s.shardIndex });
      }
    }
  }
  const missingFiles = manifest ? manifest.files.filter((f) => !seen.has(f)) : [];
  for (const f of missingFiles) addReason("missing_file", { file: f });
  if (manifest) {
    const manifestSetLocal = new Set(manifest.files);
    for (const f of seen.keys()) {
      if (!manifestSetLocal.has(f)) addReason("extra_file", { file: f });
    }
  }

  let status;
  if (reasons.some((r) => r.code !== "test_failure" && r.code !== "incomplete_result")) {
    status = "invalid";
  } else if (shardSummaries.some((s) => s.status === "interrupted")) {
    status = "interrupted";
  } else if (merged.failedFiles > 0 || merged.incompleteFiles > 0) {
    status = "failed";
  } else if (shardSummaries.every((s) => s.status === "complete")) {
    status = "complete";
  } else {
    status = "failed";
  }

  return {
    schema: SUMMARY_SCHEMA_VERSION,
    status,
    reasons,
    shardCount: shardSummaries.length,
    declaredShardTotal: declaredTotal,
    totals: merged,
    failedFiles,
    incompleteFiles,
    duplicates,
    missingFiles,
    // v4 identity axes
    shardCommonConfigFingerprints: [...commonSet],
    shardAssignmentFingerprints: shardSummaries.map((s) => s.assignmentFingerprint ?? null),
    shardCompositeFingerprints: shardSummaries.map((s) => s.shardFingerprint ?? null),
    shardManifestHashes: [...manifestSet],
    shardWorkspaceDigests: [...workspaceSet],
    shardRunSchemas: [...runSchemaSet],
    shardReporterSchemas: [...reporterSchemaSet],
    shardNodeVersions: [...shardNodeVersions],
    shardBunVersions: [...shardBunVersions],
    shardVitestVersions: [...shardVitestVersions],
    toolchainMismatches,
  };
}
