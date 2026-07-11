#!/usr/bin/env node
// Analyze a controlled-runner progress.jsonl (or a run directory) and report
// per-shard reconciliation counts: numeric/opaque entries, real file events,
// duplicates, computed extraneous paths vs assigned shard files, missing
// assigned paths, batch-end count, corrupt-line count.
//
// Usage:
//   node scripts/vitest-controlled/analyze-progress.mjs <run-dir-or-progress.jsonl>
//   node scripts/vitest-controlled/analyze-progress.mjs --json <run-dir> [...]
import fs from "node:fs";
import path from "node:path";

export const ANALYZER_SCHEMA_VERSION = 1;

function looksLikeOpaqueId(value) {
  if (typeof value !== "string") return false;
  return /^-?\d+$/.test(value.trim());
}

/**
 * Analyze a progress.jsonl content string plus optional assignment
 * metadata. Returns a structured report; never throws for malformed
 * lines (they are counted as corrupt).
 */
export function analyzeProgressContent(progressText, options = {}) {
  const {
    assignedFiles = null, // Array<string> | null (null = unknown)
    summaryExtraneous = null, // number | null
  } = options;

  const lines = progressText.split(/\r?\n/);
  let totalFileEvents = 0;
  let batchEndCount = 0;
  let corruptLineCount = 0;

  const numericEntries = [];
  const realEventPaths = [];
  const realEventPathCounts = new Map();

  for (const raw of lines) {
    if (!raw.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      corruptLineCount++;
      continue;
    }
    if (parsed?.event === "batch-end") {
      batchEndCount++;
      continue;
    }
    if (parsed?.event !== "file") continue;
    totalFileEvents++;
    const file = parsed.file;
    if (looksLikeOpaqueId(file)) {
      numericEntries.push(file);
    } else if (typeof file === "string" && file.length > 0) {
      realEventPaths.push(file);
      realEventPathCounts.set(file, (realEventPathCounts.get(file) ?? 0) + 1);
    }
  }

  const uniqueNumeric = new Set(numericEntries);
  const dedupedRealPaths = new Set(realEventPaths);
  let duplicateRealEvents = 0;
  for (const c of realEventPathCounts.values()) {
    if (c > 1) duplicateRealEvents += c - 1;
  }

  const assignedKnown = Array.isArray(assignedFiles);
  const assignedSet = assignedKnown ? new Set(assignedFiles) : null;

  const computedExtraneous = assignedKnown
    ? [...dedupedRealPaths].filter((f) => !assignedSet.has(f))
    : null;
  const missingAssigned = assignedKnown
    ? [...assignedSet].filter((f) => !dedupedRealPaths.has(f))
    : null;

  return {
    schema: ANALYZER_SCHEMA_VERSION,
    assignedCount: assignedKnown ? assignedFiles.length : "unknown",
    totalFileEvents,
    numericEventCount: numericEntries.length,
    uniqueNumericCount: uniqueNumeric.size,
    realEventCount: realEventPaths.length,
    dedupedRealPathCount: dedupedRealPaths.size,
    duplicateRealEventCount: duplicateRealEvents,
    computedExtraneousCount: assignedKnown ? computedExtraneous.length : "unknown",
    computedExtraneousSample: assignedKnown ? computedExtraneous.slice(0, 5) : null,
    summaryExtraneousCount: summaryExtraneous ?? null,
    missingAssignedCount: assignedKnown ? missingAssigned.length : "unknown",
    missingAssignedSample: assignedKnown ? missingAssigned.slice(0, 5) : null,
    batchEndCount,
    corruptLineCount,
  };
}

function readIfExists(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function readJsonIfExists(p) {
  const t = readIfExists(p);
  if (t == null) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** Analyze a run directory or a bare progress.jsonl file. */
export function analyzePath(target) {
  const stat = fs.statSync(target);
  let progressText;
  let assignedFiles = null;
  let summaryExtraneous = null;
  let source;
  if (stat.isDirectory()) {
    const pf = path.join(target, "progress.jsonl");
    progressText = fs.readFileSync(pf, "utf8");
    source = pf;
    const shardFiles = readJsonIfExists(path.join(target, "shard-files.json"));
    if (shardFiles && Array.isArray(shardFiles.files)) {
      assignedFiles = shardFiles.files;
    } else if (Array.isArray(shardFiles)) {
      assignedFiles = shardFiles;
    }
    const summary = readJsonIfExists(path.join(target, "summary.json"));
    if (summary && typeof summary.extraneousCount === "number") {
      summaryExtraneous = summary.extraneousCount;
    } else if (summary && Array.isArray(summary.extraneous)) {
      summaryExtraneous = summary.extraneous.length;
    }
  } else {
    progressText = fs.readFileSync(target, "utf8");
    source = target;
  }
  return {
    source,
    ...analyzeProgressContent(progressText, { assignedFiles, summaryExtraneous }),
  };
}

function formatTextReport(report) {
  const lines = [];
  lines.push(`Source: ${report.source}`);
  lines.push(`  assignedCount:            ${report.assignedCount}`);
  lines.push(`  totalFileEvents:          ${report.totalFileEvents}`);
  lines.push(`  numericEventCount:        ${report.numericEventCount}`);
  lines.push(`  uniqueNumericCount:       ${report.uniqueNumericCount}`);
  lines.push(`  realEventCount:           ${report.realEventCount}`);
  lines.push(`  dedupedRealPathCount:     ${report.dedupedRealPathCount}`);
  lines.push(`  duplicateRealEventCount:  ${report.duplicateRealEventCount}`);
  lines.push(`  computedExtraneousCount:  ${report.computedExtraneousCount}`);
  lines.push(`  summaryExtraneousCount:   ${report.summaryExtraneousCount ?? "n/a"}`);
  lines.push(`  missingAssignedCount:     ${report.missingAssignedCount}`);
  lines.push(`  batchEndCount:            ${report.batchEndCount}`);
  lines.push(`  corruptLineCount:         ${report.corruptLineCount}`);
  return lines.join("\n");
}

function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Usage: analyze-progress.mjs <run-dir-or-progress.jsonl> [more...] [--json]",
    );
    process.exit(2);
  }
  const jsonMode = args.includes("--json");
  const targets = args.filter((a) => a !== "--json");
  const reports = targets.map((t) => analyzePath(t));
  if (jsonMode) {
    process.stdout.write(JSON.stringify(reports, null, 2) + "\n");
  } else {
    process.stdout.write(reports.map(formatTextReport).join("\n\n") + "\n");
  }
}

// Only run main when invoked directly (not when imported by tests).
const isDirect = (() => {
  try {
    const invoked = process.argv[1] && path.resolve(process.argv[1]);
    const self = new URL(import.meta.url).pathname;
    return invoked === path.resolve(self);
  } catch {
    return false;
  }
})();
if (isDirect) main(process.argv);
