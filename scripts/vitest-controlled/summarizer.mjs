// Read run artifacts and produce machine-readable JSON, Markdown, and
// terminal summaries. Structured progress is authoritative; raw logs
// are diagnostics only.
import fs from "node:fs";
import path from "node:path";

export const SUMMARY_SCHEMA_VERSION = 1;

/** Read progress.jsonl and reduce to a per-file map + batch events.
 *  Deduplication rule:
 *    * Identical duplicate events: silently deduped (same status +
 *      identical counts).
 *    * Conflicting duplicate events: recorded as `conflicts` and make
 *      the run invalid.
 */
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

/** Build a shard-level summary from a run directory. */
export function summarizeRun(runDir, { authoritativeManifest } = {}) {
  const runJson = loadJson(path.join(runDir, "run.json"));
  const manifestJson = loadJson(path.join(runDir, "manifest.json"));
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

  const expected = manifest?.files ?? [...files.keys()].sort();
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
  if (conflicts.length || corruptLines.length || duplicatesInManifest.length) {
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
    sourceFingerprint: runJson?.sourceFingerprint ?? null,
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
    totals,
    perFile,
    incompleteFiles,
    failedFilesList,
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

/** Aggregate multiple shard summaries. Returns { status, totals, ... }. */
export function aggregateShards(shardSummaries, { manifest } = {}) {
  const seen = new Map(); // file -> shardIndex that reported it
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
  const shardFingerprints = new Set();
  const shardManifestHashes = new Set();
  for (const s of shardSummaries) {
    shardFingerprints.add(s.sourceFingerprint || "");
    shardManifestHashes.add(s.manifestHash || "");
    for (const r of s.perFile) {
      if (seen.has(r.file)) {
        duplicates.push({ file: r.file, shards: [seen.get(r.file), s.shardIndex] });
      } else {
        seen.set(r.file, s.shardIndex);
      }
      if (r.status === "passed") merged.passedFiles++;
      else if (r.status === "failed") {
        merged.failedFiles++;
        failedFiles.push(r.file);
      } else if (r.status === "skipped") merged.skippedFiles++;
      else {
        merged.incompleteFiles++;
        incompleteFiles.push(r.file);
      }
      if (r.counts) {
        merged.passedTests += r.counts.passed || 0;
        merged.failedTests += r.counts.failed || 0;
        merged.skippedTests += r.counts.skipped || 0;
        merged.todoTests += r.counts.todo || 0;
      }
    }
  }
  const missingFiles = manifest ? manifest.files.filter((f) => !seen.has(f)) : [];
  const shardsAgree =
    shardManifestHashes.size <= 1 && (shardFingerprints.size === 0 || shardFingerprints.size === 1);
  let status;
  if (
    duplicates.length ||
    missingFiles.length ||
    !shardsAgree ||
    shardSummaries.some((s) => s.status === "invalid")
  ) {
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
    shardCount: shardSummaries.length,
    totals: merged,
    failedFiles,
    incompleteFiles,
    duplicates,
    missingFiles,
    shardManifestHashes: [...shardManifestHashes],
    shardFingerprints: [...shardFingerprints],
  };
}
