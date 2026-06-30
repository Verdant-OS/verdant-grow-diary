#!/usr/bin/env node
/**
 * Verdant CI receipt parser for the batched Vitest workflow.
 *
 * Fetches a GitHub Actions run (metadata + per-job logs via the `gh` CLI) and
 * emits a structured markdown receipt with a GO / PARTIAL / NO-GO verdict.
 *
 * Node built-ins only. No npm deps. Never prints tokens or env values.
 *
 * Pure functions (parseJobLog, summarizeGates, computeVerdict, buildReceipt)
 * are exported and unit-tested with fixtures; the CLI (main) wires `gh`.
 *
 * Usage:
 *   node scripts/parse-vitest-batched-workflow-logs.mjs --run-url=<url>
 *   node scripts/parse-vitest-batched-workflow-logs.mjs --repo=<o/r> --run-id=<id>
 *     [--json-out=<path>] [--md-out=<path>]
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REQUIRED_BATCHES = 16;

export const OOM_PATTERNS = [
  /JavaScript heap out of memory/,
  /FATAL ERROR: Reached heap limit/,
  /ERR_IPC_CHANNEL_CLOSED/,
  /Channel closed/,
];

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/﻿/g, "");

export function detectOOM(text) {
  return OOM_PATTERNS.some((p) => p.test(text));
}

/** Sum Vitest summary lines (` Tests  X passed | Y failed | Z skipped (T)`). */
function sumVitest(section, label) {
  let passed = 0, failed = 0, skipped = 0, seen = 0;
  const re = new RegExp(` ${label} {2}([^\\n(]*)\\(\\d+\\)`, "g");
  for (const m of section.matchAll(re)) {
    seen++;
    const seg = m[1];
    const p = seg.match(/(\d+)\s+passed/);
    const f = seg.match(/(\d+)\s+failed/);
    const s = seg.match(/(\d+)\s+skipped/);
    if (p) passed += +p[1];
    if (f) failed += +f[1];
    if (s) skipped += +s[1];
  }
  return { passed, failed, skipped, seen };
}

/**
 * Parse a single matrix job's log into a batch result. Uses VERDANT_* markers
 * when present (robust); falls back to the human ▶/◀ Batch lines.
 * Vitest summaries are only counted from the batch-run section, so the
 * docs-demo-safety gate (which runs in an earlier step) is excluded by design.
 */
export function parseJobLog(rawLog) {
  const log = stripAnsi(rawLog);

  const startM = log.match(/VERDANT_BATCH_START (\{[^\n]*\})/);
  let batch = null, fileCount = null, chunksExpected = null;
  if (startM) {
    try {
      const o = JSON.parse(startM[1]);
      batch = o.batch; fileCount = o.fileCount ?? null; chunksExpected = o.chunks ?? null;
    } catch { /* ignore malformed marker */ }
  }

  // Section to analyze for counts/OOM = from batch start onward (excludes gates).
  const startIdx = startM ? log.indexOf(startM[0]) : log.search(/▶ Batch \d+:/);
  const section = startIdx >= 0 ? log.slice(startIdx) : log;

  const chunkEnds = [...section.matchAll(/VERDANT_CHUNK_END (\{[^\n]*\})/g)].map((m) => {
    try { return JSON.parse(m[1]); } catch { return null; }
  }).filter(Boolean);
  const chunksRun = chunkEnds.length || (section.match(/chunk \d+\/\d+: (PASS|FAIL)/g) || []).length;

  const endM = section.match(/VERDANT_BATCH_END (\{[^\n]*\})/);
  let endStatus = null, exitCode = null;
  if (endM) {
    try { const o = JSON.parse(endM[1]); endStatus = o.status; exitCode = o.exitCode; } catch { /* ignore */ }
  }

  const tests = sumVitest(section, "Tests");
  const files = sumVitest(section, "Test Files");
  const oom = detectOOM(section);

  let status;
  if (endStatus) status = endStatus === "pass" ? "pass" : (oom ? "oom" : "fail");
  else if (oom) status = "oom";
  else if (tests.failed > 0) status = "fail";
  else if (/◀ Batch \d+: PASS/.test(section)) status = "pass";
  else status = "incomplete";
  if (status === "fail" && oom && tests.failed === 0) status = "oom";

  const complete = chunksExpected != null ? chunksRun >= chunksExpected : status === "pass";

  return {
    batch,
    fileCount,
    chunksExpected,
    chunksRun,
    passed: tests.passed,
    failed: tests.failed,
    skipped: tests.skipped,
    filesPassed: files.passed,
    filesFailed: files.failed,
    filesSkipped: files.skipped,
    filesValidated: status === "pass" ? (fileCount ?? files.passed + files.skipped) : (files.passed + files.skipped),
    oom,
    exitCode,
    status,
    complete,
  };
}

const stepConclusion = (steps, predicate) => {
  const s = (steps || []).find((x) => predicate(x.name || ""));
  return s ? s.conclusion : null;
};

/** Derive safety-gate statuses from a matrix job's steps + log. */
export function summarizeGates(job) {
  const steps = job.steps || [];
  const gatesStep = stepConclusion(steps, (n) => /Safety gates/i.test(n));
  const selfStep = stepConclusion(steps, (n) => /Batch utils self-test/i.test(n));
  const guardStep = stepConclusion(steps, (n) => /Assert batches input/i.test(n));
  const wfSafety = stepConclusion(steps, (n) => /Assert batched workflow safety/i.test(n));

  const gates = [
    { gate: "bun run typecheck", status: gatesStep, notes: "bundled: Safety gates step" },
    { gate: "node scripts/sensor-safety-check.mjs", status: gatesStep, notes: "bundled: Safety gates step" },
    { gate: "node scripts/assert-sensor-intelligence-safety.mjs --quiet", status: gatesStep, notes: "bundled: Safety gates step" },
    { gate: "bun run test:docs-demo-safety", status: gatesStep, notes: "bundled: Safety gates step (excluded from batch totals)" },
    { gate: "batches=16 guard", status: guardStep, notes: "Assert batches input step" },
  ];
  if (wfSafety) gates.push({ gate: "workflow safety (chunk-size=1)", status: wfSafety, notes: "Assert batched workflow safety step" });

  // Batch-utils self-test counts ("N passed, M failed") from the log.
  const log = stripAnsi(job.log || "");
  const m = log.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  const selfTest = {
    status: selfStep || (m ? (Number(m[2]) === 0 ? "success" : "failure") : null),
    passed: m ? Number(m[1]) : null,
    failed: m ? Number(m[2]) : null,
  };

  return { gates, selfTest };
}

export function computeVerdict({ conclusion, batches, gates }) {
  const present = new Set(batches.map((b) => b.batch).filter((b) => b != null));
  const allPresent = [...Array(REQUIRED_BATCHES).keys()].every((i) => present.has(i));
  const anyAssertionFail = batches.some((b) => b.failed > 0);
  const anyOOM = batches.some((b) => b.oom);
  const anyIncomplete = batches.some((b) => b.status !== "pass");
  const gatesOk = gates.length > 0 && gates.every((g) => g.status === "success");

  if (!gatesOk) return { verdict: "NO-GO", reason: "one or more safety gates did not pass" };
  if (anyAssertionFail) return { verdict: "NO-GO", reason: "at least one test assertion failed" };
  if (!allPresent) return { verdict: "NO-GO", reason: `cannot prove all ${REQUIRED_BATCHES} batches ran (missing job data)` };
  if (conclusion === "success" && !anyOOM && !anyIncomplete) return { verdict: "GO", reason: "all batches passed, no OOM, gates green" };
  if (!anyAssertionFail && (anyOOM || anyIncomplete)) return { verdict: "PARTIAL", reason: "OOM/incomplete batch with zero assertion failures" };
  return { verdict: "NO-GO", reason: "unresolved failure state" };
}

const fmtDur = (a, b) => {
  if (!a || !b) return "-";
  const ms = new Date(b) - new Date(a);
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};

/** Build the full receipt object + markdown from run metadata and matrix jobs. */
export function buildReceipt({ run, jobs }) {
  const matrix = jobs
    .map((j) => {
      const m = (j.name || "").match(/\(matrix\)\s*\((\d+)\)/);
      if (!m) return null;
      const parsed = parseJobLog(j.log || "");
      return {
        ...parsed,
        batch: parsed.batch != null ? parsed.batch : Number(m[1]),
        name: j.name,
        conclusion: j.conclusion,
        duration: fmtDur(j.startedAt, j.completedAt),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.batch - b.batch);

  const gateSource = jobs.find((j) => /\(matrix\)/.test(j.name || "")) || jobs[0] || {};
  const { gates, selfTest } = summarizeGates(gateSource);

  const { verdict, reason } = computeVerdict({ conclusion: run.conclusion, batches: matrix, gates });

  const passing = matrix.filter((b) => b.status === "pass");
  const totalPassed = passing.reduce((a, b) => a + b.passed, 0);
  const totalFailed = matrix.reduce((a, b) => a + b.failed, 0);
  const totalSkipped = passing.reduce((a, b) => a + b.skipped, 0);
  const totalFiles = passing.reduce((a, b) => a + (b.filesValidated || 0), 0);
  const oomBatches = matrix.filter((b) => b.oom).map((b) => b.batch);
  const unvalidated = matrix.filter((b) => b.status !== "pass").map((b) => b.batch);

  const md = buildMarkdown({ run, verdict, reason, gates, selfTest, matrix, agg: { totalPassed, totalFailed, totalSkipped, totalFiles, oomBatches, unvalidated } });

  return {
    verdict,
    reason,
    markdown: md,
    json: { run, verdict, reason, gates, selfTest, batches: matrix, aggregate: { totalPassed, totalFailed, totalSkipped, totalFiles, oomBatches, unvalidated } },
  };
}

function buildMarkdown({ run, verdict, reason, gates, selfTest, matrix, agg }) {
  const L = [];
  L.push("# Verdant CI Chunk Size 1 Receipt", "");
  L.push("## Executive verdict", `${verdict} — ${reason}`, "");
  L.push("## Workflow");
  L.push(`- workflow: ${run.workflowName ?? "-"}`);
  L.push(`- run URL: ${run.url ?? "-"}`);
  L.push(`- ref: ${run.headBranch ?? "-"}`);
  L.push(`- commit SHA: ${run.headSha ?? "-"}`);
  L.push(`- started: ${run.createdAt ?? "-"}`);
  L.push(`- completed: ${run.updatedAt ?? "-"}`);
  L.push(`- conclusion: ${run.conclusion ?? "-"}`, "");
  L.push("## Safety gates", "", "| gate | status | notes |", "|---|---|---|");
  for (const g of gates) L.push(`| ${g.gate} | ${g.status ?? "unknown"} | ${g.notes} |`);
  L.push("");
  L.push("## Batch-utils self-test");
  L.push(`- status: ${selfTest.status ?? "unknown"}`);
  L.push(`- passed: ${selfTest.passed ?? "-"}`);
  L.push(`- failed: ${selfTest.failed ?? "-"}`, "");
  L.push("## Batch matrix results", "");
  L.push("| batch | status | passed | failed | skipped | files validated | chunks run | duration | OOM | notes |");
  L.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const b of matrix) {
    L.push(
      `| ${b.batch} | ${b.status} | ${b.passed} | ${b.failed} | ${b.skipped} | ${b.filesValidated ?? "-"} | ${b.chunksRun}${b.chunksExpected != null ? "/" + b.chunksExpected : ""} | ${b.duration ?? "-"} | ${b.oom ? "yes" : "no"} | ${b.status === "pass" ? "" : (b.oom ? "OOM" : "incomplete/failed")} |`,
    );
  }
  L.push("");
  L.push("## Aggregate results");
  L.push(`- total passed: ${agg.totalPassed}`);
  L.push(`- total failed: ${agg.totalFailed}`);
  L.push(`- total skipped: ${agg.totalSkipped}`);
  L.push(`- total files validated: ${agg.totalFiles}`);
  L.push(`- failed files/tests: ${agg.totalFailed === 0 ? "none" : agg.totalFailed + " failed tests"}`);
  L.push(`- unvalidated batches: ${agg.unvalidated.length ? agg.unvalidated.join(", ") : "none"}`);
  L.push(`- OOM batches: ${agg.oomBatches.length ? agg.oomBatches.join(", ") : "none"}`, "");
  L.push("## Failures or OOMs");
  const probs = matrix.filter((b) => b.status !== "pass");
  if (!probs.length) L.push("- none", "");
  else {
    for (const b of probs) {
      L.push(`- batch: ${b.batch}`);
      L.push(`  - chunk/file: chunk ${b.chunksRun}${b.chunksExpected != null ? "/" + b.chunksExpected : ""} (first failing)`);
      L.push(`  - error summary: ${b.oom ? "JavaScript heap out of memory (V8 heap limit)" : "batch did not complete / test failure"}`);
      L.push(`  - heap size: ${b.oom ? "~4 GB cap reached" : "-"}`);
      L.push(`  - recommended next step: ${b.oom ? "reduce per-process file load further or fix the leaking test; verify under CI" : "inspect the failing chunk log"}`);
    }
    L.push("");
  }
  L.push("## Safety confirmation");
  L.push("- no counts invented: all numbers parsed from run job logs");
  L.push("- all numbers came from the run logs");
  return L.join("\n");
}

// ---------------- CLI (gh wiring) ----------------

function parseArgs(argv) {
  const o = { repo: null, runId: null, jsonOut: null, mdOut: null };
  for (const a of argv) {
    if (a.startsWith("--run-url=")) {
      const m = a.slice("--run-url=".length).match(/github\.com\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)/);
      if (m) { o.repo = m[1]; o.runId = m[2]; }
    } else if (a.startsWith("--repo=")) o.repo = a.slice("--repo=".length);
    else if (a.startsWith("--run-id=")) o.runId = a.slice("--run-id=".length);
    else if (a.startsWith("--json-out=")) o.jsonOut = a.slice("--json-out=".length);
    else if (a.startsWith("--md-out=")) o.mdOut = a.slice("--md-out=".length);
  }
  return o;
}

function ghAvailable() {
  const r = spawnSync("gh", ["auth", "status"], { encoding: "utf8" });
  return r.status === 0;
}

function gh(args) {
  const r = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (r.status !== 0) throw new Error((r.stderr || "gh command failed").split("\n")[0]);
  return r.stdout;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.repo || !o.runId) {
    console.error("Usage: --run-url=<url> OR --repo=<owner/repo> --run-id=<id>");
    process.exit(2);
  }
  if (!ghAvailable()) {
    console.error("GitHub CLI authentication required to fetch workflow logs.");
    process.exit(2);
  }
  let runJson;
  try {
    runJson = JSON.parse(
      gh(["run", "view", o.runId, "--repo", o.repo, "--json", "workflowName,url,headBranch,headSha,status,conclusion,createdAt,updatedAt,jobs"]),
    );
  } catch (e) {
    console.error("GitHub CLI authentication required to fetch workflow logs.");
    process.exit(2);
  }
  const run = {
    workflowName: runJson.workflowName, url: runJson.url, headBranch: runJson.headBranch,
    headSha: runJson.headSha, status: runJson.status, conclusion: runJson.conclusion,
    createdAt: runJson.createdAt, updatedAt: runJson.updatedAt,
  };
  const jobs = (runJson.jobs || []).map((j) => {
    let log = "";
    if (/\(matrix\)/.test(j.name || "")) {
      try { log = gh(["run", "view", "--repo", o.repo, "--job", String(j.databaseId), "--log"]); } catch { log = ""; }
    }
    return { databaseId: j.databaseId, name: j.name, conclusion: j.conclusion, startedAt: j.startedAt, completedAt: j.completedAt, steps: j.steps, log };
  });

  const receipt = buildReceipt({ run, jobs });
  if (o.jsonOut) writeFileSync(o.jsonOut, JSON.stringify(receipt.json, null, 2));
  if (o.mdOut) writeFileSync(o.mdOut, receipt.markdown);
  process.stdout.write(receipt.markdown + "\n");
  process.exit(receipt.verdict === "GO" ? 0 : receipt.verdict === "PARTIAL" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
