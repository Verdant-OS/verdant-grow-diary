// Vitest 3.2.4-compatible reporter that emits append-only, structured
// JSONL events. Each completed test module is flushed as an independent
// line so an interrupted batch never claims uncompleted work as green.
//
// Env inputs (set by the orchestrator):
//   VERDANT_CTRL_PROGRESS_FILE   absolute path to progress.jsonl
//   VERDANT_CTRL_RUN_ID          run identifier (opaque)
//   VERDANT_CTRL_SHARD_INDEX     "1" (1-based)
//   VERDANT_CTRL_SHARD_TOTAL     "16"
//   VERDANT_CTRL_BATCH_INDEX     "0" (0-based)
//   VERDANT_CTRL_REPO_ROOT       absolute repo root (for path normalization)
import fs from "node:fs";
import path from "node:path";

export const REPORTER_SCHEMA_VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

function normalize(repoRoot, absOrRel) {
  if (!absOrRel) return absOrRel;
  const abs = path.isAbsolute(absOrRel) ? absOrRel : path.resolve(repoRoot, absOrRel);
  return path.relative(repoRoot, abs).split(path.sep).join("/");
}

/** Extract a plain array of task children regardless of vitest version shape. */
function taskChildren(t) {
  if (!t) return [];
  if (Array.isArray(t.tasks)) return t.tasks;
  if (Array.isArray(t.children)) return t.children;
  return [];
}

/** Recursively collect leaf tests (mode="test") with their state. */
function collectTests(task, acc = []) {
  const type = task?.type;
  if (type === "test" || type === "custom") {
    acc.push({
      name: (task.suite?.name ? `${task.suite.name} > ` : "") + (task.name || "<unnamed>"),
      state: task.result?.state ?? task.mode ?? "unknown",
      duration: task.result?.duration ?? null,
      error: task.result?.errors?.[0]?.message ?? null,
    });
  }
  for (const c of taskChildren(task)) collectTests(c, acc);
  return acc;
}

function fileStateFromTests(tests, fileResultState) {
  if (fileResultState === "fail" || tests.some((t) => t.state === "fail")) return "failed";
  if (tests.length === 0) return fileResultState === "pass" ? "passed" : "skipped";
  if (tests.every((t) => t.state === "skip" || t.state === "todo")) return "skipped";
  return "passed";
}

export default class VerdantControlledReporter {
  constructor(options = {}) {
    this.options = options;
    // Explicit constructor options take precedence over environment
    // variables. When both are provided (e.g. a focused unit test passes
    // repoRoot="/repo" but CI has already exported VERDANT_CTRL_REPO_ROOT
    // for the child vitest run), the caller's intent must win — otherwise
    // path normalization silently produces "../.." repo-relative strings
    // that break every downstream shard summary lookup.
    this.progressFile = options.progressFile ?? process.env.VERDANT_CTRL_PROGRESS_FILE;
    this.runId = options.runId ?? process.env.VERDANT_CTRL_RUN_ID ?? "unknown";
    this.shardIndex = Number(options.shardIndex ?? process.env.VERDANT_CTRL_SHARD_INDEX ?? 1);
    this.shardTotal = Number(options.shardTotal ?? process.env.VERDANT_CTRL_SHARD_TOTAL ?? 1);
    this.batchIndex = Number(options.batchIndex ?? process.env.VERDANT_CTRL_BATCH_INDEX ?? 0);
    this.repoRoot = options.repoRoot ?? process.env.VERDANT_CTRL_REPO_ROOT ?? process.cwd();
    this._flushed = new Set();
    if (!this.progressFile) {
      throw new Error("VerdantControlledReporter: progress file path required");
    }
    fs.mkdirSync(path.dirname(this.progressFile), { recursive: true });
  }

  _append(event) {
    const line = JSON.stringify(event) + "\n";
    // Open/close per-write forces flush to disk — critical for crash safety.
    const fd = fs.openSync(this.progressFile, "a");
    try {
      fs.writeSync(fd, line);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  _flushFile(fileTask) {
    const abs = fileTask.filepath || fileTask.file?.filepath || fileTask.id;
    if (!abs) return;
    const rel = normalize(this.repoRoot, abs);
    if (this._flushed.has(rel)) return;
    this._flushed.add(rel);
    const tests = collectTests(fileTask);
    const passed = tests.filter((t) => t.state === "pass").length;
    const failed = tests.filter((t) => t.state === "fail").length;
    const skipped = tests.filter((t) => t.state === "skip").length;
    const todo = tests.filter((t) => t.state === "todo").length;
    const status = fileStateFromTests(tests, fileTask.result?.state);
    const failedNames = tests.filter((t) => t.state === "fail").map((t) => t.name);
    this._append({
      event: "file",
      schema: REPORTER_SCHEMA_VERSION,
      runId: this.runId,
      shardIndex: this.shardIndex,
      shardTotal: this.shardTotal,
      batchIndex: this.batchIndex,
      file: rel,
      status,
      counts: { passed, failed, skipped, todo },
      duration: fileTask.result?.duration ?? null,
      failedTests: failedNames,
      firstError: failedNames.length
        ? (tests.find((t) => t.state === "fail")?.error ?? null)
        : null,
      completedAt: nowIso(),
    });
  }

  // Vitest v3 supports onTestModuleEnd for per-module flush; older
  // callers hit onFinished only. Implement both.
  onTestModuleEnd(module) {
    try {
      this._flushFile(module);
    } catch (err) {
      // Never crash the run because of a reporter I/O error; leave the
      // file unflushed so resume treats it as incomplete.
      console.error("[verdant-controlled-reporter] flush error:", err?.message ?? err);
    }
  }

  onFinished(files, errors) {
    for (const f of files || []) {
      try {
        this._flushFile(f);
      } catch (err) {
        console.error("[verdant-controlled-reporter] finish flush error:", err?.message ?? err);
      }
    }
    try {
      this._append({
        event: "batch-end",
        schema: REPORTER_SCHEMA_VERSION,
        runId: this.runId,
        shardIndex: this.shardIndex,
        shardTotal: this.shardTotal,
        batchIndex: this.batchIndex,
        errorCount: (errors || []).length,
        completedAt: nowIso(),
      });
    } catch (err) {
      console.error("[verdant-controlled-reporter] batch-end error:", err?.message ?? err);
    }
  }
}
